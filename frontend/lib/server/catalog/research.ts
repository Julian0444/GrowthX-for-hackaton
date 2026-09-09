// Investigación de catálogo sobre el material PERSISTIDO (ticket 09). Server-only.
//
// Reemplaza al fixture del ticket 08 cuando el tenant tiene un catálogo curado
// cargado: el matching es estructurado (solapamiento del stack del perfil con
// los claims de foco del organizador) y devuelve razones por atributo y
// pendientes, nunca un índice de confianza. Sin coincidencias se informa el
// límite del catálogo; sin ediciones vigentes se declara el vencimiento — no se
// rellena con seeds históricos ni con el fixture.
//
// Devuelve null cuando el tenant NUNCA cargó un catálogo: el llamador
// (run-worker) cae al fixture preparado del ticket 08, etiquetado como tal
// (D4 pendiente). Esa distinción es deliberada: «sin catálogo» ≠ «catálogo sin
// opciones vigentes».

import type pg from 'pg';
import { withTenantTransaction } from '../db/pool.ts';
import type { CatalogCandidate, CatalogResearchResult } from '../evaluations/fixture-catalog.ts';
import { listCatalogEditions, type CatalogEditionSummary } from './read.ts';

// Claims del organizador que declaran tema/stack: sus valores de texto se
// tokenizan para el matching estructurado.
const FOCUS_ATTRIBUTES = ['focus', 'stack', 'theme'];

export interface PersistedResearchResult extends CatalogResearchResult {
  evaluatedAt: string;
  material: 'synthetic' | 'curated' | 'mixed';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[,;/·\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function pendingLabel(attribute: string): string {
  if (attribute === 'date') return 'fecha de la edición por confirmar';
  if (attribute === 'location') return 'lugar de la edición por confirmar';
  if (attribute === 'city') return 'ciudad por confirmar (el soporte no tiene alcance urbano)';
  if (attribute === 'access') return 'acceso por confirmar';
  if (attribute === 'audience') return 'audiencia sin confirmación de terceros';
  if (attribute === 'cost') return 'costos de patrocinio por confirmar';
  if (attribute.startsWith('cost:')) return `costo «${attribute.slice('cost:'.length)}» por confirmar`;
  return `«${attribute}» por confirmar`;
}

export async function researchPersistedCatalog(
  pool: pg.Pool,
  tenantId: string,
  input: { stack: string[]; evaluationInstant: string },
): Promise<PersistedResearchResult | null> {
  const hasCatalog = await withTenantTransaction(pool, tenantId, async (client) => {
    const { rows } = await client.query('select count(*)::int as n from growthx.catalog_loads');
    return (rows[0].n as number) > 0;
  });
  if (!hasCatalog) return null;

  const list = await listCatalogEditions(pool, tenantId, input.evaluationInstant);

  // Claims de foco por organizador (para las razones por atributo).
  const focusByOrganizer = await withTenantTransaction(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      `select subject_id, payload from growthx.claim_revisions
        where subject_type = 'organizer' and attribute = any($1)`,
      [FOCUS_ATTRIBUTES],
    );
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const value = (row.payload as { value?: { kind?: string; text?: string } }).value;
      if (value?.kind !== 'text' || typeof value.text !== 'string') continue;
      const list = map.get(row.subject_id as string) ?? [];
      list.push(value.text);
      map.set(row.subject_id as string, list);
    }
    return map;
  });

  const upcoming = list.editions.filter((edition) => edition.validity.validity === 'upcoming');
  const expired = list.editions.filter((edition) => edition.validity.validity === 'past');
  const material = deriveMaterial(list.editions);

  // Candidatos: organizadores con al menos una edición vigente.
  const byOrganizer = new Map<string, { displayName: string; editions: CatalogEditionSummary[] }>();
  for (const edition of upcoming) {
    for (const organizer of edition.organizers) {
      const entry = byOrganizer.get(organizer.organizerId) ?? {
        displayName: organizer.displayName,
        editions: [],
      };
      entry.editions.push(edition);
      byOrganizer.set(organizer.organizerId, entry);
    }
  }

  const stackTokens = input.stack.map((item) => item.toLowerCase());
  const candidates: CatalogCandidate[] = [];
  for (const [organizerId, entry] of [...byOrganizer.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const focusTexts = focusByOrganizer.get(organizerId) ?? [];
    const focusTokens = focusTexts.flatMap(tokenize);
    const matchedTokens = focusTokens.filter((token) =>
      stackTokens.some((item) => item.includes(token) || token.includes(item)),
    );
    if (stackTokens.length > 0 && focusTokens.length > 0 && matchedTokens.length === 0) continue;
    const matchedAttributes =
      matchedTokens.length > 0
        ? [...new Set(matchedTokens)].map((token) => `foco declarado del organizador incluye «${token}»`)
        : focusTokens.length === 0
          ? ['organizador sin foco declarado en el catálogo; se lista por cobertura']
          : ['perfil sin stack declarado; se lista la cobertura del catálogo'];
    const pending = [
      ...new Set(entry.editions.flatMap((edition) => edition.pendingAttributes.map(pendingLabel))),
    ];
    candidates.push({
      organizerId,
      displayName: entry.displayName,
      matchedAttributes,
      pending,
      editions: entry.editions.map((edition) => ({
        editionId: edition.editionId,
        name: edition.name,
        note: `vigente al ${input.evaluationInstant} · verificado ${edition.curation ? `${edition.curation.verifiedAt} por ${edition.curation.authorizedBy}` : 'sin registro de carga'}`,
      })),
    });
  }

  const noteParts = [
    material === 'curated'
      ? 'Catálogo curado bajo el tenant.'
      : 'Catálogo curado bajo el tenant (material sintético etiquetado; D4 pendiente — no acredita eventos reales).',
  ];
  if (expired.length > 0)
    noteParts.push(
      `${expired.length} edición(es) curadas ya vencieron al evaluar; quedan como antecedentes, no como oportunidades.`,
    );
  if (upcoming.length === 0)
    noteParts.push(
      'Sin ediciones vigentes: se declara el límite del catálogo; no se rellena con seeds históricos.',
    );
  else if (candidates.length === 0)
    noteParts.push('Ninguna edición vigente coincide con el stack del perfil: límite del catálogo declarado.');

  const organizersInCatalog = new Set(
    list.editions.flatMap((edition) => edition.organizers.map((organizer) => organizer.organizerId)),
  ).size;

  return {
    kind: 'catalog_research',
    catalogNote: noteParts.join(' '),
    candidates,
    coverage: { organizersInCatalog, matched: candidates.length },
    evaluatedAt: input.evaluationInstant,
    material,
  };
}

function deriveMaterial(editions: CatalogEditionSummary[]): 'synthetic' | 'curated' | 'mixed' {
  const materials = new Set(
    editions.map((edition) => edition.curation?.material ?? 'synthetic'),
  );
  if (materials.size === 1) return [...materials][0] as 'synthetic' | 'curated';
  return materials.size === 0 ? 'synthetic' : 'mixed';
}
