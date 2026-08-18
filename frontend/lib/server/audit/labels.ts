// Auditoría de labels (T7). Regla: "Observed" SOLO con evidencia justificada.
//
// - Evidencia web (web_page / event_listing / repo_activity): Observed exige
//   URL real + fecha (observedAt). Sin URL, baja a Estimated.
// - Evidencia humana (human_interview / human_confirmation): Observed se
//   justifica por el rightsBasis consentido (consented_panel / direct_consent)
//   + fecha, SIN URL (una entrevista no tiene página pública).
// - prepared_fixture nunca es Observed.
//
// Además baja la Opportunity de Observed→Estimated si, tras la auditoría, ya no
// cita ninguna evidencia Observed (salvo que sea humanValidated por Terac).

import type { Evidence, SearchResponse } from '@/lib/contracts/growxth';

const HUMAN_KINDS = new Set<Evidence['kind']>(['human_interview', 'human_confirmation']);
const HUMAN_RIGHTS = new Set<Evidence['rightsBasis']>(['consented_panel', 'direct_consent']);

export function observedJustified(e: Evidence): boolean {
  if (!e.observedAt) return false;
  if (e.kind === 'prepared_fixture') return false;
  if (HUMAN_KINDS.has(e.kind)) return HUMAN_RIGHTS.has(e.rightsBasis);
  return typeof e.url === 'string' && e.url.trim().length > 0;
}

export function auditResponse(response: SearchResponse): SearchResponse {
  const warnings = [...response.warnings];
  const evidence: Record<string, Evidence> = {};
  let downgraded = 0;

  for (const [id, e] of Object.entries(response.evidence)) {
    if (e.status === 'observed' && !observedJustified(e)) {
      evidence[id] = { ...e, status: 'estimated' };
      downgraded += 1;
    } else {
      evidence[id] = e;
    }
  }

  const opportunities = response.opportunities.map((opp) => {
    if (opp.status !== 'observed' || opp.humanValidated) return opp;
    const citedObserved = opp.reasons
      .flatMap((r) => r.evidenceIds)
      .some((eid) => evidence[eid]?.status === 'observed');
    return citedObserved ? opp : { ...opp, status: 'estimated' as const };
  });

  if (downgraded > 0) {
    warnings.push(
      `Auditoría de labels: ${downgraded} evidencia(s) bajada(s) de Observed a Estimated por faltar URL/fecha.`,
    );
  }

  return { ...response, evidence, opportunities, warnings };
}
