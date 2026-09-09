// Procesamiento de un run en el worker (ticket 08). Server-only; lo invoca
// worker/index.ts desde el handler de pg-boss.
//
// La primera ruta procesa la entrada controlada mínima de investigación de
// catálogo (fixture-catalog.ts, material preparado). No depende de ningún
// estado en memoria de Next: todo avance se confirma transaccionalmente en
// PostgreSQL bajo el tenant del run, resuelto por el servidor al aceptar y
// transportado en el payload del job.
//
// Reanudación: una reentrega del job salta los pasos ya completados y retoma
// el primero pendiente. Reiniciar puede repetir un paso no confirmado; no
// duplica resultados publicados (publish_result es un update idempotente del
// mismo run).

import type pg from 'pg';
import { parseEvaluationProfile } from '../../contracts/evaluation-validation.ts';
import type { EvaluationProfile } from '../../contracts/evaluation.ts';
import { researchSfOrganizers, SF_WORKFLOW } from './research.ts';
import { researchPersistedCatalog } from '../catalog/research.ts';
import { withTenantTransaction } from '../db/pool.ts';
import { researchFixtureCatalog, type CatalogResearchResult } from './fixture-catalog.ts';
import {
  buildLumaIngestResult,
  LUMA_INGEST_WORKFLOW,
  parseLumaFetchOutput,
  runFetchEventPageStep,
  runPersistDossierStep,
  type LumaIngestStepOptions,
} from './luma-step.ts';
import type { LumaPersistOutcome } from '../catalog/luma-adapter.ts';
import {
  buildComparisonResult,
  COMPARISON_WORKFLOW,
  runComposeNarrativeStep,
  runEvaluateCandidatesStep,
  type ComparisonStepOptions,
} from './compare.ts';
import { RUN_MAX_ATTEMPTS, type EvaluationJobData } from './queue-config.ts';

// Pedido de corte controlado tras completar un paso (demo del ticket y test de
// reanudación): el paso ya confirmó su avance; el job vuelve a la cola y el
// proceso del worker sale. Restringido a arranques explícitos con
// GROWTHX_WORKER_EXIT_AFTER_STEP.
export class WorkerStopRequested extends Error {
  constructor(step: string) {
    super(`corte controlado tras el paso ${step} (GROWTHX_WORKER_EXIT_AFTER_STEP)`);
    this.name = 'WorkerStopRequested';
  }
}

export interface ProcessRunDeps {
  pool: pg.Pool;
  exitAfterStep?: string | null;
  // Ticket 11: transporte y límites del step de obtención Luma, inyectables en
  // tests (HTML controlado, timeouts cortos). En producción quedan los defaults.
  lumaIngest?: LumaIngestStepOptions;
  // Ticket 12: política/sombra v0/adaptador de modelo de la comparación,
  // inyectables en tests (política ficticia explícita, transporte controlado,
  // reloj fijo). En producción quedan los defaults (sin política — D2).
  comparison?: ComparisonStepOptions;
}

interface StepRow {
  id: string;
  name: string;
  seq: number;
  state: 'pending' | 'running' | 'completed' | 'failed';
  output: unknown;
}

async function log(
  client: pg.ClientBase,
  entry: {
    tenantId: string;
    runId: string;
    stepName?: string | null;
    attempt?: number | null;
    level: 'info' | 'warn' | 'error';
    message: string;
    context?: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into growthx.run_logs (tenant_id, run_id, step_name, attempt, level, message, context)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.tenantId,
      entry.runId,
      entry.stepName ?? null,
      entry.attempt ?? null,
      entry.level,
      entry.message,
      entry.context === undefined ? null : JSON.stringify(entry.context),
    ],
  );
}

export async function processEvaluationRun(
  job: EvaluationJobData,
  deps: ProcessRunDeps,
): Promise<void> {
  const { pool, exitAfterStep = null, lumaIngest = {}, comparison = {} } = deps;
  const { runId, tenantId } = job;

  // Intento: reclamar el run bajo su tenant. Un run completado se ignora
  // (reentrega idempotente); uno inexistente bajo este tenant es un job
  // inválido y falla con log.
  const claim = await withTenantTransaction(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      'select state, attempt_count, profile_id, workflow_version from growthx.runs where id = $1 for update',
      [runId],
    );
    if (rows.length === 0) {
      throw new Error(`run ${runId} inexistente bajo el tenant del job`);
    }
    const run = rows[0] as { state: string; attempt_count: number; profile_id: string; workflow_version: string };
    if (run.state === 'completed') return null;
    const attempt = run.attempt_count + 1;
    await client.query(
      "update growthx.runs set state = 'running', attempt_count = $2, updated_at = now() where id = $1",
      [runId, attempt],
    );
    await log(client, {
      tenantId,
      runId,
      attempt,
      level: 'info',
      message: `intento ${attempt}/${RUN_MAX_ATTEMPTS} iniciado`,
    });
    return { attempt, profileId: run.profile_id, workflowVersion: run.workflow_version };
  });
  if (claim === null) return;
  const { attempt, profileId, workflowVersion } = claim;

  const steps = await withTenantTransaction(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      'select id, name, seq, state, output from growthx.run_steps where run_id = $1 order by seq',
      [runId],
    );
    return rows as StepRow[];
  });

  let currentStep: StepRow | null = null;
  try {
    const outputs = new Map<string, unknown>();
    for (const step of steps) {
      if (step.state === 'completed') {
        outputs.set(step.name, step.output);
        continue; // reanudación: el avance confirmado no se repite
      }
      currentStep = step;
      await withTenantTransaction(pool, tenantId, async (client) => {
        await client.query(
          `update growthx.run_steps
              set state = 'running', attempts = attempts + 1,
                  started_at = coalesce(started_at, now())
            where id = $1`,
          [step.id],
        );
        await log(client, {
          tenantId,
          runId,
          stepName: step.name,
          attempt,
          level: 'info',
          message: 'paso iniciado',
        });
      });

      const output = await executeStep(step.name, { pool, tenantId, runId, profileId, outputs, workflowVersion, lumaIngest, comparison });
      outputs.set(step.name, output);

      await withTenantTransaction(pool, tenantId, async (client) => {
        await client.query(
          `update growthx.run_steps
              set state = 'completed', finished_at = now(), error = null, output = $2
            where id = $1`,
          [step.id, JSON.stringify(output)],
        );
        await log(client, {
          tenantId,
          runId,
          stepName: step.name,
          attempt,
          level: 'info',
          message: 'paso completado',
        });
      });

      if (exitAfterStep === step.name) throw new WorkerStopRequested(step.name);
      currentStep = null;
    }

    await withTenantTransaction(pool, tenantId, async (client) => {
      await client.query(
        "update growthx.runs set state = 'completed', error = null, updated_at = now() where id = $1",
        [runId],
      );
      await log(client, { tenantId, runId, attempt, level: 'info', message: 'run completado' });
    });
  } catch (error) {
    if (error instanceof WorkerStopRequested) {
      await withTenantTransaction(pool, tenantId, async (client) => {
        await log(client, {
          tenantId,
          runId,
          attempt,
          level: 'warn',
          message: error.message,
        });
      });
      throw error; // el job vuelve a la cola; el run sigue recuperable
    }
    const message = error instanceof Error ? error.message : String(error);
    const finalFailure = attempt >= RUN_MAX_ATTEMPTS;
    await withTenantTransaction(pool, tenantId, async (client) => {
      if (currentStep) {
        await client.query(
          `update growthx.run_steps set state = 'failed', finished_at = now(), error = $2 where id = $1`,
          [currentStep.id, JSON.stringify({ message })],
        );
      }
      await client.query(
        `update growthx.runs set state = $2, error = $3, updated_at = now() where id = $1`,
        [runId, finalFailure ? 'failed' : 'queued', JSON.stringify({ message })],
      );
      await log(client, {
        tenantId,
        runId,
        stepName: currentStep?.name ?? null,
        attempt,
        level: 'error',
        message: finalFailure
          ? `fallo definitivo tras ${attempt} intentos: ${message}`
          : `intento ${attempt} falló, reintento pendiente: ${message}`,
      });
    });
    throw error;
  }
}

async function executeStep(
  name: string,
  ctx: {
    pool: pg.Pool;
    tenantId: string;
    runId: string;
    profileId: string;
    outputs: Map<string, unknown>;
    workflowVersion: string;
    lumaIngest: LumaIngestStepOptions;
    comparison: ComparisonStepOptions;
  },
): Promise<unknown> {
  switch (name) {
    // Ticket 12: etapa determinística de la comparación — elegibilidad antes
    // del score, features con razón de ausencia, política (o su ausencia),
    // sombra v0 y snapshot oficial INMUTABLE confirmado acá, antes de pedir
    // redacción alguna.
    case 'evaluate_candidates': {
      const profile = await loadProfile(ctx);
      const input = await loadRunInput(ctx);
      if (!Array.isArray(input.editionIds) || input.editionIds.some((id) => typeof id !== 'string')) {
        throw new Error(`run ${ctx.runId} sin selección de ediciones para comparar`);
      }
      return runEvaluateCandidatesStep(
        ctx.pool,
        ctx.tenantId,
        ctx.runId,
        profile,
        input.editionIds as string[],
        ctx.comparison,
      );
    }
    // Redacción opcional SOBRE el snapshot ya confirmado: su salida se guarda
    // separada y validada; nunca toca orden, score, eligibility ni condiciones.
    case 'compose_narrative': {
      return runComposeNarrativeStep(ctx.pool, ctx.tenantId, ctx.runId, ctx.comparison);
    }
    case 'validate_profile': {
      const profile = await loadProfile(ctx);
      return { valid: true, profileId: profile.id, profileVersion: profile.profileVersion };
    }
    // Ticket 11: la obtención y el parseo corren ACÁ, en el worker — la ruta
    // HTTP solo validó la URL y encoló. La salida no conserva HTML completo.
    case 'fetch_event_page': {
      const input = await loadRunInput(ctx);
      if (typeof input.url !== 'string') throw new Error(`run ${ctx.runId} sin URL de importación`);
      return runFetchEventPageStep(input.url, ctx.lumaIngest);
    }
    case 'persist_dossier': {
      const fetched = parseLumaFetchOutput(ctx.outputs.get('fetch_event_page'));
      return runPersistDossierStep(ctx.pool, ctx.tenantId, ctx.runId, fetched);
    }
    case 'research_catalog': {
      const profile = await loadProfile(ctx);
      if (ctx.workflowVersion === SF_WORKFLOW)
        return researchSfOrganizers(ctx.pool, ctx.tenantId, profile, new Date().toISOString());
      // Ticket 09: con catálogo curado bajo el tenant se investiga el material
      // PERSISTIDO (vigencia evaluada al instante del paso; sin opciones
      // vigentes se declara el límite, no se rellena con seeds). Solo un tenant
      // que nunca cargó catálogo cae al fixture preparado de 08 (D4 pendiente).
      const persisted = await researchPersistedCatalog(ctx.pool, ctx.tenantId, {
        stack: profile.stack,
        evaluationInstant: new Date().toISOString(),
      });
      if (persisted) return persisted;
      const result = researchFixtureCatalog({
        stack: profile.stack,
        audienceDescription: profile.audience.description,
      });
      return result;
    }
    case 'publish_result': {
      if (ctx.workflowVersion === COMPARISON_WORKFLOW) {
        // El resultado publicado se compone RELEYENDO el snapshot persistido y
        // su registro de redacción: lo que la UI muestra es lo confirmado en
        // PostgreSQL, no un estado en memoria del worker.
        const result = await buildComparisonResult(ctx.pool, ctx.tenantId, ctx.runId);
        await withTenantTransaction(ctx.pool, ctx.tenantId, async (client) => {
          await client.query('update growthx.runs set result = $2, updated_at = now() where id = $1', [
            ctx.runId,
            JSON.stringify(result),
          ]);
        });
        return { published: true, snapshotId: result.snapshotId };
      }
      if (ctx.workflowVersion === LUMA_INGEST_WORKFLOW) {
        const fetched = parseLumaFetchOutput(ctx.outputs.get('fetch_event_page'));
        const persisted = ctx.outputs.get('persist_dossier') as LumaPersistOutcome | undefined;
        if (!persisted || typeof persisted.editionId !== 'string') {
          throw new Error('publish_result sin salida de persist_dossier');
        }
        const result = buildLumaIngestResult(fetched, persisted);
        await withTenantTransaction(ctx.pool, ctx.tenantId, async (client) => {
          await client.query('update growthx.runs set result = $2, updated_at = now() where id = $1', [
            ctx.runId,
            JSON.stringify(result),
          ]);
        });
        return { published: true };
      }
      const research = ctx.outputs.get('research_catalog') as CatalogResearchResult | import('../../../components/research-dashboard/research-types.ts').SfResearchResult | undefined;
      if (!research || (research.kind !== 'catalog_research' && research.kind !== 'sf_organizer_research')) {
        throw new Error('publish_result sin salida de research_catalog');
      }
      await withTenantTransaction(ctx.pool, ctx.tenantId, async (client) => {
        await client.query('update growthx.runs set result = $2, updated_at = now() where id = $1', [
          ctx.runId,
          JSON.stringify(research),
        ]);
      });
      return { published: true };
    }
    default:
      throw new Error(`paso desconocido «${name}» para ${ctx.runId}`);
  }
}

// Entrada persistida del run (la URL de importación o la selección de
// ediciones viajan acá, resueltas y validadas por el servidor al aceptar —
// nunca desde el contenido).
async function loadRunInput(ctx: {
  pool: pg.Pool;
  tenantId: string;
  runId: string;
}): Promise<{ url?: string; editionIds?: unknown[] }> {
  return withTenantTransaction(ctx.pool, ctx.tenantId, async (client) => {
    const { rows } = await client.query('select input from growthx.runs where id = $1', [ctx.runId]);
    if (rows.length === 0) throw new Error(`run ${ctx.runId} inexistente bajo el tenant`);
    return rows[0].input as { url?: string; editionIds?: unknown[] };
  });
}

async function loadProfile(ctx: {
  pool: pg.Pool;
  tenantId: string;
  profileId: string;
}): Promise<EvaluationProfile> {
  const payload = await withTenantTransaction(ctx.pool, ctx.tenantId, async (client) => {
    const { rows } = await client.query('select payload from growthx.profiles where id = $1', [
      ctx.profileId,
    ]);
    if (rows.length === 0) throw new Error(`perfil ${ctx.profileId} inexistente bajo el tenant`);
    return rows[0].payload as unknown;
  });
  // El JSONB persistido se revalida al leer: un payload que dejó de cumplir el
  // contrato no se interpreta silenciosamente.
  const parsed = parseEvaluationProfile(payload);
  if (!parsed.ok) {
    const detail = parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`perfil ${ctx.profileId} inválido según contrato: ${detail}`);
  }
  return parsed.value;
}
