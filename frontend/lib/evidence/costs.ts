import type { BudgetDeclaration, ClaimRevision } from '../contracts/evaluation.ts';
import { hasAffirmativeSupport } from './claim-support.ts';

// Una cota inferior conocida puede excluir aunque falten partidas. Nunca se
// suman monedas distintas ni se suman dos opciones del mismo grupo.
export function assessCosts(claims: ClaimRevision[], budget: BudgetDeclaration) {
  const costs = claims.filter(c => c.attribute.startsWith('cost:'));
  const pending: string[] = [];
  const conflicts: string[] = [];
  if (!costs.length) pending.push('Total cost unknown: no supported cost items. Unknown cost is not zero.');
  let common = 0;
  const groups = new Map<string, Map<string, number>>();
  for (const claim of costs) {
    const composition = claim.costComposition;
    let options: Map<string, number> | undefined;
    if (composition?.kind === 'alternative') {
      options = groups.get(composition.groupId) ?? new Map();
      groups.set(composition.groupId, options);
      if (!options.has(composition.optionId)) options.set(composition.optionId, 0);
    }
    if (!hasAffirmativeSupport(claim) || claim.value.kind !== 'money') {
      pending.push(`Incomplete cost: item «${claim.attribute.slice(5)}» ${claim.status}; ${claim.note ?? (claim.value.kind === 'pending' ? claim.value.note : null) ?? 'supported amount missing'}; it does not count as zero.`);
      continue;
    }
    if (budget.status !== 'declared') continue;
    if (claim.value.currency !== budget.currency) {
      pending.push(`Currency is not comparable: «${claim.attribute.slice(5)}» in ${claim.value.currency} against the budget in ${budget.currency}; requires an explicit conversion with date and basis.`);
      continue;
    }
    if (composition?.kind === 'alternative' && options) {
      options.set(composition.optionId, options.get(composition.optionId)! + claim.value.amount);
    } else common += claim.value.amount;
  }
  // Se toma la menor cota conocida entre opciones, nunca el precio de una
  // opción desconocida como oferta gratis. Su incertidumbre queda arriba.
  let lowerBound = common;
  for (const [group, options] of groups) {
    lowerBound += Math.min(...options.values());
    pending.push(`Alternative packages in group «${group}»: choose one option and confirm its complete cost; alternatives are not added together.`);
  }
  if (budget.status === 'declared' && lowerBound > budget.amount) {
    conflicts.push(`Confirmed budget conflict: known cumulative items total at least ${budget.currency} ${lowerBound}, exceeding the declared budget (${budget.currency} ${budget.amount}).`);
  }
  return { conflicts, pending, knownLowerBound: budget.status === 'declared' ? lowerBound : null };
}
