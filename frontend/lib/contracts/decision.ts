// Shared decision HTTP inputs. Server-resolved authors are never accepted here.
export interface DecisionConditionInput {
  // Condición del snapshot que esta entrada detalla (null = condición nueva
  // registrada por la persona que decide).
  snapshotConditionId: string | null;
  pendingItem: string; // claim o dato pendiente
  question: string | null; // pregunta al organizador (no se envía ningún mensaje)
  expectedAnswer: string | null; // respuesta esperada
  effect: 'chosen' | 'discarded' | null; // efecto sobre la decisión si llega esa respuesta
  owner: string | null; // responsable, si se conoce
  dueBy: string | null; // plazo, si se conoce
}

// A null campaign preserves/composes the existing minimum. In a supplied
// campaign, null owner/success/modality explicitly clear those optional fields;
// null objective/costs/questions keep their fallback. Original evidence survives.
export interface DecisionCampaignInput {
  owner?: string | null;
  objective: string | null;
  successDefinition: string | null;
  modality: { kind: 'sponsorship' | 'workshop' | 'co_hosted' | 'booth' | 'other'; detail: string | null; basis?: 'proposed' | 'offered'; attribution?: { attributedTo: string; support: string; sourceIds: string[] } } | null;
  costItems: { label: string; amount: unknown; attribution?: { attributedTo: string; support: string; sourceIds: string[] } }[] | null;
  openQuestions: string[] | null;
  commitments: {
    description: string;
    kind: 'estimate' | 'goal' | 'agreed';
    owner: string | null;
    dueBy: string | null;
    confirmation: { method: string; sourceIds: string[]; confirmedBy: string; confirmedAt: string } | null;
  }[];
}

export interface DecisionSaveBody {
  idempotencyKey: string;
  snapshotId: string;
  editionId: string;
  verdict: 'chosen' | 'discarded' | 'pending';
  intent?: 'explore_first' | null;
  reasons: string[];
  conditions: DecisionConditionInput[];
  campaignDraft: DecisionCampaignInput | null;
}

export interface DecisionReviseBody {
  idempotencyKey: string | null;
  expectedRevision: number; // revisión esperada: obsoleta → conflicto, jamás sobrescritura
  verdict: 'chosen' | 'discarded' | 'pending' | null;
  intent?: 'explore_first' | null;
  reasons: string[] | null; // null = conservar los de la última revisión
  addConditions: DecisionConditionInput[];
  resolveConditions: { conditionId: string; resolvedNote: string; attribution?: { attributedTo: string; support: string; sourceIds: string[] } }[];
  campaignDraft: DecisionCampaignInput | null;
}

