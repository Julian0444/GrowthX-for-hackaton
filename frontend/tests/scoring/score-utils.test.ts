import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clamp01, coverageRatio, weightedScore } from '../../lib/server/scoring/score-utils.ts';

const W = { a: 0.25, b: 0.2, c: 0.2, d: 0.15, e: 0.1, f: 0.1 };

test('renormaliza sobre las dimensiones activas: una sola dim activa = 100', () => {
  const score = weightedScore({ a: 1, b: null, c: null, d: null, e: null, f: null }, W);
  assert.equal(score, 100);
});

test('null NUNCA es 0: null y 0 dan scores distintos', () => {
  const withNull = weightedScore({ a: 1, b: null, c: null, d: null, e: null, f: null }, W);
  const withZero = weightedScore({ a: 1, b: 0, c: null, d: null, e: null, f: null }, W);
  assert.equal(withNull, 100);
  assert.equal(withZero, 56); // 1*(.25/.45) = .5556 → 56
  assert.notEqual(withNull, withZero);
});

test('todas las dimensiones null → score 0', () => {
  const score = weightedScore({ a: null, b: null, c: null, d: null, e: null, f: null }, W);
  assert.equal(score, 0);
});

test('coverageRatio: fracción del target cubierta, null si falta un conjunto', () => {
  assert.equal(coverageRatio(['python', 'postgres'], ['Python']), 1);
  assert.equal(coverageRatio(['go'], ['python']), 0);
  assert.equal(coverageRatio([], ['python']), null);
  assert.equal(coverageRatio(['python'], []), null);
});

test('clamp01 acota a [0,1]', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(0.5), 0.5);
});
