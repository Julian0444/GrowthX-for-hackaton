// Adaptador Luma del recorrido persistido (ticket 11). Server-only.
//
// Convierte una página de evento de Luma APORTADA POR EL USUARIO en material
// del modelo de eventos/claims del ticket 09: una fuente inmutable, una
// revisión de edición encadenada a la identidad existente cuando la URL
// canónica coincide, y claims por atributo con método y fuente. No es un
// conector de descubrimiento: solo obtiene la URL admitida que llegó por la
// aceptación del run.
//
// Seguridad de la obtención (criterio del ticket):
// - HTTPS, hostname en la allowlist de Luma, sin credenciales ni puertos no
//   estándar; cada redirección se valida con las mismas reglas ANTES de
//   seguirla. Tamaño acotado y timeout por petición.
// - El HTML es DATO no confiable: se leen JSON-LD y texto visible relevante.
//   Cada valor conserva fragmentos acotados; NUNCA se sigue
//   una URL sugerida por el contenido de la página. Ningún texto de la fuente
//   se interpreta como instrucción.
// - No se conserva el HTML completo: la fuente guarda su sha256 (regla de
//   extractos del manifiesto: público no es licencia de republicación).

import type { Geocoder } from '../geocoding/census.ts';
import { resolveEditionLocation } from '../geocoding/resolve.ts';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { parseLumaEvent } from '../../api/luma.ts';
import { fetchKnownHtml, readingFromHtml, SourceReadError, type SourceReadOptions, type KnownSourceRead, type ReadingMetadata } from '../sources/reader.ts';
import { unsafeText, type SourceExtraction, type ExtractedAttribute } from '../sources/extract.ts';
import type {
  ClaimRevision,
  ClaimValue,
  DeclaredDate,
  EventEditionRevision,
  SourceRecord,
} from '../../contracts/evaluation.ts';
import {
  parseClaimRevision,
  parseEventEditionRevision,
  parseSourceRecord,
  type ValidationResult,
} from '../../contracts/evaluation-validation.ts';
import { withTenantTransaction } from '../db/pool.ts';
import {
  orderRevisionChain,
  readClaimsForSubjects,
  upsertClaimRevisions,
  upsertSources,
} from '../evidence/store.ts';
import { upsertEditionRevisions } from './store.ts';

// Fallo del importador con causa visible (se persiste en runs.error y en el
// error del step). El mensaje nunca incluye credenciales ni HTML.
export class LumaIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LumaIngestError';
  }
}

// ============ URL: validación y forma canónica ============

// Solo páginas de evento de Luma aportadas por el usuario; los cuatro hosts
// son aliases comprobados del mismo servicio y canonicalizan a lu.ma.
const ALLOWED_HOSTS = new Set(['lu.ma', 'www.lu.ma', 'luma.com', 'www.luma.com']);

export type CanonicalizeResult =
  | { ok: true; canonical: string }
  | { ok: false; reason: string };

// Valida y canonicaliza una URL aportada por el usuario. Reglas: https (una
// URL sin esquema o con http se eleva a https; cualquier otro esquema se
// rechaza), sin credenciales, sin puerto no estándar, hostname en la
// allowlist, y una ruta de evento no vacía. La forma canónica es
// https://lu.ma/<ruta> sin query ni fragmento.
export function canonicalizeLumaUrl(raw: string): CanonicalizeResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'Empty URL' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:')
    return { ok: false, reason: `scheme «${url.protocol}» rejected: HTTPS only` };
  if (url.username || url.password)
    return { ok: false, reason: 'URL contains embedded credentials; rejected' };
  if (url.port !== '' && url.port !== '443')
    return { ok: false, reason: `port «${url.port}» rejected: standard port only` };
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host))
    return {
      ok: false,
      reason: `host «${host}» outside the allowlist: only Luma event pages (lu.ma / luma.com)`,
    };
  const path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/')
    return { ok: false, reason: 'the URL must point to an event page (path missing)' };
  return { ok: true, canonical: `https://lu.ma${path}` };
}

// Forma canónica para relacionar identidades: la misma normalización aplicada
// a una URL ya almacenada. null = no es una URL de Luma admitida (se compara
// entonces por igualdad literal, sin inventar equivalencias).
export function lumaIdentityUrl(url: string | null): string | null {
  if (url === null) return null;
  const result = canonicalizeLumaUrl(url);
  return result.ok ? result.canonical : null;
}

// Transport and limits are shared with other known DP-01 sources.
export type LumaFetchOptions = SourceReadOptions;

// ============ Salida del step de obtención (sin HTML completo) ============

export interface LumaExtractionSummary {
  status: 'complete' | 'partial';
  warnings: string[];
  fieldsExtracted: string[];
}

export interface LumaEventFields {
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  city: string | null;
  coordinates: { lat: number; lng: number } | null;
  organizerName: string | null;
  registrationStatus: string | null;
}

export interface LumaFetchOutput {
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  fetchedAt: string;
  htmlSha256: string;
  htmlBytes: number;
  fullContent?: SourceExtraction;
  reading?: ReadingMetadata;
  extraction: LumaExtractionSummary;
  fields: LumaEventFields;
  // Opcional para conservar la relectura de steps anteriores a esta marca.
  isFixture?: true;
}

// Sanea texto extraído del HTML: es dato no confiable — se quitan controles,
// se colapsa espacio y se trunca. Nunca se interpreta como instrucción.
function clean(value: string | undefined | null, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

// Obtiene y parsea la página del evento. Corre en el WORKER (paso
// fetch_event_page); lanza LumaIngestError con causa visible ante destino no
// admitido, tamaño excedido, timeout, error HTTP o extracción fallida.
export async function fetchLumaEvent(
  requestedUrl: string,
  options: LumaFetchOptions = {},
): Promise<LumaFetchOutput & KnownSourceRead> {
  const validated = canonicalizeLumaUrl(requestedUrl);
  if (!validated.ok) throw new LumaIngestError(`URL rejected: ${validated.reason}`);
  let page;
  try { page = await fetchKnownHtml(validated.canonical, options); }
  catch (error) { throw new SourceReadError(error instanceof SourceReadError ? error.message : 'No se pudo leer la fuente'); }
  const { html, fetchedAt } = page;
  const reading = readingFromHtml(page, options);
  const parsed = parseLumaEvent(html, page.finalUrl, fetchedAt);
  if (parsed.extraction.status === 'failed' || parsed.event === null)
    throw new SourceReadError('extraction failed: the page does not identify an event through JSON-LD');
  const event = parsed.event;
  const name = clean(event.name, 300);
  if (!name || unsafeText(name)) throw new SourceReadError('extraction failed: event name empty or unsupported');
  if(!reading.fullContent.attributes.some(a=>a.attribute==='name')){
    reading.fullContent.fragments.push({id:'event-name',text:`Event name metadata: ${name}`,locator:'Event JSON-LD name / OpenGraph title fallback'});
    reading.fullContent.attributes.push({attribute:'name',value:{kind:'text',text:name},status:'announced',fragmentIds:['event-name'],note:null});
  }
  const coordinates = reading.fullContent.coordinates;
  return {
    ...reading,
    extraction: {
      status: parsed.extraction.status,
      warnings: [...parsed.extraction.warnings.filter(w => !w.startsWith('sponsors not') || !reading.fullContent.attributes.some(a => a.attribute.startsWith('sponsors:'))), ...reading.fullContent.warnings].map(w => clean(w, 300) ?? '').filter(Boolean),
      fieldsExtracted: [...new Set([...parsed.extraction.fieldsExtracted, ...reading.fullContent.attributes.map(a => a.attribute)])],
    },
    fields: {
      name,
      startsAt: clean(event.startsAt || null, 64),
      endsAt: clean(event.endsAt ?? null, 64),
      venue: reading.fullContent.location?.venue ?? clean(event.venue ?? null, 200),
      city: reading.fullContent.location?.city ?? clean(event.city || null, 120),
      coordinates,
      organizerName: clean(event.organizer ?? null, 200),
      registrationStatus: clean(event.registrationStatus ?? null, 60),
    },
  };
}

// ============ Fecha declarada (política del ticket 04/07) ============

const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

// La fecha publicada se conserva con su incertidumbre real: con zona es un
// instante; solo día es date_only sin zona; con hora pero SIN zona queda
// ambigua sobre el rango real de offsets (UTC−12…+14), nunca se inventa zona;
// ausente o irreconocible queda unknown — jamás la fecha actual.
export function declaredDateFromLuma(startsAt: string | null): DeclaredDate {
  if (startsAt === null) return { precision: 'unknown' };
  // Date.parse normaliza días imposibles (31 de febrero → marzo). Comprobar
  // el día publicado antes de clasificar evita convertir ese error en una
  // fecha utilizable por elegibilidad; la zona del instante no cambia el día
  // que la fuente intentó declarar.
  const day = startsAt.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (
    !ISO_DAY_RE.test(day) ||
    Number.isNaN(midnight) ||
    new Date(midnight).toISOString().slice(0, 10) !== day
  ) return { precision: 'unknown' };
  if (ISO_DAY_RE.test(startsAt) && !Number.isNaN(Date.parse(`${startsAt}T00:00:00Z`)))
    return { precision: 'date_only', date: startsAt, timezone: null };
  if (ISO_INSTANT_RE.test(startsAt) && !Number.isNaN(Date.parse(startsAt))) {
    const zone = startsAt.endsWith('Z') ? 'UTC' : startsAt.slice(-6);
    return { precision: 'instant', iso: startsAt, timezone: zone };
  }
  if (ISO_LOCAL_RE.test(startsAt) && !Number.isNaN(Date.parse(`${startsAt}Z`))) {
    const base = Date.parse(`${startsAt}Z`);
    return {
      precision: 'ambiguous',
      text: startsAt,
      earliest: new Date(base - 14 * 3_600_000).toISOString(),
      latest: new Date(base + 12 * 3_600_000).toISOString(),
    };
  }
  return { precision: 'unknown' };
}

// ============ Persistencia del dossier ============

export interface LumaPersistOutcome {
  editionId: string;
  editionRevisionId: string;
  sourceId: string;
  loadId: string;
  linkedToExistingEdition: boolean;
  claimRevisionIds: string[];
}

function mustParse<T>(kind: string, result: ValidationResult<T>): T {
  if (!result.ok) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new LumaIngestError(`${kind} produced by the import violates the contract: ${detail}`);
  }
  return result.value;
}

const parseClaimOrThrow = (payload: unknown): ClaimRevision =>
  mustParse('ClaimRevision persistida', parseClaimRevision(payload));

// Id del catálogo a partir de un fragmento arbitrario (alfabeto admitido).
function catalogIdFragment(raw: string, max: number): string {
  const sanitized = raw.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, '');
  return (sanitized || 'event').slice(0, max);
}

interface ExistingEdition {
  editionId: string;
  latest: EventEditionRevision;
}

// Última revisión de cada edición del tenant, para relacionar la URL canónica
// con la identidad EXISTENTE (importar de nuevo no crea otra identidad lógica).
async function findEditionByCanonicalUrl(
  client: pg.ClientBase,
  canonicalUrl: string,
): Promise<ExistingEdition | null> {
  const { rows } = await client.query(
    'select edition_id, payload from growthx.edition_revisions',
  );
  const grouped = new Map<string, EventEditionRevision[]>();
  for (const row of rows) {
    const revision = mustParse('EventEditionRevision persistida', parseEventEditionRevision(row.payload));
    const list = grouped.get(row.edition_id as string) ?? [];
    list.push(revision);
    grouped.set(row.edition_id as string, list);
  }
  for (const [editionId, revisions] of grouped) {
    const ordered = orderRevisionChain(revisions, (revision) => revision.revisedAt);
    const latest = ordered[ordered.length - 1];
    const stored = lumaIdentityUrl(latest.canonicalUrl) ?? latest.canonicalUrl;
    if (stored !== null && stored === canonicalUrl) return { editionId, latest };
  }
  return null;
}

interface ClaimChainHead {
  claimId: string;
  latestRevisionId: string;
}

// Paso persist_dossier del worker: UNA transacción bajo el tenant del run que
// registra la procedencia (catalog_loads, material 'imported'), la fuente
// inmutable, la revisión de edición encadenada y los claims por atributo.
// Idempotente ante re-entrega: los ids derivan del runId y el contenido del
// paso de obtención ya confirmado, así repetir el paso no duplica material.
async function persistLumaDossierBase(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
  output: LumaFetchOutput,
): Promise<LumaPersistOutcome> {
  const revisionId = `luma-${runId}-edition`;
  const sourceId = `luma-${runId}-src`;
  const loadHash = createHash('sha256').update(`luma-ingest:${runId}`).digest('hex');

  return withTenantTransaction(pool, tenantId, async (client) => {
    // Alias imports from different jobs serialize their revision chains.
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`luma-edition:${tenantId}:${output.canonicalUrl}`]);
    // Re-entrega tras un commit previo: el material de ESTE run ya está; se
    // recompone el resultado sin encadenar una segunda revisión.
    const { rows: already } = await client.query(
      'select edition_id, payload, load_id from growthx.edition_revisions where id = $1',
      [revisionId],
    );
    if (already.length > 0) {
      const revision = mustParse(
        'EventEditionRevision persistida',
        parseEventEditionRevision(already[0].payload),
      );
      return {
        editionId: already[0].edition_id as string,
        editionRevisionId: revisionId,
        sourceId,
        loadId: already[0].load_id as string,
        linkedToExistingEdition: revision.previousRevisionId !== null,
        claimRevisionIds: revision.claimRevisionIds,
      };
    }

    const { rows: runRows } = await client.query(
      'select requested_by from growthx.runs where id = $1',
      [runId],
    );
    if (runRows.length === 0) throw new LumaIngestError('run inexistente bajo el tenant al persistir');
    const requestedBy = runRows[0].requested_by as string;

    // Procedencia de la importación: una carga etiquetada 'imported' — visible
    // en el dossier como material NO curado ni sintético.
    await client.query(
      `insert into growthx.catalog_loads
         (tenant_id, manifest_name, manifest_hash, material, authorized_by, verified_at, note, summary)
       values ($1, $2, $3, 'imported', $4, $5, $6, '{}'::jsonb)
       on conflict (tenant_id, manifest_hash) do nothing`,
      [
        tenantId,
        `luma-import:${runId}`,
        loadHash,
        requestedBy,
        output.fetchedAt,
        output.isFixture
          ? `Durable import from ${output.canonicalUrl} (run ${runId}); test fixture transport, without querying real Luma. Does not establish a real event or commercial coverage.`
          : `Durable import from ${output.canonicalUrl} (run ${runId}); automatically extracted material, without human review.`,
      ],
    );
    const { rows: loadRows } = await client.query(
      'select id from growthx.catalog_loads where manifest_hash = $1',
      [loadHash],
    );
    const loadId = loadRows[0].id as string;

    const source: SourceRecord = mustParse(
      'SourceRecord',
      parseSourceRecord({
        contractVersion: '1',
        id: sourceId,
        url: output.finalUrl,
        locator: null,
        provider: 'luma',
        collector: 'growthx-worker',
        fetchedAt: output.fetchedAt,
        publishedAt: null,
        method: output.isFixture ? 'test_fixture+jsonld_extraction' : 'http_get+jsonld_extraction',
        ...(output.fullContent ? {
          method: `${output.isFixture ? 'test_fixture' : output.reading?.strategy ?? 'http_get'}+visible_text+jsonld_extraction${output.reading?.cache === 'hit' ? '+cache_hit' : output.reading?.cache === 'stale_fallback' ? '+stale_cache' : ''}`,
          requestedUrl: output.requestedUrl, canonicalUrl: output.canonicalUrl, title: output.fields.name,
          fragments: output.fullContent.fragments,
          retrieval: { status: output.reading?.status ?? 'partial', freshness: output.reading?.freshness ?? 'unknown', limitation: output.reading?.limitation ?? null },
        } : {}),
        geoScope: output.fields.city ? 'city' : 'unknown',
        content: { kind: 'hash', sha256: output.htmlSha256 },
        usageRestrictions: [],
      } satisfies SourceRecord),
    );
    await upsertSources(client, tenantId, [source], loadId);

    const existing = await findEditionByCanonicalUrl(client, output.canonicalUrl);
    let editionId: string;
    if (existing) {
      editionId = existing.editionId;
    } else {
      const slug = catalogIdFragment(output.canonicalUrl.split('/').filter(Boolean).pop() ?? '', 80);
      editionId = `luma-${slug}`;
      // Homónimo de id sin coincidencia canónica: identidad NUEVA con sufijo,
      // nunca se fusiona con otra edición por similitud de nombre/slug.
      const { rows: clash } = await client.query(
        'select 1 from growthx.event_editions where id = $1',
        [editionId],
      );
      if (clash.length > 0) editionId = `luma-${slug}-${runId.slice(0, 8)}`;
    }

    // Claims por atributo con método y fuente (nunca un bloque con una
    // confianza global). Un atributo que la página no publica queda pendiente;
    // si ya existe un claim de ese atributo NO se entierra bajo un pendiente:
    // la ausencia en esta fuente no contradice el conocimiento existente.
    const existingClaims = await readClaimsForSubjects(
      client,
      [{ type: 'edition', id: editionId }],
      parseClaimOrThrow,
    );
    const chainByAttribute = new Map<string, ClaimChainHead>();
    for (const claim of existingClaims) {
      const latest = claim.revisions[claim.revisions.length - 1];
      if (!chainByAttribute.has(latest.attribute))
        chainByAttribute.set(latest.attribute, { claimId: claim.claimId, latestRevisionId: latest.id });
    }

    const claims: ClaimRevision[] = [];
    const addClaim = (attribute: string, value: ClaimValue, status: ClaimRevision['status'], observations: ExtractedAttribute[] = []): void => {
      const key = catalogIdFragment(attribute, 40);
      const chain = chainByAttribute.get(attribute) ?? null;
      claims.push(
        mustParse(
          'ClaimRevision',
          parseClaimRevision({
            contractVersion: '1',
            id: `luma-${runId}-${key}`,
            claimId: chain?.claimId ?? `${editionId}.${key}`,
            subject: { type: 'edition', editionId },
            attribute,
            value,
            status,
            sourceIds: [sourceId],
            ...(observations.length ? { evidence: [...new Set(observations.flatMap(o => o.fragmentIds))].map(fragmentId => ({sourceId,fragmentId,locator:null})) } : {}),
            method: output.fullContent ? `${output.isFixture ? 'test_fixture+' : ''}visible_text+jsonld_extraction` : output.isFixture ? 'test_fixture+jsonld_extraction' : 'jsonld_extraction',
            note: observations.find(o => o.note)?.note ?? null,
            reviewer: null,
            reviewedAt: output.fetchedAt,
            previousRevisionId: chain?.latestRevisionId ?? null,
          } satisfies ClaimRevision),
        ),
      );
    };
    const addPendingIfNew = (attribute: string, note: string): void => {
      if (chainByAttribute.has(attribute) || claims.some(c => c.attribute === attribute)) return;
      addClaim(attribute, { kind: 'pending', note }, 'pending');
    };

    const fields = output.fields;
    const base = existing?.latest ?? null;
    const startDate = declaredDateFromLuma(fields.startsAt);
    // Valores efectivos de la revisión: lo que ESTA página afirma o, si no lo
    // publica, lo que la identidad existente ya tenía respaldado.
    const effectiveStartDate = fields.startsAt !== null ? startDate : base?.startDate ?? startDate;
    const effectiveLocation =
      fields.city !== null
        ? ({ scope: 'city', name: fields.city } as const)
        : base?.location.scope === 'city' || base?.location.scope === 'venue'
          ? base.location
          : fields.venue !== null && fields.coordinates !== null
            ? ({ scope: 'venue', name: fields.venue } as const)
            : base?.location ?? ({ scope: 'unknown', name: null } as const);
    if (output.fullContent) {
      const groups = new Map<string, ExtractedAttribute[]>();
      for (const observation of output.fullContent.attributes) {
        const attribute = observation.attribute === 'date:structured' ? 'date' : observation.attribute;
        const list = groups.get(attribute) ?? []; list.push(observation); groups.set(attribute,list);
      }
      for (const [attribute, observations] of groups) {
        const evidence = attribute === 'date' ? [...observations,...(groups.get('date:visible') ?? [])] : observations;
        const value: ClaimValue = attribute === 'date' ? {kind:'date',date:startDate}
          : attribute === 'address' && output.fullContent.location?.originalAddress && !evidence.some(o=>o.status==='contradicted')
            ? {kind:'text',text:output.fullContent.location.originalAddress}
            : observations.length === 1 ? observations[0].value : {kind:'text',text:observations.map(o => o.value.kind === 'text' ? o.value.text : JSON.stringify(o.value)).join('\n')};
        addClaim(attribute,value,evidence.some(o => o.status === 'contradicted') ? 'contradicted' : observations[0].status,evidence);
      }
      for (const [attribute,note] of [
        ['date','Start date not published in recognized event data.'],['location','Public city not obtained.'],
        ['access','Access and approval requirements not obtained.'],['audience','Target audience not obtained; actual attendance is not established.'],
        ['cost:attendance','Attendance cost not published. Sponsorship and total participation cost remain separate.'],['organizer','Organizer not obtained.'],
      ]) addPendingIfNew(attribute,note);
    } else {
    // Compatibility for durable steps created before DP-05.
    // Toda importación identifica al evento por su nombre. Incluso una
    // reimportación que no publique ningún otro campo debe conservar una
    // referencia a SU fuente, sin heredar la procedencia de otra revisión.
    addClaim('name', { kind: 'text', text: fields.name }, 'announced');
    if (fields.startsAt !== null) addClaim('date', { kind: 'date', date: startDate }, 'announced');
    else if (effectiveStartDate.precision === 'unknown')
      addPendingIfNew('date', 'Start date not published as structured data on the event page.');
    if (fields.city !== null)
      addClaim('location', { kind: 'location', scope: 'city', name: fields.city }, 'announced');
    else if (effectiveLocation.scope === 'unknown')
      addPendingIfNew('location', 'Location not published on the event page; city stays pending.');
    if (fields.registrationStatus !== null)
      addClaim('access', { kind: 'text', text: fields.registrationStatus }, 'announced');
    else addPendingIfNew('access', 'Registration/access status not published as structured data.');
    addPendingIfNew('audience', 'Audience not published as structured data on the event page.');
    addPendingIfNew('cost:attendance', 'Attendance cost not published as structured data on the event page.');
    if (fields.organizerName !== null)
      addClaim('organizer', { kind: 'text', text: fields.organizerName }, 'announced');
    else addPendingIfNew('organizer', 'Organizer not published as structured data on the event page.');
    if (fields.venue !== null) addClaim('venue', { kind: 'text', text: fields.venue }, 'announced');
    }

    // A sparse refresh does not erase a supported field or its revision ID.
    const retainedIds = existingClaims.map(c => c.revisions.at(-1)!).filter(c => !claims.some(n => n.attribute === c.attribute)).map(c => c.id);
    const claimRevisionIds = [...new Set([...retainedIds,...claims.map(c=>c.id)])];
    const observedLocation = output.fullContent?.location;
    const samePlace = base?.publicLocation && observedLocation &&
      (!observedLocation.city || observedLocation.city === base.publicLocation.city) &&
      (!observedLocation.address?.streetAddress || observedLocation.address.streetAddress === base.publicLocation.address?.streetAddress) &&
      (!observedLocation.venue || observedLocation.venue === base.publicLocation.venue) &&
      !/withheld|conflict|invalid/i.test(observedLocation.limitation ?? '');
    const preservePosition = samePlace && !output.fullContent?.coordinates;
    const publicLocation = observedLocation ? {
      ...observedLocation,
      ...(samePlace ? {
        originalAddress: observedLocation.originalAddress ?? base!.publicLocation!.originalAddress,
        address: observedLocation.address?.streetAddress ? observedLocation.address : base!.publicLocation!.address,
        venue: observedLocation.venue ?? base!.publicLocation!.venue,
        ...(preservePosition ? {precision:base!.publicLocation!.precision,method:base!.publicLocation!.method,provider:base!.publicLocation!.provider,resolvedAt:base!.publicLocation!.resolvedAt,limitation:base!.publicLocation!.limitation,...(base!.publicLocation!.resolution ? {resolution:base!.publicLocation!.resolution} : {})} : {}),
      } : {}),
      sourceIds: [...new Set([sourceId,...(samePlace ? base!.publicLocation!.sourceIds : [])])],
      resolvedAt: preservePosition ? base!.publicLocation!.resolvedAt : output.fullContent?.coordinates ? output.fetchedAt : null,
    } : base?.publicLocation;

    // Revisión de edición: para una identidad existente se parte de su última
    // revisión y solo se sobreescribe lo que ESTA página afirma — un campo que
    // la página no publica no entierra el valor previamente respaldado.
    const revision: EventEditionRevision = mustParse(
      'EventEditionRevision',
      parseEventEditionRevision({
        contractVersion: '1',
        id: revisionId,
        editionId,
        organizerIds: base?.organizerIds ?? [],
        name: fields.name,
        canonicalUrl: output.canonicalUrl,
        provider: 'luma',
        startDate: effectiveStartDate,
        location: effectiveLocation,
        coordinates: output.fullContent ? (observedLocation ? preservePosition ? base?.coordinates ?? null : output.fullContent.coordinates : base?.coordinates ?? null) : fields.city !== null ? fields.coordinates : base?.coordinates ?? null,
        ...(publicLocation ? {publicLocation} : {}),
        ...(base?.relationships ? {relationships:base.relationships} : {}),
        claimRevisionIds,
        revisedAt: output.reading?.checkedAt ?? output.fetchedAt,
        previousRevisionId: base?.id ?? null,
      } satisfies EventEditionRevision),
    );
    const editionCounts = await upsertEditionRevisions(client, tenantId, [revision], loadId);
    const claimCounts = await upsertClaimRevisions(client, tenantId, claims, loadId);

    await client.query('update growthx.catalog_loads set summary = $2 where id = $1', [
      loadId,
      JSON.stringify({
        sources: { inserted: 1, unchanged: 0 },
        editionRevisions: editionCounts,
        claimRevisions: claimCounts,
      }),
    ]);

    return {
      editionId,
      editionRevisionId: revisionId,
      sourceId,
      loadId,
      linkedToExistingEdition: existing !== null,
      claimRevisionIds,
    };
  });
}

// DP-08 adds an immutable geographic revision after the existing import.
export async function persistLumaDossier(pool: pg.Pool, tenantId: string, runId: string, output: LumaFetchOutput, geocoder?: Geocoder | null): Promise<LumaPersistOutcome> {
  const persisted = await persistLumaDossierBase(pool, tenantId, runId, output);
  return resolveEditionLocation(pool, tenantId, runId, persisted, output.isFixture && geocoder === undefined ? null : geocoder);
}
