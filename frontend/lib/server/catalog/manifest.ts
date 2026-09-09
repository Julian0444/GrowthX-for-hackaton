// Manifiesto de curación (ticket 09). Server-only.
//
// La ÚNICA vía de entrada del catálogo curado es esta carga interna explícita:
// un manifiesto con responsable, fecha de verificación y etiqueta del material,
// cuyas entidades son exactamente los contratos del ticket 07 (validados con
// sus parsers; claves desconocidas se rechazan). No es una UI de organizador,
// ni un CSV de outcomes, ni scraping: no agrega conectores ni ingesta.
//
// DECISIÓN ABIERTA D4: mientras el catálogo real de SF no esté verificado, todo
// manifiesto se etiqueta material: 'synthetic' — demuestra el mecanismo y NO
// acredita la revisión de eventos reales. 'curated' queda reservado para el
// cierre de D4.

import { createHash } from 'node:crypto';
import type {
  ClaimRevision,
  CompanyRecord,
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
  type ValidationIssue,
} from '../../contracts/evaluation-validation.ts';

export const MANIFEST_VERSION = '1';

// Extractos acotados: la presencia pública de una página no es licencia para
// almacenar y republicar todo su contenido. Más que esto exige conservar hash.
export const MAX_EXCERPT_LENGTH = 600;

// Ids del catálogo: viajan en URLs de API y en columnas relacionales.
const CATALOG_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

// 'imported' (ticket 11) lo escribe SOLO el importador durable de Luma: un
// manifiesto de curación sigue admitiendo únicamente 'synthetic' | 'curated'.
export type CatalogMaterial = 'synthetic' | 'curated' | 'imported';

export interface CurationManifest {
  manifestVersion: typeof MANIFEST_VERSION;
  name: string;
  // Etiqueta del material (columna en catalog_loads y visible en la lectura).
  material: CatalogMaterial;
  // Responsable de la verificación/carga y fecha de verificación de la revisión.
  authorizedBy: string;
  verifiedAt: string;
  note: string | null;
  sources: SourceRecord[];
  companies: CompanyRecord[];
  organizers: OrganizerRevision[];
  editions: EventEditionRevision[];
  participations: ParticipationRevision[];
  claims: ClaimRevision[];
}

export type ManifestParseResult =
  | { ok: true; manifest: CurationManifest }
  | { ok: false; issues: ValidationIssue[] };

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEntityList<T extends { id: string }>(
  input: unknown,
  path: string,
  parse: (item: unknown) => { ok: true; value: T } | { ok: false; issues: ValidationIssue[] },
  issues: ValidationIssue[],
): T[] {
  if (!Array.isArray(input)) {
    issues.push({ path, message: 'se esperaba una lista' });
    return [];
  }
  const out: T[] = [];
  input.forEach((item, index) => {
    const parsed = parse(item);
    if (!parsed.ok) {
      for (const issue of parsed.issues)
        issues.push({ path: `${path}[${index}]${issue.path.replace(/^\$/, '')}`, message: issue.message });
      return;
    }
    if (!CATALOG_ID.test(parsed.value.id)) {
      issues.push({
        path: `${path}[${index}].id`,
        message: `id «${parsed.value.id}» fuera del alfabeto admitido del catálogo ([A-Za-z0-9._-], máx. 120)`,
      });
      return;
    }
    out.push(parsed.value);
  });
  return out;
}

export function parseCurationManifest(input: unknown): ManifestParseResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '$', message: 'se esperaba un objeto JSON' }] };
  }

  const allowed = [
    'manifestVersion',
    'name',
    'material',
    'authorizedBy',
    'verifiedAt',
    'note',
    'sources',
    'companies',
    'organizers',
    'editions',
    'participations',
    'claims',
  ];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key))
      issues.push({ path: `$.${key}`, message: 'clave desconocida para el manifiesto v1: se rechaza' });
  }
  for (const key of allowed) {
    if (!(key in input)) issues.push({ path: `$.${key}`, message: 'campo requerido ausente' });
  }
  if (issues.length > 0) return { ok: false, issues };

  // La versión se comprueba ANTES que la forma (mismo criterio que 07).
  if (input.manifestVersion !== MANIFEST_VERSION) {
    return {
      ok: false,
      issues: [
        {
          path: '$.manifestVersion',
          message: `versión «${String(input.manifestVersion)}» desconocida; este lector solo admite «${MANIFEST_VERSION}»`,
        },
      ],
    };
  }
  if (typeof input.name !== 'string' || input.name.trim().length === 0)
    issues.push({ path: '$.name', message: 'name es obligatorio' });
  if (input.material !== 'synthetic' && input.material !== 'curated')
    issues.push({ path: '$.material', message: 'material debe ser "synthetic" o "curated" (etiqueta obligatoria del material)' });
  if (typeof input.authorizedBy !== 'string' || input.authorizedBy.trim().length === 0)
    issues.push({
      path: '$.authorizedBy',
      message: 'authorizedBy es obligatorio: sin responsable de verificación no hay manifiesto autorizado',
    });
  if (typeof input.verifiedAt !== 'string' || !ISO_INSTANT.test(input.verifiedAt))
    issues.push({ path: '$.verifiedAt', message: 'verifiedAt debe ser un instante ISO 8601 con zona' });
  if (input.note !== null && (typeof input.note !== 'string' || input.note.trim().length === 0))
    issues.push({ path: '$.note', message: 'note debe ser null o un string con contenido' });

  const sources = parseEntityList(input.sources, '$.sources', parseSourceRecord, issues);
  const companies = parseEntityList(input.companies, '$.companies', parseCompanyRecord, issues);
  const organizers = parseEntityList(input.organizers, '$.organizers', parseOrganizerRevision, issues);
  const editions = parseEntityList(input.editions, '$.editions', parseEventEditionRevision, issues);
  const participations = parseEntityList(
    input.participations,
    '$.participations',
    parseParticipationRevision,
    issues,
  );
  const claims = parseEntityList(input.claims, '$.claims', parseClaimRevision, issues);

  for (const [index, source] of sources.entries()) {
    if (source.content.kind === 'excerpt' && source.content.excerpt.length > MAX_EXCERPT_LENGTH)
      issues.push({
        path: `$.sources[${index}].content.excerpt`,
        message: `extracto de ${source.content.excerpt.length} caracteres supera el máximo (${MAX_EXCERPT_LENGTH}); conservar hash en vez de republicar la página`,
      });
  }
  for (const [index, claim] of claims.entries()) {
    if (claim.subject.type === 'profile')
      issues.push({
        path: `$.claims[${index}].subject`,
        message: 'la curación no afirma sobre perfiles de clientes',
      });
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    manifest: {
      manifestVersion: MANIFEST_VERSION,
      name: (input.name as string).trim(),
      material: input.material as CatalogMaterial,
      authorizedBy: (input.authorizedBy as string).trim(),
      verifiedAt: input.verifiedAt as string,
      note: input.note as string | null,
      sources,
      companies,
      organizers,
      editions,
      participations,
      claims,
    },
  };
}

// Hash canónico del manifiesto (claves ordenadas): decide «mismo manifiesto»
// para la idempotencia de la carga completa.
export function manifestHash(manifest: CurationManifest): string {
  return createHash('sha256').update(JSON.stringify(sortKeysDeep(manifest))).digest('hex');
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeysDeep(value[key]);
    return sorted;
  }
  return value;
}
