import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeclaredDate, EvaluationProfile } from '../../lib/contracts/evaluation.ts';
import type { EditionDossierRead } from '../../lib/server/catalog/read.ts';
import { evaluateEligibility } from '../../lib/server/evaluations/eligibility.ts';

const profile: EvaluationProfile = {
  contractVersion: '1', id: 'profile-window', profileVersion: 1,
  createdAt: '2026-09-01T00:00:00Z', product: 'Herramienta para desarrolladores',
  audience: { description: 'Desarrolladores', profiles: [] }, stack: [],
  budget: { status: 'declared', amount: 5000, currency: 'USD' },
  window: { from: '2026-10-01', to: '2026-10-01' }, restrictions: [],
  objective: { kind: 'adoption', confirmation: 'provisional', successDefinition: { status: 'pending' } },
  comparableCompanies: [],
};

function evaluate(startDate: DeclaredDate, window = profile.window) {
  const dossier: EditionDossierRead = {
    contractVersion: '1', evaluatedAt: profile.createdAt, editionId: 'edition-window',
    editionRevisions: [{
      contractVersion: '1', id: 'edition-window-r1', editionId: 'edition-window',
      name: 'Evento SF', organizerIds: [], canonicalUrl: null, provider: null,
      startDate, location: { scope: 'city', name: 'San Francisco' }, coordinates: null,
      claimRevisionIds: [], revisedAt: profile.createdAt, previousRevisionId: null,
    }],
    validity: { validity: 'upcoming', reason: 'Fecha futura del caso de prueba' },
    organizers: [], claims: [], participations: [], companies: [], sources: [], curation: null,
  };
  return evaluateEligibility({ profile: { ...profile, window }, dossier });
}

test('la ventana usa el día de SF aunque el instante UTC ya esté en el día siguiente', () => {
  const result = evaluate({ precision: 'instant', iso: '2026-10-02T01:00:00Z', timezone: 'America/Los_Angeles' });
  assert.notEqual(result.eligibility.status, 'excluded');
});

test('el día UTC dentro de la ventana no admite un evento cuyo día local es anterior', () => {
  const result = evaluate({ precision: 'instant', iso: '2026-10-01T01:00:00Z', timezone: 'America/Los_Angeles' });
  assert.equal(result.eligibility.status, 'excluded');
  if (result.eligibility.status === 'excluded') assert.match(result.eligibility.reasons.join(' '), /2026-09-30.*anterior/);
});

test('los offsets declarados negativos y positivos conservan ambos bordes inclusivos', () => {
  for (const date of [
    { iso: '2026-10-02T01:00:00Z', timezone: '-07:00' },
    { iso: '2026-09-30T20:00:00Z', timezone: '+05:30' },
    { iso: '2026-10-01T00:00:00-07:00', timezone: '-07:00' },
    { iso: '2026-10-01T23:59:59-07:00', timezone: '-07:00' },
    { iso: '2026-10-01T12:00:00Z', timezone: 'UTC' },
  ]) assert.notEqual(evaluate({ precision: 'instant', ...date }).eligibility.status, 'excluded', JSON.stringify(date));
});

test('la zona IANA respeta el horario de invierno y no asume un offset fijo para SF', () => {
  const result = evaluate(
    { precision: 'instant', iso: '2026-12-02T07:30:00Z', timezone: 'America/Los_Angeles' },
    { from: '2026-12-01', to: '2026-12-01' },
  );
  assert.notEqual(result.eligibility.status, 'excluded');
});

test('una fecha sin hora se compara tal como fue declarada', () => {
  assert.notEqual(evaluate({ precision: 'date_only', date: '2026-10-01', timezone: null }).eligibility.status, 'excluded');
  assert.equal(evaluate({ precision: 'date_only', date: '2026-10-02', timezone: null }).eligibility.status, 'excluded');
});

test('una zona no reconocida mantiene pendiente la ventana en vez de inventar el día', () => {
  const result = evaluate({ precision: 'instant', iso: '2026-10-02T01:00:00Z', timezone: 'Zona no disponible' });
  assert.notEqual(result.eligibility.status, 'excluded');
  assert.ok(result.conditions.some(condition => /zona horaria/i.test(condition.description)));
});
