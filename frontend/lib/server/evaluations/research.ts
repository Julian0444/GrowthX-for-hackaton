// Ticket 10. Selección estructurada sobre catálogo del tenant, sin proveedores ni scores.
import { hasAffirmativeSupport as supported } from '../../evidence/claim-support.ts';
import { evaluateEligibility } from './eligibility.ts';
import type pg from 'pg';
import type { EvaluationProfile, ClaimRevision } from '../../contracts/evaluation.ts';
import { parseOrganizerRevision } from '../../contracts/evaluation-validation.ts';
import { listCatalogEditions, readEditionDossier, readOrganizerDossier } from '../catalog/read.ts';
import { withTenantTransaction } from '../db/pool.ts';
import { isSanFrancisco } from '../../../components/research-dashboard/research-model.ts';
import type { ResearchReason, SfResearchResult } from '../../../components/research-dashboard/research-types.ts';
import type { EditionDossierRead } from '../catalog/read.ts';

export const SF_WORKFLOW = 'sf-organizers/1';
const tokens = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}+#.-]+/u).filter(t => t.length > 1 && !['de','la','el','en','the','for','and','con','para','una','los','del'].includes(t));
const currentClaims = (read: { claims: { revisions: ClaimRevision[] }[] }) => read.claims.map(c => c.revisions[c.revisions.length - 1]);

export function futureSfConditions(read: EditionDossierRead, profile: EvaluationProfile): string[] {
  const result = evaluateEligibility({ dossier: read, profile });
  // Una edición futura puede abrirse e investigarse con costo/acceso/audiencia
  // pendientes. Esas condiciones se muestran abajo y se heredan al comparar.
  return result.researchBlockers;
}

export async function researchSfOrganizers(pool: pg.Pool, tenantId: string, profile: EvaluationProfile, evaluatedAt: string): Promise<SfResearchResult> {
  const list = await listCatalogEditions(pool, tenantId, evaluatedAt);
  const catalog = await withTenantTransaction(pool, tenantId, async client => {
    const { rows } = await client.query(`select payload from growthx.organizer_revisions r
      where not exists (select 1 from growthx.organizer_revisions n where n.previous_revision_id = r.id)
      order by organizer_id`);
    const organizers = rows.map(row => {
      const parsed = parseOrganizerRevision(row.payload);
      if (!parsed.ok) throw new Error('Revisión de organizador inválida');
      return parsed.value;
    });
    const loads = await client.query('select verified_at, material from growthx.catalog_loads order by verified_at');
    return { organizers, loads: loads.rows };
  });
  const editions: EditionDossierRead[] = [];
  for (const item of list.editions) {
    const read = await readEditionDossier(pool, tenantId, item.editionId, evaluatedAt);
    if (read) editions.push(read);
  }
  const stack = new Set(profile.stack.flatMap(tokens));
  const audience = new Set(tokens([profile.audience.description, ...profile.audience.profiles].join(' ')));
  const comparableIds = profile.comparableCompanies.filter(c => c.confirmation === 'confirmed' && c.companyId).map(c => c.companyId!);
  const candidates: SfResearchResult['candidates'] = [];
  for (const organizer of catalog.organizers) {
    const dossier = await readOrganizerDossier(pool, tenantId, organizer.organizerId, evaluatedAt);
    if (!dossier) continue;
    const ownEditions = editions.filter(e => e.editionRevisions[e.editionRevisions.length - 1].organizerIds.includes(organizer.organizerId));
    const reasons: ResearchReason[] = [];
    const facts = [...currentClaims(dossier), ...ownEditions.flatMap(currentClaims).filter(c => c.subject.type === 'edition')];
    for (const c of facts) {
      if (!supported(c) || c.value.kind !== 'text') continue;
      const criterion = ['focus','stack','theme'].includes(c.attribute) ? stack : c.attribute === 'audience' ? audience : null;
      if (!criterion) continue;
      const matched = [...new Set(tokens(c.value.text).filter(t => criterion.has(t)))];
      if (!matched.length) continue;
      reasons.push({ attribute: c.attribute, text: `${matched.join(', ')} · ${c.value.text} · ${c.status}`, sourceIds: c.sourceIds, revisionIds: [c.id] });
    }
    for (const chain of dossier.participations) {
      const participation = chain.revisions[chain.revisions.length - 1];
      // La última revisión puede corregir también la edición de la relación.
      if (!dossier.editions.some(e => e.edition.editionId === participation.editionId)) continue;
      if (!comparableIds.includes(participation.companyId) || !supported({ status: participation.roleStatus, sourceIds: participation.sourceIds })) continue;
      const company = dossier.companies.find(c => c.id === participation.companyId);
      reasons.push({ attribute: 'empresa comparable', text: `${company?.name ?? participation.companyId} → ${participation.editionId} → ${participation.role} · ${participation.roleStatus}. Resultado comercial ${participation.commercialOutcome.status === 'unknown' ? 'desconocido' : 'reportado; consultar fuente'}.`, sourceIds: participation.sourceIds, revisionIds: [participation.id] });
    }
    if (!reasons.length) continue;
    const futureSfEditionIds = ownEditions.filter(e => futureSfConditions(e, profile).length === 0).map(e => e.editionId);
    const pending = ['Afinidad por factores explícitos; no mide reputación, popularidad ni probabilidad de ROI.',
      'Acceso, audiencia y costo total requieren revisión antes de una decisión de inversión.'];
    for (const read of ownEditions) {
      const name = read.editionRevisions.at(-1)!.name;
      pending.push(...evaluateEligibility({ dossier: read, profile }).conditions.map(c => `${name}: ${c.description}`));
    }
    if (!futureSfEditionIds.length) pending.push('Sin edición futura de SF con fecha, lugar y restricciones respaldados. Se puede guardar como investigación pendiente.');
    if (!dossier.coverage.antecedentsDocumented) pending.push('Sin antecedentes históricos documentados.');
    candidates.push({ organizerId: organizer.organizerId, displayName: organizer.displayName, dossier, reasons, futureSfEditionIds, pending });
  }
  return {
    kind: 'sf_organizer_research', version: 1, evaluatedAt,
    criteria: { stack: profile.stack, audience: profile.audience.description, comparableCompanyIds: comparableIds, window: profile.window, budget: profile.budget, objective: profile.objective, ordering: 'presentation_only' },
    coverage: { organizers: catalog.organizers.length, editions: editions.length, sfEditions: list.editions.filter(e => isSanFrancisco(e.location)).length, matched: candidates.length,
      verifiedAt: [...new Set(catalog.loads.map(l => (l.verified_at as Date).toISOString()))], material: [...new Set(catalog.loads.map(l => String(l.material)))] },
    catalogNote: [list.note, !candidates.length ? 'Sin coincidencias respaldadas: este es el límite del catálogo consultado, no una conclusión sobre todos los organizadores de SF.' : 'Orden por ID estable, sin ranking ni política comercial aprobada.'].filter(Boolean).join(' '),
    candidates, editions,
  };
}
