// Store en memoria de las Decisiones de la Launch Room (§L5).
//
// LA DISTINCIÓN QUE NO SE NEGOCIA:
//   confidence = qué tan seguros estamos sobre el MUNDO. La mueve SOLO la
//     evidencia. En el store eso es `confidenceDelta`, que se mueve únicamente
//     con señales `becomesEvidence: true`.
//   consensus  = qué tan alineado está el EQUIPO. La mueven los tapbacks
//     (approve/reject de owner/teammate). NUNCA toca confidence.
//
// becomesEvidence es true SOLO para confirm_availability de un organizer
// (información nueva y consentida sobre el mundo → además llena roi.tierPriceUsd).

import type { Decision, DecisionSignal } from '@/lib/contracts/growxth';

type Role = DecisionSignal['from'];
type SignalType = DecisionSignal['type'];

const decisions = new Map<string, Decision>();

// Cada confirmación de organizer suma este delta de confianza (tope 100).
const EVIDENCE_CONFIDENCE_BUMP = 8;

export function signalBecomesEvidence(from: Role, type: SignalType): boolean {
  return from === 'organizer' && type === 'confirm_availability';
}

export function createSignal(
  from: Role,
  type: SignalType,
  payload?: DecisionSignal['payload'],
): DecisionSignal {
  return {
    id: `sig-${crypto.randomUUID().slice(0, 8)}`,
    from,
    type,
    payload,
    receivedAt: new Date().toISOString(),
    becomesEvidence: signalBecomesEvidence(from, type),
  };
}

export function getDecision(id: string): Decision | null {
  return decisions.get(id) ?? null;
}

export function ensureDecision(id: string, opportunityId: string, threadId: string): Decision {
  const existing = decisions.get(id);
  if (existing) return existing;
  const created: Decision = {
    id,
    opportunityId,
    threadId,
    participants: [],
    signals: [],
    consensus: 0,
    confidenceDelta: 0,
    state: 'open',
  };
  decisions.set(id, created);
  return created;
}

function recompute(decision: Decision): void {
  // Consenso: alineación del equipo (owner + teammate). Organizer no vota
  // alineación de equipo; su aporte es evidencia, no consenso.
  const teamVotes = decision.signals.filter(
    (s) => (s.from === 'owner' || s.from === 'teammate') && (s.type === 'approve' || s.type === 'reject'),
  );
  const approvals = teamVotes.filter((s) => s.type === 'approve').length;
  const total = teamVotes.length;
  decision.consensus = total > 0 ? Math.round((approvals / total) * 100) / 100 : 0;

  // Confianza: SOLO evidencia. Suma acotada de deltas por señal becomesEvidence.
  const evidenceCount = decision.signals.filter((s) => s.becomesEvidence).length;
  decision.confidenceDelta = Math.min(100, evidenceCount * EVIDENCE_CONFIDENCE_BUMP);

  // Estado.
  const ownerRejected = decision.signals.some((s) => s.from === 'owner' && s.type === 'reject');
  const ownerApproved = decision.signals.some((s) => s.from === 'owner' && s.type === 'approve');
  const pendingEvidence =
    decision.signals.some((s) => s.type === 'request_evidence') && evidenceCount === 0;

  if (ownerRejected) decision.state = 'rejected';
  else if (ownerApproved && decision.consensus >= 0.5) decision.state = 'approved';
  else if (pendingEvidence) decision.state = 'needs_evidence';
  else decision.state = 'open';
}

export function addSignal(decisionId: string, signal: DecisionSignal): Decision | null {
  const decision = decisions.get(decisionId);
  if (!decision) return null;

  // Registrar consentimiento del participante en su primera aparición.
  if (!decision.participants.some((p) => p.role === signal.from)) {
    decision.participants.push({ role: signal.from, consentAt: signal.receivedAt });
  }

  decision.signals.push(signal);
  recompute(decision);
  return decision;
}

// El precio de tier confirmado por un organizer (llena roi.tierPriceUsd cuando
// la oportunidad se recompone con la decisión aplicada). null si nadie confirmó.
export function getConfirmedTierPriceUsd(decision: Decision): number | null {
  for (let i = decision.signals.length - 1; i >= 0; i -= 1) {
    const s = decision.signals[i];
    if (s.becomesEvidence && typeof s.payload?.tierPriceUsd === 'number') {
      return s.payload.tierPriceUsd;
    }
  }
  return null;
}

// Solo para tests/demo: limpiar el store.
export function _resetDecisions(): void {
  decisions.clear();
}
