// Ticket 06 — quitar al LLM la autoridad sobre el orden y los scores (O5).
//
// Roja sobre la referencia v0 congelada por 01 (la grabación adversarial de
// Gemini pide rank invertido y v0 reordena el array; el adaptador emite
// rank: index + 1 sobre ese orden), verde cuando el orden visible, los scores
// y el breakdown son exclusivamente del scorer y la redacción nunca reordena.
//
// Recorrido del ticket: evaluación determinística conocida → payloads
// adversariales del modelo (grabación de 01 e inyectados: invertidos,
// repetidos, desconocidos, omitidos, con campos de score) → respuesta y
// proyección del rail. Cubre además el desempate determinístico (mismo orden
// oficial ante distinto orden de llegada de señales de proveedor, en los dos
// pipelines) y la ausencia de modelo comparando la proyección completa del
// rail, no solo los valores numéricos.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import type {
  Community,
  SearchRequest,
  SearchResponse,
  SFEvent,
} from '../../lib/contracts/growxth.ts';
import type { GlobalSignalBundle } from '../../lib/server/pipeline/global-market-search.ts';
import * as h from '../fixtures/baseline-v0/harness.ts';

// El tsconfig no admite top-level await: cada test espera esta promesa. Los
// módulos con alias `@/` cargan tras registrar el gancho del harness.
const modulesPromise = (async () => ({
  v0: await h.loadV0(),
  gemini: await import('../../lib/server/reasoning/gemini.ts'),
  markets: await import('../../lib/server/pipeline/global-market-search.ts'),
  catalog: await import('../../lib/server/markets/city-catalog.ts'),
}))();

// runReplay tarda unos segundos (timers de la búsqueda mundial): cada variante
// se corre una sola vez y se comparte.
let replayMemo: ReturnType<typeof h.runReplay> | null = null;
function getReplay(): ReturnType<typeof h.runReplay> {
  replayMemo ??= h.runReplay();
  return replayMemo;
}
let deterministicMemo: ReturnType<typeof h.runReplay> | null = null;
function getDeterministic(): ReturnType<typeof h.runReplay> {
  deterministicMemo ??= h.runReplay(h.BASELINE_REQUEST, { withGemini: false });
  return deterministicMemo;
}

function orderOf(response: SearchResponse): string[] {
  return response.opportunities.map((item) => item.id);
}

function scoresById(response: SearchResponse): Array<[string, number]> {
  return response.opportunities
    .map((item): [string, number] => [item.id, item.score])
    .sort(([a], [b]) => a.localeCompare(b));
}

// Proyección determinística posición a posición: id, score, breakdown y
// razones deben ser los del scorer en el MISMO lugar del array.
function deterministicProjection(response: SearchResponse): unknown[] {
  return response.opportunities.map((item) => ({
    id: item.id,
    score: item.score,
    breakdown: item.breakdown,
    reasons: item.reasons,
  }));
}

function opportunityOf(response: SearchResponse, id: string) {
  const opportunity = response.opportunities.find((item) => item.id === id);
  assert.ok(opportunity, `${id} está en la respuesta`);
  return opportunity;
}

function ownEvidenceIds(response: SearchResponse, id: string): string[] {
  return [...new Set(opportunityOf(response, id).reasons.flatMap((reason) => reason.evidenceIds))];
}

// ------------------------------------------------------- inyección de modelo

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function geminiEnvelope(decisions: unknown[]): unknown {
  return {
    candidates: [
      {
        content: { parts: [{ text: JSON.stringify({ decisions }) }], role: 'model' },
        finishReason: 'STOP',
      },
    ],
  };
}

// Ejecuta la etapa de redacción con una respuesta de modelo controlada y
// captura el cuerpo enviado al proveedor (instrucciones + contrato de salida).
async function redactWith(
  request: SearchRequest,
  base: SearchResponse,
  respond: () => Response | Promise<Response>,
): Promise<{ response: SearchResponse; requestBodies: string[] }> {
  const { gemini } = await modulesPromise;
  const requestBodies: string[] = [];
  const realFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'llm-rank-authority-fake-key';
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const init = args[1];
    if (typeof init?.body === 'string') requestBodies.push(init.body);
    return respond();
  }) as typeof fetch;
  try {
    return { response: await gemini.reasonWithGemini(request, base), requestBodies };
  } finally {
    globalThis.fetch = realFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
}

// Proyección legacy (rail y mapa) bajo reloj congelado, como el resto de la
// suite.
async function projectLegacy(response: SearchResponse) {
  const { v0 } = await modulesPromise;
  const restore = h.freezeClock();
  try {
    return v0.adapter.toLegacyShape(response);
  } finally {
    restore();
  }
}

// ------------------------------------------------- contrato de salida útil

test('el contrato de salida útil y las instrucciones de Gemini no piden rank; una decisión sin rank se aplica igual', async () => {
  const base = (await getDeterministic()).response;
  const admitted = ownEvidenceIds(base, 'opp-global-bengaluru')[0];
  assert.ok(admitted, 'Bengaluru tiene evidencia admitida propia');

  const { response: out, requestBodies } = await redactWith(h.BASELINE_REQUEST, base, () =>
    jsonOk(
      geminiEnvelope([
        {
          id: 'opp-global-bengaluru',
          headline: 'Run a hands-on tracing night in Bengaluru',
          reasoning: 'A workshop fits this community.',
          evidenceIds: [admitted],
        },
      ]),
    ),
  );

  assert.equal(requestBodies.length, 1, 'la redacción hizo exactamente una petición');
  const body = JSON.parse(requestBodies[0]!) as {
    contents?: Array<{ parts?: Array<{ text?: string }> }>;
    generationConfig?: {
      responseSchema?: {
        properties?: {
          decisions?: { items?: { properties?: Record<string, unknown>; required?: string[] } };
        };
      };
    };
  };
  const decisionSchema = body.generationConfig?.responseSchema?.properties?.decisions?.items;
  assert.ok(decisionSchema?.properties, 'el contrato de salida declara las propiedades de cada decisión');
  assert.ok(!('rank' in decisionSchema.properties), 'el contrato de salida útil no incluye rank');
  assert.ok(!(decisionSchema.required ?? []).includes('rank'), 'rank no es un campo requerido');
  const prompt = body.contents?.[0]?.parts?.[0]?.text ?? '';
  assert.ok(prompt.length > 0, 'las instrucciones viajan en la petición');
  assert.ok(!/\brank\b/i.test(prompt), 'las instrucciones no piden un rank al modelo');

  // Sin rank, la decisión validada se aplica igual y el orden no se toca.
  assert.equal(opportunityOf(out, 'opp-global-bengaluru').narrative?.status, 'validated');
  assert.equal(opportunityOf(out, 'opp-global-bengaluru').play.headline, 'Run a hands-on tracing night in Bengaluru');
  assert.deepEqual(orderOf(out), orderOf(base));
});

// ------------------------------------------------ grabación adversarial (01)

test('grabación adversarial (rank invertido, candidato desconocido, campo score): el orden visible y el rail siguen al scorer (O5)', async () => {
  const { response } = await getReplay();
  const { response: deterministic } = await getDeterministic();
  const deterministicOrder = orderOf(deterministic);

  // Premisa de la grabación de 01: pide EXACTAMENTE el orden inverso, trae un
  // candidato desconocido y un campo score que nadie debe obedecer.
  const recording = JSON.parse(readFileSync(join(h.PROVIDERS_DIR, 'gemini.json'), 'utf8')) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  const recorded = JSON.parse(recording.candidates[0]!.content.parts[0]!.text) as {
    decisions: Array<{ id: string; rank?: number; score?: number }>;
  };
  const requestedOrder = recorded.decisions
    .filter((item) => deterministicOrder.includes(item.id))
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map((item) => item.id);
  assert.deepEqual(requestedOrder, [...deterministicOrder].reverse(), 'la grabación solicita el orden inverso');
  assert.ok(
    recorded.decisions.some((item) => item.id === 'opp-global-nowhere'),
    'la grabación trae un candidato que el scorer no evaluó',
  );
  assert.equal(recorded.decisions.find((item) => item.id === 'opp-global-berlin')?.score, 99, 'la grabación trae un campo score');

  // O5.1 en su valor deseado: el orden visible es el determinístico, con las
  // mismas oportunidades (ninguna creada, ninguna perdida, ninguna movida).
  assert.deepEqual(orderOf(response), deterministicOrder, 'la redacción no reordena el array del scorer');
  assert.ok(
    response.opportunities.every((item) => item.id !== 'opp-global-nowhere'),
    'un candidato desconocido del modelo no crea una oportunidad',
  );

  // Proyección determinística completa posición a posición: IDs, scores,
  // breakdown y razones idénticos con y sin modelo.
  assert.deepEqual(deterministicProjection(response), deterministicProjection(deterministic));
  assert.notEqual(
    opportunityOf(response, 'opp-global-berlin').score,
    99,
    'el campo score de la decisión no se convierte en autoridad',
  );

  // O5.3: los scores no se mueven por la redacción.
  assert.deepEqual(scoresById(response), scoresById(deterministic));

  // O5.2: el rank que recibe la UI es la posición en el orden oficial; el
  // adaptador no introduce una segunda decisión de orden.
  const legacy = await projectLegacy(response);
  assert.deepEqual(
    legacy.opportunities.map(({ id, rank }) => ({ id, rank })),
    deterministicOrder.map((id, index) => ({ id, rank: index + 1 })),
    'el rail y el mapa reciben el orden producido por el scorer',
  );
});

// -------------------------------------------------- respuestas inyectadas

test('candidatos repetidos, omitidos y con campos de score no crean oportunidades, no pierden las válidas y no cambian posiciones; una segunda redacción tampoco', async () => {
  const base = (await getDeterministic()).response;
  const baseOrder = orderOf(base);
  const sfAdmitted = ownEvidenceIds(base, 'opp-global-san-francisco')[0];
  const berlinAdmitted = ownEvidenceIds(base, 'opp-global-berlin')[0];

  // Bengaluru omitido; San Francisco con rank y score espurios; Berlín
  // repetido (dos decisiones idénticas salvo el rank); un desconocido más.
  const berlinDuplicate = {
    id: 'opp-global-berlin',
    headline: 'Host a tracing night with Berlin builders',
    reasoning: 'Strong community energy.',
    evidenceIds: [berlinAdmitted],
  };
  const { response: out } = await redactWith(h.BASELINE_REQUEST, base, () =>
    jsonOk(
      geminiEnvelope([
        {
          id: 'opp-global-san-francisco',
          rank: 1,
          score: 100,
          headline: 'Sponsor an evals night in SoMa',
          reasoning: 'Search interest supports it.',
          evidenceIds: [sfAdmitted],
        },
        { ...berlinDuplicate, rank: 2 },
        { ...berlinDuplicate, rank: 3 },
        {
          id: 'opp-global-atlantis',
          rank: 0,
          headline: 'Open a market nobody evaluated',
          reasoning: 'Should be ignored.',
          evidenceIds: [sfAdmitted],
        },
      ]),
    ),
  );

  assert.deepEqual(orderOf(out), baseOrder, 'ninguna posición cambia');
  assert.equal(out.opportunities.length, base.opportunities.length, 'ninguna oportunidad se pierde');
  assert.equal(
    out.opportunities.filter((item) => item.id === 'opp-global-berlin').length,
    1,
    'una decisión repetida no duplica la oportunidad',
  );
  assert.ok(
    out.opportunities.every((item) => item.id !== 'opp-global-atlantis'),
    'un candidato desconocido no crea una oportunidad',
  );
  assert.equal(
    opportunityOf(out, 'opp-global-san-francisco').score,
    opportunityOf(base, 'opp-global-san-francisco').score,
    'el campo score inyectado no toca el score oficial',
  );
  assert.equal(
    opportunityOf(out, 'opp-global-bengaluru').narrative?.status,
    'deterministic_only',
    'el candidato omitido conserva su explicación determinística y lo declara',
  );
  assert.equal(opportunityOf(out, 'opp-global-berlin').narrative?.status, 'validated');
  assert.equal(opportunityOf(out, 'opp-global-berlin').play.headline, 'Host a tracing night with Berlin builders');

  // Segunda redacción sobre la respuesta ya redactada, pidiendo otro orden:
  // el orden oficial tampoco se modifica.
  const { response: again } = await redactWith(h.BASELINE_REQUEST, out, () =>
    jsonOk(
      geminiEnvelope(
        [...baseOrder].reverse().map((id, index) => ({
          id,
          rank: index + 1,
          headline: 'Keep a hands-on developer play',
          reasoning: 'Grounded in the admitted facts.',
          evidenceIds: [ownEvidenceIds(base, id)[0]],
        })),
      ),
    ),
  );
  assert.deepEqual(orderOf(again), baseOrder, 'una segunda redacción no modifica el orden');
  assert.deepEqual(scoresById(again), scoresById(base));
});

// ------------------------------------------------- desempate determinístico

test('desempate determinístico del ranking mundial: señales empatadas en distinto orden de llegada dan el mismo orden oficial (decide el id estable)', async () => {
  const { markets, catalog } = await modulesPromise;
  const singapore = catalog.MARKET_CITIES.find((city) => city.id === 'singapore');
  const tokyo = catalog.MARKET_CITIES.find((city) => city.id === 'tokyo');
  assert.ok(singapore && tokyo);
  assert.equal(singapore.hubWeight, tokyo.hubWeight, 'las dos ciudades comparten hubWeight: el empate es real');

  const bundleWith = (trends: GlobalSignalBundle['trends']): GlobalSignalBundle => ({
    term: 'ai observability',
    collectedAt: '2026-09-07T00:00:00.000Z',
    trends,
    tweets: [],
    github: [],
    sources: [
      { source: 'google_trends', available: true, warning: null, globalCount: trends.length, globalEvidenceUrl: 'https://trends.google.com/' },
      { source: 'github', available: false, warning: 'offline', globalCount: 0, globalEvidenceUrl: null },
      { source: 'x', available: false, warning: 'offline', globalCount: 0, globalEvidenceUrl: null },
    ],
  });
  const trendFor = (city: NonNullable<typeof singapore>): GlobalSignalBundle['trends'][number] => ({
    city,
    value: 80,
    basis: 'city',
    geoLabel: city.city,
    url: 'https://trends.google.com/',
  });

  const forward = markets.rankGlobalMarkets(h.BASELINE_REQUEST, bundleWith([trendFor(singapore), trendFor(tokyo)]));
  const reversed = markets.rankGlobalMarkets(h.BASELINE_REQUEST, bundleWith([trendFor(tokyo), trendFor(singapore)]));

  const tiedForward = forward.opportunities.filter((item) =>
    ['opp-global-singapore', 'opp-global-tokyo'].includes(item.id),
  );
  assert.equal(tiedForward.length, 2, 'las dos ciudades empatadas entran al top');
  assert.equal(tiedForward[0]!.score, tiedForward[1]!.score, 'el caso empata de verdad');

  assert.deepEqual(
    orderOf(forward),
    orderOf(reversed),
    'el orden de llegada de las señales del proveedor no modifica el orden oficial',
  );
  assert.deepEqual(
    orderOf(forward).slice(0, 2),
    ['opp-global-singapore', 'opp-global-tokyo'],
    'el empate se resuelve por id estable, documentado en el sort del pipeline',
  );
});

test('desempate determinístico del pipeline local: candidatos espejo empatados conservan el mismo orden ante grafos en distinto orden', async () => {
  const { v0 } = await modulesPromise;

  const mirrorEvent = (id: string, communityId: string): SFEvent => ({
    id,
    name: 'Mirror Builders Night',
    url: `https://lu.ma/${id}`,
    startsAt: '2026-09-20T18:00:00.000Z',
    venueArea: 'SoMa',
    lat: 37.7786,
    lng: -122.3893,
    expectedAttendance: 120,
    attendanceBasis: 'estimated',
    stack: ['Python'],
    communityIds: [communityId],
    organizerIds: [],
    sponsorTiers: [],
    knownSponsors: [],
    pastThemes: ['observability'],
    evidenceIds: [],
  });
  const mirrorCommunity = (id: string): Community => ({
    id,
    name: 'Mirror Builders',
    url: `https://lu.ma/${id}`,
    kind: 'meetup-series',
    cadence: 'monthly',
    eventsRun12mo: 6,
    foundedYear: 2024,
    sizeEstimate: 200,
    sizeBasis: 'estimated',
    stack: ['Python'],
    organizerIds: [],
    pastSponsors: [],
    evidenceIds: [],
  });

  const eventA = mirrorEvent('evt-mirror-a', 'com-mirror-a');
  const eventB = mirrorEvent('evt-mirror-b', 'com-mirror-b');
  const communityA = mirrorCommunity('com-mirror-a');
  const communityB = mirrorCommunity('com-mirror-b');
  const sourceMeta = { source: 'test-fixture', fetchedAt: '2026-09-01T00:00:00.000Z' };

  const run = (events: SFEvent[], communities: Community[]): SearchResponse => {
    const restore = h.freezeClock();
    try {
      return v0.searchOpportunities.searchOpportunities(h.BASELINE_REQUEST, {
        deps: { graph: { events, communities, organizers: [], sourceMeta }, evidence: [], communityEvidence: {} },
      });
    } finally {
      restore();
    }
  };

  const first = run([eventA, eventB], [communityA, communityB]);
  const second = run([eventB, eventA], [communityB, communityA]);

  assert.equal(first.opportunities.length, 2, 'los dos espejos son elegibles');
  assert.equal(first.opportunities[0]!.score, first.opportunities[1]!.score, 'el caso empata de verdad');
  assert.deepEqual(
    orderOf(first),
    orderOf(second),
    'el orden de llegada de los candidatos no modifica el orden oficial',
  );
  assert.deepEqual(
    orderOf(first),
    ['opp-com-mirror-a-evt-mirror-a', 'opp-com-mirror-b-evt-mirror-b'],
    'el empate se resuelve por id estable',
  );
});

// ------------------------------------------------------- ausencia de modelo

test('ausencia de modelo: orden idéntico con redacción degradada declarada; la proyección completa del rail coincide, no solo los números', async () => {
  const { response: deterministic } = await getDeterministic();
  const failed = (await h.runReplay(h.BASELINE_REQUEST, { failProviders: ['gemini'] })).response;

  for (const [label, out] of [
    ['sin clave', deterministic],
    ['proveedor caído', failed],
  ] as const) {
    assert.ok(
      out.opportunities.every((item) => item.narrative?.status === 'deterministic_only'),
      `${label}: cada oportunidad declara la redacción degradada`,
    );
    assert.ok(
      out.warnings.some((warning) => /unavailable/i.test(warning)),
      `${label}: la degradación se declara en warnings`,
    );
  }
  assert.deepEqual(orderOf(failed), orderOf(deterministic), 'el orden es idéntico sin modelo');

  // Proyección completa que consumen rail y mapa. Solo `narrative.note`
  // distingue el motivo de degradación; se normaliza y TODO lo demás debe
  // coincidir campo a campo (ids, rank, ciudad, score, razones, evidencia,
  // métricas, campañas), no solo los valores numéricos.
  const [failedLegacy, deterministicLegacy] = await Promise.all([
    projectLegacy(failed),
    projectLegacy(deterministic),
  ]);
  const comparable = (legacy: Awaited<ReturnType<typeof projectLegacy>>): unknown[] =>
    legacy.opportunities.map((item) => ({ ...item, narrative: null }));
  assert.deepEqual(comparable(failedLegacy), comparable(deterministicLegacy));
});
