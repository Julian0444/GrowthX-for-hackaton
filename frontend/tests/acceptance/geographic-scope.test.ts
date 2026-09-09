// Ticket 03 — la geografía conserva el alcance de la evidencia (oráculo O2).
//
// Roja sobre la referencia v0 congelada por 01 (señal nacional presentada como
// mercado urbano; ciudad de la consulta copiada al resultado de Exa), verde con
// la corrección de growxth.ts (contrato) + city-catalog.ts +
// global-market-search.ts + exa-events.ts + opportunity-adapter.ts.
//
// Recorre normalización → respuesta → proyección de UI con tres fixtures:
// 1. País (Trends India): sigue siendo observación de país; el vínculo con
//    Bengaluru queda como hipótesis de exploración etiquetada
//    (market.explorationCity), nunca como market.city factual.
// 2. Ciudad explícita (perfil que declara «Berlin, Germany»): la ciudad se
//    conserva con el alcance de lo declarado (estimated / profile_location);
//    declarar ubicación no demuestra presencia física. Un alias de país
//    («Germany») no se eleva a ciudad.
// 3. Ciudad que aparece únicamente en la query (Exa): sin lugar en la página,
//    location queda pendiente (null); la hipótesis sigue guiando el
//    descubrimiento (la grabación de Bengaluru se sigue consultando).
// Cada aserción de valor va acompañada de una de estado/alcance: comprobar solo
// el texto de la ciudad no alcanza.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SearchRequest } from '../../lib/contracts/growxth.ts';
import type { ApifyActorResult } from '../../lib/server/connectors/apify.ts';
import type { GlobalSignalBundle } from '../../lib/server/pipeline/global-market-search.ts';
import * as h from '../fixtures/baseline-v0/harness.ts';

// El tsconfig del proyecto no admite top-level await: cada test espera acá.
// Los módulos con alias `@/` cargan tras registrar el gancho del harness.
const modulesPromise = (async () => ({
  markets: await import('../../lib/server/pipeline/global-market-search.ts'),
  adapter: await import('../../lib/api/opportunity-adapter.ts'),
}))();

const COLLECTED_AT = '2026-09-01T10:00:00.000Z';
const REQUEST: SearchRequest = h.BASELINE_REQUEST;

function actor(items: unknown[]): ApifyActorResult {
  return {
    actorId: 'test/actor',
    runId: 'run-geo',
    status: 'SUCCEEDED',
    items,
    warning: null,
  };
}

function bundle(partial: Partial<GlobalSignalBundle>): GlobalSignalBundle {
  const trends = partial.trends ?? [];
  const tweets = partial.tweets ?? [];
  const github = partial.github ?? [];
  return {
    term: 'ai observability',
    collectedAt: COLLECTED_AT,
    trends,
    tweets,
    github,
    sources: [
      { source: 'google_trends', available: trends.length > 0, warning: null, globalCount: trends.length, globalEvidenceUrl: null },
      { source: 'github', available: github.length > 0, warning: null, globalCount: github.length, globalEvidenceUrl: null },
      { source: 'x', available: tweets.length > 0, warning: null, globalCount: tweets.length, globalEvidenceUrl: null },
    ],
    ...partial,
  };
}

test('fixture país: un dato de Trends sobre India sigue siendo observación de país', async () => {
  const { markets, adapter } = await modulesPromise;

  // Normalización: el país sí asigna un punto de exploración, con su alcance.
  const trends = markets.normalizeGoogleTrends(
    actor([{ geoData: [{ geoCode: 'IN', geoName: 'India', value: [96] }] }]),
    'ai observability',
  );
  assert.equal(trends.length, 1);
  assert.equal(trends[0]?.city.city, 'Bengaluru', 'el país asigna un punto de exploración');
  assert.equal(trends[0]?.basis, 'country', 'el alcance de la señal sigue siendo país');

  // Respuesta: la hipótesis de exploración no se presenta como ciudad factual.
  const response = markets.rankGlobalMarkets(REQUEST, bundle({ trends }));
  const opp = response.opportunities.find((item) => item.id === 'opp-global-bengaluru');
  assert.ok(opp, 'el mercado nominado por la señal nacional existe');
  assert.equal(opp.market?.city ?? null, null, 'una señal nacional no se presenta como ciudad observada');
  assert.equal(opp.market?.explorationCity, 'Bengaluru', 'el vínculo con la ciudad queda etiquetado como hipótesis de exploración');
  assert.equal(opp.market?.country, 'India', 'el alcance real (país) se conserva');

  const trendSignal = opp.momentumSignals?.find((signal) => signal.source === 'google_trends');
  assert.equal(trendSignal?.basis, 'country', 'la señal de momentum declara su base de país');
  assert.equal(trendSignal?.status, 'estimated', 'sin base urbana la señal no es observed');
  const locations = (trendSignal?.evidenceIds ?? []).map((id) => response.evidence[id]?.location ?? null);
  assert.deepEqual(locations, ['India'], 'la evidencia conserva la ubicación de país');
  assert.ok(
    opp.reasons.some((reason) => reason.text.includes('India')),
    'la razón habla del país observado, no de la ciudad inferida',
  );

  // Proyección de UI (adaptador legacy que alimenta mapa, rail y drawer).
  const legacy = adapter.toLegacyShape(response);
  const legacyOpp = legacy.opportunities.find((item) => item.id === 'opp-global-bengaluru');
  assert.notEqual(legacyOpp?.city, 'Bengaluru', 'la UI no recibe la hipótesis como ciudad factual');
  assert.match(legacyOpp?.city ?? '', /hypothesis/i, 'la hipótesis llega a la UI con etiqueta visible');
  assert.equal(legacyOpp?.country, 'India', 'el país se conserva para el resaltado del mapa');
});

test('fixture ciudad explícita: la ubicación declarada conserva ciudad y alcance de lo declarado', async () => {
  const { markets } = await modulesPromise;

  const tweets = markets.normalizeTweets(
    actor([
      {
        url: 'https://x.com/langfuse',
        username: 'langfuse',
        name: 'Langfuse (perfil controlado)',
        location: 'Berlin, Germany',
        followers: 5400,
        scrapedAt: COLLECTED_AT,
      },
    ]),
    COLLECTED_AT,
  );
  assert.equal(tweets[0]?.city.city, 'Berlin');
  assert.equal(tweets[0]?.basis, 'profile_location', 'la fuente es una declaración de perfil');

  const response = markets.rankGlobalMarkets(REQUEST, bundle({ tweets }));
  const opp = response.opportunities.find((item) => item.id === 'opp-global-berlin');
  assert.ok(opp);
  assert.equal(opp.market?.city, 'Berlin', 'la ciudad declarada explícitamente sí puede afirmarse');
  assert.equal(opp.market?.explorationCity ?? null, null, 'no hace falta hipótesis cuando la ciudad está respaldada');

  const xSignal = opp.momentumSignals?.find((signal) => signal.source === 'x');
  assert.equal(xSignal?.basis, 'profile_location', 'el alcance sigue siendo la declaración del perfil');
  assert.equal(xSignal?.status, 'estimated', 'ubicación declarada no demuestra presencia física ni asistencia');
  for (const id of xSignal?.evidenceIds ?? []) {
    assert.equal(response.evidence[id]?.status, 'estimated', 'la evidencia declarada no se eleva a observed');
    assert.ok(
      (response.evidence[id]?.location ?? '').includes('Berlin'),
      'la evidencia conserva la ubicación declarada',
    );
  }

  // Contraste: el mismo tipo de perfil declarando solo el país no afirma ciudad.
  const countryTweets = markets.normalizeTweets(
    actor([
      {
        url: 'https://x.com/pais-solamente',
        username: 'pais-solamente',
        name: 'Perfil con país',
        location: 'Germany',
        followers: 10,
        scrapedAt: COLLECTED_AT,
      },
    ]),
    COLLECTED_AT,
  );
  assert.equal(countryTweets[0]?.city.city, 'Berlin', 'el país sigue asignando un punto de exploración');
  const countryResponse = markets.rankGlobalMarkets(REQUEST, bundle({ tweets: countryTweets }));
  const hypothesis = countryResponse.opportunities.find((item) => item.id === 'opp-global-berlin');
  assert.equal(hypothesis?.market?.city ?? null, null, 'un alias de país (Germany) no se eleva a ciudad');
  assert.equal(hypothesis?.market?.explorationCity, 'Berlin');
});

test('fixture ciudad solo en la query: Exa no copia la ciudad de la consulta al resultado', async () => {
  const { adapter } = await modulesPromise;
  const { response, calls } = await h.runReplay();

  // La página sin lugar queda con location pendiente; la página sigue observada.
  const noPlace = Object.values(response.evidence).find(
    (item) => item.url === 'https://example.org/baseline-v0/llm-monitoring-online',
  );
  assert.ok(noPlace, 'el resultado de Exa sin lugar sigue citado (permanece incompleto, no desaparece)');
  assert.equal(noPlace.location, null, 'sin fuente que respalde el lugar, la ubicación queda pendiente');
  assert.equal(noPlace.status, 'observed', 'la página en sí sigue observada (URL + fecha)');

  // La página que sí nombra el lugar lo conserva.
  const withPlace = Object.values(response.evidence).find(
    (item) => item.url === 'https://lu.ma/baseline-v0-ai-obs-blr-oct',
  );
  assert.equal(withPlace?.location, 'Bengaluru', 'cuando la página nombra el lugar, se conserva');
  assert.equal(withPlace?.status, 'observed');

  // La señal exclusivamente nacional no se convierte en mercado urbano, pero la
  // hipótesis sigue guiando el descubrimiento (Exa se consulta igual).
  const bengaluru = response.opportunities.find((item) => item.id === 'opp-global-bengaluru');
  assert.equal(bengaluru?.market?.city ?? null, null, 'señal nacional + resultados de Exa no fabrican mercado urbano');
  assert.equal(bengaluru?.market?.explorationCity, 'Bengaluru');
  assert.ok(
    calls.some((call) => call.recording === 'exa:Bengaluru'),
    'la hipótesis de exploración sigue alimentando la búsqueda de eventos',
  );

  // Proyección de UI del replay completo: ciudad respaldada tal cual; hipótesis etiquetada.
  const legacy = adapter.toLegacyShape(response);
  const cities = Object.fromEntries(legacy.opportunities.map((item) => [item.id, item.city]));
  assert.equal(cities['opp-global-san-francisco'], 'San Francisco', 'la ciudad declarada se muestra tal cual');
  assert.match(cities['opp-global-bengaluru'] ?? '', /hypothesis/i, 'la hipótesis llega al mapa con etiqueta visible');
});
