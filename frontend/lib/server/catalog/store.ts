// Carga del catálogo curado bajo el tenant (ticket 09). Server-only.
//
// UNA transacción con contexto de tenant para todo el manifiesto: o entra
// completo o no entra nada. Orden de carga: fuentes → empresas → organizadores
// → ediciones → participaciones → claims, así cada referencia se comprueba
// contra material ya presente DEL MISMO TENANT (la RLS hace invisible el resto).
//
// Idempotencia en dos niveles:
// - Manifiesto completo: mismo hash canónico ya cargado → no-op declarado.
// - Entidad por entidad: mismo id con el mismo payload → unchanged; mismo id
//   con otro payload → conflicto (inmutables; una corrección es una revisión
//   nueva). Así dos manifiestos que comparten material no duplican nada.

import type pg from 'pg';
import { withTenantTransaction } from '../db/pool.ts';
import {
  CatalogIntegrityError,
  upsertClaimRevisions,
  upsertSources,
  type UpsertCounts,
} from '../evidence/store.ts';
import { manifestHash, type CurationManifest } from './manifest.ts';
import type {
  CompanyRecord,
  EventEditionRevision,
  OrganizerRevision,
  ParticipationRevision,
} from '../../contracts/evaluation.ts';

export interface CatalogLoadSummary {
  status: 'loaded' | 'already_loaded';
  loadId: string | null;
  manifestName: string;
  manifestHash: string;
  material: CurationManifest['material'];
  counts: {
    sources: UpsertCounts;
    companies: UpsertCounts;
    organizerRevisions: UpsertCounts;
    editionRevisions: UpsertCounts;
    participationRevisions: UpsertCounts;
    claimRevisions: UpsertCounts;
  };
}

const EMPTY: UpsertCounts = { inserted: 0, unchanged: 0 };

interface RevisionTableSpec {
  identityTable: string;
  revisionTable: string;
  entityColumn: string;
}

// Upsert genérico de una revisión encadenada (organizador/edición/participación).
async function upsertRevision(
  client: pg.ClientBase,
  tenantId: string,
  spec: RevisionTableSpec,
  revision: { id: string; previousRevisionId: string | null; revisedAt: string; contractVersion: string },
  entityId: string,
  extraColumns: Record<string, string>,
  payload: unknown,
  loadId: string,
  issues: string[],
): Promise<'inserted' | 'unchanged' | 'failed'> {
  const { rows: existing } = await client.query(
    `select ${spec.entityColumn}, payload = $2::jsonb as same from ${spec.revisionTable} where id = $1`,
    [revision.id, JSON.stringify(payload)],
  );
  if (existing.length > 0) {
    if (existing[0].same === true) return 'unchanged';
    issues.push(
      `revisión «${revision.id}» (${spec.revisionTable}): ya existe con otro contenido; una revisión es inmutable — una corrección es una revisión NUEVA`,
    );
    return 'failed';
  }
  if (revision.previousRevisionId !== null) {
    const { rows: previous } = await client.query(
      `select ${spec.entityColumn} as entity_id from ${spec.revisionTable} where id = $1`,
      [revision.previousRevisionId],
    );
    if (previous.length === 0) {
      issues.push(
        `revisión «${revision.id}»: previousRevisionId «${revision.previousRevisionId}» inexistente bajo el tenant`,
      );
      return 'failed';
    }
    if (previous[0].entity_id !== entityId) {
      issues.push(
        `revisión «${revision.id}»: previousRevisionId pertenece a otra identidad («${previous[0].entity_id}») — las identidades no se fusionan`,
      );
      return 'failed';
    }
  }
  await client.query(
    `insert into ${spec.identityTable} (tenant_id, id) values ($1, $2) on conflict do nothing`,
    [tenantId, entityId],
  );
  const extraNames = Object.keys(extraColumns);
  const columns = [
    'tenant_id',
    'id',
    spec.entityColumn,
    ...extraNames,
    'previous_revision_id',
    'revised_at',
    'contract_version',
    'payload',
    'load_id',
  ];
  const values = [
    tenantId,
    revision.id,
    entityId,
    ...extraNames.map((name) => extraColumns[name]),
    revision.previousRevisionId,
    revision.revisedAt,
    revision.contractVersion,
    JSON.stringify(payload),
    loadId,
  ];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  await client.query(
    `insert into ${spec.revisionTable} (${columns.join(', ')}) values (${placeholders})`,
    values,
  );
  return 'inserted';
}

async function upsertCompanies(
  client: pg.ClientBase,
  tenantId: string,
  companies: CompanyRecord[],
  loadId: string,
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, unchanged: 0 };
  const issues: string[] = [];
  for (const company of companies) {
    const { rows } = await client.query(
      'select payload = $2::jsonb as same from growthx.companies where id = $1',
      [company.id, JSON.stringify(company)],
    );
    if (rows.length > 0) {
      if (rows[0].same === true) counts.unchanged += 1;
      else
        issues.push(
          `empresa «${company.id}»: ya existe con otro contenido; el registro de empresa es inmutable en v1 — usar un id nuevo`,
        );
      continue;
    }
    await client.query(
      `insert into growthx.companies (tenant_id, id, name, payload, load_id)
       values ($1, $2, $3, $4, $5)`,
      [tenantId, company.id, company.name, JSON.stringify(company), loadId],
    );
    counts.inserted += 1;
  }
  if (issues.length > 0) throw new CatalogIntegrityError(issues);
  return counts;
}

async function upsertOrganizerRevisions(
  client: pg.ClientBase,
  tenantId: string,
  revisions: OrganizerRevision[],
  loadId: string,
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, unchanged: 0 };
  const issues: string[] = [];
  const spec: RevisionTableSpec = {
    identityTable: 'growthx.organizers',
    revisionTable: 'growthx.organizer_revisions',
    entityColumn: 'organizer_id',
  };
  for (const revision of revisions) {
    // Un alias confirmado exige soporte existente bajo el tenant.
    const aliasSources = revision.aliases.flatMap((alias) => alias.sourceIds);
    const missing = await missingSources(client, aliasSources);
    if (missing.length > 0) {
      issues.push(`organizador «${revision.organizerId}»: fuentes de alias inexistentes: ${missing.join(', ')}`);
      continue;
    }
    const outcome = await upsertRevision(
      client,
      tenantId,
      spec,
      revision,
      revision.organizerId,
      {},
      revision,
      loadId,
      issues,
    );
    if (outcome === 'inserted') counts.inserted += 1;
    if (outcome === 'unchanged') counts.unchanged += 1;
  }
  if (issues.length > 0) throw new CatalogIntegrityError(issues);
  return counts;
}

// Exportado para el importador durable de Luma (ticket 11): la importación
// reutiliza ESTE upsert (misma cadena de revisiones, mismas verificaciones),
// no un segundo formato de escritura de ediciones.
export async function upsertEditionRevisions(
  client: pg.ClientBase,
  tenantId: string,
  revisions: EventEditionRevision[],
  loadId: string,
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, unchanged: 0 };
  const issues: string[] = [];
  const spec: RevisionTableSpec = {
    identityTable: 'growthx.event_editions',
    revisionTable: 'growthx.edition_revisions',
    entityColumn: 'edition_id',
  };
  for (const revision of revisions) {
    // organiza/coorganiza: cada organizador debe existir; un coorganizador
    // enlazado acá NO hereda otras ediciones (la relación es por edición).
    let ok = true;
    for (const organizerId of revision.organizerIds) {
      const { rows } = await client.query('select 1 from growthx.organizers where id = $1', [organizerId]);
      if (rows.length === 0) {
        issues.push(`edición «${revision.editionId}»: organizador «${organizerId}» inexistente bajo el tenant`);
        ok = false;
      }
    }
    if (!ok) continue;
    const outcome = await upsertRevision(
      client,
      tenantId,
      spec,
      revision,
      revision.editionId,
      {},
      revision,
      loadId,
      issues,
    );
    if (outcome === 'inserted') counts.inserted += 1;
    if (outcome === 'unchanged') counts.unchanged += 1;
  }
  if (issues.length > 0) throw new CatalogIntegrityError(issues);
  return counts;
}

async function upsertParticipationRevisions(
  client: pg.ClientBase,
  tenantId: string,
  revisions: ParticipationRevision[],
  loadId: string,
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, unchanged: 0 };
  const issues: string[] = [];
  const spec: RevisionTableSpec = {
    identityTable: 'growthx.participations',
    revisionTable: 'growthx.participation_revisions',
    entityColumn: 'participation_id',
  };
  for (const revision of revisions) {
    const outcomeSources =
      revision.commercialOutcome.status === 'reported' ? revision.commercialOutcome.sourceIds : [];
    const missing = await missingSources(client, [...revision.sourceIds, ...outcomeSources]);
    if (missing.length > 0) {
      issues.push(`participación «${revision.participationId}»: fuentes inexistentes: ${missing.join(', ')}`);
      continue;
    }
    const outcome = await upsertRevision(
      client,
      tenantId,
      spec,
      revision,
      revision.participationId,
      { company_id: revision.companyId, edition_id: revision.editionId },
      revision,
      loadId,
      issues,
    );
    if (outcome === 'inserted') counts.inserted += 1;
    if (outcome === 'unchanged') counts.unchanged += 1;
  }
  if (issues.length > 0) throw new CatalogIntegrityError(issues);
  return counts;
}

async function missingSources(client: pg.ClientBase, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { rows } = await client.query('select id from growthx.sources where id = any($1)', [unique]);
  const found = new Set(rows.map((row) => row.id as string));
  return unique.filter((id) => !found.has(id));
}

// Chequeo diferido: claimRevisionIds citados por revisiones de organizador y
// edición deben existir al cerrar la carga (los claims entran al final).
async function verifyClaimRevisionRefs(
  client: pg.ClientBase,
  manifest: CurationManifest,
): Promise<void> {
  const refs = new Map<string, string>();
  for (const organizer of manifest.organizers)
    for (const id of organizer.claimRevisionIds) refs.set(id, `organizador «${organizer.organizerId}»`);
  for (const edition of manifest.editions)
    for (const id of edition.claimRevisionIds) refs.set(id, `edición «${edition.editionId}»`);
  if (refs.size === 0) return;
  const ids = [...refs.keys()];
  const { rows } = await client.query('select id from growthx.claim_revisions where id = any($1)', [ids]);
  const found = new Set(rows.map((row) => row.id as string));
  const issues = ids
    .filter((id) => !found.has(id))
    .map((id) => `${refs.get(id)}: claimRevisionId «${id}» inexistente bajo el tenant`);
  if (issues.length > 0) throw new CatalogIntegrityError(issues);
}

export async function loadCuratedCatalog(
  pool: pg.Pool,
  tenantId: string,
  manifest: CurationManifest,
): Promise<CatalogLoadSummary> {
  const hash = manifestHash(manifest);
  return withTenantTransaction(pool, tenantId, async (client) => {
    const { rows: existing } = await client.query(
      'select id from growthx.catalog_loads where manifest_hash = $1',
      [hash],
    );
    if (existing.length > 0) {
      return {
        status: 'already_loaded',
        loadId: existing[0].id as string,
        manifestName: manifest.name,
        manifestHash: hash,
        material: manifest.material,
        counts: {
          sources: EMPTY,
          companies: EMPTY,
          organizerRevisions: EMPTY,
          editionRevisions: EMPTY,
          participationRevisions: EMPTY,
          claimRevisions: EMPTY,
        },
      };
    }

    const { rows: loadRows } = await client.query(
      `insert into growthx.catalog_loads
         (tenant_id, manifest_name, manifest_hash, material, authorized_by, verified_at, note, summary)
       values ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)
       returning id`,
      [
        tenantId,
        manifest.name,
        hash,
        manifest.material,
        manifest.authorizedBy,
        manifest.verifiedAt,
        manifest.note,
      ],
    );
    const loadId = loadRows[0].id as string;

    const counts = {
      sources: await upsertSources(client, tenantId, manifest.sources, loadId),
      companies: await upsertCompanies(client, tenantId, manifest.companies, loadId),
      organizerRevisions: await upsertOrganizerRevisions(client, tenantId, manifest.organizers, loadId),
      editionRevisions: await upsertEditionRevisions(client, tenantId, manifest.editions, loadId),
      participationRevisions: await upsertParticipationRevisions(
        client,
        tenantId,
        manifest.participations,
        loadId,
      ),
      claimRevisions: await upsertClaimRevisions(client, tenantId, manifest.claims, loadId),
    };
    await verifyClaimRevisionRefs(client, manifest);

    await client.query('update growthx.catalog_loads set summary = $2 where id = $1', [
      loadId,
      JSON.stringify(counts),
    ]);
    return {
      status: 'loaded',
      loadId,
      manifestName: manifest.name,
      manifestHash: hash,
      material: manifest.material,
      counts,
    };
  });
}
