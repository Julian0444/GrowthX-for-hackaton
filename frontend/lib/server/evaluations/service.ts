// Servicio de evaluaciones persistidas (ticket 08). Server-only.
//
// startEvaluation (aceptación) y getEvaluation (lectura) sobre PostgreSQL con
// RLS por tenant. El contexto de tenant llega SIEMPRE resuelto por el servidor
// (sesión en las rutas, payload del job en el worker); la inyección directa de
// un contexto está restringida a tests.
//
// Aceptación atómica: perfil + run + steps + job de pg-boss comparten UNA
// transacción (ver queue.ts). Idempotencia por (tenant, clave): misma clave y
// mismo payload devuelven el mismo run; misma clave con otro payload → conflicto.

import type pg from 'pg';
import { parseEvaluationProfile } from '../../contracts/evaluation-validation.ts';
import { getAppPool, withTenantTransaction } from '../db/pool.ts';
import { SF_WORKFLOW } from './research.ts';
import { readSavedOrganizers } from './dashboard-store.ts';
import { EVALUATION_WORKFLOW_VERSION } from './queue-config.ts';
import { transactionalEvaluationQueue, type EvaluationQueue } from './queue.ts';
import { LUMA_INGEST_STEPS, LUMA_INGEST_WORKFLOW } from './luma-step.ts';
import { COMPARISON_STEPS, COMPARISON_WORKFLOW } from './compare.ts';
import {
  buildEvaluationProfile,
  comparisonPayloadHash,
  evaluationPayloadHash,
  eventIngestPayloadHash,
  newRunIds,
  type ComparisonStartBody,
  type EvaluationRunView,
  type EvaluationStartBody,
  type EventIngestStartBody,
  type EvaluationStepView,
} from './wire.ts';

// Pasos del primer workflow (investigación de catálogo controlada). El orden
// es el orden de ejecución; cada paso confirma su avance transaccionalmente.
export const EVALUATION_STEPS = ['validate_profile', 'research_catalog', 'publish_result'] as const;

export type AcceptOutcome =
  | { status: 'accepted'; runId: string }
  | { status: 'duplicate'; runId: string }
  | { status: 'conflict' }
  | { status: 'invalid_profile'; issues: string[] };

export interface EvaluationServiceDeps {
  pool?: pg.Pool;
  queue?: EvaluationQueue;
  now?: () => Date;
}

export interface EvaluationService {
  accept(input: {
    tenantId: string;
    userId: string;
    body: EvaluationStartBody | ComparisonStartBody;
  }): Promise<AcceptOutcome>;
  // Ticket 11: POST /api/events/ingest delega acá — misma aceptación atómica
  // (run + steps + job en un commit) e idempotencia por (tenant, clave).
  acceptEventIngest(input: {
    tenantId: string;
    userId: string;
    body: EventIngestStartBody;
  }): Promise<AcceptOutcome>;
  getRun(input: { tenantId: string; runId: string }): Promise<EvaluationRunView | null>;
}

const UNIQUE_VIOLATION = '23505';

export function createEvaluationService(deps: EvaluationServiceDeps = {}): EvaluationService {
  const queue = deps.queue ?? transactionalEvaluationQueue;
  const now = deps.now ?? (() => new Date());
  const poolOf = () => deps.pool ?? getAppPool();

  async function findByIdempotencyKey(
    client: pg.PoolClient,
    idempotencyKey: string,
  ): Promise<{ id: string; payload_hash: string } | null> {
    const { rows } = await client.query(
      'select id, payload_hash from growthx.runs where idempotency_key = $1',
      [idempotencyKey],
    );
    return rows.length > 0 ? (rows[0] as { id: string; payload_hash: string }) : null;
  }

  async function accept(input: {
    tenantId: string;
    userId: string;
    body: EvaluationStartBody | ComparisonStartBody;
  }): Promise<AcceptOutcome> {
    const { tenantId, userId, body } = input;
    // Ticket 12: la comparación de inversión entra por la MISMA frontera con su
    // propia aceptación (perfil reutilizado, candidatos validados en el tenant).
    if (body.mode === 'investment_comparison') {
      return acceptComparison({ tenantId, userId, body });
    }
    const { runId, profileId } = newRunIds();
    const createdAt = now().toISOString();
    const profile = buildEvaluationProfile(body, { profileId, createdAt });
    // El payload persistido es JSONB VALIDADO contra el contrato 07, no un
    // objeto tipado sin comprobar.
    const parsed = parseEvaluationProfile(profile);
    if (!parsed.ok) {
      return {
        status: 'invalid_profile',
        issues: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`),
      };
    }
    const payloadHash = evaluationPayloadHash(body);

    const runAccept = () =>
      withTenantTransaction(poolOf(), tenantId, async (client): Promise<AcceptOutcome> => {
        const existing = await findByIdempotencyKey(client, body.idempotencyKey);
        if (existing) {
          return existing.payload_hash === payloadHash
            ? { status: 'duplicate', runId: existing.id }
            : { status: 'conflict' };
        }
        for (const company of profile.comparableCompanies) {
          if (!company.companyId) continue;
          const { rows } = await client.query('select payload from growthx.companies where id = $1', [company.companyId]);
          if (!rows.length || rows[0].payload.name !== company.name)
            return { status: 'invalid_profile', issues: ['Identidad comparable inexistente o distinta en el catálogo de esta sesión.'] };
        }
        let lineageId = profileId;
        if (body.previousRunId) {
          const { rows } = await client.query(`select p.id, p.lineage_id from growthx.profiles p
            join growthx.runs r on r.profile_id = p.id where r.id = $1 and r.workflow_version = $2`, [body.previousRunId, SF_WORKFLOW]);
          if (!rows.length) return { status: 'invalid_profile', issues: ['Investigación anterior no disponible para esta sesión.'] };
          lineageId = rows[0].lineage_id as string;
          await client.query('select pg_advisory_xact_lock(hashtext($1))', [tenantId + ':' + lineageId]);
          const versions = await client.query('select max(version)::int as version from growthx.profiles where lineage_id = $1', [lineageId]);
          profile.profileVersion = Number(versions.rows[0].version) + 1;
          parsed.value.profileVersion = profile.profileVersion;
        }
        await client.query(
          `insert into growthx.profiles (id, tenant_id, lineage_id, version, contract_version, payload, created_by)
           values ($1, $2, $3, $7, $4, $5, $6)`,
          [profileId, tenantId, lineageId, profile.contractVersion, JSON.stringify(parsed.value), userId, profile.profileVersion],
        );
        await client.query(
          `insert into growthx.runs
             (id, tenant_id, profile_id, requested_by, mode, input, state,
              workflow_version, contract_version, idempotency_key, payload_hash)
           values ($1, $2, $3, $4, $5, $6, 'queued', $7, $8, $9, $10)`,
          [
            runId,
            tenantId,
            profileId,
            userId,
            body.mode,
            JSON.stringify({ mode: body.mode, profile: body.profile, previousRunId: body.previousRunId ?? null }),
            body.researchScope === 'sf_organizers' ? SF_WORKFLOW : EVALUATION_WORKFLOW_VERSION,
            profile.contractVersion,
            body.idempotencyKey,
            payloadHash,
          ],
        );
        for (const [index, name] of EVALUATION_STEPS.entries()) {
          await client.query(
            `insert into growthx.run_steps (run_id, tenant_id, seq, name) values ($1, $2, $3, $4)`,
            [runId, tenantId, index + 1, name],
          );
        }
        await client.query(
          `insert into growthx.run_logs (tenant_id, run_id, level, message, context)
           values ($1, $2, 'info', 'run aceptado', $3)`,
          [tenantId, runId, JSON.stringify({ mode: body.mode, workflow: EVALUATION_WORKFLOW_VERSION })],
        );
        // Trabajo durable DENTRO de la misma transacción: si esto falla, no
        // queda run; si el commit falla, no queda job. Nunca un 202 sin job.
        await queue.sendRunJob(client, { runId, tenantId });
        return { status: 'accepted', runId };
      });

    return runWithIdempotencyRecovery(tenantId, body.idempotencyKey, payloadHash, runAccept);
  }

  // Carrera de dos aceptaciones con la misma clave: la segunda pierde el
  // unique (tenant, idempotency_key) y se resuelve releyendo.
  async function runWithIdempotencyRecovery(
    tenantId: string,
    idempotencyKey: string,
    payloadHash: string,
    runAccept: () => Promise<AcceptOutcome>,
  ): Promise<AcceptOutcome> {
    try {
      return await runAccept();
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return withTenantTransaction(poolOf(), tenantId, async (client): Promise<AcceptOutcome> => {
          const existing = await findByIdempotencyKey(client, idempotencyKey);
          if (!existing) throw error;
          return existing.payload_hash === payloadHash
            ? { status: 'duplicate', runId: existing.id }
            : { status: 'conflict' };
        });
      }
      throw error;
    }
  }

  // Comparación de inversión (ticket 12). El run reutiliza el PERFIL de una
  // investigación existente del tenant (misma revisión para todos los
  // candidatos) y valida que cada edición seleccionada exista en el catálogo
  // del tenant (bajo RLS, una edición ajena no existe). Misma aceptación
  // atómica: run + steps + job durable en un commit; misma idempotencia.
  async function acceptComparison(input: {
    tenantId: string;
    userId: string;
    body: ComparisonStartBody;
  }): Promise<AcceptOutcome> {
    const { tenantId, userId, body } = input;
    const { runId } = newRunIds();
    const payloadHash = comparisonPayloadHash(body);

    const runAccept = () =>
      withTenantTransaction(poolOf(), tenantId, async (client): Promise<AcceptOutcome> => {
        const existing = await findByIdempotencyKey(client, body.idempotencyKey);
        if (existing) {
          return existing.payload_hash === payloadHash
            ? { status: 'duplicate', runId: existing.id }
            : { status: 'conflict' };
        }
        const { rows: profileRows } = await client.query(
          'select profile_id from growthx.runs where id = $1',
          [body.profileRunId],
        );
        if (profileRows.length === 0) {
          return {
            status: 'invalid_profile',
            issues: [
              'La comparación requiere una investigación previa de esta sesión (perfil no disponible).',
            ],
          };
        }
        const profileId = profileRows[0].profile_id as string;
        // Candidatos del catálogo del tenant, no ids arbitrarios: se seleccionan
        // desde el dashboard con expedientes (arista 10 → 12).
        const { rows: editionRows } = await client.query(
          'select distinct edition_id from growthx.edition_revisions where edition_id = any($1)',
          [body.editionIds],
        );
        const known = new Set(editionRows.map((row) => row.edition_id as string));
        const missing = body.editionIds.filter((id) => !known.has(id));
        if (missing.length > 0) {
          return {
            status: 'invalid_profile',
            issues: [
              `Ediciones fuera del catálogo de esta sesión: ${missing.join(', ')}. La comparación no inventa candidatos.`,
            ],
          };
        }
        await client.query(
          `insert into growthx.runs
             (id, tenant_id, profile_id, requested_by, mode, input, state,
              workflow_version, contract_version, idempotency_key, payload_hash)
           values ($1, $2, $3, $4, 'investment_comparison', $5, 'queued', $6, '1', $7, $8)`,
          [
            runId,
            tenantId,
            profileId,
            userId,
            JSON.stringify({
              mode: 'investment_comparison',
              editionIds: body.editionIds,
              profileRunId: body.profileRunId,
            }),
            COMPARISON_WORKFLOW,
            body.idempotencyKey,
            payloadHash,
          ],
        );
        for (const [index, name] of COMPARISON_STEPS.entries()) {
          await client.query(
            `insert into growthx.run_steps (run_id, tenant_id, seq, name) values ($1, $2, $3, $4)`,
            [runId, tenantId, index + 1, name],
          );
        }
        await client.query(
          `insert into growthx.run_logs (tenant_id, run_id, level, message, context)
           values ($1, $2, 'info', 'comparación de inversión aceptada', $3)`,
          [tenantId, runId, JSON.stringify({ editionIds: body.editionIds, workflow: COMPARISON_WORKFLOW })],
        );
        await queue.sendRunJob(client, { runId, tenantId });
        return { status: 'accepted', runId };
      });

    return runWithIdempotencyRecovery(tenantId, body.idempotencyKey, payloadHash, runAccept);
  }

  // Importación durable de una URL Luma (ticket 11). El run reutiliza el
  // PERFIL de una investigación existente del tenant (profileRunId): la
  // importación no fabrica producto/audiencia/objetivo. Misma transacción
  // atómica que accept: run + steps + job durable en un commit.
  async function acceptEventIngest(input: {
    tenantId: string;
    userId: string;
    body: EventIngestStartBody;
  }): Promise<AcceptOutcome> {
    const { tenantId, userId, body } = input;
    const { runId } = newRunIds();
    const payloadHash = eventIngestPayloadHash(body);

    const runAccept = () =>
      withTenantTransaction(poolOf(), tenantId, async (client): Promise<AcceptOutcome> => {
        const existing = await findByIdempotencyKey(client, body.idempotencyKey);
        if (existing) {
          return existing.payload_hash === payloadHash
            ? { status: 'duplicate', runId: existing.id }
            : { status: 'conflict' };
        }
        // La RLS hace que un run de otro tenant no exista para esta consulta.
        const { rows: profileRows } = await client.query(
          'select profile_id from growthx.runs where id = $1',
          [body.profileRunId],
        );
        if (profileRows.length === 0) {
          return {
            status: 'invalid_profile',
            issues: [
              'La importación durable requiere una investigación previa de esta sesión (perfil no disponible).',
            ],
          };
        }
        const profileId = profileRows[0].profile_id as string;
        await client.query(
          `insert into growthx.runs
             (id, tenant_id, profile_id, requested_by, mode, input, state,
              workflow_version, contract_version, idempotency_key, payload_hash)
           values ($1, $2, $3, $4, 'event_evaluation', $5, 'queued', $6, '1', $7, $8)`,
          [
            runId,
            tenantId,
            profileId,
            userId,
            JSON.stringify({
              mode: 'event_evaluation',
              url: body.url,
              profileRunId: body.profileRunId,
            }),
            LUMA_INGEST_WORKFLOW,
            body.idempotencyKey,
            payloadHash,
          ],
        );
        for (const [index, name] of LUMA_INGEST_STEPS.entries()) {
          await client.query(
            `insert into growthx.run_steps (run_id, tenant_id, seq, name) values ($1, $2, $3, $4)`,
            [runId, tenantId, index + 1, name],
          );
        }
        await client.query(
          `insert into growthx.run_logs (tenant_id, run_id, level, message, context)
           values ($1, $2, 'info', 'importación de evento aceptada', $3)`,
          [tenantId, runId, JSON.stringify({ url: body.url, workflow: LUMA_INGEST_WORKFLOW })],
        );
        await queue.sendRunJob(client, { runId, tenantId });
        return { status: 'accepted', runId };
      });

    return runWithIdempotencyRecovery(tenantId, body.idempotencyKey, payloadHash, runAccept);
  }

  async function getRun(input: {
    tenantId: string;
    runId: string;
  }): Promise<EvaluationRunView | null> {
    return withTenantTransaction(poolOf(), input.tenantId, async (client) => {
      const { rows: runRows } = await client.query(
        `select id, state, mode, workflow_version, profile_id, input, error, result,
                created_at, updated_at
           from growthx.runs where id = $1`,
        [input.runId],
      );
      if (runRows.length === 0) return null;
      const run = runRows[0] as {
        id: string;
        state: EvaluationRunView['state'];
        mode: string;
        workflow_version: string;
        profile_id: string;
        input: { previousRunId?: string | null; url?: string };
        error: { message?: string } | null;
        result: unknown;
        created_at: Date;
        updated_at: Date;
      };
      const { rows: stepRows } = await client.query(
        `select name, seq, state, attempts, started_at, finished_at, error
           from growthx.run_steps where run_id = $1 order by seq`,
        [input.runId],
      );
      const steps: EvaluationStepView[] = (stepRows as Array<{
        name: string;
        seq: number;
        state: EvaluationStepView['state'];
        attempts: number;
        started_at: Date | null;
        finished_at: Date | null;
        error: { message?: string } | null;
      }>).map((step) => ({
        name: step.name,
        seq: step.seq,
        state: step.state,
        attempts: step.attempts,
        startedAt: step.started_at ? step.started_at.toISOString() : null,
        finishedAt: step.finished_at ? step.finished_at.toISOString() : null,
        error: step.error?.message ?? null,
      }));
      const profileRows = await client.query('select payload from growthx.profiles where id = $1', [run.profile_id]);
      const parsed = parseEvaluationProfile(profileRows.rows[0]?.payload);
      if (!parsed.ok) throw new Error('Perfil persistido inválido');
      const savedOrganizers = await readSavedOrganizers(client, run.id);
      return {
        runId: run.id,
        profile: parsed.value,
        previousRunId: run.input.previousRunId ?? null,
        requestedUrl: typeof run.input.url === 'string' ? run.input.url : null,
        savedOrganizers,
        state: run.state,
        mode: run.mode,
        workflowVersion: run.workflow_version,
        profileId: run.profile_id,
        createdAt: run.created_at.toISOString(),
        updatedAt: run.updated_at.toISOString(),
        steps,
        result: run.result,
        error: run.error?.message ?? null,
      };
    });
  }

  return { accept, acceptEventIngest, getRun };
}

// Instancia por defecto de las rutas HTTP.
export const evaluationService: EvaluationService = createEvaluationService();
