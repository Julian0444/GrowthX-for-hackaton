import type { PublicEventLocation } from '../contracts/evaluation.ts';
import type { EditionDossierRead, EvaluationRunView } from '../api/atlas-client.ts';
import type { AlternativeReading } from '../contracts/comparison.ts';
import { projectEditionDossierView } from '../api/opportunity-adapter.ts';
import { backgroundResult } from '../contracts/background.ts';

export { readableDate, declaredDateLabel } from '../temporal/display-date.ts';

export function stableIds(previous: string[], incoming: string[]): string[] {
  const present = new Set(incoming);
  return [...previous.filter(id => present.has(id)), ...incoming.filter(id => !previous.includes(id))].filter((id, index, all) => all.indexOf(id) === index);
}

export function alternativeReason(reading: Pick<AlternativeReading, 'editionId' | 'antecedents' | 'matchedCriteria'>, editions: { id: string; name: string }[]) {
  const historical = reading.antecedents.flatMap(reason => reason.basis).filter(ref => ref.editionId !== reading.editionId).map(ref => editions.find(edition => edition.id === ref.editionRevisionId)?.name).find(Boolean);
  if (reading.matchedCriteria.includes('antecedente_pertinente')) return historical ? `Relevant background: ${historical}. Explore a similar activity with this organizer.` : 'Relevant documented background supports exploring a similar activity. Confirm the current audience and availability.';
  return reading.matchedCriteria.includes('programa_actual_pertinente') ? 'The documented program matches this brief. Confirm the audience and permission for your proposed activity.' : 'No documented program or project establishes fit with this brief yet. Ask for relevant use cases and audience evidence.';
}

export function opportunitySummary(read: EditionDossierRead, reading?: AlternativeReading) {
  const view = projectEditionDossierView(read);
  const edition = read.editionRevisions.at(-1)!;
  const values = [view.date, view.location, view.access, view.audience, ...view.costs];
  const conflict = values.find(value => value.conflict || value.field.state === 'ambiguous' || (value.field.state === 'known' && value.field.claimStatus === 'contradicted'));
  const incompleteCost = !view.costs.length || view.costs.some(value => value.field.state !== 'known' || value.field.claimStatus === 'pending' || value.field.claimStatus === 'inferred' || value.field.claimStatus === 'contradicted' || value.field.pendingNote);
  const reasons = view.otherClaims.filter(c => c.attribute === 'buyer:relevance');
  const reason = (reading?.relevance.text ?? (reasons.map(v => v.field.state === 'pending' ? '' : v.field.display).filter(Boolean).join(' ') || 'Fit with your brief is still being researched. Inspect the published program and audience.')).replace(/^For .+? \((?:adoption|feedback|hiring|awareness)\),\s*/i, '');
  const pending = conflict ? `${conflict.label} has conflicting evidence. Resolve the discrepancy before deciding.`
    : incompleteCost ? 'Full participation cost is unknown. Request an edition-specific quote before committing budget.'
    : view.access.field.state !== 'known' ? 'Access is pending. Confirm eligibility and the participation requirements.'
    : view.audience.field.state !== 'known' ? 'Audience is pending. Confirm who will participate.'
    : 'Confirm the proposed activity and the full commercial terms.';
  return { view, edition, reason, pending, conflict: Boolean(conflict), incompleteCost,
    nextAction: conflict ? 'Review conflicting evidence' : incompleteCost ? 'Review quote requirements' : 'Review participation requirements',
    sourceCount: new Set(read.sources.map(s => s.id)).size };
}

export const STAGE_LABELS: Record<string, string> = {
  validate_profile: 'Brief saved', discover_sources: 'Finding sources', research_catalog: 'Matching evidence',
  fetch_event_page: 'Reading event page', persist_dossier: 'Saving event evidence', read_relationship_sources: 'Reading background',
  persist_relationships: 'Connecting editions and projects', evaluate_candidates: 'Comparing conditions',
  compose_narrative: 'Preparing explanation', publish_result: 'Saving results',
};
export const RUN_LABELS: Record<string, string> = { queued: 'Queued', running: 'In progress', completed: 'Saved', failed: 'Interrupted', pending: 'Pending', partial: 'Partial coverage', insufficient: 'Insufficient coverage' };
export function progressSummary(run: EvaluationRunView, editionCount: number) {
  const background = backgroundResult(run.result);
  const status = run.discovery?.progress.status ?? background?.status ?? run.state;
  const current = run.steps.find(step => step.state === 'running') ?? run.steps.find(step => step.state === 'failed');
  return { status, label: RUN_LABELS[status] ?? status,
    stage: current ? STAGE_LABELS[current.name] ?? 'Researching sources' : run.state === 'queued' ? 'Waiting to start' : run.state === 'completed' ? 'Evidence saved' : 'Reading saved progress',
    findings: run.discovery ? `${run.discovery.candidates.length} source pages saved · event details await reading` : `${editionCount} event${editionCount === 1 ? '' : 's'} with saved evidence${background ? ` · ${background.sourceCount} pages read` : ''}`,
    limited: ['partial', 'insufficient', 'failed'].includes(status),
  };
}

export function locationLabel(location: PublicEventLocation, reason: string | null): string {
  if (!reason) return location.resolution?.accuracy === 'interpolated' || location.precision === 'street' ? '≈ Approximate location' : `● Location ${location.status}`;
  if (location.status === 'contradicted' || /contradict|conflict/i.test(reason)) return 'Conflicting location evidence · no point';
  if (/hidden|withheld|oculta/i.test(reason)) return 'Venue withheld until registration · no point';
  if (location.precision === 'city') return 'City only · venue pending';
  if (/provider|proveedor|fall|fail|unavailable/i.test(reason)) return 'Location provider unavailable · event kept in the list';
  if (/fuera de SF|outside SF/i.test(reason)) return 'Outside SF or city pending · no point';
  return 'Location pending · no supported point';
}
