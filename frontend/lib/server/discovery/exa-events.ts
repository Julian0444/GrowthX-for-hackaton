// Exa live discovery: por cada mercado top, busca eventos/hackathons reales
// próximos en esa ciudad y los adjunta como Evidence citable (URL + fecha, así
// pasa la auditoría de labels como Observed). Degradación: sin EXA_API_KEY o
// ante fallo de red, la respuesta original queda intacta y 'exa' se reporta en
// sourcesFailed. Nunca lanza.

import type {
  Evidence,
  EvidenceSource,
  Opportunity,
  SearchRequest,
  SearchResponse,
} from '@/lib/contracts/growxth';
// Relativo (no alias `@/`) para que los tests de node --test lo resuelvan
// sin gancho de alias, igual que los imports de global-market-search.ts.
import { cityLevelNames } from '../markets/city-catalog.ts';
import { classifyEventValidity, type EventValidity } from '../../temporal/event-validity.ts';

const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const REQUEST_TIMEOUT_MS = 7000;
const RESULTS_PER_CITY = 3;

function stableId(prefix: string, value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function compact(value: string, max = 190): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

function eventQuery(request: SearchRequest, city: string): string {
  const stack = request.icpStack.slice(0, 2).join(' ');
  const topic = [compact(request.product, 60), stack].filter(Boolean).join(' ') || 'developer tools';
  return `upcoming ${topic} hackathon or developer meetup in ${city}`;
}

interface ExaResult {
  title: string | null;
  url: string;
  publishedDate?: string | null;
  text?: string | null;
}

async function searchCity(
  apiKey: string,
  request: SearchRequest,
  city: string,
): Promise<ExaResult[]> {
  const response = await fetch(EXA_SEARCH_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: eventQuery(request, city),
      numResults: RESULTS_PER_CITY,
      type: 'auto',
      contents: { text: { maxCharacters: 320 } },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Exa search ${response.status}`);
  const body = (await response.json()) as { results?: unknown[] };
  const results: ExaResult[] = [];
  for (const raw of body.results ?? []) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.url !== 'string' || item.url.length === 0) continue;
    results.push({
      title: typeof item.title === 'string' ? item.title : null,
      url: item.url,
      publishedDate: typeof item.publishedDate === 'string' ? item.publishedDate : null,
      text: typeof item.text === 'string' ? item.text : null,
    });
  }
  return results;
}

// La ciudad de la consulta no es una observación: el lugar solo se registra
// cuando la propia página lo nombra (ciudad o alias urbano del catálogo). Sin
// eso, la ubicación queda pendiente (null).
function locationNamedInResult(result: ExaResult, city: string): string | null {
  const content = `${result.title ?? ''} ${result.text ?? ''}`.toLowerCase();
  const named = cityLevelNames(city).some(
    (name) => name.length >= 3 && content.includes(name.toLowerCase()),
  );
  return named ? city : null;
}

// ---- Vigencia del listado (ticket 04) ----
//
// La vigencia se decide por la fecha del EVENTO que la propia página nombra
// («15 October 2026», «held on 12 August 2026»), nunca por publishedDate: la
// publicación reciente de una página vieja no rejuvenece el evento, y la fecha
// de obtención (collectedAt) tampoco es la fecha del evento.

const MONTH_BY_PREFIX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_FIRST_DATE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/gi;
const MONTH_FIRST_DATE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;
const ISO_TEXT_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

function isoDay(year: string, month: number, day: string): string | null {
  const dd = Number(day);
  if (dd < 1 || dd > 31 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// Fechas de evento mencionadas en la propia página (título + texto), como
// días calendario ISO. Sin zona: la política las evalúa sin inventarla.
function mentionedEventDates(result: ExaResult): string[] {
  const content = `${result.title ?? ''} ${result.text ?? ''}`;
  const dates = new Set<string>();
  for (const match of content.matchAll(DAY_FIRST_DATE)) {
    const day = isoDay(match[3], MONTH_BY_PREFIX[match[2].toLowerCase()] ?? 0, match[1]);
    if (day) dates.add(day);
  }
  for (const match of content.matchAll(MONTH_FIRST_DATE)) {
    const day = isoDay(match[3], MONTH_BY_PREFIX[match[1].toLowerCase()] ?? 0, match[2]);
    if (day) dates.add(day);
  }
  for (const match of content.matchAll(ISO_TEXT_DATE)) {
    const day = isoDay(match[1], Number(match[2]), match[3]);
    if (day) dates.add(day);
  }
  return [...dates];
}

function listingValidity(result: ExaResult, evaluationInstant: string): EventValidity {
  const dates = mentionedEventDates(result);
  if (dates.length === 0) return 'date_pending';
  const classes = dates.map((day) => classifyEventValidity(day, evaluationInstant).validity);
  // Todas las fechas nombradas ya pasaron → la página documenta un evento
  // pasado (recap); cualquier fecha futura la mantiene como listado por venir.
  if (classes.every((value) => value === 'past')) return 'past';
  if (classes.some((value) => value === 'upcoming')) return 'upcoming';
  return 'date_ambiguous';
}

function toEvidence(result: ExaResult, city: string, collectedAt: string): Evidence {
  return {
    id: stableId('ev-exa', result.url),
    source: 'exa',
    kind: 'event_listing',
    url: result.url,
    title: compact(result.title ?? 'Developer event listing', 110),
    observedAt: result.publishedDate ?? collectedAt,
    location: locationNamedInResult(result, city),
    confidence: 0.74,
    rightsBasis: 'public_web',
    status: 'observed',
    collector: 'direct',
    excerpt: result.text ? compact(result.text, 190) : undefined,
  };
}

export async function enrichWithExaEvents(
  request: SearchRequest,
  response: SearchResponse,
): Promise<SearchResponse> {
  const apiKey = process.env.EXA_API_KEY;
  // La ciudad confirmada o, si está pendiente, la hipótesis de exploración
  // orientan la búsqueda; ninguna de las dos se copia como lugar del resultado.
  const searchCityFor = (item: Opportunity): string | null =>
    item.market?.city ?? item.market?.explorationCity ?? null;
  const targets = response.opportunities.filter((item) => searchCityFor(item) != null);
  if (!apiKey || targets.length === 0) {
    if (!apiKey) {
      return withSourceFailure(
        response,
        'Exa live event discovery unavailable (EXA_API_KEY missing); ranking shows market signals only.',
      );
    }
    return response;
  }

  // La fecha de obtención es también el instante de evaluación de la regla
  // temporal; nunca reemplaza a la fecha del evento ni a la de publicación.
  const collectedAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    targets.map((item) => searchCity(apiKey, request, searchCityFor(item)!)),
  );

  const evidence: Record<string, Evidence> = { ...response.evidence };
  let anySuccess = false;
  const opportunities: Opportunity[] = response.opportunities.map((opportunity) => {
    const index = targets.findIndex((item) => item.id === opportunity.id);
    if (index === -1) return opportunity;
    const outcome = settled[index];
    if (outcome.status !== 'fulfilled' || outcome.value.length === 0) return opportunity;
    anySuccess = true;
    const city = searchCityFor(opportunity)!;
    const items = outcome.value.map((result) => ({
      evidence: toEvidence(result, city, collectedAt),
      validity: listingValidity(result, collectedAt),
    }));
    // Toda página observada queda consultable como evidencia (URL + fecha)…
    for (const item of items) evidence[item.evidence.id] = item.evidence;
    // …pero solo las que no documentan un evento ya pasado se citan como
    // listados por venir. Un recap vencido es antecedente histórico: su
    // publicación reciente no lo rejuvenece (ticket 04).
    const historical = items.filter((item) => item.validity === 'past');
    const cited = items.filter((item) => item.validity !== 'past');
    if (cited.length === 0) return opportunity;
    const sample = cited[0].evidence.title;
    const upcoming = cited.filter((item) => item.validity === 'upcoming').length;
    const undated = cited.length - upcoming;
    const pendingPlace = cited.filter((item) => item.evidence.location == null).length;
    let text = `Exa found ${cited.length} developer event listing${cited.length === 1 ? '' : 's'} from a search for ${city}, e.g. “${sample}”.`;
    if (upcoming > 0) {
      text += ` ${upcoming} name${upcoming === 1 ? 's' : ''} an upcoming event date.`;
    }
    if (undated > 0) {
      text += ` ${undated} ${undated === 1 ? 'does' : 'do'} not name a verifiable event date; their date is pending.`;
    }
    if (pendingPlace > 0) {
      text += ` ${pendingPlace} listing${pendingPlace === 1 ? ' does' : 's do'} not name a place; their location is pending.`;
    }
    if (historical.length > 0) {
      text += ` ${historical.length} page${historical.length === 1 ? '' : 's'} document${historical.length === 1 ? 's' : ''} an already past event (e.g. “${historical[0].evidence.title}”); kept as historical antecedents, not cited as live listings.`;
    }
    return {
      ...opportunity,
      reasons: [
        ...opportunity.reasons,
        {
          // La razón describe la búsqueda y la vigencia de cada resultado; los
          // listados sin lugar o sin fecha propios quedan explícitamente
          // pendientes.
          text,
          evidenceIds: cited.map((item) => item.evidence.id),
        },
      ],
    };
  });

  if (!anySuccess) {
    return withSourceFailure(
      response,
      'Exa returned no live event listings for these markets; ranking shows market signals only.',
    );
  }

  const sourcesUsed: EvidenceSource[] = response.coverage.sourcesUsed.includes('exa')
    ? response.coverage.sourcesUsed
    : [...response.coverage.sourcesUsed, 'exa'];
  return {
    ...response,
    opportunities,
    evidence,
    coverage: { ...response.coverage, sourcesUsed },
  };
}

function withSourceFailure(response: SearchResponse, warning: string): SearchResponse {
  const sourcesFailed: EvidenceSource[] = response.coverage.sourcesFailed.includes('exa')
    ? response.coverage.sourcesFailed
    : [...response.coverage.sourcesFailed, 'exa'];
  return {
    ...response,
    warnings: [...response.warnings, warning],
    coverage: { ...response.coverage, sourcesFailed },
  };
}
