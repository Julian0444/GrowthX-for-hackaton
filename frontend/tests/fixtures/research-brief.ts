import type { EvaluationStartBody } from '../../lib/server/evaluations/wire.ts';
import type { CurationManifest } from '../../lib/server/catalog/manifest.ts';
export const briefBody = (): EvaluationStartBody => ({
  idempotencyKey: 'brief-dp03-test', mode: 'catalog_research', researchScope: 'sf_organizers',
  profile: { product: 'Observabilidad para agentes', audienceDescription: 'Equipos que construyen agentes', audienceProfiles: ['Backend'], stack: ['Python'], budget: { status: 'declared', amount: 5000, currency: 'USD' }, window: { from: '2026-09-10', to: '2026-10-22' }, objective: { kind: 'adoption', confirmation: 'confirmed', successDefinition: { status: 'defined', text: 'Instrumentar un proyecto voluntario' } }, restrictions: ['No comprar solo logo', 'Introducciones con opt-in'], formats: ['workshop', 'hackathon'], geography: { city: 'San Francisco', timezone: 'America/Los_Angeles' }, comparableCompanies: [{ companyId: null, name: 'Datadog', relation: 'comparable', confirmation: 'indicated' }] },
});

// Serialización controlada de A03/A08/A09 y la relación E-AIT de DP-01.
// No es extracción nueva ni material cargado en la sesión de la persona.
export function referenceManifest(): CurationManifest {
  const at = '2026-09-10T17:10:00Z';
  const refs = [{ sourceId: 'ait-page', fragmentId: 'sponsor', locator: null }];
  const projectRefs = [{ sourceId: 'citadel', fragmentId: 'award', locator: null }];
  return {
    manifestVersion: '1', name: 'DP03 reference serialization (controlled)', material: 'synthetic', authorizedBy: 'DP03 controlled test', verifiedAt: at, note: 'Referencia documental DP-01; prueba del contrato, no investigación ejecutada.',
    sources: [
      { contractVersion: '1', id: 'ait-page', url: 'https://sf.aitinkerers.org/p/ai-tinkerers-sf-secure-agents-buildathon', requestedUrl: 'https://sf.aitinkerers.org/p/ai-tinkerers-sf-secure-agents-buildathon', canonicalUrl: null, title: 'Secure Agents Buildathon', locator: 'Patrocinio y capítulo SF', provider: 'AI Tinkerers', collector: 'DP01 reference', fetchedAt: at, publishedAt: null, method: 'documentary_reference', geoScope: 'city', content: { kind: 'none' }, fragments: [{ id: 'sponsor', text: 'Thank you to Google Cloud', locator: 'Patrocinio' }], retrieval: { status: 'partial', limitation: 'Fragmentos de referencia; página no descargada por esta prueba.', freshness: 'unknown' }, usageRestrictions: [] },
      { contractVersion: '1', id: 'citadel', url: 'https://sf.aitinkerers.org/hackathons/h_3D-tFFdFiYo/entries/ht_-q61ElFncwo', locator: null, provider: 'AI Tinkerers', collector: 'DP01 reference', fetchedAt: at, publishedAt: null, method: 'documentary_reference', geoScope: 'city', content: { kind: 'none' }, fragments: [{ id: 'award', text: '1st Place Winner', locator: 'Insignia encima del título' }, { id: 'tool', text: 'Google Cloud', locator: 'Lista de herramientas' }], usageRestrictions: [] },
    ],
    companies: [{ contractVersion: '1', id: 'google-cloud', name: 'Google Cloud', websiteUrl: null }],
    organizers: [{ contractVersion: '1', id: 'ait-r1', organizerId: 'ait-sf', displayName: 'AI Tinkerers SF', aliases: [], claimRevisionIds: [], revisedAt: at, previousRevisionId: null }],
    editions: [{ contractVersion: '1', id: 'ait-2025-r1', editionId: 'ait-2025', organizerIds: ['ait-sf'], name: 'Secure Agents Buildathon', canonicalUrl: 'https://sf.aitinkerers.org/p/ai-tinkerers-sf-secure-agents-buildathon', provider: 'AI Tinkerers', startDate: { precision: 'date_only', date: '2025-12-06', timezone: null }, location: { scope: 'city', name: 'San Francisco' }, coordinates: null, claimRevisionIds: ['citadel-award-r1', 'citadel-tool-r1'], revisedAt: at, previousRevisionId: null, relationships: [
      { id: 'ait-host', editionId: 'ait-2025', entity: { type: 'organizer', organizerId: 'ait-sf' }, role: 'organizer', status: 'announced', scope: 'edition', sourceIds: ['ait-page'], evidence: [{ sourceId: 'ait-page', fragmentId: null, locator: 'Ficha del capítulo SF / edición 06 diciembre 2025' }], claimRevisionIds: [], limitation: null },
      { id: 'google-sponsor', editionId: 'ait-2025', entity: { type: 'company', companyId: 'google-cloud' }, role: 'sponsor', status: 'announced', scope: 'edition', sourceIds: ['ait-page'], evidence: refs, claimRevisionIds: [], limitation: 'No acredita monto pagado ni ROI.' },
      { id: 'citadel-entry', editionId: 'ait-2025', entity: { type: 'project', projectId: 'citadel-entry-2025', name: 'The Citadel', url: 'https://sf.aitinkerers.org/hackathons/h_3D-tFFdFiYo/entries/ht_-q61ElFncwo' }, role: 'published_project', status: 'reported', scope: 'edition', sourceIds: ['citadel'], evidence: projectRefs, claimRevisionIds: ['citadel-award-r1', 'citadel-tool-r1'], limitation: 'Premio y herramienta declarada; eficacia sin verificar.' },
    ] }],
    participations: [],
    claims: ['award', 'tool'].map(attribute => ({ contractVersion: '1', id: `citadel-${attribute}-r1`, claimId: `citadel-${attribute}`, subject: { type: 'edition', editionId: 'ait-2025' }, attribute: `project:citadel-entry-2025:${attribute}`, value: { kind: 'text', text: attribute === 'award' ? 'Primer puesto publicado' : 'Google Cloud declarado' }, status: 'reported', sourceIds: ['citadel'], evidence: [{ sourceId: 'citadel', fragmentId: attribute, locator: null }], method: 'documentary_reference', note: 'No prueba eficacia ni adopción.', reviewer: null, reviewedAt: at, previousRevisionId: null })),
  };
}
