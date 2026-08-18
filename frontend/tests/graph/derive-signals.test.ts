import assert from 'node:assert/strict';
import test from 'node:test';

import {
  distanceMiles,
  requestCapabilities,
} from '../../lib/server/graph/derive-signals.ts';

test('derives query-specific capabilities instead of requiring a static topics file', () => {
  const capabilities = requestCapabilities({
    product: 'An observability SDK for Python and Kubernetes teams',
    icpStack: [],
    budgetUsd: 5000,
    goal: 'adoption',
  });
  assert.ok(capabilities.includes('Observability'));
  assert.ok(capabilities.includes('Python'));
  assert.ok(capabilities.includes('Infrastructure'));
});

test('distance is context in miles and can be computed independently from score', () => {
  const miles = distanceMiles(
    { lat: 37.7749, lng: -122.4194 },
    { lat: 37.7849, lng: -122.4094 },
  );
  assert.ok(miles > 0.5 && miles < 1.5);
});
