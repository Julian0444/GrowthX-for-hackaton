// Almacén de evidencia: fuentes y claims con revisiones (ticket 09). Server-only.
//
// Todas las funciones reciben un cliente YA dentro de una transacción con
// contexto de tenant (withTenantTransaction): la RLS limita cada consulta al
// tenant, así «el sujeto existe» o «la fuente existe» comprobados acá son
// comprobaciones DENTRO del tenant — una referencia a material de otro tenant
// simplemente no se encuentra y la escritura se rechaza.
//
// Reglas de inmutabilidad:
// - Una fuente es un registro inmutable: recargar el mismo id con el mismo
//   payload es un no-op; con otro payload es un conflicto (el material citado
//   no se reescribe por debajo de los claims que lo citan).
// - Una revisión de claim es inmutable; una corrección o contradicción es una
//   REVISIÓN NUEVA encadenada por previousRevisionId. Las revisiones previas
//   se conservan siempre: así dos fuentes contradictorias mantienen sus
//   revisiones y el conflicto queda visible.

import type pg from 'pg';
import type { ClaimRevision, SourceRecord } from '../../contracts/evaluation.ts';

// Error de integridad de la carga: referencias irresolubles bajo el tenant,
// conflictos con material inmutable o cadenas de revisión rotas.
export class CatalogIntegrityError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`carga de catálogo rechazada:\n- ${issues.join('\n- ')}`);
    this.name = 'CatalogIntegrityError';
    this.issues = issues;
  }
}

export interface UpsertCounts {
  inserted: number;
  unchanged: number;
}

// Ordena una cadena de revisiones (primera → última) siguiendo
// previousRevisionId. Si la cadena está incompleta (lectura parcial), los
// sueltos se agregan al final ordenados por fecha: la lectura no inventa un
// orden, pero tampoco oculta revisiones.
export function orderRevisionChain<T extends { id: string; previousRevisionId: string | null }>(
  revisions: T[],
  dateOf: (revision: T) => string,
): T[] {
  const byPrevious = new Map<string | null, T>();
  const ids = new Set(revisions.map((revision) => revision.id));
  for (const revision of revisions) {
    // Una revisión cuyo previous no está en la lectura se trata como cabeza
    // local de su fragmento.
    const key = revision.previousRevisionId !== null && ids.has(revision.previousRevisionId)
      ? revision.previousRevisionId
      : null;
    if (!byPrevious.has(key)) byPrevious.set(key, revision);
  }
  const ordered: T[] = [];
  const seen = new Set<string>();
  let current = byPrevious.get(null) ?? null;
  while (current && !seen.has(current.id)) {
    ordered.push(current);
    seen.add(current.id);
    current = byPrevious.get(current.id) ?? null;
  }
  const leftovers = revisions
    .filter((revision) => !seen.has(revision.id))
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  return [...ordered, ...leftovers];
}

// ============ Fuentes ============

export async function upsertSources(
  client: pg.ClientBase,
  tenantId: string,
  sources: SourceRecord[],
  loadId: string,
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, unchanged: 0 };
  const issues: string[] = [];
  for (const source of sources) {
    const { rows } = await client.query(
      // La igualdad jsonb es estructural: el orden de claves del manifiesto no
      // fabrica conflictos.
      'select payload = $2::jsonb as same from growthx.sources where id = $1',
      [source.id, JSON.stringify(source)],
    );
    if (rows.length > 0) {
      if (rows[0].same === true) counts.unchanged += 1;
      else
        issues.push(
          `fuente «${source.id}»: ya existe con otro contenido; una fuente es inmutable — usar un id nuevo`,
        );
      continue;
    }
    await client.query(
      `insert into growthx.sources
         (tenant_id, id, contract_version, url, provider, fetched_at, geo_scope, payload, load_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId,
        source.id,
        source.contractVersion,
        source.url,
        source.provider,
        source.fetchedAt,
        source.geoScope,
        JSON.stringify(source),
        loadId,
      ],
    );
    counts.inserted += 1;
  }
  if (issues.length > 0) throw new CatalogIntegrityError(issues);
  return counts;
}

// Comprueba que cada id de fuente exista bajo el tenant; devuelve los que no.
export async function missingSourceIds(
  client: pg.ClientBase,
  ids: string[],
): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { rows } = await client.query('select id from growthx.sources where id = any($1)', [unique]);
  const found = new Set(rows.map((row) => row.id as string));
  return unique.filter((id) => !found.has(id));
}

export async function readSourcesByIds(
  client: pg.ClientBase,
  ids: string[],
): Promise<SourceRecord[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { rows } = await client.query('select payload from growthx.sources where id = any($1)', [
    unique,
  ]);
  return rows.map((row) => row.payload as SourceRecord);
}

// ============ Claims ============

const CLAIM_SUBJECT_TABLE: Record<string, string> = {
  organizer: 'growthx.organizers',
  edition: 'growthx.event_editions',
  company: 'growthx.companies',
  participation: 'growthx.participations',
};

function claimSubjectId(revision: ClaimRevision): { type: string; id: string } {
  const subject = revision.subject;
  switch (subject.type) {
    case 'organizer':
      return { type: subject.type, id: subject.organizerId };
    case 'edition':
      return { type: subject.type, id: subject.editionId };
    case 'company':
      return { type: subject.type, id: subject.companyId };
    case 'participation':
      return { type: subject.type, id: subject.participationId };
    case 'profile':
      // La curación afirma sobre el catálogo, no sobre perfiles de clientes.
      return { type: subject.type, id: subject.profileId };
  }
}

export async function upsertClaimRevisions(
  client: pg.ClientBase,
  tenantId: string,
  revisions: ClaimRevision[],
  loadId: string,
): Promise<UpsertCounts> {
  const counts: UpsertCounts = { inserted: 0, unchanged: 0 };
  const issues: string[] = [];
  for (const revision of revisions) {
    const subject = claimSubjectId(revision);
    const subjectTable = CLAIM_SUBJECT_TABLE[subject.type];
    if (!subjectTable) {
      issues.push(
        `claim «${revision.id}»: sujeto «${subject.type}» no admitido en la curación (los claims de perfil no se curan)`,
      );
      continue;
    }

    const { rows: existing } = await client.query(
      'select claim_id, payload = $2::jsonb as same from growthx.claim_revisions where id = $1',
      [revision.id, JSON.stringify(revision)],
    );
    if (existing.length > 0) {
      if (existing[0].same === true) counts.unchanged += 1;
      else
        issues.push(
          `revisión de claim «${revision.id}»: ya existe con otro contenido; una revisión es inmutable — una corrección es una revisión NUEVA`,
        );
      continue;
    }

    // Sujeto dentro del tenant (la RLS hace que «de otro tenant» = inexistente).
    const { rows: subjectRows } = await client.query(
      `select 1 from ${subjectTable} where id = $1`,
      [subject.id],
    );
    if (subjectRows.length === 0) {
      issues.push(`claim «${revision.id}»: sujeto ${subject.type} «${subject.id}» inexistente bajo el tenant`);
      continue;
    }

    const missing = await missingSourceIds(client, revision.sourceIds);
    if (missing.length > 0) {
      issues.push(`claim «${revision.id}»: fuentes inexistentes bajo el tenant: ${missing.join(', ')}`);
      continue;
    }

    if (revision.previousRevisionId !== null) {
      const { rows: previousRows } = await client.query(
        'select claim_id from growthx.claim_revisions where id = $1',
        [revision.previousRevisionId],
      );
      if (previousRows.length === 0) {
        issues.push(
          `revisión «${revision.id}»: previousRevisionId «${revision.previousRevisionId}» inexistente bajo el tenant`,
        );
        continue;
      }
      if (previousRows[0].claim_id !== revision.claimId) {
        issues.push(
          `revisión «${revision.id}»: previousRevisionId pertenece a otro claim («${previousRows[0].claim_id}»)`,
        );
        continue;
      }
    }

    await client.query(
      'insert into growthx.claims (tenant_id, id) values ($1, $2) on conflict do nothing',
      [tenantId, revision.claimId],
    );
    await client.query(
      `insert into growthx.claim_revisions
         (tenant_id, id, claim_id, subject_type, subject_id, attribute, status,
          previous_revision_id, reviewed_at, contract_version, payload, load_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        tenantId,
        revision.id,
        revision.claimId,
        subject.type,
        subject.id,
        revision.attribute,
        revision.status,
        revision.previousRevisionId,
        revision.reviewedAt,
        revision.contractVersion,
        JSON.stringify(revision),
        loadId,
      ],
    );
    for (const sourceId of new Set(revision.sourceIds)) {
      await client.query(
        `insert into growthx.claim_revision_sources (tenant_id, claim_revision_id, source_id)
         values ($1, $2, $3)`,
        [tenantId, revision.id, sourceId],
      );
    }
    counts.inserted += 1;
  }
  if (issues.length > 0) throw new CatalogIntegrityError(issues);
  return counts;
}

export interface RevisionedClaimRead {
  claimId: string;
  // Cadena completa, primera → última. La última es la vigente para mostrar;
  // las anteriores siguen presentes (una edición no borra la evidencia previa).
  revisions: ClaimRevision[];
}

export async function readClaimsForSubjects(
  client: pg.ClientBase,
  subjects: { type: string; id: string }[],
  parseClaim: (payload: unknown) => ClaimRevision,
): Promise<RevisionedClaimRead[]> {
  if (subjects.length === 0) return [];
  const conditions = subjects
    .map((_, index) => `(subject_type = $${index * 2 + 1} and subject_id = $${index * 2 + 2})`)
    .join(' or ');
  const params = subjects.flatMap((subject) => [subject.type, subject.id]);
  const { rows } = await client.query(
    `select claim_id, payload from growthx.claim_revisions where ${conditions}`,
    params,
  );
  const byClaim = new Map<string, ClaimRevision[]>();
  for (const row of rows) {
    const revision = parseClaim(row.payload);
    const list = byClaim.get(row.claim_id as string) ?? [];
    list.push(revision);
    byClaim.set(row.claim_id as string, list);
  }
  return [...byClaim.entries()]
    .map(([claimId, revisions]) => ({
      claimId,
      revisions: orderRevisionChain(revisions, (revision) => revision.reviewedAt),
    }))
    .sort((a, b) => a.claimId.localeCompare(b.claimId));
}
