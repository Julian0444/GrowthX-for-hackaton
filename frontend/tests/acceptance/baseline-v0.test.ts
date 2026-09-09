// Referencia congelada v0 (ticket 01, evaluación persistida de SF).
//
// Qué demuestra:
// 1. El manifiesto describe el estado realmente usado (reloj, perfil, política,
//    hashes) y los 136 eventos seed siguen intactos, clasificados en el reloj
//    congelado sin alterar fechas.
// 2. La evaluación se repite sin red ni claves reales, con reloj congelado y
//    respuestas de proveedor grabadas, y da la misma salida dos veces.
// 3. Sobre v0 (fuentes iguales al manifiesto) la salida congelada se repite
//    exactamente. Cuando 02–06 corrijan las fuentes, la igualdad ya no se
//    exige: la caracterización se conserva para comparar, no como
//    comportamiento aceptado.
// 4. Los cinco oráculos se reproducen con el harness. Cada observación coincide
//    con el defecto de v0 o con la salida deseada; sobre v0 debe ser el defecto.
//    Las pruebas rojas/verdes de cada corrección viven en 02–06.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import * as h from '../fixtures/baseline-v0/harness.ts';

const manifest = h.readManifest();
const characterization = h.readCharacterization();
const sourceDrift = h.driftAgainst(manifest.sources);
const onV0 = sourceDrift.length === 0;

const ORACLES: Array<[h.OracleId, h.OracleCase['ticket']]> = [
  ['O1', '02'],
  ['O2', '03'],
  ['O3', '04'],
  ['O4', '05'],
  ['O5', '06'],
];

test('manifiesto: reloj, perfil, política y captura sin secretos coinciden con el harness', () => {
  assert.equal(manifest.evaluationClock, h.EVALUATION_CLOCK);
  assert.equal(characterization.evaluationClock, h.EVALUATION_CLOCK);
  assert.deepEqual(manifest.request, h.BASELINE_REQUEST);
  assert.deepEqual(characterization.request, h.BASELINE_REQUEST);
  assert.match(manifest.commit.head, /^[0-9a-f]{40}$/);
  assert.equal(manifest.commit.workingTreeDirty, true, 'la v0 se congeló sobre el árbol de trabajo, no solo HEAD');
  assert.ok(manifest.versions.node && manifest.versions.next && manifest.versions.typescript);
  assert.ok(manifest.policy.version.length > 0);
  assert.ok(
    manifest.policy.scoreSemantics.some((line) => /(no|ninguno de los dos) es un score de evento/i.test(line)),
    'la política debe decir que el score de comunidad/mercado no es un score de evento',
  );
  assert.ok(
    manifest.policy.scoreSemantics.some((line) => /recruiting/i.test(line)),
    'la política debe decir que el score no es una política de recruiting',
  );
  assert.match(manifest.secrets, /^Ninguno/);
  const serialized = JSON.stringify(manifest);
  for (const name of Object.keys(h.FAKE_KEYS)) {
    const real = process.env[name];
    if (real) assert.ok(!serialized.includes(real), `${name} no debe aparecer en el manifiesto`);
  }
  for (const file of h.V0_SOURCE_FILES) {
    assert.match(manifest.sources[file] ?? '', /^[0-9a-f]{64}$/, `falta el hash de ${file}`);
  }
});

test('seeds: 136 eventos históricos sin alteración, clasificados en el reloj congelado', () => {
  let total = 0;
  for (const file of h.SEED_EVENT_FILES) {
    const recorded = manifest.seeds[file];
    assert.equal(typeof recorded, 'object', `el manifiesto debe resumir ${file}`);
    const current = h.summarizeSeedEvents(file);
    assert.deepEqual(current, recorded, `${file} cambió respecto del manifiesto congelado`);
    assert.equal(current.withoutDate + current.expiredAtClock + current.futureAtClock, current.events);
    assert.ok(current.expiredAtClock > 0, `${file}: en el instante congelado hay eventos vencidos`);
    assert.ok(current.futureAtClock > 0, `${file}: en el instante congelado quedan eventos futuros`);
    total += current.events;
  }
  assert.equal(total, 136);
  const support = Object.fromEntries(
    h.SEED_SUPPORT_FILES.map((file) => {
      const hash = manifest.seeds[file];
      assert.equal(typeof hash, 'string', `falta el hash de ${file}`);
      return [file, hash as string];
    }),
  );
  assert.deepEqual(h.driftAgainst(support), [], 'los seeds de apoyo no deben cambiar');
});

test('fixtures: fixture preparado y respuestas grabadas de proveedores sin alteración', () => {
  assert.deepEqual(Object.keys(manifest.fixtures).sort(), [...h.V0_FIXTURE_FILES].sort());
  assert.deepEqual(h.driftAgainst(manifest.fixtures), []);
});

test('repetición: sin red ni claves reales, dos corridas con el mismo reloj dan la misma salida', async () => {
  const envBefore = Object.fromEntries(
    [...Object.keys(h.FAKE_KEYS), 'GITHUB_TOKEN'].map((name) => [name, process.env[name]]),
  );
  const first = await h.runReplay();
  const second = await h.runReplay();

  assert.deepEqual(first.response, second.response);
  assert.equal(first.response.generatedAt, h.EVALUATION_CLOCK, 'la salida lleva el reloj congelado');
  assert.deepEqual(first.response.query, h.BASELINE_REQUEST);
  assert.equal(first.response.opportunities.length, 3);
  assert.ok(first.calls.length > 0, 'la repetición pasa por el transporte grabado');
  assert.ok(first.calls.every((call) => !call.recording.endsWith(':failed')));
  assert.ok(first.calls.some((call) => call.recording === 'gemini'), 'el modelo se sirve desde la grabación');
  assert.ok(first.calls.some((call) => call.recording.startsWith('exa:')), 'Exa se sirve desde la grabación');
  const envAfter = Object.fromEntries(
    [...Object.keys(h.FAKE_KEYS), 'GITHUB_TOKEN'].map((name) => [name, process.env[name]]),
  );
  assert.deepEqual(envAfter, envBefore, 'la repetición restaura el entorno');
  assert.notEqual(globalThis.Date.now(), new Date(h.EVALUATION_CLOCK).getTime(), 'el reloj real se restaura');
});

test('repetición: una petición no grabada falla en lugar de salir a la red', async () => {
  await h.withReplay({}, async () => {
    await assert.rejects(fetch('https://example.com/baseline-v0/no-grabada'), /no grabada/);
    await assert.rejects(
      fetch('https://api.exa.ai/search', { method: 'POST', body: JSON.stringify({ query: 'meetup in Atlantis' }) }),
      /no grabada/,
    );
  });
});

test('caracterización: la salida congelada de v0 se repite exactamente mientras las fuentes coincidan con el manifiesto', async (t) => {
  const replay = await h.runReplay();
  const deterministic = await h.runReplay(h.BASELINE_REQUEST, { withGemini: false });
  const local = await h.runLocalPipeline();

  if (onV0) {
    assert.deepEqual(replay.response, characterization.replay);
    assert.deepEqual(deterministic.response, characterization.deterministic);
    assert.deepEqual(local, characterization.local);
    return;
  }

  t.diagnostic(
    `fuentes distintas del manifiesto v0: ${sourceDrift.join(', ')}. ` +
      'La igualdad con la caracterización solo se exige sobre v0; la corrección la prueban 02–06.',
  );
  // Lo que no depende de los cinco defectos sigue valiendo tras corregir.
  assert.equal(replay.response.generatedAt, characterization.replay.generatedAt);
  assert.deepEqual(replay.response.query, characterization.replay.query);
  assert.equal(local.generatedAt, characterization.local.generatedAt);
  assert.deepEqual(local.coverage, characterization.local.coverage, 'la cobertura de seeds no cambia');
});

test('oráculos: los cinco casos se reproducen y cada observación es el defecto de v0 o la salida deseada', async (t) => {
  const cases = await h.observeOracles();
  assert.deepEqual(
    [...new Set(cases.map((item) => item.oracle))].sort(),
    ORACLES.map(([id]) => id),
  );
  for (const [id, ticket] of ORACLES) {
    const own = cases.filter((item) => item.oracle === id);
    assert.ok(own.every((item) => item.ticket === ticket), `${id} pertenece al ticket ${ticket}`);
    assert.ok(
      own.some((item) => !h.sameValue(item.v0, item.desired)),
      `${id} debe tener al menos un predicado donde v0 y lo deseado difieren`,
    );
  }
  for (const item of cases) {
    const atV0 = h.sameValue(item.observed, item.v0);
    const atDesired = h.sameValue(item.observed, item.desired);
    const state = atV0 && atDesired ? 'invariante' : atV0 ? 'defecto v0 vigente' : atDesired ? 'corregido' : 'INESPERADO';
    t.diagnostic(`${item.oracle} (ticket ${item.ticket}) ${state}: ${item.predicate}`);
    assert.ok(
      atV0 || atDesired,
      `${item.oracle}: observado ${JSON.stringify(item.observed)} no coincide ni con v0 ${JSON.stringify(item.v0)} ni con lo deseado ${JSON.stringify(item.desired)} — ${item.predicate}`,
    );
    if (onV0) {
      assert.deepEqual(item.observed, item.v0, `${item.oracle}: sobre v0 la observación debe ser el defecto documentado — ${item.predicate}`);
    }
    const recorded = Object.values(characterization.oracles).find(
      (entry) => (entry as { predicate: string }).predicate === item.predicate,
    ) as { v0: unknown } | undefined;
    assert.ok(recorded, `la caracterización registra el predicado: ${item.predicate}`);
    assert.ok(h.sameValue(recorded.v0, item.v0), `el valor v0 documentado no cambió: ${item.predicate}`);
  }
});

test('matriz: oracles.md documenta los cinco oráculos, su ticket y cómo reproducirlos', () => {
  const matrix = readFileSync(join(h.BASELINE_DIR, 'oracles.md'), 'utf8');
  for (const [id, ticket] of ORACLES) {
    assert.match(matrix, new RegExp(`\\| ${id} \\|`), `${id} figura en la matriz`);
    assert.ok(matrix.includes(`issues/${ticket}-`), `${id} enlaza al ticket ${ticket}`);
  }
  assert.match(matrix, /observeOracles/);
  assert.match(matrix, /no es un score de evento/i);
});
