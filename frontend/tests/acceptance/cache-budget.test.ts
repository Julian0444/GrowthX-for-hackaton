// Ticket 02 — el cache y la promesa en curso respetan el presupuesto (oráculo O1).
//
// Roja sobre la referencia v0 congelada por 01 (la clave omitía `budgetUsd`),
// verde con la corrección de `resolve.ts` + `route.ts`. Qué demuestra:
// 1. Frontera de servicio con transporte grabado: USD 2.000 y USD 20.000 no
//    comparten respuesta (secuencial) ni promesa en curso (concurrente);
//    peticiones equivalentes sí reutilizan cache y trabajo pendiente.
// 2. Un proveedor controlado permite observar qué evaluación produjo cada
//    respuesta: cada presupuesto dispara la suya; dos equivalentes comparten.
// 3. El fallo del proveedor conserva `degraded` y warnings, y el fallback no
//    rellena la recomendación con el `query` de otro presupuesto.
// 4. Frontera HTTP real (POST del route): la normalización de presupuesto es
//    la misma del parser a la clave; el sentinel 0 de v0 (desconocido) no se
//    trata como presupuesto positivo (la representación nueva la define 07).
//
// Esta corrección es del recorrido actual: el slice persistido usará la
// identidad de perfil/run en PostgreSQL y no este cache como fuente de verdad.

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

import type { SearchRequest, SearchResponse } from '../../lib/contracts/growxth.ts';
import * as h from '../fixtures/baseline-v0/harness.ts';

// `next/server` no resuelve bajo `node --test` (espera el resolver de Next);
// solo en este proceso de prueba se mapea al archivo real del paquete.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    return nextResolve(specifier, context);
  },
});

// El tsconfig del proyecto no admite top-level await: cada test espera acá.
const v0Promise = h.loadV0();

const REQUEST_2K: SearchRequest = { ...h.BASELINE_REQUEST, budgetUsd: 2000 };
const REQUEST_20K: SearchRequest = { ...h.BASELINE_REQUEST, budgetUsd: 20000 };

async function isolatedResolver(
  overrides: Parameters<h.V0Modules['resolve']['createSearchResolver']>[0] = {},
) {
  const v0 = await v0Promise;
  return v0.resolve.createSearchResolver({
    cache: new v0.cache.TtlCache<SearchResponse>(v0.cache.SIX_HOURS_MS),
    ...overrides,
  });
}

test('secuencial: USD 20.000 tras USD 2.000 recibe su propia evaluación; la petición equivalente sí reutiliza', async () => {
  const resolver = await isolatedResolver();
  await h.withReplay({}, async () => {
    const first = await resolver(REQUEST_2K);
    const second = await resolver(REQUEST_20K);
    const repeat = await resolver(REQUEST_2K);

    assert.deepEqual(first.query, REQUEST_2K);
    assert.deepEqual(second.query, REQUEST_20K, 'el query devuelto coincide con la petición correcta');
    assert.notEqual(second.requestId, first.requestId, 'USD 20.000 no recibe la respuesta generada para USD 2.000');
    assert.equal(repeat.requestId, first.requestId, 'mismo presupuesto reutiliza la respuesta cacheada');
    assert.deepEqual(repeat.query, REQUEST_2K);
  });
});

test('concurrente: presupuestos distintos no comparten la promesa en curso', async () => {
  const resolver = await isolatedResolver();
  await h.withReplay({}, async () => {
    const [a, b] = await Promise.all([resolver(REQUEST_2K), resolver(REQUEST_20K)]);

    assert.deepEqual(a.query, REQUEST_2K);
    assert.deepEqual(b.query, REQUEST_20K, 'la petición concurrente de USD 20.000 no hereda la evaluación de USD 2.000');
    assert.notEqual(a.requestId, b.requestId, 'cada presupuesto produce su propia evaluación');
  });
});

test('proveedor controlado: se observa qué evaluación produjo cada respuesta', async () => {
  const v0 = await v0Promise;
  const evaluatedFor: number[] = [];
  const controlled = async (request: SearchRequest): Promise<SearchResponse> => {
    evaluatedFor.push(request.budgetUsd);
    // Cede el turno para que la petición concurrente entre antes de resolver.
    await new Promise((resolve) => setImmediate(resolve));
    return {
      ...v0.fixtures.getFixtureSearchResponse(),
      query: request,
      degraded: false,
      warnings: [`evaluación producida para budgetUsd=${request.budgetUsd}`],
    };
  };
  const resolver = await isolatedResolver({
    searchGlobalMarkets: controlled,
    audit: (response) => response,
    checkEnv: () => {},
  });

  const [a, b] = await Promise.all([resolver(REQUEST_2K), resolver(REQUEST_20K)]);
  assert.deepEqual(a.warnings, ['evaluación producida para budgetUsd=2000']);
  assert.deepEqual(b.warnings, ['evaluación producida para budgetUsd=20000'], 'la respuesta de USD 20.000 sale de su evaluación, no de la de USD 2.000');
  assert.deepEqual([...evaluatedFor].sort((x, y) => x - y), [2000, 20000], 'cada presupuesto dispara su propia evaluación');

  evaluatedFor.length = 0;
  const [c, d] = await Promise.all([
    resolver({ ...h.BASELINE_REQUEST, budgetUsd: 5000 }),
    resolver({ ...h.BASELINE_REQUEST, budgetUsd: 5000 }),
  ]);
  assert.deepEqual(evaluatedFor, [5000], 'dos peticiones equivalentes concurrentes comparten el trabajo pendiente');
  assert.equal(c, d, 'ambas reciben la misma respuesta compartida');
  assert.equal(c.query.budgetUsd, 5000);
});

test('fallo del proveedor: el fallback conserva degraded/warnings y el query de cada presupuesto', async () => {
  let failures = 0;
  const failing = async (): Promise<SearchResponse> => {
    failures += 1;
    await new Promise((resolve) => setImmediate(resolve));
    throw new Error('cache-budget: proveedor controlado en fallo');
  };
  const resolver = await isolatedResolver({
    searchGlobalMarkets: failing,
    searchOpportunities: () => {
      throw new Error('cache-budget: pipeline local también en fallo');
    },
    checkEnv: () => {},
  });

  const [a, b] = await Promise.all([resolver(REQUEST_2K), resolver(REQUEST_20K)]);
  for (const response of [a, b]) {
    assert.equal(response.degraded, true, 'la degradación conserva su etiquetado');
    assert.ok(
      response.warnings.some((warning) => warning.includes('sirviendo fixture preparado')),
      'el warning del fallback se conserva',
    );
  }
  assert.deepEqual(a.query, REQUEST_2K);
  assert.deepEqual(b.query, REQUEST_20K, 'el fallback no copia el request de un presupuesto distinto');

  const again = await resolver(REQUEST_2K);
  assert.equal(again.degraded, true);
  assert.equal(failures, 3, 'una respuesta degradada no queda cacheada: la reintenta');
});

test('frontera HTTP: el parser y la clave comparten la normalización; el sentinel 0 no es un presupuesto positivo', async () => {
  const route = await import('../../app/api/opportunities/search/route.ts');
  const post = async (body: Record<string, unknown>): Promise<SearchResponse> => {
    const response = await route.POST(
      new Request('http://localhost/api/opportunities/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return (await response.json()) as SearchResponse;
  };
  const base = {
    product: h.BASELINE_REQUEST.product,
    icpStack: h.BASELINE_REQUEST.icpStack,
    goal: h.BASELINE_REQUEST.goal,
  };

  await h.withReplay({}, async () => {
    const small = await post({ ...base, budgetUsd: 2000 });
    const large = await post({ ...base, budgetUsd: 20000 });
    const repeat = await post({ ...base, budgetUsd: 2000 });
    assert.equal(small.query.budgetUsd, 2000);
    assert.equal(large.query.budgetUsd, 20000, 'el endpoint devuelve el query de la petición correcta');
    assert.notEqual(large.requestId, small.requestId, 'el endpoint no reutiliza la evaluación de otro presupuesto');
    assert.equal(repeat.requestId, small.requestId, 'el endpoint sí reutiliza la evaluación equivalente');

    const unknown = await post(base);
    const negative = await post({ ...base, budgetUsd: -50 });
    assert.equal(unknown.query.budgetUsd, 0, 'presupuesto ausente queda en el sentinel 0 de v0');
    assert.equal(negative.query.budgetUsd, 0, 'presupuesto inválido se normaliza igual en el parser');
    assert.equal(negative.requestId, unknown.requestId, 'dos desconocidos comparten evaluación');
    assert.notEqual(unknown.requestId, small.requestId, 'desconocido no reutiliza la evaluación de un presupuesto positivo');
  });
});

test('normalización única: caracterización del sentinel de presupuesto desconocido', async () => {
  const { normalizeBudgetUsd } = (await v0Promise).resolve;
  assert.equal(typeof normalizeBudgetUsd, 'function', 'resolve.ts expone la normalización que comparte el parser');
  assert.equal(normalizeBudgetUsd(2000), 2000);
  assert.equal(normalizeBudgetUsd(undefined), 0);
  assert.equal(normalizeBudgetUsd(0), 0);
  assert.equal(normalizeBudgetUsd(-50), 0);
  assert.equal(normalizeBudgetUsd(Number.NaN), 0);
  assert.equal(normalizeBudgetUsd(Number.POSITIVE_INFINITY), 0, 'Infinity no cuenta como presupuesto positivo');
});
