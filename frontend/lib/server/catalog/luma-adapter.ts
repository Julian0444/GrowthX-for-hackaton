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
// - El HTML es DATO no confiable: solo se leen los campos JSON-LD/OG que el
//   parser existente extrae, cada valor se sanea y se trunca, y NUNCA se sigue
//   una URL sugerida por el contenido de la página. Ningún texto de la fuente
//   se interpreta como instrucción.
// - No se conserva el HTML completo: la fuente guarda su sha256 (regla de
//   extractos del manifiesto: público no es licencia de republicación).

import { createHash } from 'node:crypto';
import type pg from 'pg';
import { parseLumaEvent } from '../../api/luma.ts';
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
  if (!trimmed) return { ok: false, reason: 'URL vacía' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'URL inválida' };
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:')
    return { ok: false, reason: `esquema «${url.protocol}» no admitido: solo https` };
  if (url.username || url.password)
    return { ok: false, reason: 'la URL contiene credenciales embebidas; se rechaza' };
  if (url.port !== '' && url.port !== '443')
    return { ok: false, reason: `puerto «${url.port}» no admitido: solo el puerto estándar` };
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host))
    return {
      ok: false,
      reason: `host «${host}» fuera de la allowlist: solo páginas de evento de Luma (lu.ma / luma.com)`,
    };
  const path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/')
    return { ok: false, reason: 'la URL debe apuntar a la página de un evento (falta la ruta)' };
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

// Un destino de redirección se valida con las mismas reglas, sin elevación de
// esquema: una redirección a http o fuera de la allowlist se rechaza.
function validateRedirectTarget(target: URL): string | null {
  if (target.protocol !== 'https:') return `redirección a esquema «${target.protocol}» rechazada`;
  if (target.username || target.password) return 'redirección con credenciales embebidas rechazada';
  if (target.port !== '' && target.port !== '443')
    return `redirección al puerto «${target.port}» rechazada`;
  const host = target.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return `redirección al host «${host}» fuera de la allowlist rechazada`;
  return null;
}

// ============ Obtención acotada ============

export interface LumaFetchOptions {
  fetchImpl?: typeof fetch;
  // Solo el worker que activa un transporte de prueba aporta esta marca;
  // nunca se infiere de la URL ni del HTML no confiable.
  isFixture?: true;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 3;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new LumaIngestError(
      `la página declara ${declared} bytes y supera el límite de ${maxBytes}; se rechaza antes de descargarla`,
    );
  const body = response.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new LumaIngestError(
            `la página supera el límite de ${maxBytes} bytes; la descarga se cortó y se rechaza`,
          );
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes)
    throw new LumaIngestError(`la página supera el límite de ${maxBytes} bytes; se rechaza`);
  return text;
}

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
): Promise<LumaFetchOutput> {
  const {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    now = () => new Date(),
  } = options;

  const validated = canonicalizeLumaUrl(requestedUrl);
  if (!validated.ok) throw new LumaIngestError(`URL rechazada: ${validated.reason}`);

  let current = new URL(validated.canonical);
  let response: Response | null = null;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let candidate: Response;
    try {
      candidate = await fetchImpl(current.toString(), {
        headers: { 'user-agent': BROWSER_UA, accept: 'text/html' },
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const cause = error instanceof Error ? error.name : String(error);
      throw new LumaIngestError(
        cause === 'TimeoutError' || cause === 'AbortError'
          ? `timeout de ${timeoutMs} ms obteniendo la página del evento`
          : 'no se pudo alcanzar la página del evento (error de red)',
      );
    }
    if (candidate.status >= 301 && candidate.status <= 308) {
      const location = candidate.headers.get('location');
      if (!location)
        throw new LumaIngestError(`la página respondió ${candidate.status} sin destino de redirección`);
      let target: URL;
      try {
        target = new URL(location, current);
      } catch {
        throw new LumaIngestError('destino de redirección inválido');
      }
      const rejected = validateRedirectTarget(target);
      if (rejected) throw new LumaIngestError(rejected);
      current = target;
      response = null;
      continue;
    }
    response = candidate;
    break;
  }
  if (response === null)
    throw new LumaIngestError(`más de ${maxRedirects} redirecciones; se rechaza`);
  if (!response.ok) throw new LumaIngestError(`la página del evento respondió ${response.status}`);

  const html = await readBodyCapped(response, maxBytes);
  const fetchedAt = now().toISOString();
  // JSON-LD identifica un evento; OG solo completa su nombre. Metadatos de
  // páginas genéricas nunca se convierten en un dossier de evento.
  const parsed = parseLumaEvent(html, current.toString(), fetchedAt);
  if (parsed.extraction.status === 'failed' || parsed.event === null)
    throw new LumaIngestError(
      `extracción fallida: ${parsed.extraction.warnings.join(' · ') || 'sin datos estructurados'}`,
    );

  const event = parsed.event;
  const name = clean(event.name, 300);
  if (!name) throw new LumaIngestError('extracción fallida: nombre del evento vacío tras sanear');
  const coordinates =
    event.coordinates &&
    Number.isFinite(event.coordinates[0]) &&
    Number.isFinite(event.coordinates[1]) &&
    Math.abs(event.coordinates[1]) <= 90 &&
    Math.abs(event.coordinates[0]) <= 180
      ? { lat: event.coordinates[1], lng: event.coordinates[0] }
      : null;

  return {
    ...(options.isFixture === true ? { isFixture: true as const } : {}),
    requestedUrl: validated.canonical,
    finalUrl: current.toString(),
    canonicalUrl: lumaIdentityUrl(current.toString()) ?? validated.canonical,
    fetchedAt,
    htmlSha256: createHash('sha256').update(html).digest('hex'),
    htmlBytes: Buffer.byteLength(html, 'utf8'),
    extraction: {
      status: parsed.extraction.status,
      warnings: parsed.extraction.warnings.map((warning) => clean(warning, 300) ?? '').filter(Boolean),
      fieldsExtracted: [...parsed.extraction.fieldsExtracted],
    },
    fields: {
      name,
      startsAt: clean(event.startsAt || null, 64),
      endsAt: clean(event.endsAt ?? null, 64),
      venue: clean(event.venue ?? null, 200),
      city: clean(event.city || null, 120),
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
    throw new LumaIngestError(`${kind} producido por la importación no cumple el contrato: ${detail}`);
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
export async function persistLumaDossier(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
  output: LumaFetchOutput,
): Promise<LumaPersistOutcome> {
  const revisionId = `luma-${runId}-edition`;
  const sourceId = `luma-${runId}-src`;
  const loadHash = createHash('sha256').update(`luma-ingest:${runId}`).digest('hex');

  return withTenantTransaction(pool, tenantId, async (client) => {
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
          ? `Importación durable de ${output.canonicalUrl} (run ${runId}); transporte fixture de prueba, sin consulta a Luma real. No acredita un evento real ni cobertura comercial.`
          : `Importación durable de ${output.canonicalUrl} (run ${runId}); material extraído automáticamente, sin revisión humana.`,
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
    const addClaim = (attribute: string, value: ClaimValue, status: ClaimRevision['status']): void => {
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
            method: output.isFixture ? 'test_fixture+jsonld_extraction' : 'jsonld_extraction',
            note: null,
            reviewer: null,
            reviewedAt: output.fetchedAt,
            previousRevisionId: chain?.latestRevisionId ?? null,
          } satisfies ClaimRevision),
        ),
      );
    };
    const addPendingIfNew = (attribute: string, note: string): void => {
      if (chainByAttribute.has(attribute)) return;
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
        : base?.location ?? ({ scope: 'unknown', name: null } as const);
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
        coordinates:
          fields.city !== null ? fields.coordinates : base?.coordinates ?? null,
        claimRevisionIds: claims.map((claim) => claim.id),
        revisedAt: output.fetchedAt,
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
      claimRevisionIds: claims.map((claim) => claim.id),
    };
  });
}
