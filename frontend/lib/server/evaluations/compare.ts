// Orquestador de la comparación de inversión (ticket 12). Server-only; los
// steps corren en el worker (run-worker.ts).
//
// Workflow investment-comparison/1:
//   validate_profile → evaluate_candidates → compose_narrative → publish_result
//
// evaluate_candidates es la etapa DETERMINÍSTICA: todos los candidatos se
// evalúan contra la misma revisión del perfil, el mismo instante y la misma
// política; la elegibilidad excluye ANTES del score; el snapshot oficial
// inmutable se confirma acá — ANTES de pedir cualquier redacción. La sombra v0
// se computa offline contra la referencia congelada del ticket 01 y se guarda
// como registro: sus scores jamás llenan campos de v1.
//
// compose_narrative corre DESPUÉS, sobre el snapshot ya confirmado, con el
// adaptador de modelo (model-adapter.ts); su salida se guarda separada y no
// altera orden, score, eligibility ni condiciones.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  EvaluationProfile,
  EvaluationReadBundle,
  EvaluationSnapshot,
  PolicyRef,
  SnapshotAlternative,
  SnapshotOrdering,
} from '../../contracts/evaluation.ts';
import { listCatalogEditions, readEditionDossier, type EditionDossierRead } from '../catalog/read.ts';
import { withTenantTransaction } from '../db/pool.ts';
import { evaluateEligibility, ELIGIBLE_IS_NOT_RECOMMENDED } from './eligibility.ts';
import {
  composeSnapshotNarrative,
  type ComparisonNarrativeRecord,
  type ModelAdapterOptions,
} from './model-adapter.ts';
import {
  applyScoringPolicy,
  approvedPolicyFor,
  extractFeatures,
  FEATURE_SET_VERSION,
  type FeatureValue,
  type ScoringPolicy,
} from './scoring-policy.ts';
import {
  buildReadBundle,
  persistNarrativeRecord,
  persistOfficialSnapshot,
  readNarrativeBySnapshot,
  readSnapshotByRun,
  type AvailableCatalogRecord,
  type SnapshotCompanions,
  type V0ShadowEntry,
  type V0ShadowRecord,
} from './snapshot-store.ts';

export const COMPARISON_WORKFLOW = 'investment-comparison/1';
export const COMPARISON_STEPS = [
  'validate_profile',
  'evaluate_candidates',
  'compose_narrative',
  'publish_result',
] as const;

// Conjunto comparado: hasta tres. Con menos opciones elegibles NO se inventan
// candidatos para completar un top 3.
export const MAX_COMPARED = 3;

// ============ Referencia v0 (sombra offline) ============

export interface V0Reference {
  label: string;
  unit: string;
  objective: string;
  entries: { id: string; eventName: string; score: number }[];
}

// Carga la referencia v0 CONGELADA del ticket 01 (caracterización del pipeline
// local sobre seeds). Lectura offline de un archivo del repo: sin red, sin
// claves, sin re-grabar nada. Si el archivo no está (entorno recortado), la
// sombra lo declara en vez de fingir una comparación.
export async function loadFrozenV0Reference(): Promise<V0Reference | null> {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const file = path.join(here, '..', '..', '..', 'tests', 'fixtures', 'baseline-v0', 'characterization.json');
    const parsed = JSON.parse(await readFile(file, 'utf8')) as {
      request?: { goal?: string };
      local?: { opportunities?: Array<{ id?: string; score?: number; event?: { name?: string } }> };
    };
    const opportunities = parsed.local?.opportunities ?? [];
    const entries = opportunities.flatMap((opportunity) =>
      typeof opportunity.id === 'string' &&
      typeof opportunity.score === 'number' &&
      typeof opportunity.event?.name === 'string'
        ? [{ id: opportunity.id, eventName: opportunity.event.name, score: opportunity.score }]
        : [],
    );
    return {
      label: 'baseline-v0/characterization.json · pipeline local sobre seeds congelados (ticket 01)',
      unit: 'community_market',
      objective: typeof parsed.request?.goal === 'string' ? parsed.request.goal : 'unknown',
      entries,
    };
  } catch {
    return null;
  }
}

const normalizeName = (name: string): string => name.toLowerCase().replace(/\s+/g, ' ').trim();

// Comparación en sombra: solo registra. v0 evalúa comunidades/mercados con su
// propio objetivo — otra unidad y otro objetivo que una edición como
// inversión —, así que un match se registra como «no comparable» con el score
// v0 visible SOLO dentro de la sombra; y un evento ausente en v0 también.
export function shadowCompareWithV0(
  alternatives: { editionId: string; name: string }[],
  reference: V0Reference | null,
): V0ShadowRecord {
  const entries: V0ShadowEntry[] = alternatives.map(({ editionId, name }) => {
    if (reference === null) {
      return {
        editionId,
        status: 'not_comparable' as const,
        reason: 'referencia v0 congelada no disponible en este entorno: no se compara ni se estima.',
      };
    }
    const match = reference.entries.find((entry) => normalizeName(entry.eventName) === normalizeName(name));
    if (!match) {
      return {
        editionId,
        status: 'not_comparable' as const,
        reason: 'v0 no evaluó este evento (no está en la referencia congelada): no comparable; nada se rellena con scores v0.',
      };
    }
    return {
      editionId,
      status: 'reference_found_not_comparable' as const,
      reason: `v0 evaluó una unidad ${reference.unit} con objetivo «${reference.objective}», no una edición como inversión: unidad y objetivo distintos — no comparable; su score no se reutiliza.`,
      v0Id: match.id,
      v0Unit: reference.unit,
      v0Objective: reference.objective,
      v0Score: match.score,
    };
  });
  return {
    mode: 'offline_shadow',
    referenceLabel: reference?.label ?? null,
    entries,
    note: 'Comparación en modo sombra, offline y sin nuevas consultas externas. Ningún score v0 llena campos de v1.',
  };
}

// ============ Steps del workflow ============

export interface ComparisonStepOptions {
  // Política aplicable por objetivo. Default: approvedPolicyFor (null — D2:
  // sin política aprobada no hay ranking; los pesos de test no se despliegan).
  policyProvider?: (profile: EvaluationProfile) => ScoringPolicy | null;
  // Referencia v0 para la sombra; default: la congelada del repo.
  v0Reference?: () => Promise<V0Reference | null>;
  // Opciones del adaptador de modelo (transporte inyectable, presupuesto).
  narrative?: ModelAdapterOptions;
  // Instante de evaluación inyectable (tests con reloj controlado).
  evaluationInstant?: string;
}

export interface EvaluateCandidatesOutput {
  snapshotId: string;
  evaluatedAt: string;
  persisted: 'persisted' | 'already_persisted';
}

const latestOf = (dossier: EditionDossierRead) =>
  dossier.editionRevisions[dossier.editionRevisions.length - 1];

const byCodePoints = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export async function runEvaluateCandidatesStep(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
  profile: EvaluationProfile,
  editionIds: string[],
  options: ComparisonStepOptions = {},
): Promise<EvaluateCandidatesOutput> {
  // Reentrega: un snapshot ya confirmado ES el resultado oficial del run.
  const existing = await readSnapshotByRun(pool, tenantId, runId);
  if (existing) {
    return {
      snapshotId: existing.snapshot.id,
      evaluatedAt: existing.snapshot.evaluatedAt,
      persisted: 'already_persisted',
    };
  }

  if (editionIds.length === 0 || editionIds.length > MAX_COMPARED)
    throw new Error(`la comparación admite de 1 a ${MAX_COMPARED} ediciones seleccionadas`);

  // MISMO instante para todos los candidatos (criterio del ticket).
  const evaluatedAt = options.evaluationInstant ?? new Date().toISOString();

  // Catálogo disponible ≠ conjunto comparado. El catálogo se lee al mismo
  // instante; con menos opciones elegibles no se inventan candidatos.
  const catalog = await listCatalogEditions(pool, tenantId, evaluatedAt);
  const availableIds = catalog.editions.map((edition) => edition.editionId);
  const upcomingIds = catalog.editions
    .filter((edition) => edition.validity.validity === 'upcoming')
    .map((edition) => edition.editionId);
  const availableCatalog: AvailableCatalogRecord = {
    evaluatedAt,
    editionIds: availableIds,
    upcomingEditionIds: upcomingIds,
    comparedEditionIds: [...editionIds].sort(byCodePoints),
    note:
      `Catálogo disponible: ${availableIds.length} edición(es) (${upcomingIds.length} vigentes; cobertura esperada 2-5). ` +
      `Conjunto comparado: ${editionIds.length} de hasta ${MAX_COMPARED}; no se completa un top 3 con candidatos inventados.` +
      (catalog.note ? ` ${catalog.note}` : ''),
  };

  const dossiers: EditionDossierRead[] = [];
  for (const editionId of [...editionIds].sort(byCodePoints)) {
    const dossier = await readEditionDossier(pool, tenantId, editionId, evaluatedAt);
    if (!dossier) throw new Error(`edición seleccionada «${editionId}» inexistente en el catálogo del tenant`);
    dossiers.push(dossier);
  }

  // Elegibilidad ANTES del score + features con razón de cada ausencia.
  const evaluations = dossiers.map((dossier) => ({
    dossier,
    eligibility: evaluateEligibility({ profile, dossier }),
    features: extractFeatures(profile, dossier),
  }));
  const featuresByEdition: Record<string, FeatureValue[]> = {};
  for (const evaluation of evaluations) featuresByEdition[evaluation.eligibility.editionId] = evaluation.features;

  // Política aplicable (D2: por defecto ninguna). El scorer SOLO recibe
  // candidatos no excluidos: un excluido no se puntúa y ningún puntaje lo
  // habilita.
  const policyProvider = options.policyProvider ?? ((p: EvaluationProfile) => approvedPolicyFor(p.objective.kind));
  const policy = policyProvider(profile);
  const scorable = evaluations.filter((evaluation) => evaluation.eligibility.eligibility.status !== 'excluded');
  const application = policy
    ? applyScoringPolicy(
        policy,
        scorable.map((evaluation) => ({ editionId: evaluation.eligibility.editionId, features: evaluation.features })),
      )
    : null;

  const policyRef: PolicyRef = policy
    ? { status: 'applied', policyId: policy.policyId, policyVersion: policy.policyVersion }
    : {
        status: 'none',
        note: 'Política pendiente (decisión abierta D2): comparación factual sin ranking numérico; ningún faltante se puntúa como 0.',
      };

  const alternatives: SnapshotAlternative[] = evaluations.map(({ eligibility }) => {
    const excluded = eligibility.eligibility.status === 'excluded';
    let scoring: SnapshotAlternative['scoring'];
    if (excluded) {
      scoring = {
        status: 'not_scored',
        reason: 'excluded_before_scoring',
        note: 'Excluido por conflicto confirmado antes del score: un puntaje alto no habilita un evento excluido.',
      };
    } else if (!policy || !application) {
      scoring = { status: 'not_scored', reason: 'no_policy', note: 'Sin política aplicable (D2): sin score.' };
    } else {
      const scored = application.scored.find((candidate) => candidate.editionId === eligibility.editionId);
      if (scored) {
        scoring = {
          status: 'scored',
          sKnown: scored.sKnown,
          coverage: scored.coverage,
          sensitivityNote: scored.sensitivityNote,
        };
      } else {
        const abstention = application.abstained.find((candidate) => candidate.editionId === eligibility.editionId);
        scoring = {
          status: 'not_scored',
          reason: 'insufficient_data',
          note: abstention?.note ?? 'sin datos suficientes para puntuar; abstención explícita',
        };
      }
    }
    return {
      editionId: eligibility.editionId,
      organizerId: eligibility.organizerId,
      eligibility: eligibility.eligibility,
      conditions: eligibility.conditions,
      scoring,
    };
  });

  // Orden oficial: con política, el del scorer (scored → abstenidos →
  // excluidos, cada tramo por id estable); sin política, orden de
  // presentación por id estable, explícitamente distinto de un ranking.
  const excludedIds = evaluations
    .filter((evaluation) => evaluation.eligibility.eligibility.status === 'excluded')
    .map((evaluation) => evaluation.eligibility.editionId)
    .sort(byCodePoints);
  let ordering: SnapshotOrdering;
  if (policy && application) {
    const abstainedIds = application.abstained.map((candidate) => candidate.editionId).sort(byCodePoints);
    ordering = {
      kind: 'ranked',
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      editionIds: [...application.ordering, ...abstainedIds, ...excludedIds],
    };
  } else {
    ordering = {
      kind: 'presentation_only',
      editionIds: evaluations.map((evaluation) => evaluation.eligibility.editionId).sort(byCodePoints),
      note: 'Orden de presentación por id estable, NO un ranking: la política del objetivo sigue pendiente (D2).',
    };
  }

  const allExcluded = alternatives.every((alternative) => alternative.eligibility.status === 'excluded');

  // Revisiones fijadas por el snapshot: la ÚLTIMA revisión de cada claim del
  // dossier, la edición, sus organizadores y las participaciones — junto a los
  // claims del evento quedan fijadas las revisiones de organizador y de la
  // relación empresa/edición (criterio SF).
  const claimRevisionIds = new Set<string>();
  const organizerRevisionIds = new Set<string>();
  const editionRevisionIds = new Set<string>();
  const participationRevisionIds = new Set<string>();
  for (const { dossier } of evaluations) {
    editionRevisionIds.add(latestOf(dossier).id);
    for (const chain of dossier.claims) claimRevisionIds.add(chain.revisions[chain.revisions.length - 1].id);
    for (const organizer of dossier.organizers)
      organizerRevisionIds.add(organizer.revisions[organizer.revisions.length - 1].id);
    for (const participation of dossier.participations)
      participationRevisionIds.add(participation.revisions[participation.revisions.length - 1].id);
  }

  const v0ReferenceLoader = options.v0Reference ?? loadFrozenV0Reference;
  const v0Shadow = shadowCompareWithV0(
    evaluations.map((evaluation) => ({
      editionId: evaluation.eligibility.editionId,
      name: latestOf(evaluation.dossier).name,
    })),
    await v0ReferenceLoader(),
  );

  const snapshot: EvaluationSnapshot = {
    contractVersion: '1',
    id: randomUUID(),
    kind: 'investment_comparison',
    profileId: profile.id,
    profileVersion: profile.profileVersion,
    evaluatedAt,
    claimRevisionIds: [...claimRevisionIds].sort(byCodePoints),
    organizerRevisionIds: [...organizerRevisionIds].sort(byCodePoints),
    editionRevisionIds: [...editionRevisionIds].sort(byCodePoints),
    participationRevisionIds: [...participationRevisionIds].sort(byCodePoints),
    policy: policyRef,
    alternatives,
    ordering,
    outcome: allExcluded
      ? {
          kind: 'no_eligible_candidates',
          reasons: alternatives.flatMap((alternative) =>
            alternative.eligibility.status === 'excluded' ? alternative.eligibility.reasons : [],
          ),
        }
      : { kind: 'completed' },
    // La redacción llega DESPUÉS de confirmar el snapshot y vive aparte.
    narrative: null,
  };

  const companions: SnapshotCompanions = {
    featureSetVersion: FEATURE_SET_VERSION,
    featuresByEdition,
    v0Shadow,
    availableCatalog,
  };
  const persisted = await persistOfficialSnapshot(pool, tenantId, { runId, snapshot, companions });
  return { snapshotId: persisted.snapshotId, evaluatedAt, persisted: persisted.status };
}

export interface ComposeNarrativeOutput {
  narrativeStatus: ComparisonNarrativeRecord['status'];
  motive: string | null;
  persisted: 'persisted' | 'already_persisted';
}

export async function runComposeNarrativeStep(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
  options: ComparisonStepOptions = {},
): Promise<ComposeNarrativeOutput> {
  const persisted = await readSnapshotByRun(pool, tenantId, runId);
  if (!persisted) throw new Error(`compose_narrative sin snapshot confirmado para el run ${runId}`);

  // Reentrega idempotente: si el registro de redacción ya existe, se reutiliza.
  const existing = await readNarrativeBySnapshot(pool, tenantId, persisted.snapshot.id);
  if (existing) {
    return { narrativeStatus: existing.status, motive: existing.motive, persisted: 'already_persisted' };
  }

  const claims = await withTenantTransaction(pool, tenantId, async (client) => {
    if (persisted.snapshot.claimRevisionIds.length === 0) return [];
    const { rows } = await client.query('select payload from growthx.claim_revisions where id = any($1)', [
      persisted.snapshot.claimRevisionIds,
    ]);
    return rows.map((row) => row.payload as import('../../contracts/evaluation.ts').ClaimRevision);
  });

  const record = await composeSnapshotNarrative(
    { snapshot: persisted.snapshot, claims },
    options.narrative ?? {},
  );
  const saved = await persistNarrativeRecord(pool, tenantId, record);
  return { narrativeStatus: record.status, motive: record.motive, persisted: saved.status };
}

// ============ Resultado publicado (runs.result) ============

export interface ComparisonRunResult {
  kind: 'investment_comparison';
  version: 1;
  snapshotId: string;
  evaluatedAt: string;
  // Bundle del contrato 07: la UI proyecta con projectEvaluationRead (el
  // snapshot y sus revisiones exactas, releídos de PostgreSQL).
  bundle: EvaluationReadBundle;
  featureSetVersion: string;
  featuresByEdition: Record<string, FeatureValue[]>;
  v0Shadow: V0ShadowRecord;
  availableCatalog: AvailableCatalogRecord;
  narrative: ComparisonNarrativeRecord | null;
  eligibleIsNotRecommended: string;
  warnings: string[];
}

export async function buildComparisonResult(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
): Promise<ComparisonRunResult> {
  const persisted = await readSnapshotByRun(pool, tenantId, runId);
  if (!persisted) throw new Error(`publish_result sin snapshot confirmado para el run ${runId}`);
  const narrative = await readNarrativeBySnapshot(pool, tenantId, persisted.snapshot.id);
  const bundle = await buildReadBundle(pool, tenantId, persisted);
  const warnings: string[] = [...(narrative?.warnings ?? [])];
  if (narrative && narrative.status !== 'validated' && narrative.motive) warnings.push(narrative.motive);
  return {
    kind: 'investment_comparison',
    version: 1,
    snapshotId: persisted.snapshot.id,
    evaluatedAt: persisted.snapshot.evaluatedAt,
    bundle,
    featureSetVersion: persisted.companions.featureSetVersion,
    featuresByEdition: persisted.companions.featuresByEdition,
    v0Shadow: persisted.companions.v0Shadow,
    availableCatalog: persisted.companions.availableCatalog,
    narrative,
    eligibleIsNotRecommended: ELIGIBLE_IS_NOT_RECOMMENDED,
    warnings,
  };
}
