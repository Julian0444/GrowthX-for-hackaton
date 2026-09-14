import type { AlternativeReading, ComparisonEvidenceRef, ComparisonReading, ComparisonReason } from '../../contracts/comparison.ts';
import type { ClaimRevision, EvaluationProfile, EvaluationSnapshot, EditionRelationship } from '../../contracts/evaluation.ts';
import type { EditionDossierRead } from '../catalog/read.ts';
import { hasAffirmativeSupport } from '../../evidence/claim-support.ts';
import { assessCosts } from '../../evidence/costs.ts';

export const RESEARCH_COMPARISON_VERSION = 'research-comparison/1';
const CRITERIA = [
  'Check date, city, access, audience, and costs first; excluded options cannot compete.',
  'Look for explicit topical fit between the brief and a documented program or project; prizes, brands, and figures do not establish fit.',
  'Use historical evidence with the same identity and an edition-specific role; sponsorship experience does not establish organizing experience.',
  'Prioritize only a factual difference: relevant background versus missing support. Ties preserve presentation order without an investment ranking.',
];
const latest = (d: EditionDossierRead) => d.editionRevisions.at(-1)!;
const claimsOf = (d: EditionDossierRead) => d.claims.map(c => c.revisions.at(-1)!).filter(c => c.subject.type === 'edition' && c.subject.editionId === d.editionId);
const unique = (values: string[]) => [...new Set(values)].sort();
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
// Vocabulario acotado y versionado; coincidencia temática es una hipótesis de
// investigación, nunca prueba de audiencia, intención de compra o éxito.
const TOPICS: [string, RegExp][] = [
  ['agents', /\b(?:agents?|agentes?|agentic)\b/i],
  ['observability', /\b(?:observability|observabilidad|monitoring|tracing|auditing|recovery|telemetry)\b/i],
  ['payments', /\b(?:payments?|pagos?|fintech|billing)\b/i],
  ['security', /\b(?:security|seguridad|secure|safety)\b/i],
  ['infrastructure', /\b(?:infrastructure|infraestructura|cloud|kubernetes|deployment)\b/i],
];
function topics(profile: EvaluationProfile, text: string): string[] {
  const buyer = normalize(`${profile.product} ${profile.audience.description} ${profile.stack.join(' ')}`);
  const evidence = normalize(text);
  const matched = TOPICS.filter(([, pattern]) => pattern.test(buyer) && pattern.test(evidence)).map(([name]) => name);
  for (const technology of profile.stack) {
    const term = normalize(technology).trim();
    if (term.length > 1 && evidence.split(/[^\p{L}\p{N}+#.-]+/u).includes(term)) matched.push(technology);
  }
  return unique(matched);
}
const topical = (c: ClaimRevision) => /^(program:|project:.*:(?:technology|technologies|tool|tools|description)$|theme$|focus$|stack$|description$)/.test(c.attribute);
function admitted(d: EditionDossierRead, c: ClaimRevision): boolean {
  return hasAffirmativeSupport(c) && c.sourceIds.every(id => d.sources.some(s => s.id === id)) &&
    (c.evidence ?? []).every(ref => d.sources.some(s => s.id === ref.sourceId && (ref.fragmentId === null || s.fragments?.some(f => f.id === ref.fragmentId))));
}
function relationshipAdmitted(d: EditionDossierRead, r: EditionRelationship): boolean {
  return r.editionId === d.editionId && r.scope === 'edition' && hasAffirmativeSupport({status:r.status,sourceIds:r.sourceIds}) && r.claimRevisionIds.length > 0 &&
    r.claimRevisionIds.every(id => claimsOf(d).some(c => c.id === id && admitted(d,c))) &&
    r.sourceIds.every(id => d.sources.some(s => s.id === id));
}
function ref(d: EditionDossierRead, claims: ClaimRevision[], relationships: EditionRelationship[] = []): ComparisonEvidenceRef {
  return { editionId: d.editionId, editionRevisionId: latest(d).id,
    claimRevisionIds: unique([...claims.map(c => c.id), ...relationships.flatMap(r => r.claimRevisionIds)]),
    relationshipIds: unique(relationships.map(r => r.id)), sourceIds: unique([...claims.flatMap(c => c.sourceIds), ...relationships.flatMap(r => r.sourceIds)]) };
}
const valueText = (c: ClaimRevision) => c.value.kind === 'text' ? c.value.text : '';
const modalityText = (c: ClaimRevision) => valueText(c).replaceAll('https://schema.org/OfflineEventAttendanceMode', 'in person').replaceAll('https://schema.org/OnlineEventAttendanceMode', 'online').replaceAll('https://schema.org/MixedEventAttendanceMode', 'hybrid');
const objectiveLabels = { adoption: 'adoption', feedback: 'feedback', hiring: 'hiring', awareness: 'awareness' };
function proposal(profile: EvaluationProfile): string {
  switch (profile.objective.kind) {
    case 'feedback': return 'Explore a voluntary product feedback session with relevant participants.';
    case 'hiring': return 'Explore voluntary technical conversations with candidates, confirming profiles and permission to contact.';
    case 'awareness': return 'Explore a technical demo to introduce the product to the declared audience.';
    case 'adoption': return 'Explore a workshop for voluntary product integration into a project.';
  }
}

export function buildAlternativeReading(profile: EvaluationProfile, dossier: EditionDossierRead, histories: EditionDossierRead[], alternative: EvaluationSnapshot['alternatives'][number]): AlternativeReading {
  const edition = latest(dossier);
  const ownClaims = claimsOf(dossier);
  const ownTechnical = ownClaims.filter(c => admitted(dossier,c) && topical(c) && c.value.kind === 'text');
  const currentMatches = ownTechnical.filter(c => topics(profile,valueText(c)).length > 0);
  const currentRelations = (edition.relationships ?? []).filter(r => relationshipAdmitted(dossier,r) && r.entity.type === 'organizer' && ['organizer','co_organizer','host'].includes(r.role));
  const organizerIds = currentRelations.flatMap(r => r.entity.type === 'organizer' ? [r.entity.organizerId] : []);
  const companyIds = dossier.organizers.filter(o => organizerIds.includes(o.organizerId)).flatMap(o => o.revisions.at(-1)?.companyId ? [o.revisions.at(-1)!.companyId!] : []);
  const antecedents: ComparisonReason[] = [];
  const historicalMatches: { dossier: EditionDossierRead; claims: ClaimRevision[]; relations: EditionRelationship[]; text: string }[] = [];
  for (const history of [...histories].sort((a,b) => a.editionId.localeCompare(b.editionId))) {
    if (history.editionId === edition.editionId || history.validity.validity !== 'past') continue;
    const historical = latest(history);
    const relations = (historical.relationships ?? []).filter(r => relationshipAdmitted(history,r));
    const shared = relations.filter(r => r.entity.type === 'organizer' ? organizerIds.includes(r.entity.organizerId) && ['organizer','co_organizer','host'].includes(r.role) : r.entity.type === 'company' && companyIds.includes(r.entity.companyId) && ['sponsor','host','co_organizer'].includes(r.role));
    if (!shared.length) continue;
    const technical = claimsOf(history).filter(c => admitted(history,c) && topical(c) && c.value.kind === 'text');
    const matches = technical.filter(c => topics(profile,valueText(c)).length > 0);
    const projects = relations.filter(r => r.entity.type === 'project' && r.role === 'published_project');
    const companies = relations.filter(r => r.entity.type === 'company');
    const roleText = shared.map(r => `${r.role} [${r.status}]`).join(', ');
    const detail = matches.length ? matches.map(c => `${c.attribute.startsWith('program:') ? 'Program' : 'Project / technology'} [${c.status}]: ${valueText(c)}`).join('; ') : 'No program or project establishes topical fit in this reading.';
    const linked = [...shared,...companies,...projects];
    const text = `${historical.name} · ${historical.location.name ?? 'city pending'}: previous role ${roleText}. ${detail} ${companies.map(r => `${history.companies.find(c => r.entity.type === 'company' && c.id === r.entity.companyId)?.name ?? 'Company'}: ${r.role} [${r.status}].`).join(' ')} The publication retains its evidence status; it does not establish payment, delivery, attendance, or commercial return.`;
    const basis = [ref(dossier,[],currentRelations),ref(history,matches,linked)];
    antecedents.push({text,basis});
    if (matches.length) historicalMatches.push({dossier:history,claims:matches,relations:linked,text});
  }
  const basis = [...(currentMatches.length ? [ref(dossier,currentMatches)] : []),...historicalMatches.flatMap(h => [ref(dossier,[],currentRelations),ref(h.dossier,h.claims,h.relations)])];
  const matchedTerms = unique([...currentMatches.flatMap(c=>topics(profile,valueText(c))),...historicalMatches.flatMap(h=>h.claims.flatMap(c=>topics(profile,valueText(c))))]);
  const hasFit = matchedTerms.length > 0;
  const goal = objectiveLabels[profile.objective.kind];
  const reason = hasFit
    ? `For «${profile.product}», targeting «${profile.audience.description}» with a goal of ${goal}, there is topical fit in ${matchedTerms.join(', ')}. ${historicalMatches.length ? 'The documented background supports asking about a similar activity in the current edition.' : 'The published topic supports checking the fit of the activity.'} This is a relevance hypothesis; actual audience and availability still need validation.`
    : `For «${profile.product}», targeting «${profile.audience.description}» with a goal of ${goal}, no documented program or project establishes specific fit. Ask for relevant use cases and audience before proposing investment.`;
  const modalityClaims = ownClaims.filter(c => ['modality','format'].includes(c.attribute));
  const published = modalityClaims.filter(c=>admitted(dossier,c) && c.value.kind === 'text');
  const modalityUncertain = modalityClaims.some(c=>!admitted(dossier,c));
  const modality: AlternativeReading['modality'] = published.length && !modalityUncertain
    ? {status:'published',text:`Published format: ${published.map(c=>`${modalityText(c)} [${c.status}]`).join('; ')}. ${hasFit ? `Buyer-proposed activity: ${proposal(profile)}` : 'Confirm a relevant program and audience before proposing an activity.'} Commercial participation requires its own permission and price.`,basis:[ref(dossier,published),...basis]}
    : hasFit ? {status:'proposed',text:`Buyer proposal: ${proposal(profile)} No offer is confirmed; validate format${profile.formats?.length ? ` (${profile.formats.join(', ')})` : ''}, permission, and conditions for this edition.${modalityUncertain ? ' The format has pending or conflicting evidence.' : ''}`,basis}
    : {status:'pending',text:'Format pending: ask for the program, participant profiles, and participation options before proposing an activity.',basis:[]};
  const costs = assessCosts(ownClaims,profile.budget);
  const amounts = ownClaims.filter(c=>c.attribute.startsWith('cost:')).map(c=>`${c.attribute.slice(5)} [${c.status}]: ${c.value.kind === 'money' ? `${c.value.currency} ${c.value.amount}` : 'amount pending'}`);
  const cost = [...amounts,...costs.conflicts,...costs.pending,'Confirm what the complete participation price includes; tickets, prizes, and credits are not sponsorship fees.'].join(' ');
  const blocking = alternative.conditions.find(c=>c.blocksEligibility);
  const question = alternative.eligibility.status === 'excluded'
    ? `Is there another edition or participation format that resolves this conflict: ${alternative.eligibility.reasons.join(' ')}?`
    : `${blocking?.resolution ?? 'What conditions, permission, and complete price does this edition offer?'} ${hasFit ? `Does the event allow ${goal === 'adoption' ? 'voluntary integration' : `an activity for ${goal}`} for «${profile.product}» with «${profile.audience.description}»?` : 'Which previous program or project demonstrates fit with this product and its audience?'}`;
  return {editionId:edition.editionId,relevance:{text:reason,basis},antecedents,modality,
    evidenceQuality:{status:hasFit ? historicalMatches.length ? 'supported' : 'limited' : 'insufficient',note:`${currentMatches.length} current topical claim(s) and ${historicalMatches.length} relevant historical example(s) reviewed. Source coverage does not extrapolate projects to attendees. ${alternative.conditions.length} open material condition(s).`},
    cost,nextQuestion:question,matchedCriteria:[...(currentMatches.length?['programa_actual_pertinente']:[]),...(historicalMatches.length?['antecedente_pertinente']:[])]};
}

export function buildComparisonReading(profile: EvaluationProfile, dossiers: EditionDossierRead[], histories: EditionDossierRead[], alternatives: EvaluationSnapshot['alternatives']): ComparisonReading {
  const readings = alternatives.map(a => buildAlternativeReading(profile,dossiers.find(d=>d.editionId===a.editionId)!,histories,a));
  const possible = readings.filter(r=>alternatives.find(a=>a.editionId===r.editionId)!.eligibility.status !== 'excluded');
  const supported = possible.filter(r=>r.evidenceQuality.status !== 'insufficient');
  const historical = supported.filter(r=>r.matchedCriteria.includes('antecedente_pertinente'));
  const first = historical.length === 1 && possible.length > 1 ? historical : [];
  const priority: ComparisonReading['priority'] = !supported.length
    ? {kind:'insufficient',editionIds:[],explanation:'No option has enough evidence to prioritize research for this brief. Ask for a relevant program or project, documented audience, and participation conditions; three recommendations are not fabricated.',criteria:CRITERIA}
    : first.length ? {kind:'investigate_first',editionIds:first.map(r=>r.editionId),explanation:`Investigate first ${latest(dossiers.find(d=>d.editionId===first[0].editionId)!).name}: it is the only non-excluded candidate with relevant topical background and a documented identity link. The other options lack that support in the reviewed coverage. Resolve its conditions before committing budget.`,criteria:CRITERIA}
    : {kind:'unordered',editionIds:[],explanation:'Comparison without investment ranking: coverage does not establish a sufficient factual difference to prioritize an option. Keep the questions and conditions of each option.',criteria:CRITERIA};
  return {version:RESEARCH_COMPARISON_VERSION,alternatives:readings,priority,differences:null};
}

export function explainDifferences(previous: {snapshot:EvaluationSnapshot;profile:EvaluationProfile}, current: EvaluationSnapshot, profile:EvaluationProfile): NonNullable<ComparisonReading['differences']> {
  const fields: (keyof EvaluationProfile)[] = ['product','audience','objective','budget','window','restrictions','formats','stack','comparableCompanies','geography'];
  const briefChanges = fields.flatMap(field => {
    const before=JSON.stringify(previous.profile[field] ?? null), after=JSON.stringify(profile[field] ?? null);
    return before===after ? [] : [{field,before,after}];
  });
  const ids=unique([...previous.snapshot.alternatives.map(a=>a.editionId),...current.alternatives.map(a=>a.editionId)]);
  const alternatives=ids.map(editionId=>{
    const before=previous.snapshot.alternatives.find(a=>a.editionId===editionId),after=current.alternatives.find(a=>a.editionId===editionId);
    const oldReading=previous.snapshot.decisionReading?.alternatives.find(a=>a.editionId===editionId),newReading=current.decisionReading?.alternatives.find(a=>a.editionId===editionId);
    const changes:string[]=[];
    if(!before||!after)changes.push(before?'Option removed from the comparison.':'Option added to the comparison.');
    else {
      if(JSON.stringify(before.eligibility)!==JSON.stringify(after.eligibility)) changes.push(`Participation: ${before.eligibility.status} → ${after.eligibility.status}. ${after.eligibility.status==='excluded'?after.eligibility.reasons.join(' '):''}`);
      const oldConditions=before.conditions.map(c=>c.description),newConditions=after.conditions.map(c=>c.description);
      for(const added of newConditions.filter(c=>!oldConditions.includes(c)))changes.push(`New condition: ${added}`);
      for(const removed of oldConditions.filter(c=>!newConditions.includes(c)))changes.push(`Condition no longer applicable in this evaluation: ${removed}`);
      if(oldReading?.relevance.text!==newReading?.relevance.text)changes.push(`Relevance: ${newReading?.relevance.text??'no saved reading'}`);
      if(oldReading?.modality.text!==newReading?.modality.text)changes.push(`Activity: ${newReading?.modality.text??'pending'}`);
    }
    return {editionId,changes:changes.length?changes:['No material differences in participation, conditions, relevance, or activity.']};
  });
  const evidenceChanged=JSON.stringify(previous.snapshot.editionRevisionIds)!==JSON.stringify(current.editionRevisionIds)||JSON.stringify(previous.snapshot.claimRevisionIds)!==JSON.stringify(current.claimRevisionIds);
  const priorityChanged=JSON.stringify(previous.snapshot.decisionReading?.priority)!==JSON.stringify(current.decisionReading?.priority);
  return {previousSnapshotId:previous.snapshot.id,briefChanges,alternatives,note:`${briefChanges.length?'The brief changed; each option was evaluated using the new revision.':'Same declared brief.'} ${evidenceChanged?'The evidence revisions changed.':'Same evidence revisions.'} ${priorityChanged?'The priority or its explanation changed.':'Research priority is unchanged.'} The original snapshot is unchanged.`};
}
