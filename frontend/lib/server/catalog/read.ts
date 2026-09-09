// Lectura del catálogo curado y de los expedientes (ticket 09). Server-only.
//
// Todo sale de PostgreSQL bajo el tenant (RLS); abrir un expediente NO consulta
// fuentes nuevas. El JSONB persistido se REVALIDA contra los contratos de 07 al
// leer (mismo criterio que run-worker.ts con el perfil): un payload que dejó de
// cumplir el contrato no se interpreta en silencio.
//
// La vigencia se calcula con el instante de evaluación recibido (inyectable
// para tests con reloj controlado) y la política temporal del ticket 04: un
// evento curado como futuro que ya venció se marca como tal AL EVALUARLO, y un
// catálogo sin opciones vigentes se declara — no se rellena con seeds
// históricos ni con material de otro origen.

import type pg from 'pg';
import type {
  ClaimRevision,
  CompanyRecord,
  DeclaredDate,
  EditionLocation,
  EventEditionRevision,
  OrganizerRevision,
  ParticipationRevision,
  SourceRecord,
} from '../../contracts/evaluation.ts';
import {
  parseClaimRevision,
  parseCompanyRecord,
  parseEventEditionRevision,
  parseOrganizerRevision,
  parseParticipationRevision,
  parseSourceRecord,
  type ValidationResult,
} from '../../contracts/evaluation-validation.ts';
import { classifyEventValidity, type EventValidity } from '../../temporal/event-validity.ts';
import { withTenantTransaction } from '../db/pool.ts';
import {
  orderRevisionChain,
  readClaimsForSubjects,
  readSourcesByIds,
  type RevisionedClaimRead,
} from '../evidence/store.ts';
import type { CatalogMaterial } from './manifest.ts';

// ============ Formas de la lectura (las espeja lib/api/atlas-client.ts) ============

export interface EditionValidityView {
  validity: EventValidity;
  reason: string;
}

export interface CurationInfo {
  material: CatalogMaterial;
  authorizedBy: string;
  verifiedAt: string;
  manifestName: string;
  note: string | null;
}

export interface CatalogEditionSummary {
  editionId: string;
  name: string;
  canonicalUrl: string | null;
  startDate: DeclaredDate;
  location: EditionLocation;
  organizers: { organizerId: string; displayName: string }[];
  validity: EditionValidityView;
  // Qué promesas siguen sin confirmar: «evento futuro verificado» ≠ «todas sus
  // promesas confirmadas».
  pendingAttributes: string[];
  curation: CurationInfo | null;
}

export interface CatalogListRead {
  contractVersion: '1';
  evaluatedAt: string;
  // Orden de presentación (id estable), NO un ranking: sin política aprobada no
  // hay orden de mérito.
  editions: CatalogEditionSummary[];
  upcomingCount: number;
  note: string | null;
}

export interface RevisionedOrganizerRead {
  organizerId: string;
  revisions: OrganizerRevision[];
}

export interface RevisionedParticipationRead {
  participationId: string;
  revisions: ParticipationRevision[];
}

export interface EditionDossierRead {
  contractVersion: '1';
  evaluatedAt: string;
  editionId: string;
  // Cadena completa de revisiones de la edición (primera → última).
  editionRevisions: EventEditionRevision[];
  validity: EditionValidityView;
  organizers: RevisionedOrganizerRead[];
  claims: RevisionedClaimRead[];
  participations: RevisionedParticipationRead[];
  companies: CompanyRecord[];
  sources: SourceRecord[];
  curation: CurationInfo | null;
}

export interface OrganizerDossierEdition {
  edition: EventEditionRevision; // última revisión
  validity: EditionValidityView;
}

export interface OrganizerDossierRead {
  contractVersion: '1';
  evaluatedAt: string;
  organizerId: string;
  organizerRevisions: OrganizerRevision[];
  claims: RevisionedClaimRead[];
  // Solo ediciones cuya última revisión lo lista como organizador o
  // coorganizador: un coorganizador no hereda los eventos ajenos.
  editions: OrganizerDossierEdition[];
  participations: RevisionedParticipationRead[];
  companies: CompanyRecord[];
  sources: SourceRecord[];
  coverage: { antecedentsDocumented: number; note: string | null };
}

// ============ Vigencia de una fecha declarada ============

// Adapta DeclaredDate (contrato 07) a la política temporal del ticket 04.
// Con zona IANA declarada en date_only se evalúa igual de forma conservadora
// (rango completo de offsets): refinarlo por zona es parte de D2.
export function classifyDeclaredDate(date: DeclaredDate, evaluationInstant: string): EditionValidityView {
  switch (date.precision) {
    case 'instant': {
      const result = classifyEventValidity(date.iso, evaluationInstant);
      return { validity: result.validity, reason: result.reason };
    }
    case 'date_only': {
      const result = classifyEventValidity(date.date, evaluationInstant);
      return { validity: result.validity, reason: result.reason };
    }
    case 'ambiguous': {
      const evaluation = Date.parse(evaluationInstant);
      const earliest = date.earliest !== null ? Date.parse(date.earliest) : Number.NaN;
      const latest = date.latest !== null ? Date.parse(date.latest) : Number.NaN;
      if (Number.isFinite(latest) && latest < evaluation) {
        return {
          validity: 'past',
          reason: `Declared range ends (${date.latest}) before the evaluation instant; expired as an opportunity, kept as antecedent.`,
        };
      }
      if (Number.isFinite(earliest) && earliest >= evaluation) {
        return {
          validity: 'upcoming',
          reason: `Declared range starts (${date.earliest}) at or after the evaluation instant.`,
        };
      }
      return {
        validity: 'date_ambiguous',
        reason: `Declared date "${date.text}" is ambiguous around the evaluation instant; it stays pending instead of guessing.`,
      };
    }
    case 'unknown':
      return {
        validity: 'date_pending',
        reason: 'No declared start date; the date stays pending and is never replaced by the current time.',
      };
  }
}

// ============ Helpers de parseo (revalidación al leer) ============

function mustParse<T>(kind: string, id: string, result: ValidationResult<T>): T {
  if (!result.ok) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`${kind} «${id}» inválido según contrato al leer: ${detail}`);
  }
  return result.value;
}

interface RevisionRow {
  entity_id: string;
  payload: unknown;
  load_id: string;
}

async function loadEditionChains(
  client: pg.ClientBase,
): Promise<Map<string, { revisions: EventEditionRevision[]; latestLoadId: string }>> {
  const { rows } = await client.query(
    'select edition_id as entity_id, payload, load_id from growthx.edition_revisions',
  );
  return groupChains(rows as RevisionRow[], (row) =>
    mustParse('EventEditionRevision', String((row.payload as { id?: string }).id ?? '?'), parseEventEditionRevision(row.payload)),
  );
}

async function loadOrganizerChains(
  client: pg.ClientBase,
  organizerIds: string[] | null,
): Promise<Map<string, { revisions: OrganizerRevision[]; latestLoadId: string }>> {
  const { rows } = organizerIds
    ? await client.query(
        'select organizer_id as entity_id, payload, load_id from growthx.organizer_revisions where organizer_id = any($1)',
        [organizerIds],
      )
    : await client.query('select organizer_id as entity_id, payload, load_id from growthx.organizer_revisions');
  return groupChains(rows as RevisionRow[], (row) =>
    mustParse('OrganizerRevision', String((row.payload as { id?: string }).id ?? '?'), parseOrganizerRevision(row.payload)),
  );
}

function groupChains<T extends { id: string; previousRevisionId: string | null; revisedAt: string }>(
  rows: RevisionRow[],
  parse: (row: RevisionRow) => T,
): Map<string, { revisions: T[]; latestLoadId: string }> {
  const grouped = new Map<string, { revision: T; loadId: string }[]>();
  for (const row of rows) {
    const revision = parse(row);
    const list = grouped.get(row.entity_id) ?? [];
    list.push({ revision, loadId: row.load_id });
    grouped.set(row.entity_id, list);
  }
  const out = new Map<string, { revisions: T[]; latestLoadId: string }>();
  for (const [entityId, entries] of grouped) {
    const ordered = orderRevisionChain(
      entries.map((entry) => entry.revision),
      (revision) => revision.revisedAt,
    );
    const latest = ordered[ordered.length - 1];
    const latestLoadId = entries.find((entry) => entry.revision.id === latest.id)?.loadId ?? entries[0].loadId;
    out.set(entityId, { revisions: ordered, latestLoadId });
  }
  return out;
}

async function loadCurationInfo(
  client: pg.ClientBase,
  loadIds: string[],
): Promise<Map<string, CurationInfo>> {
  const unique = [...new Set(loadIds)];
  if (unique.length === 0) return new Map();
  const { rows } = await client.query(
    `select id, material, authorized_by, verified_at, manifest_name, note
       from growthx.catalog_loads where id = any($1::uuid[])`,
    [unique],
  );
  return new Map(
    rows.map((row) => [
      row.id as string,
      {
        material: row.material as CatalogMaterial,
        authorizedBy: row.authorized_by as string,
        verifiedAt: (row.verified_at as Date).toISOString(),
        manifestName: row.manifest_name as string,
        note: (row.note as string | null) ?? null,
      },
    ]),
  );
}

const parseClaimOrThrow = (payload: unknown): ClaimRevision =>
  mustParse('ClaimRevision', String((payload as { id?: string })?.id ?? '?'), parseClaimRevision(payload));

// Las fuentes también se revalidan al leer (mismo criterio que el resto del
// material persistido).
async function readValidatedSources(client: pg.ClientBase, ids: string[]): Promise<SourceRecord[]> {
  const sources = await readSourcesByIds(client, ids);
  return sources.map((source) =>
    mustParse('SourceRecord', String((source as { id?: string }).id ?? '?'), parseSourceRecord(source)),
  );
}

function latestOf<T>(chain: T[]): T {
  return chain[chain.length - 1];
}

function claimIsPending(revision: ClaimRevision): boolean {
  return revision.status === 'pending' || revision.value.kind === 'pending';
}

function pendingAttributesFor(
  validity: EditionValidityView,
  location: EditionLocation,
  editionClaims: RevisionedClaimRead[],
): string[] {
  const pending: string[] = [];
  if (validity.validity === 'date_pending' || validity.validity === 'date_ambiguous') pending.push('date');
  if (location.scope === 'unknown' || location.name === null) pending.push('location');
  else if (location.scope === 'country' || location.scope === 'region' || location.scope === 'global')
    pending.push('city');
  const latestByAttribute = new Map<string, ClaimRevision[]>();
  for (const claim of editionClaims) {
    const latest = latestOf(claim.revisions);
    const list = latestByAttribute.get(latest.attribute) ?? [];
    list.push(latest);
    latestByAttribute.set(latest.attribute, list);
  }
  for (const attribute of ['access', 'audience']) {
    const latest = latestByAttribute.get(attribute);
    if (!latest || latest.every(claimIsPending)) pending.push(attribute);
  }
  const costAttributes = [...latestByAttribute.keys()].filter((attribute) => attribute.startsWith('cost:'));
  if (costAttributes.length === 0) pending.push('cost');
  else
    for (const attribute of costAttributes.sort()) {
      const latest = latestByAttribute.get(attribute) ?? [];
      if (latest.every(claimIsPending)) pending.push(attribute);
    }
  return pending;
}

function collectSourceIds(
  claims: RevisionedClaimRead[],
  organizers: RevisionedOrganizerRead[],
  participations: RevisionedParticipationRead[],
): string[] {
  const ids = new Set<string>();
  for (const claim of claims)
    for (const revision of claim.revisions) for (const id of revision.sourceIds) ids.add(id);
  for (const organizer of organizers)
    for (const revision of organizer.revisions)
      for (const alias of revision.aliases) for (const id of alias.sourceIds) ids.add(id);
  for (const participation of participations)
    for (const revision of participation.revisions) {
      for (const id of revision.sourceIds) ids.add(id);
      if (revision.commercialOutcome.status === 'reported')
        for (const id of revision.commercialOutcome.sourceIds) ids.add(id);
    }
  return [...ids];
}

async function loadParticipationsForEditions(
  client: pg.ClientBase,
  editionIds: string[],
): Promise<RevisionedParticipationRead[]> {
  if (editionIds.length === 0) return [];
  const { rows: idRows } = await client.query(
    'select distinct participation_id from growthx.participation_revisions where edition_id = any($1)',
    [editionIds],
  );
  const participationIds = idRows.map((row) => row.participation_id as string);
  if (participationIds.length === 0) return [];
  const { rows } = await client.query(
    'select participation_id, payload from growthx.participation_revisions where participation_id = any($1)',
    [participationIds],
  );
  const grouped = new Map<string, ParticipationRevision[]>();
  for (const row of rows) {
    const revision = mustParse(
      'ParticipationRevision',
      String((row.payload as { id?: string }).id ?? '?'),
      parseParticipationRevision(row.payload),
    );
    const list = grouped.get(row.participation_id as string) ?? [];
    list.push(revision);
    grouped.set(row.participation_id as string, list);
  }
  return [...grouped.entries()]
    .map(([participationId, revisions]) => ({
      participationId,
      revisions: orderRevisionChain(revisions, (revision) => revision.revisedAt),
    }))
    .sort((a, b) => a.participationId.localeCompare(b.participationId));
}

async function loadCompanies(client: pg.ClientBase, companyIds: string[]): Promise<CompanyRecord[]> {
  const unique = [...new Set(companyIds)];
  if (unique.length === 0) return [];
  const { rows } = await client.query('select payload from growthx.companies where id = any($1)', [unique]);
  return rows.map((row) =>
    mustParse('CompanyRecord', String((row.payload as { id?: string }).id ?? '?'), parseCompanyRecord(row.payload)),
  );
}

// ============ Lecturas públicas ============

export async function listCatalogEditions(
  pool: pg.Pool,
  tenantId: string,
  evaluationInstant: string,
): Promise<CatalogListRead> {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const editionChains = await loadEditionChains(client);
    const organizerIds = [
      ...new Set([...editionChains.values()].flatMap(({ revisions }) => latestOf(revisions).organizerIds)),
    ];
    const organizerChains = await loadOrganizerChains(client, organizerIds);
    const curationByLoad = await loadCurationInfo(
      client,
      [...editionChains.values()].map(({ latestLoadId }) => latestLoadId),
    );

    const editions: CatalogEditionSummary[] = [];
    for (const [editionId, { revisions, latestLoadId }] of [...editionChains.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const latest = latestOf(revisions);
      const validity = classifyDeclaredDate(latest.startDate, evaluationInstant);
      const editionClaims = await readClaimsForSubjects(
        client,
        [{ type: 'edition', id: editionId }],
        parseClaimOrThrow,
      );
      editions.push({
        editionId,
        name: latest.name,
        canonicalUrl: latest.canonicalUrl,
        startDate: latest.startDate,
        location: latest.location,
        organizers: latest.organizerIds.map((organizerId) => ({
          organizerId,
          displayName: organizerChains.has(organizerId)
            ? latestOf(organizerChains.get(organizerId)!.revisions).displayName
            : organizerId,
        })),
        validity,
        pendingAttributes: pendingAttributesFor(validity, latest.location, editionClaims),
        curation: curationByLoad.get(latestLoadId) ?? null,
      });
    }

    const upcomingCount = editions.filter((edition) => edition.validity.validity === 'upcoming').length;
    const hasSynthetic = editions.some((edition) => edition.curation?.material === 'synthetic');
    const notes: string[] = [];
    if (editions.length === 0) {
      notes.push(
        'No hay catálogo curado bajo este tenant. La carga es interna y explícita (scripts/load-curated-catalog.ts); no se rellena con seeds históricos.',
      );
    } else if (upcomingCount === 0) {
      notes.push(
        `El catálogo curado no tiene ediciones vigentes al ${evaluationInstant}: se declara el límite del catálogo; no se rellena con seeds históricos.`,
      );
    }
    if (hasSynthetic)
      notes.push('Material sintético etiquetado (D4 pendiente): no acredita la revisión de eventos reales.');

    return {
      contractVersion: '1',
      evaluatedAt: evaluationInstant,
      editions,
      upcomingCount,
      note: notes.length > 0 ? notes.join(' ') : null,
    };
  });
}

export async function readEditionDossier(
  pool: pg.Pool,
  tenantId: string,
  editionId: string,
  evaluationInstant: string,
): Promise<EditionDossierRead | null> {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      'select edition_id as entity_id, payload, load_id from growthx.edition_revisions where edition_id = $1',
      [editionId],
    );
    if (rows.length === 0) return null;
    const chains = groupChains(rows as RevisionRow[], (row) =>
      mustParse('EventEditionRevision', String((row.payload as { id?: string }).id ?? '?'), parseEventEditionRevision(row.payload)),
    );
    const chain = chains.get(editionId)!;
    const latest = latestOf(chain.revisions);
    const validity = classifyDeclaredDate(latest.startDate, evaluationInstant);

    const organizerChains = await loadOrganizerChains(client, latest.organizerIds);
    const organizers: RevisionedOrganizerRead[] = latest.organizerIds
      .filter((organizerId) => organizerChains.has(organizerId))
      .map((organizerId) => ({
        organizerId,
        revisions: organizerChains.get(organizerId)!.revisions,
      }));

    const claims = await readClaimsForSubjects(
      client,
      [
        { type: 'edition', id: editionId },
        ...organizers.map((organizer) => ({ type: 'organizer', id: organizer.organizerId })),
      ],
      parseClaimOrThrow,
    );
    const participations = await loadParticipationsForEditions(client, [editionId]);
    const companies = await loadCompanies(
      client,
      participations.map((participation) => latestOf(participation.revisions).companyId),
    );
    const sources = await readValidatedSources(client, collectSourceIds(claims, organizers, participations));
    const curationByLoad = await loadCurationInfo(client, [chain.latestLoadId]);

    return {
      contractVersion: '1',
      evaluatedAt: evaluationInstant,
      editionId,
      editionRevisions: chain.revisions,
      validity,
      organizers,
      claims,
      participations,
      companies,
      sources,
      curation: curationByLoad.get(chain.latestLoadId) ?? null,
    };
  });
}

export async function readOrganizerDossier(
  pool: pg.Pool,
  tenantId: string,
  organizerId: string,
  evaluationInstant: string,
): Promise<OrganizerDossierRead | null> {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const organizerChains = await loadOrganizerChains(client, [organizerId]);
    const chain = organizerChains.get(organizerId);
    if (!chain) return null;

    const editionChains = await loadEditionChains(client);
    const editions: OrganizerDossierEdition[] = [...editionChains.entries()]
      .filter(([, { revisions }]) => latestOf(revisions).organizerIds.includes(organizerId))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { revisions }]) => {
        const latest = latestOf(revisions);
        return { edition: latest, validity: classifyDeclaredDate(latest.startDate, evaluationInstant) };
      });

    const claims = await readClaimsForSubjects(client, [{ type: 'organizer', id: organizerId }], parseClaimOrThrow);
    const participations = await loadParticipationsForEditions(
      client,
      editions.map(({ edition }) => edition.editionId),
    );
    const companies = await loadCompanies(
      client,
      participations.map((participation) => latestOf(participation.revisions).companyId),
    );
    const organizers: RevisionedOrganizerRead[] = [{ organizerId, revisions: chain.revisions }];
    const sources = await readValidatedSources(client, collectSourceIds(claims, organizers, participations));

    const antecedentsDocumented = editions.filter(({ validity }) => validity.validity === 'past').length;
    return {
      contractVersion: '1',
      evaluatedAt: evaluationInstant,
      organizerId,
      organizerRevisions: chain.revisions,
      claims,
      editions,
      participations,
      companies,
      sources,
      coverage: {
        antecedentsDocumented,
        note:
          antecedentsDocumented === 0
            ? 'Sin antecedente histórico documentado para este organizador: se declara la insuficiencia de cobertura; no se fabrica trayectoria.'
            : null,
      },
    };
  });
}
