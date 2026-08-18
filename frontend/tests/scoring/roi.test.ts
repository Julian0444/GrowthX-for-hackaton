import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeRoi } from '../../lib/server/scoring/roi.ts';

test('inputs completos: costo por dev calificado + banda', () => {
  const roi = computeRoi({ tierPriceUsd: 2500, expectedAttendance: 120, icpFitRate: 0.5, icpFitBasis: 'terac' });
  assert.equal(roi.costPerQualifiedDev, 41.67); // 2500 / (120*0.5=60)
  assert.deepEqual(roi.band, [35, 48]);
  assert.equal(roi.note, null);
});

test('falta el precio del tier → null + "No disponible" (nunca se estima el precio)', () => {
  const roi = computeRoi({ tierPriceUsd: null, expectedAttendance: 120, icpFitRate: 0.5, icpFitBasis: 'terac' });
  assert.equal(roi.costPerQualifiedDev, null);
  assert.equal(roi.band, null);
  assert.equal(roi.note, 'No disponible');
});

test('falta icpFitRate → null + "No disponible"', () => {
  const roi = computeRoi({ tierPriceUsd: 2500, expectedAttendance: 120, icpFitRate: null, icpFitBasis: null });
  assert.equal(roi.costPerQualifiedDev, null);
  assert.equal(roi.note, 'No disponible');
});

test('attendance 0 → null (no dividir por cero)', () => {
  const roi = computeRoi({ tierPriceUsd: 2500, expectedAttendance: 0, icpFitRate: 0.5, icpFitBasis: 'github' });
  assert.equal(roi.costPerQualifiedDev, null);
  assert.equal(roi.note, 'No disponible');
});
