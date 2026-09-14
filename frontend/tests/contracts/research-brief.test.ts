import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEvaluationStartBody, buildEvaluationProfile, evaluationPayloadHash } from '../../lib/server/evaluations/wire.ts';
import { parseEventEditionRevision, parseSourceRecord, parseClaimRevision, parseResearchPlan, parseResearchProgress, parseProviderConsumption } from '../../lib/contracts/evaluation-validation.ts';
import { buildResearchPlan } from '../../lib/research/brief-plan.ts';
import { decodePublicLocation, projectEditionPosition } from '../../lib/research/edition-location.ts';
import { dossier, now } from '../fixtures/trust.ts';
import { briefBody, referenceManifest } from '../fixtures/research-brief.ts';

test('DP03: brief completo y legado; preguntas ligadas a producto, audiencia y objetivo; dinero separado', () => {
  const parsed = parseEvaluationStartBody(briefBody());
  assert.ok(parsed.ok); if (parsed.body.mode !== 'catalog_research') throw Error('mode');
  const p = buildEvaluationProfile(parsed.body, { profileId: 'profile', createdAt: now });
  assert.equal(p.objective.confirmation, 'confirmed');
  assert.deepEqual(p.objective.successDefinition, { status: 'defined', text: 'Instrumentar un proyecto voluntario' });
  assert.deepEqual(p.restrictions, ['No comprar solo logo', 'Introducciones con opt-in']);
  assert.deepEqual(p.formats, ['workshop', 'hackathon']);
  const plan = buildResearchPlan(p);
  assert.ok(parseResearchPlan(plan).ok);
  assert.ok(plan.questions.some(q => q.text.includes('Instrumentar un proyecto')));
  assert.ok(plan.questions.some(q => q.text.includes('No comprar solo logo')));
  assert.ok(plan.questions.some(q => q.text.includes('Datadog')));
  assert.ok(plan.providerLimits.every(l => !l.enabled && l.maxRequests === 0 && l.maxCost?.amount === 0));
  const changed = structuredClone(p); changed.product = 'Infraestructura de pagos'; changed.audience.description = 'Ingenieros fintech'; changed.objective.kind = 'hiring';
  const next = buildResearchPlan(changed);
  assert.notDeepEqual(next.questions, plan.questions);
  assert.match(next.questions[0].text, /pagos.*fintech/);
  assert.match(next.questions[1].text, /candidatos/);
  changed.budget = { status: 'declared', amount: 999999, currency: 'EUR' };
  assert.deepEqual(buildResearchPlan(changed).providerLimits, plan.providerLimits);
  const legacy = briefBody(); legacy.profile.objective = { kind: 'feedback' }; delete legacy.profile.restrictions; delete legacy.profile.formats; delete legacy.profile.geography;
  const old = parseEvaluationStartBody(legacy); assert.ok(old.ok); if (old.body.mode !== 'catalog_research') throw Error('mode');
  const oldProfile = buildEvaluationProfile(old.body, { profileId: 'old', createdAt: now });
  assert.equal(oldProfile.objective.confirmation, 'provisional'); assert.deepEqual(oldProfile.objective.successDefinition, { status: 'pending' });
  assert.notEqual(evaluationPayloadHash(parsed.body), evaluationPayloadHash(old.body));
});

test('DP03: rechaza datos inválidos y campos operativos/tenant en el brief', () => {
  const b = briefBody(), p = b.profile;
  const invalid = [
    { ...b, profile: { ...p, window: { ...p.window, from: '2026-02-30' } } },
    { ...b, profile: { ...p, budget: { status: 'declared', amount: 1, currency: 'dollars' } } },
    { ...b, profile: { ...p, budget: { status: 'declared', amount: -1, currency: 'USD' } } },
    { ...b, profile: { ...p, objective: { ...p.objective, confirmation: 'verified' } } },
    { ...b, profile: { ...p, objective: { ...p.objective, confirmation: null } } },
    { ...b, profile: { ...p, objective: { ...p.objective, successDefinition: { status: 'defined', text: ' ' } } } },
    { ...b, profile: { ...p, restrictions: [''] } },
    { ...b, profile: { ...p, restrictions: null } },
    { ...b, profile: { ...p, geography: { ...p.geography, city: 'New York' } } },
    { ...b, profile: { ...p, providerLimits: [] } },
    { ...b, tenantId: 'foreign' },
  ];
  for (const input of invalid) assert.equal(parseEvaluationStartBody(input).ok, false, JSON.stringify(input));
});

test('DP03: contratos de fuentes y relaciones preservan premio, herramienta y edición sin atribuir eficacia', () => {
  const m = referenceManifest();
  for (const s of m.sources) assert.ok(parseSourceRecord(s).ok);
  for (const c of m.claims) assert.ok(parseClaimRevision(c).ok);
  const edition = m.editions[0]; assert.ok(parseEventEditionRevision(edition).ok);
  assert.equal(edition.relationships?.[2].entity.type, 'project');
  assert.equal(m.claims.some(c => c.attribute.endsWith('efficacy')), false);
  const otherEdition = structuredClone(edition); otherEdition.relationships![0].editionId = 'other-year';
  assert.equal(parseEventEditionRevision(otherEdition).ok, false);
  const genericCitation = structuredClone(edition); genericCitation.relationships![0].evidence = [];
  assert.equal(parseEventEditionRevision(genericCitation).ok, false);
  const duplicate = structuredClone(m.sources[0]); duplicate.fragments!.push(duplicate.fragments![0]);
  assert.equal(parseSourceRecord(duplicate).ok, false);
});

test('DP03: ubicación anterior, ciudad, fallo y contradicción no fabrican un punto', () => {
  const read = dossier(); const e = read.editionRevisions[0]; e.coordinates = { lat: 37.78, lng: -122.39 };
  assert.equal(decodePublicLocation(e).precision, 'unknown');
  assert.equal(projectEditionPosition(e, read.sources, []).mapPoint, null);
  e.publicLocation = { originalAddress: '501 Folsom St', address: { streetAddress: '501 Folsom St', locality: 'San Francisco', region: 'CA', postalCode: '94105', country: 'US' }, venue: 'EF', city: 'San Francisco', precision: 'address', method: 'published_coordinates', provider: 'luma', resolvedAt: now, sourceIds: ['s'], status: 'announced', limitation: null };
  assert.equal(projectEditionPosition(e, read.sources, []).mapPoint?.editionRevisionId, e.id);
  e.publicLocation.status = 'confirmed'; assert.ok(projectEditionPosition(e, read.sources, []).mapPoint);
  e.publicLocation.precision = 'city'; assert.equal(projectEditionPosition(e, read.sources, []).mapPoint, null);
  e.publicLocation.precision = 'address'; e.publicLocation.status = 'contradicted'; e.publicLocation.limitation = 'Dos direcciones';
  assert.equal(projectEditionPosition(e, read.sources, []).mapPoint, null);
  e.publicLocation.status = 'announced'; assert.equal(projectEditionPosition(e, [], []).mapPoint, null);
});

test('DP03: parcial/error/insuficiente y consumo desconocido son estados distintos de éxito/cero', () => {
  const progress = { contractVersion: '1', runId: 'run', status: 'insufficient', stage: 'reading', terminal: true, attempts: 1, findings: [], limitations: ['No se obtuvo soporte suficiente'], material: 'real', updatedAt: now };
  assert.ok(parseResearchProgress(progress).ok);
  assert.equal(parseResearchProgress({ ...progress, status: 'completed' }).ok, false);
  assert.equal(parseResearchProgress({ ...progress, status: 'failed', limitations: [] }).ok, false);
  const finding = { id: 'f', editionId: 'e', editionRevisionId: 'er1', status: 'partial', claimRevisionIds: [], sourceIds: ['s'], limitation: 'Precio pendiente' };
  assert.ok(parseResearchProgress({ ...progress, status: 'partial', findings: [finding] }).ok);
  assert.equal(parseResearchProgress({ ...progress, status: 'completed', findings: [{ ...finding, status: 'supported' }] }).ok, false);
  const usage = { provider: 'exa', runId: 'run', operationId: 'search-1', requests: { status: 'known', count: 1 }, cost: { status: 'unknown', reason: 'Proveedor no informó costo' }, recordedAt: now };
  const decoded = parseProviderConsumption(JSON.parse(JSON.stringify(usage))); assert.ok(decoded.ok); assert.deepEqual(decoded.value, usage);
  assert.equal(parseProviderConsumption({ ...usage, cost: { status: 'known', amount: -1, currency: 'USD' } }).ok, false);
  assert.equal(parseProviderConsumption({ ...usage, requests: { status: 'known', count: 0.5 } }).ok, false);
});

test('DP03: comparación, dossier y mapa conservan la revisión seleccionada aunque exista una nueva', async () => {
  const { snapshotEditionDossiers, projectEvaluationRead } = await import('../../lib/api/opportunity-adapter.ts');
  const m = referenceManifest(); const e = m.editions[0];
  const profile = buildEvaluationProfile(briefBody(), { profileId: 'profile', createdAt: now });
  const bundle: import('../../lib/contracts/evaluation.ts').EvaluationReadBundle = {
    profile, snapshot: { contractVersion: '1', id: 'snapshot', kind: 'investment_comparison', profileId: 'profile', profileVersion: 1, evaluatedAt: now, claimRevisionIds: e.claimRevisionIds, organizerRevisionIds: ['ait-r1'], editionRevisionIds: [e.id], participationRevisionIds: [], policy: { status: 'none', note: 'Sin política' }, alternatives: [{ editionId: e.editionId, organizerId: 'ait-sf', eligibility: { status: 'eligible' }, conditions: [], scoring: { status: 'not_scored', reason: 'no_policy', note: null } }], ordering: { kind: 'presentation_only', editionIds: [e.editionId], note: 'Factual' }, outcome: { kind: 'completed' }, narrative: null },
    claims: m.claims, sources: m.sources, organizers: m.organizers, editions: [{ ...e, id: 'later-r2', name: 'Nombre actualizado', previousRevisionId: e.id }, e], companies: m.companies, participations: [], decision: null, campaign: null,
  };
  const historical = snapshotEditionDossiers(bundle)[0];
  assert.equal(historical.editionRevisions[0].id, e.id); assert.equal(historical.editionRevisions[0].name, e.name);
  assert.deepEqual(historical.editionRevisions[0].relationships, e.relationships);
  const view = projectEvaluationRead(bundle); assert.equal(view.dossiers[0].editionRevisionId, e.id); assert.equal(view.map.listedWithoutPoint[0].editionRevisionId, e.id);
  bundle.editions = bundle.editions.filter(edition => edition.id !== e.id);
  assert.deepEqual(snapshotEditionDossiers(bundle), []); assert.equal(projectEvaluationRead(bundle).dossiers[0].editionRevisionId, null);
});
