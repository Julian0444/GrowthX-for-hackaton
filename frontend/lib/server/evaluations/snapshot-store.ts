// Repositorio del snapshot oficial (ticket 12). Server-only, PostgreSQL bajo
// RLS del tenant.
//
// El snapshot es INMUTABLE: acá no existe ninguna operación de update/delete y
// los grants (migración 005) tampoco las conceden. Un run publica a lo sumo un
// snapshot; una reentrega del step devuelve el confirmado en vez de duplicarlo
// (y jamás lo reescribe). El payload es el EvaluationSnapshot del contrato 07,
// validado en escritura Y revalidado en lectura; las columnas companion llevan
// lo que el ticket exige persistir y el contrato cerrado de 07 no modela
// (features con razón de ausencia, sombra v0, catálogo disponible).
//
// La salida del adaptador de modelo se guarda SEPARADA (snapshot_narratives),
// ligada al snapshot: puede faltar o estar rechazada sin tocar el snapshot.

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  ClaimRevision,
  CompanyRecord,
  EvaluationProfile,
  EvaluationReadBundle,
  EvaluationSnapshot,
  EventEditionRevision,
  OrganizerRevision,
  ParticipationRevision,
  SourceRecord,
} from '../../contracts/evaluation.ts';
import {
  parseClaimRevision,
  parseCompanyRecord,
  parseEvaluationProfile,
  parseEvaluationSnapshot,
  parseEventEditionRevision,
  parseOrganizerRevision,
  parseParticipationRevision,
  parseSourceRecord,
  type ValidationResult,
} from '../../contracts/evaluation-validation.ts';
import { withTenantTransaction } from '../db/pool.ts';
import type { ComparisonNarrativeRecord } from './model-adapter.ts';
import type { FeatureValue } from './scoring-policy.ts';

// ============ Formas persistidas junto al snapshot ============

export interface AvailableCatalogRecord {
  evaluatedAt: string;
  // Catálogo disponible ≠ conjunto comparado: la selección (hasta 3) nunca se
  // completa inventando candidatos si hay menos opciones elegibles.
  editionIds: string[];
  upcomingEditionIds: string[];
  comparedEditionIds: string[];
  note: string;
}

export type V0ShadowEntry =
  | { editionId: string; status: 'not_comparable'; reason: string }
  | {
      editionId: string;
      status: 'reference_found_not_comparable';
      reason: string;
      v0Id: string;
      v0Unit: string;
      v0Objective: string;
      // Score de v0 SOLO como registro de la sombra: jamás se reutiliza para
      // llenar un campo de v1.
      v0Score: number;
    };

export interface V0ShadowRecord {
  mode: 'offline_shadow';
  referenceLabel: string | null;
  entries: V0ShadowEntry[];
  note: string;
}

export interface SnapshotCompanions {
  featureSetVersion: string;
  featuresByEdition: Record<string, FeatureValue[]>;
  v0Shadow: V0ShadowRecord;
  availableCatalog: AvailableCatalogRecord;
}

export interface PersistedSnapshot {
  snapshot: EvaluationSnapshot;
  companions: SnapshotCompanions;
  runId: string;
  createdAt: string;
}

function mustParse<T>(kind: string, result: ValidationResult<T>): T {
  if (!result.ok) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`${kind} inválido según contrato: ${detail}`);
  }
  return result.value;
}

// ============ Escritura (inserción única, jamás update) ============

export async function persistOfficialSnapshot(
  pool: pg.Pool,
  tenantId: string,
  input: { runId: string; snapshot: EvaluationSnapshot; companions: SnapshotCompanions },
): Promise<{ status: 'persisted' | 'already_persisted'; snapshotId: string }> {
  // El payload se valida ANTES de tocar la base: un snapshot que no cumple el
  // contrato no se persiste (y la redacción viaja aparte: acá narrative=null).
  const snapshot = mustParse('EvaluationSnapshot', parseEvaluationSnapshot(input.snapshot));
  if (snapshot.narrative !== null)
    throw new Error('el snapshot oficial se confirma ANTES de la redacción: narrative debe ser null');

  return withTenantTransaction(pool, tenantId, async (client) => {
    // Reentrega del step: si el run ya confirmó su snapshot oficial, ese es el
    // resultado — no se duplica ni se reemplaza por una re-evaluación.
    const { rows: existing } = await client.query('select id from growthx.snapshots where run_id = $1', [
      input.runId,
    ]);
    if (existing.length > 0) {
      return { status: 'already_persisted', snapshotId: existing[0].id as string };
    }
    await client.query(
      `insert into growthx.snapshots
         (id, tenant_id, run_id, kind, profile_id, profile_version, contract_version,
          evaluated_at, payload, feature_set_version, features, v0_shadow, available_catalog)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        snapshot.id,
        tenantId,
        input.runId,
        snapshot.kind,
        snapshot.profileId,
        snapshot.profileVersion,
        snapshot.contractVersion,
        snapshot.evaluatedAt,
        JSON.stringify(snapshot),
        input.companions.featureSetVersion,
        JSON.stringify(input.companions.featuresByEdition),
        JSON.stringify(input.companions.v0Shadow),
        JSON.stringify(input.companions.availableCatalog),
      ],
    );
    return { status: 'persisted', snapshotId: snapshot.id };
  });
}

// Registro de redacción: a lo sumo uno por snapshot; la reentrega devuelve el
// existente. Defensa en profundidad: toda cita debe ser una revisión fijada
// por el snapshot (la validación por alternativa vive en model-adapter.ts).
export async function persistNarrativeRecord(
  pool: pg.Pool,
  tenantId: string,
  record: ComparisonNarrativeRecord,
): Promise<{ status: 'persisted' | 'already_persisted'; narrativeId: string }> {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const { rows: snapshotRows } = await client.query(
      'select payload from growthx.snapshots where id = $1',
      [record.snapshotId],
    );
    if (snapshotRows.length === 0)
      throw new Error(`snapshot ${record.snapshotId} inexistente bajo el tenant: la redacción no se guarda suelta`);
    const snapshot = mustParse('EvaluationSnapshot', parseEvaluationSnapshot(snapshotRows[0].payload));
    const pinned = new Set(snapshot.claimRevisionIds);
    for (const proposal of record.proposals) {
      const foreign = proposal.selectedClaimRevisionIds.find((id) => !pinned.has(id));
      if (foreign)
        throw new Error(
          `registro de redacción cita una revisión fuera del snapshot («${foreign}»): no se persiste`,
        );
    }
    const { rows: existing } = await client.query(
      'select id from growthx.snapshot_narratives where snapshot_id = $1',
      [record.snapshotId],
    );
    if (existing.length > 0) return { status: 'already_persisted', narrativeId: existing[0].id as string };
    const narrativeId = randomUUID();
    await client.query(
      `insert into growthx.snapshot_narratives
         (id, tenant_id, snapshot_id, status, model, prompt_version, duration_ms, usage, payload)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        narrativeId,
        tenantId,
        record.snapshotId,
        record.status,
        record.model,
        record.promptVersion,
        Math.round(record.durationMs),
        record.usage === null ? null : JSON.stringify(record.usage),
        JSON.stringify(record),
      ],
    );
    return { status: 'persisted', narrativeId };
  });
}

// ============ Lectura (revalidación al leer) ============

interface SnapshotRow {
  id: string;
  run_id: string;
  payload: unknown;
  feature_set_version: string;
  features: unknown;
  v0_shadow: unknown;
  available_catalog: unknown;
  created_at: Date;
}

function rowToPersisted(row: SnapshotRow): PersistedSnapshot {
  const snapshot = mustParse('EvaluationSnapshot', parseEvaluationSnapshot(row.payload));
  return {
    snapshot,
    companions: {
      featureSetVersion: row.feature_set_version,
      featuresByEdition: row.features as Record<string, FeatureValue[]>,
      v0Shadow: row.v0_shadow as V0ShadowRecord,
      availableCatalog: row.available_catalog as AvailableCatalogRecord,
    },
    runId: row.run_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function readSnapshotByRun(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
): Promise<PersistedSnapshot | null> {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      `select id, run_id, payload, feature_set_version, features, v0_shadow, available_catalog, created_at
         from growthx.snapshots where run_id = $1`,
      [runId],
    );
    return rows.length > 0 ? rowToPersisted(rows[0] as SnapshotRow) : null;
  });
}

export async function readNarrativeBySnapshot(
  pool: pg.Pool,
  tenantId: string,
  snapshotId: string,
): Promise<ComparisonNarrativeRecord | null> {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      'select payload from growthx.snapshot_narratives where snapshot_id = $1',
      [snapshotId],
    );
    return rows.length > 0 ? (rows[0].payload as ComparisonNarrativeRecord) : null;
  });
}

// Bundle de lectura del contrato 07: el snapshot más las revisiones EXACTAS
// que referencia, releídas de las tablas del catálogo y revalidadas. Una
// referencia irresoluble queda afuera y la proyección la muestra como
// pendiente honesto (jamás como valor inventado).
export async function buildReadBundle(
  pool: pg.Pool,
  tenantId: string,
  persisted: PersistedSnapshot,
): Promise<EvaluationReadBundle> {
  const { snapshot } = persisted;
  return withTenantTransaction(pool, tenantId, async (client) => {
    const { rows: profileRows } = await client.query('select payload from growthx.profiles where id = $1', [
      snapshot.profileId,
    ]);
    if (profileRows.length === 0) throw new Error(`perfil ${snapshot.profileId} inexistente bajo el tenant`);
    const profile: EvaluationProfile = mustParse(
      'EvaluationProfile',
      parseEvaluationProfile(profileRows[0].payload),
    );

    const byIds = async <T>(
      table: string,
      ids: string[],
      parse: (payload: unknown) => ValidationResult<T>,
      kind: string,
    ): Promise<T[]> => {
      if (ids.length === 0) return [];
      const { rows } = await client.query(`select payload from growthx.${table} where id = any($1)`, [ids]);
      return rows.map((row) => mustParse(kind, parse(row.payload)));
    };

    const claims = await byIds<ClaimRevision>('claim_revisions', snapshot.claimRevisionIds, parseClaimRevision, 'ClaimRevision');
    const organizers = await byIds<OrganizerRevision>(
      'organizer_revisions',
      snapshot.organizerRevisionIds,
      parseOrganizerRevision,
      'OrganizerRevision',
    );
    const editions = await byIds<EventEditionRevision>(
      'edition_revisions',
      snapshot.editionRevisionIds,
      parseEventEditionRevision,
      'EventEditionRevision',
    );
    const participations = await byIds<ParticipationRevision>(
      'participation_revisions',
      snapshot.participationRevisionIds,
      parseParticipationRevision,
      'ParticipationRevision',
    );

    const sourceIds = [
      ...new Set([
        ...claims.flatMap((claim) => claim.sourceIds),
        ...organizers.flatMap((organizer) => organizer.aliases.flatMap((alias) => alias.sourceIds)),
        ...participations.flatMap((participation) => [
          ...participation.sourceIds,
          ...(participation.commercialOutcome.status === 'reported' ? participation.commercialOutcome.sourceIds : []),
        ]),
      ]),
    ];
    const sources =
      sourceIds.length === 0
        ? []
        : (
            await client.query('select payload from growthx.sources where id = any($1)', [sourceIds])
          ).rows.map((row) => mustParse<SourceRecord>('SourceRecord', parseSourceRecord(row.payload)));

    const companyIds = [...new Set(participations.map((participation) => participation.companyId))];
    const companies =
      companyIds.length === 0
        ? []
        : (
            await client.query('select payload from growthx.companies where id = any($1)', [companyIds])
          ).rows.map((row) => mustParse<CompanyRecord>('CompanyRecord', parseCompanyRecord(row.payload)));

    return {
      profile,
      snapshot,
      claims,
      sources,
      organizers,
      editions,
      companies,
      participations,
      // Decisión y campaña pertenecen a tickets posteriores (13-14).
      decision: null,
      campaign: null,
    };
  });
}
