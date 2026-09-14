import type { EditionDossierRead, EvaluationRunView, ComparisonRunResult } from '../../lib/api/atlas-client.ts';
import type { SfResearchResult } from '../../components/research-dashboard/research-types.ts';
import { dossier, profile, now } from './trust.ts';

export function mapRead(id = 'map-a', options: { approximate?: boolean; noPoint?: boolean; status?: 'announced' | 'confirmed' | 'contradicted'; lng?: number } = {}): EditionDossierRead {
  const read = dossier(); read.editionId = id;
  read.claims = read.claims.map(c => ({ ...c, revisions: c.revisions.map(r => ({ ...r, subject: { type: 'edition', editionId: id } })) }));
  const e = read.editionRevisions[0]; e.editionId = id; e.id = `${id}-r1`; e.name = `Evento ${id}`; e.canonicalUrl = `https://luma.com/dp09-controlled-${id}`;
  e.coordinates = options.noPoint ? null : { lat: 37.7872, lng: options.lng ?? -122.3944 };
  e.publicLocation = { originalAddress: options.noPoint ? null : '501 Folsom St, San Francisco, CA 94105', address: null, venue: options.noPoint ? null : 'Sede pública', city: 'San Francisco', precision: options.noPoint ? 'city' : options.approximate ? 'street' : 'venue', method: options.noPoint ? 'unknown' : 'published_coordinates', provider: 'controlled', resolvedAt: now, sourceIds: ['s'], status: options.status ?? 'announced', limitation: options.noPoint ? 'Solo ciudad; sede pendiente.' : null };
  return read;
}
export function mapRun(id: string, reads: EditionDossierRead[], state: EvaluationRunView['state'] = 'completed'): EvaluationRunView {
  const result: SfResearchResult = { kind: 'sf_organizer_research', version: 1, evaluatedAt: now, criteria: { stack: profile.stack, audience: profile.audience.description, comparableCompanyIds: [], window: profile.window, budget: profile.budget, objective: profile.objective, ordering: 'presentation_only' }, coverage: { organizers: 0, editions: reads.length, sfEditions: reads.length, matched: 0, verifiedAt: [], material: ['synthetic'] }, catalogNote: 'Controlled DP-09 fixture; not live findings', candidates: [], editions: reads };
  return { runId: id, state, mode: 'catalog_research', workflowVersion: 'sf-organizers/1', profileId: profile.id, profile, previousRunId: null, requestedUrl: null, savedOrganizers: [], createdAt: now, updatedAt: now, steps: [], result, error: null };
}
export function mapComparison(id: string, reads: EditionDossierRead[]): EvaluationRunView {
  const run = mapRun(id, reads);
  const bundle: ComparisonRunResult['bundle'] = { profile, snapshot: { contractVersion: '1', id: 'map-snapshot', kind: 'investment_comparison', profileId: profile.id, profileVersion: 1, evaluatedAt: now, claimRevisionIds: [...new Set(reads.flatMap(r => r.claims.flatMap(c => c.revisions.map(c => c.id))))], organizerRevisionIds: [], editionRevisionIds: reads.map(r => r.editionRevisions[0].id), participationRevisionIds: [], policy: { status: 'none', note: 'Controlled fixture' }, alternatives: reads.map(r => ({ editionId: r.editionId, organizerId: null, eligibility: { status: 'conditional', note: 'Access pending' }, conditions: [], scoring: { status: 'not_scored', reason: 'no_policy', note: null } })), ordering: { kind: 'presentation_only', editionIds: reads.map(r => r.editionId), note: 'No investment ranking' }, outcome: { kind: 'completed' }, narrative: null }, editions: reads.flatMap(r => r.editionRevisions), organizers: [], claims: reads.flatMap(r => r.claims.flatMap(c => c.revisions)), participations: [], companies: [], sources: reads[0]?.sources ?? [], decision: null, campaign: null };
  const result: ComparisonRunResult = { kind: 'investment_comparison', version: 1, snapshotId: bundle.snapshot.id, evaluatedAt: now, bundle, featureSetVersion: 'test', featuresByEdition: {}, v0Shadow: { mode: 'offline_shadow', referenceLabel: null, entries: [], note: 'Test' }, availableCatalog: { evaluatedAt: now, editionIds: reads.map(r => r.editionId), upcomingEditionIds: [], comparedEditionIds: reads.map(r => r.editionId), note: 'Test' }, narrative: null, eligibleIsNotRecommended: 'No investment recommendation', warnings: [] };
  return { ...run, workflowVersion: 'investment-comparison/1', result };
}

export const CONTROLLED_MAP_STYLE = { version: 8, sources: { streets: { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-122.5,37.74],[-122.39,37.79],[-122.37,37.81]] } }] } } }, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8eee9' } }, { id: 'controlled-street', type: 'line', source: 'streets', paint: { 'line-color': '#fff', 'line-width': 5 } }] };
