import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Opportunity } from '../../lib/api/types.ts';
import { ARC_DELAY_MS, ARC_DRAW_MS, ARC_STAGGER_MS, arcOrigin, arcPath, buildArcs } from '../../lib/atlas/arcs.ts';
import { projectCity } from '../../lib/atlas/signal-layout.ts';

function opportunity(id: string, rank: number, coordinates: [number, number]): Opportunity {
  return {
    id,
    rank,
    city: id,
    country: 'X',
    coordinates,
    score: 50,
    confidence: 50,
    activationCostBand: 'unknown',
    recommendation: '',
    reasons: [],
    metrics: {} as Opportunity['metrics'],
    evidence: [],
    signals: [],
    events: [],
  };
}

const BERLIN: [number, number] = [13.4, 52.52];
const SAO_PAULO: [number, number] = [-46.63, -23.55];
const BANGALORE: [number, number] = [77.59, 12.97];

test('origen: ubicación del usuario si existe, si no San Francisco', () => {
  assert.deepEqual(arcOrigin(null), projectCity(-122.42, 37.77));
  assert.deepEqual(arcOrigin([-74.0, 40.71]), projectCity(-74.0, 40.71));
});

test('path = bézier cuadrática "M x0 y0Q cx cy x1 y1", redondeada a 1 decimal', () => {
  const d = arcPath([100, 200], [400, 200]);
  assert.ok(d);
  const match = /^M(-?\d+(?:\.\d)?) (-?\d+(?:\.\d)?)Q(-?\d+(?:\.\d)?) (-?\d+(?:\.\d)?) (-?\d+(?:\.\d)?) (-?\d+(?:\.\d)?)$/.exec(d);
  assert.ok(match, `formato inesperado: ${d}`);
  const [, x0, y0, cx, cy, x1, y1] = match.map(Number);
  assert.deepEqual([x0, y0, x1, y1], [100, 200, 400, 200]);
  // dist 300 → bulge 0.18×300 = 54, hacia el norte (y negativa) desde el punto medio
  assert.equal(cx, 250);
  assert.equal(cy, 146);
});

test('el arco siempre se comba hacia el norte, independientemente del sentido', () => {
  const east = arcPath([100, 200], [400, 200]);
  const west = arcPath([400, 200], [100, 200]);
  const cyOf = (d: string | null) => Number(/Q-?[\d.]+ (-?[\d.]+)/.exec(d ?? '')?.[1]);
  assert.ok(cyOf(east) < 200);
  assert.ok(cyOf(west) < 200);
});

test('bulge clampeado a [12, 60]', () => {
  const short = arcPath([0, 100], [20, 100]); // dist 20 → 3.6 → clamp 12
  const long = arcPath([0, 100], [900, 100]); // dist 900 → 162 → clamp 60
  const cyOf = (d: string | null) => Number(/Q-?[\d.]+ (-?[\d.]+)/.exec(d ?? '')?.[1]);
  assert.equal(cyOf(short), 88);
  assert.equal(cyOf(long), 40);
});

test('origen == destino → sin arco', () => {
  assert.equal(arcPath([10, 10], [10.4, 10.2]), null);
  const arcs = buildArcs([-122.42, 37.77], [opportunity('sf', 1, [-122.42, 37.77]), opportunity('ber', 2, BERLIN)]);
  assert.deepEqual(arcs.map((arc) => arc.id), ['ber']);
  assert.equal(arcs[0].order, 0);
});

test('determinista: mismo input → mismo output, sin depender del reloj', () => {
  const results = [opportunity('ber', 2, BERLIN), opportunity('sp', 1, SAO_PAULO), opportunity('blr', 3, BANGALORE)];
  const a = buildArcs(null, results);
  const b = buildArcs(null, results);
  assert.deepEqual(a, b);
  for (const arc of a) {
    assert.match(arc.d, /^M-?\d+(\.\d)? -?\d+(\.\d)?Q-?\d+(\.\d)? -?\d+(\.\d)? -?\d+(\.\d)? -?\d+(\.\d)?$/);
  }
});

test('escalonado por rank: 950ms + 240ms por posición; el cometa arranca al terminar el arco', () => {
  const results = [opportunity('ber', 2, BERLIN), opportunity('sp', 1, SAO_PAULO), opportunity('blr', 3, BANGALORE)];
  const arcs = buildArcs(null, results);
  assert.deepEqual(arcs.map((arc) => arc.id), ['sp', 'ber', 'blr']);
  assert.deepEqual(arcs.map((arc) => arc.delayMs), [ARC_DELAY_MS, ARC_DELAY_MS + ARC_STAGGER_MS, ARC_DELAY_MS + 2 * ARC_STAGGER_MS]);
  assert.deepEqual(arcs.map((arc) => arc.cometBeginS), [0.95 + 0.9, 1.19 + 0.9, 1.43 + 0.9].map((s) => Math.round(s * 1000) / 1000));
  assert.equal(ARC_DRAW_MS, 900);
});

test('todos los arcos parten del origen', () => {
  const user: [number, number] = [-74.0, 40.71];
  const [ox, oy] = projectCity(user[0], user[1]);
  const start = `M${Math.round(ox * 10) / 10} ${Math.round(oy * 10) / 10}Q`;
  for (const arc of buildArcs(user, [opportunity('ber', 1, BERLIN), opportunity('sp', 2, SAO_PAULO)])) {
    assert.ok(arc.d.startsWith(start), `${arc.d} no parte de ${start}`);
  }
});
