// Ticket 04 — excluir eventos vencidos y conservar fechas desconocidas (O3).
//
// Roja sobre la referencia v0 congelada por 01 (seeds vencidos citados como
// «upcoming», fecha ausente reemplazada por new Date() en el adaptador, recap
// de un evento pasado contado como listing vivo por su publicación reciente,
// fallbacks que reintroducen fixtures históricos como vigentes), verde con la
// política temporal (lib/temporal/event-validity.ts) aplicada en
// derive-signals + search-opportunities + exa-events + opportunity-adapter +
// atlas-client.
//
// La política es una función pura con instante de evaluación explícito; el
// reloj se inyecta con freezeClock del harness, así servidor y proyección de
// UI clasifican igual bajo el mismo instante.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Community, SearchResponse, SFEvent } from '../../lib/contracts/growxth.ts';
import type { SeedGraph } from '../../lib/server/graph/load-graph.ts';
import { classifyEventValidity } from '../../lib/temporal/event-validity.ts';
import * as h from '../fixtures/baseline-v0/harness.ts';

// El tsconfig no admite top-level await: cada test espera esta promesa. Los
// módulos con alias `@/` cargan tras registrar el gancho del harness.
const modulesPromise = (async () => ({
  v0: await h.loadV0(),
  derive: await import('../../lib/server/graph/derive-signals.ts'),
  atlasClient: await import('../../lib/api/atlas-client.ts'),
}))();

const E = h.EVALUATION_CLOCK; // 2026-09-07T22:28:00.000Z
const CLOCK_MS = Date.parse(E);

const EXA_PAST_RECAP_URL = 'https://example.org/baseline-v0/observability-day-india-recap';
const EXA_FUTURE_LISTING_URL = 'https://lu.ma/baseline-v0-ai-obs-blr-oct';
const EXA_UNDATED_URL = 'https://example.org/baseline-v0/llm-monitoring-online';

// runReplay tarda unos segundos (timers de la búsqueda mundial): se corre una
// sola vez y se comparte.
let replayMemo: ReturnType<typeof h.runReplay> | null = null;
function getReplay(): ReturnType<typeof h.runReplay> {
  replayMemo ??= h.runReplay();
  return replayMemo;
}

// ---------------------------------------------------------------- fixtures

function mkEvent(id: string, startsAt: string | null): SFEvent {
  return {
    id,
    name: `Evento ${id}`,
    url: `https://lu.ma/${id}`,
    startsAt,
    venueArea: 'SoMa',
    lat: 37.78,
    lng: -122.4,
    expectedAttendance: 100,
    attendanceBasis: 'observed',
    stack: ['Python', 'Observability'],
    communityIds: [`com-${id}`],
    organizerIds: [],
    sponsorTiers: [],
    knownSponsors: [],
    pastThemes: ['observability'],
    evidenceIds: [],
  };
}

function mkCommunity(eventId: string): Community {
  return {
    id: `com-${eventId}`,
    name: `Comunidad ${eventId}`,
    url: `https://lu.ma/com-${eventId}`,
    kind: 'meetup-series',
    cadence: 'monthly',
    eventsRun12mo: 10,
    foundedYear: 2023,
    sizeEstimate: 200,
    sizeBasis: 'estimated',
    stack: ['Python', 'Observability'],
    organizerIds: [],
    pastSponsors: [],
    evidenceIds: [],
  };
}

// Cuatro eventos, mismo reloj: futuro confirmado, pasado, sin fecha y fecha
// ambigua (sin zona, con el instante de evaluación dentro del rango posible).
const FOUR_EVENTS: Array<[string, string | null]> = [
  ['futuro', '2026-10-15T18:00:00.000Z'],
  ['pasado', '2026-08-01T18:30:00.000Z'],
  ['sin-fecha', null],
  ['ambiguo', '2026-09-08T05:00:00'],
];

function fourEventsGraph(): SeedGraph {
  return {
    events: FOUR_EVENTS.map(([id, startsAt]) => mkEvent(id, startsAt)),
    communities: FOUR_EVENTS.map(([id]) => mkCommunity(id)),
    organizers: [],
    sourceMeta: { source: 'test-fixture', fetchedAt: '2026-09-01T00:00:00.000Z' },
  };
}

// ---------------------------------------------------------------- política

test('política temporal: límites, medianoche y zonas; nunca inventa zona ni fecha', () => {
  // Ausente, vacía o no parseable → pendiente (nunca new Date()).
  for (const value of [null, undefined, '', '   ', 'TBD', '2026-13-40']) {
    const result = classifyEventValidity(value, E);
    assert.equal(result.validity, 'date_pending', `"${value}" queda pendiente`);
    assert.match(result.reason, /pending/i);
    assert.equal(result.startRange, null);
  }

  // Zona explícita: instante exacto, corte contra el instante de evaluación.
  assert.equal(classifyEventValidity('2026-10-15T18:00:00.000Z', E).validity, 'upcoming');
  assert.equal(classifyEventValidity('2026-08-01T18:30:00.000Z', E).validity, 'past');
  // Un evento que empieza exactamente en el instante de evaluación no está vencido.
  assert.equal(classifyEventValidity(E, E).validity, 'upcoming');

  // Cerca de medianoche con zona explícita: clasificación exacta y
  // determinística (la misma función sirve al servidor y a la UI).
  const beforeMidnight = classifyEventValidity('2026-09-08T00:05:00+02:00', E); // 22:05Z < 22:28Z
  const afterMidnight = classifyEventValidity('2026-09-08T01:00:00+02:00', E); // 23:00Z > 22:28Z
  assert.equal(beforeMidnight.validity, 'past');
  assert.equal(afterMidnight.validity, 'upcoming');
  assert.deepEqual(classifyEventValidity('2026-09-08T00:05:00+02:00', E), beforeMidnight);

  // Sin zona: solo se clasifica si el veredicto vale bajo cualquier offset
  // (−12:00 … +14:00); si el instante de evaluación cae dentro del rango,
  // queda ambigua en lugar de inventar zona.
  const ambiguous = classifyEventValidity('2026-09-08T05:00:00', E);
  assert.equal(ambiguous.validity, 'date_ambiguous');
  assert.match(ambiguous.reason, /timezone/i);
  assert.equal(classifyEventValidity('2026-09-20T10:00:00', E).validity, 'upcoming');
  assert.equal(classifyEventValidity('2026-08-20T10:00:00', E).validity, 'past');

  // Solo fecha: el día declarado se evalúa completo, también sin inventar zona.
  assert.equal(classifyEventValidity('2026-09-07', E).validity, 'date_ambiguous');
  assert.equal(classifyEventValidity('2026-09-09', E).validity, 'upcoming');
  assert.equal(classifyEventValidity('2026-09-05', E).validity, 'past');
});

// ---------------------------------------------------------------- pipeline

test('demostración: con el mismo reloj solo el evento futuro supera la regla; los demás tienen motivo visible; mover el reloj lo caduca', async () => {
  const { v0, derive } = await modulesPromise;
  const graph = fourEventsGraph();
  const deps = { graph, evidence: [], communityEvidence: {} };

  const restore = h.freezeClock(E);
  let response: SearchResponse;
  try {
    response = v0.searchOpportunities.searchOpportunities(h.BASELINE_REQUEST, { deps });
  } finally {
    restore();
  }

  // Solo el futuro confirmado es elegible; los otros tres no se convierten en
  // oportunidades futuras.
  assert.equal(response.opportunities.length, 1, 'solo el evento futuro supera la regla temporal');
  assert.equal(response.opportunities[0]?.event?.id, 'futuro');
  assert.ok(
    response.opportunities[0]?.reasons.some((reason) => /upcoming/i.test(reason.text)),
    'el evento futuro sí puede citarse como upcoming',
  );

  // Motivo visible para cada excluido: vencido como antecedente histórico;
  // sin fecha y ambigua quedan pendientes.
  assert.ok(
    response.warnings.some((warning) => /^1 candidate event.*historical antecedent/i.test(warning)),
    `el vencido tiene motivo visible: ${JSON.stringify(response.warnings)}`,
  );
  assert.ok(
    response.warnings.some((warning) => /^2 candidate events.*stay pending and were not ranked/i.test(warning)),
    `sin fecha y ambigua quedan pendientes con motivo visible: ${JSON.stringify(response.warnings)}`,
  );
  assert.equal(response.coverage.eventsEvaluated, 4, 'los cuatro eventos se evaluaron');
  assert.equal(response.coverage.themesEvaluated, 4, 'la elegibilidad no oculta candidatos evaluados');

  // El vencido sigue consultándose como antecedente histórico, claramente
  // identificado (evidencia del grafo derivado y clasificación del candidato).
  const restoreDerive = h.freezeClock(E);
  try {
    const runtime = derive.deriveRuntimeGraph(graph, h.BASELINE_REQUEST);
    const past = runtime.candidates.find((candidate) => candidate.event.id === 'pasado');
    assert.equal(past?.eventValidity.validity, 'past');
    assert.match(past?.eventValidity.reason ?? '', /historical antecedent/i);
    const pastEvidence = runtime.evidence.find((item) => item.id === 'ev-luma-pasado');
    assert.match(pastEvidence?.excerpt ?? '', /past event/i, 'la evidencia identifica el antecedente');
    assert.equal(pastEvidence?.observedAt, '2026-09-01T00:00:00.000Z', 'la obtención no se confunde con la fecha del evento');
    const ambiguous = runtime.candidates.find((candidate) => candidate.event.id === 'ambiguo');
    assert.equal(ambiguous?.eventValidity.validity, 'date_ambiguous');
    const undated = runtime.candidates.find((candidate) => candidate.event.id === 'sin-fecha');
    assert.equal(undated?.eventValidity.validity, 'date_pending');
  } finally {
    restoreDerive();
  }

  // Cambiar el reloj demuestra que una oportunidad puede caducar: el futuro
  // confirmado vence, y la fecha ambigua se vuelve inequívocamente pasada
  // (past bajo cualquier zona posible), así que quedan 3 vencidos y 1
  // pendiente (sin fecha).
  const restoreLater = h.freezeClock('2026-11-01T00:00:00.000Z');
  try {
    const later = v0.searchOpportunities.searchOpportunities(h.BASELINE_REQUEST, { deps });
    assert.equal(later.opportunities.length, 0, 'el evento futuro caduca al mover el reloj');
    assert.ok(
      later.warnings.some((warning) => /^3 candidate events.*historical antecedent/i.test(warning)),
      `ahora hay tres vencidos con motivo visible: ${JSON.stringify(later.warnings)}`,
    );
    assert.ok(
      later.warnings.some((warning) => /^1 candidate event.*stay pending and were not ranked/i.test(warning)),
      'el evento sin fecha sigue pendiente, no vencido',
    );
  } finally {
    restoreLater();
  }
});

test('seeds: en el reloj congelado ningún evento vencido se cita como «upcoming»; los seeds no se tocan', async () => {
  const local = await h.runLocalPipeline();

  const expiredCitedAsUpcoming = local.opportunities.filter(
    (item) =>
      item.event?.startsAt != null &&
      Date.parse(item.event.startsAt) < CLOCK_MS &&
      item.reasons.some((reason) => /upcoming/i.test(reason.text)),
  );
  assert.deepEqual(
    expiredCitedAsUpcoming.map((item) => item.id),
    [],
    'cero vencidos presentados como futuros (predicado O3)',
  );
  for (const opportunity of local.opportunities) {
    assert.equal(
      classifyEventValidity(opportunity.event?.startsAt ?? null, E).validity,
      'upcoming',
      `${opportunity.id} solo puede rankear con inicio verificable y futuro`,
    );
  }
  // La regla es de elegibilidad, no de reescritura: los seeds siguen intactos
  // (los hashes exactos los vigila baseline-v0.test.ts contra el manifiesto).
  assert.equal(local.coverage.eventsEvaluated, 64, 'los 64 eventos seed de SF se siguen evaluando');
});

// ---------------------------------------------------------------- adaptador

test('adaptador: fecha ausente queda pendiente (nunca new Date()) y un evento vencido no se proyecta como próximo evento', async () => {
  const { v0 } = await modulesPromise;
  const restore = h.freezeClock(E);
  try {
    const fixture = v0.fixtures.getFixtureSearchResponse();

    // (a) Sin fecha: el adaptador no la reemplaza por el reloj.
    const withoutDate: SearchResponse = {
      ...fixture,
      opportunities: fixture.opportunities
        .filter((item) => item.event != null)
        .slice(0, 1)
        .map((item) => ({ ...item, event: item.event ? { ...item.event, startsAt: null } : null })),
    };
    const pendingStartsAt =
      v0.adapter.toLegacyShape(withoutDate).opportunities[0]?.events[0]?.startsAt ?? null;
    assert.equal(pendingStartsAt, null, 'una fecha ausente permanece pendiente (predicado O3)');

    // (b) Vencidos (los eventos del fixture ya pasaron en el reloj congelado):
    // no se presentan como próximos eventos; el dato crudo queda intacto como
    // antecedente.
    const legacy = v0.adapter.toLegacyShape(fixture);
    for (const opportunity of legacy.opportunities) {
      for (const event of opportunity.events) {
        assert.ok(
          Date.parse(event.startsAt) >= CLOCK_MS,
          `${opportunity.id} no debe presentar un evento vencido como próximo (${event.startsAt})`,
        );
      }
    }
    const sfpython = fixture.opportunities.find((item) => item.id === 'opp-sfpython');
    assert.equal(sfpython?.event?.startsAt, '2026-07-28T18:30:00.000Z', 'el antecedente crudo no se borra ni se reescribe');

    // (c) Futuro verificable: sí se proyecta, con su fecha real y sin
    // observedAt fabricado en el momento de proyectar.
    const future: SearchResponse = {
      ...fixture,
      opportunities: fixture.opportunities.map((item) =>
        item.id === 'opp-sfpython' && item.event
          ? { ...item, event: { ...item.event, startsAt: '2026-10-01T18:00:00.000Z' } }
          : item,
      ),
    };
    const projected = v0.adapter
      .toLegacyShape(future)
      .opportunities.find((item) => item.id === 'opp-sfpython')?.events[0];
    assert.equal(projected?.startsAt, '2026-10-01T18:00:00.000Z');
    assert.notEqual(projected?.source.observedAt, E, 'la fuente no lleva un observedAt fabricado al proyectar');
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------- Exa

test('Exa: un recap vencido no se cita como listing vivo; su publicación reciente no lo rejuvenece', async () => {
  const { response } = await getReplay();

  const recap = Object.values(response.evidence).find((item) => item.url === EXA_PAST_RECAP_URL);
  assert.ok(recap, 'el recap sigue consultable como evidencia (antecedente)');
  assert.equal(recap.status, 'observed', 'la página en sí sigue observada');
  assert.equal(recap.observedAt, '2026-09-05T00:00:00.000Z', 'la fecha de publicación se conserva tal cual');

  const bengaluru = response.opportunities.find((item) => item.id === 'opp-global-bengaluru');
  assert.ok(bengaluru);
  const citedIds = bengaluru.reasons.flatMap((reason) => reason.evidenceIds);
  assert.ok(!citedIds.includes(recap.id), 'el recap del 12 Ago no se cita como listing vivo (predicado O3)');

  const futureListing = Object.values(response.evidence).find((item) => item.url === EXA_FUTURE_LISTING_URL);
  const undatedListing = Object.values(response.evidence).find((item) => item.url === EXA_UNDATED_URL);
  assert.ok(futureListing && citedIds.includes(futureListing.id), 'el listing con fecha futura sí se cita');
  assert.ok(undatedListing && citedIds.includes(undatedListing.id), 'el listing sin fecha sigue citado como pendiente');

  // La razón determinística de la búsqueda de Exa (la narrativa del modelo se
  // corrige en el ticket 05; acá solo importa que no cite el recap).
  const exaReason = bengaluru.reasons.find((reason) => /^Exa found/.test(reason.text));
  assert.match(exaReason?.text ?? '', /historical antecedent/i, 'la razón identifica el recap como antecedente, no como listing vivo');
  assert.match(exaReason?.text ?? '', /date is pending/i, 'la razón declara pendiente la fecha del listing sin fecha');
});

// ------------------------------------------------------- interdependencia 05

test('predicado O4.1: detecta el defecto v0 sobre la captura congelada aunque cambien las citas disponibles, y verifica la corrección de 05', async () => {
  // El ticket 04 cambió legítimamente qué cita Exa (el recap vencido ya no se
  // cita), así que el predicado del oráculo O4.1 no puede depender de la lista
  // accidental de ids. Su forma conductual: la narrativa con cita inexistente
  // se publica sustituyendo sus citas por citas propias de la oportunidad.

  // 1. Sobre la CAPTURA CONGELADA (characterization.json, nunca recalculada
  //    con el pipeline actual) el predicado da exactamente el v0 documentado.
  const frozen = h.readCharacterization();
  const frozenBerlin = frozen.replay.opportunities.find((item) => item.id === 'opp-global-berlin');
  const frozenInvented = frozenBerlin?.reasons.find((reason) =>
    reason.text.startsWith('80% of attendees at Berlin AI meetups'),
  );
  const frozenDeterministic = frozen.deterministic.opportunities.find((item) => item.id === 'opp-global-berlin');
  const frozenOwnIds = [...new Set(frozenDeterministic?.reasons.flatMap((reason) => reason.evidenceIds) ?? [])];
  assert.ok(frozenInvented && frozenOwnIds.length > 0, 'la captura congelada contiene el caso');
  assert.deepEqual(
    h.narrativeSubstitutionObservable(frozenInvented.evidenceIds, frozenOwnIds),
    { published: true, substitutedWithOwnCitations: true },
    'sobre la captura congelada el predicado detecta el defecto v0',
  );

  // 2. Sobre la corrida ACTUAL las citas disponibles cambiaron de verdad
  //    (ticket 04). Cuando este paso se escribió (antes de 05) el veredicto
  //    seguía siendo el defecto v0 con el nuevo conjunto de citas; con el
  //    ticket 05 implementado la narrativa con cita inexistente ya no se
  //    publica, así que el predicado da exactamente el valor DESEADO del
  //    oráculo (nunca un INESPERADO).
  const { response } = await getReplay();
  const liveBerlin = response.opportunities.find((item) => item.id === 'opp-global-berlin');
  const liveInvented = liveBerlin?.reasons.find((reason) =>
    reason.text.startsWith('80% of attendees at Berlin AI meetups'),
  );
  const deterministic = await h.runReplay(h.BASELINE_REQUEST, { withGemini: false });
  const liveDeterministicBerlin = deterministic.response.opportunities.find(
    (item) => item.id === 'opp-global-berlin',
  );
  const liveOwnIds = [...new Set(liveDeterministicBerlin?.reasons.flatMap((reason) => reason.evidenceIds) ?? [])];
  assert.notDeepEqual(
    [...liveOwnIds].sort(),
    [...frozenOwnIds].sort(),
    'las citas disponibles cambiaron de verdad con el ticket 04 (el recap ya no se cita)',
  );
  assert.deepEqual(
    h.narrativeSubstitutionObservable(liveInvented ? liveInvented.evidenceIds : null, liveOwnIds),
    { published: false, substitutedWithOwnCitations: false },
    'con la corrección de 05 el predicado da el valor deseado del oráculo sobre la corrida actual',
  );

  // 3. La corrección del ticket 05 (no publicar la narrativa sin soporte) es
  //    distinguible: produce exactamente el valor deseado, no el defecto.
  assert.deepEqual(
    h.narrativeSubstitutionObservable(null, liveOwnIds),
    { published: false, substitutedWithOwnCitations: false },
    'no publicar la narrativa produce el valor deseado del oráculo',
  );
  // Publicarla conservando la cita inexistente tampoco pasaría por defecto v0
  // ni por deseado: quedaría marcada como INESPERADO por el test de oráculos.
  assert.deepEqual(
    h.narrativeSubstitutionObservable(['ev-does-not-exist'], liveOwnIds),
    { published: true, substitutedWithOwnCitations: false },
  );
});

// ---------------------------------------------------------------- fallbacks

test('fallback del servidor sin red: el fixture histórico no vuelve como oportunidad vigente', async () => {
  const { v0 } = await modulesPromise;
  const restore = h.freezeClock(E);
  try {
    const resolver = v0.resolve.createSearchResolver({
      searchGlobalMarkets: async () => {
        throw new Error('sin red (test)');
      },
      searchOpportunities: () => {
        throw new Error('pipeline caído (test)');
      },
      cache: new v0.cache.TtlCache<SearchResponse>(v0.cache.SIX_HOURS_MS),
    });
    const response = await resolver(h.BASELINE_REQUEST);

    assert.equal(response.degraded, true);
    assert.ok(
      response.warnings.some((warning) => warning.includes('fixture')),
      'el fallback se identifica como fixture preparado',
    );
    // El dato histórico sigue en el contrato (antecedente), pero la proyección
    // de UI no lo presenta como próximo evento.
    const sfpython = response.opportunities.find((item) => item.id === 'opp-sfpython');
    assert.equal(sfpython?.event?.startsAt, '2026-07-28T18:30:00.000Z');
    const legacy = v0.adapter.toLegacyShape(response);
    const presented = legacy.opportunities.flatMap((item) => item.events);
    assert.deepEqual(presented, [], 'ningún evento vencido del fixture se presenta como vigente');
  } finally {
    restore();
  }
});

test('fallback del cliente sin red: el fixture se identifica como histórico y no se presenta como vigente', async () => {
  const { v0, atlasClient } = await modulesPromise;
  const restore = h.freezeClock(E);
  try {
    // fetch con URL relativa falla en Node: el cliente cae al fixture.
    const response = await atlasClient.searchOpportunities(h.BASELINE_REQUEST);

    assert.equal(response.degraded, true);
    assert.ok(response.warnings.some((warning) => warning.includes('Backend no disponible')));
    assert.ok(
      response.warnings.some((warning) => /2 evento.*antecedentes históricos/i.test(warning)),
      `el fallback identifica los eventos ya ocurridos: ${JSON.stringify(response.warnings)}`,
    );
    const presented = v0.adapter.toLegacyShape(response).opportunities.flatMap((item) => item.events);
    assert.deepEqual(presented, [], 'el cliente tampoco reintroduce eventos vencidos como vigentes');
  } finally {
    restore();
  }
});
