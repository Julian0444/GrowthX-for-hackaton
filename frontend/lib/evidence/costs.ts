import type { BudgetDeclaration, ClaimRevision } from '../contracts/evaluation.ts';
import { hasAffirmativeSupport } from './claim-support.ts';

// Una cota inferior conocida puede excluir aunque falten partidas. Nunca se
// suman monedas distintas ni se suman dos opciones del mismo grupo.
export function assessCosts(claims: ClaimRevision[], budget: BudgetDeclaration) {
  const costs = claims.filter(c => c.attribute.startsWith('cost:'));
  const pending: string[] = [];
  const conflicts: string[] = [];
  if (!costs.length) pending.push('Costo total desconocido: ninguna partida con soporte. No se interpreta como cero.');
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
      pending.push(`Costo incompleto: partida «${claim.attribute.slice(5)}» ${claim.status}; ${claim.note ?? (claim.value.kind === 'pending' ? claim.value.note : null) ?? 'falta importe respaldado'}; no cuenta como cero.`);
      continue;
    }
    if (budget.status !== 'declared') continue;
    if (claim.value.currency !== budget.currency) {
      pending.push(`Moneda no comparable: «${claim.attribute.slice(5)}» en ${claim.value.currency} frente al presupuesto en ${budget.currency}; requiere conversión explícita con fecha y base.`);
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
    pending.push(`Paquetes alternativos del grupo «${group}»: elegir una opción y confirmar su costo completo; no se suman entre sí.`);
  }
  if (budget.status === 'declared' && lowerBound > budget.amount) {
    conflicts.push(`Presupuesto en conflicto confirmado: las partidas acumulables conocidas suman al menos ${budget.currency} ${lowerBound}, que excede el presupuesto declarado (${budget.currency} ${budget.amount}).`);
  }
  return { conflicts, pending, knownLowerBound: budget.status === 'declared' ? lowerBound : null };
}
