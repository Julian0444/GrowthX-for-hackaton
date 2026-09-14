import { englishSystemText } from "./english.ts";
import type { DecisionRead } from '../api/atlas-client.ts';
import type { EvaluationReadBundle, MoneyClaim, BuyerResponse } from '../contracts/evaluation.ts';
import { declaredDateLabel } from '../temporal/display-date.ts';

export function decisionLabel(decision: DecisionRead['decision']): string {
  if (decision.intent === 'explore_first') return 'Explore first · participation pending';
  return decision.verdict === 'chosen' ? `Chosen${decision.conditions.some(c => c.status === 'open') ? ' · conditional choice' : ''}` : decision.verdict === 'discarded' ? 'Discarded' : 'Pending';
}
export function attributionText(response?: BuyerResponse): string {
  return response ? `Buyer reports ${response.attributedTo}: ${response.support} (recorded by ${response.recordedBy}, ${response.recordedAt})` : 'Attribution not recorded in this historical revision';
}
export function moneyText(money: MoneyClaim): string {
  if (money.status === 'unknown') return `Pending — ${money.note ?? 'amount unknown; not zero'}`;
  return `${money.currency} ${money.amount} · ${money.status}${'basis' in money ? ` — ${money.basis}` : ''}${'note' in money && money.note ? ` — ${money.note}` : ''}`;
}
export function composeDecisionBrief(read: DecisionRead, bundle: EvaluationReadBundle, href: string, message = false): string {
  const {decision, campaign} = read;
  const conditionText = (condition: typeof decision.conditions[number]) => {
    const original = bundle.snapshot.alternatives.find(a => a.editionId === read.editionId)?.conditions.find(c => c.id === condition.id);
    if (!original) return condition.description;
    const oldText = original.resolution ? `${original.description} — Qué respuesta la resolvería: ${original.resolution}` : original.description;
    const currentText = original.resolution ? `${original.description} — Answer needed to resolve this: ${original.resolution}` : original.description;
    return condition.description === oldText || condition.description === currentText ? englishSystemText(condition.description) : condition.description;
  };
  const edition = bundle.editions.find(e => e.editionId === read.editionId && bundle.snapshot.editionRevisionIds.includes(e.id));
  const profile = bundle.profile;
  const questions = [...new Set([...(campaign?.openQuestions ?? []), ...decision.conditions.filter(c => c.status === 'open').map(conditionText)])];
  const reading = bundle.snapshot.decisionReading?.alternatives.find(a => a.editionId === read.editionId);
  if (reading?.nextQuestion && !questions.includes(reading.nextQuestion)) questions.push(englishSystemText(reading.nextQuestion));
  return [
    message ? 'Manual inquiry draft' : 'Decision brief',
    `Event: ${edition?.name ?? read.editionId}`, `Official event: ${edition?.canonicalUrl ?? 'not recorded'}`,
    `Date: ${edition ? declaredDateLabel(edition.startDate) : 'pending'}`,
    `Buyer context: ${profile.product} · audience: ${profile.audience.description}`,
    `Research objective: ${profile.objective.kind} (${profile.objective.confirmation}, declared by buyer)`,
    `Budget: ${profile.budget.status === 'declared' ? `${profile.budget.currency} ${profile.budget.amount}` : 'unknown'} · window: ${profile.window.from} to ${profile.window.to}`,
    `Decision: ${decisionLabel(decision)}`, 'Reasons:', ...decision.reasons.map(r => `- ${r}`),
    ...(reading ? [`Research context: ${englishSystemText(reading.relevance.text)}`] : []),
    ...(campaign ? [`Activity objective: ${campaign.objective}`, `Owner: ${campaign.owner ?? 'pending'}`,
      `Success definition (buyer): ${campaign.successDefinition ?? 'pending'}`,
      `Modality: ${campaign.modality.status === 'defined' ? `${campaign.modality.kind}: ${campaign.modality.detail ?? ''} · ${campaign.modality.basis === 'offered' ? 'offer reported by buyer' : 'team proposal; availability unconfirmed'} · ${attributionText(campaign.modality.declaration)}` : 'pending'}`,
      'Cost items (no complete campaign total established):', ...campaign.costItems.map(c => `- ${c.label}${c.evidence?.costComposition?.kind === 'alternative' ? ` · alternative ${c.evidence.costComposition.optionId} (${c.evidence.costComposition.groupId})` : ''}: ${moneyText(c.amount)}${c.declaration ? ` · ${attributionText(c.declaration)}` : ''}`),
      ...campaign.commitments.map(c => `Commitment: ${c.kind} — ${c.description}${c.confirmation ? ` · buyer reports confirmation by ${c.confirmation.confirmedBy}, ${c.confirmation.confirmedAt}, ${c.confirmation.method}` : ''}`)] : []),
    'Conditions and answers:', ...decision.conditions.map(c => `- [${c.status}] ${conditionText(c)}${c.owner ? ` · owner: ${c.owner}` : ''}${c.dueBy ? ` · due: ${c.dueBy}` : ''}${c.resolvedNote ? ` · answer: ${c.resolvedNote} · ${attributionText(c.response)}` : ''}`),
    'Next questions:', ...questions.map(q => `- ${q}`),
    'Saved sources:', ...bundle.sources.map(s => `- ${s.url ?? s.locator ?? s.id} · obtained ${s.fetchedAt}`),
    `Saved revision: ${decision.revision} · ${decision.decidedAt}`, `Reopen this brief: ${href}`,
    'Manual draft only. Saving or copying sends no message, books no activity and commits no money.',
  ].join('\n');
}

export async function copyText(text: string): Promise<string> {
  try {
    if (!navigator.clipboard?.writeText) return 'Clipboard unavailable. Select and copy the preview text manually.';
    await navigator.clipboard.writeText(text);
    return 'Copied to clipboard';
  } catch {
    return 'Copy failed. Select and copy the preview text manually.';
  }
}
