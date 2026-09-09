// Frontera HTTP de /api/decisions (ticket 13): parseo ESTRICTO de los cuerpos
// de POST (primera decisión) y PATCH (revisión con revisión esperada).
// Server-only.
//
// Claves desconocidas se rechazan (mismo criterio que 07/08): en particular
// tenantId/decidedBy/author — autor y tenant los resuelve el servidor desde la
// sesión — y consensus/confidenceDelta, que pertenecían al store en memoria de
// la Launch Room y NO existen en la decisión persistida.
//
// La forma fina (tipos de los MoneyClaim, reglas de «acordado», motivos no
// vacíos…) la valida el contrato 07 (parseEvaluationDecision /
// parseCampaignDraft) después de que el servidor compone el registro completo:
// acá solo se comprueba la estructura y que ninguna clave se descarte en
// silencio.

const SERVER_RESOLVED_KEYS = ['tenantId', 'decidedBy', 'author', 'authorId', 'consensus', 'confidenceDelta'];

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

// Borrador de campaña del cuerpo: campos en null → el servidor compone el
// mínimo honesto desde el snapshot y el perfil (partidas conocidas/pendientes
// desde los claims fijados; «por confirmar» donde corresponda — D1/D2).
export interface DecisionCampaignInput {
  objective: string | null;
  successDefinition: string | null;
  modality: { kind: 'sponsorship' | 'workshop' | 'co_hosted' | 'booth' | 'other'; detail: string | null } | null;
  costItems: { label: string; amount: unknown }[] | null;
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
  reasons: string[];
  conditions: DecisionConditionInput[];
  campaignDraft: DecisionCampaignInput | null;
}

export interface DecisionReviseBody {
  idempotencyKey: string | null;
  expectedRevision: number; // revisión esperada: obsoleta → conflicto, jamás sobrescritura
  verdict: 'chosen' | 'discarded' | 'pending' | null;
  reasons: string[] | null; // null = conservar los de la última revisión
  addConditions: DecisionConditionInput[];
  resolveConditions: { conditionId: string; resolvedNote: string }[];
  campaignDraft: DecisionCampaignInput | null;
}

export interface WireParseFailure {
  ok: false;
  error: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(error: string): WireParseFailure {
  return { ok: false, error };
}

function unknownKeys(record: Record<string, unknown>, allowed: string[]): WireParseFailure | null {
  const extra = Object.keys(record).filter((key) => !allowed.includes(key));
  if (extra.length === 0) return null;
  const resolved = extra.filter((key) => SERVER_RESOLVED_KEYS.includes(key));
  if (resolved.length > 0)
    return fail(
      `claves no admitidas: ${resolved.join(', ')} — autor y tenant los resuelve el servidor desde la sesión; consenso y confianza no existen en la decisión persistida`,
    );
  return fail(`claves no admitidas en el cuerpo: ${extra.join(', ')}`);
}

function parseTrimmedString(value: unknown, label: string): string | WireParseFailure {
  if (typeof value !== 'string' || value.trim().length === 0) return fail(`${label} debe ser un string no vacío`);
  return value.trim();
}

function parseNullableString(value: unknown, label: string): string | null | WireParseFailure {
  if (value === null || value === undefined) return null;
  return parseTrimmedString(value, label);
}

function parseStringList(value: unknown, label: string): string[] | WireParseFailure {
  if (!Array.isArray(value)) return fail(`${label} debe ser una lista de strings`);
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) return fail(`${label} contiene un valor vacío o no-string`);
    items.push(item.trim());
  }
  return items;
}

function isFailure(value: unknown): value is WireParseFailure {
  return isRecord(value) && value.ok === false && typeof value.error === 'string';
}

function parseConditionInput(value: unknown, label: string): DecisionConditionInput | WireParseFailure {
  if (!isRecord(value)) return fail(`${label} debe ser un objeto`);
  const extra = unknownKeys(value, ['snapshotConditionId', 'pendingItem', 'question', 'expectedAnswer', 'effect', 'owner', 'dueBy']);
  if (extra) return extra;
  const pendingItem = parseTrimmedString(value.pendingItem, `${label}.pendingItem`);
  if (isFailure(pendingItem)) return pendingItem;
  const question = parseNullableString(value.question, `${label}.question`);
  if (isFailure(question)) return question;
  const expectedAnswer = parseNullableString(value.expectedAnswer, `${label}.expectedAnswer`);
  if (isFailure(expectedAnswer)) return expectedAnswer;
  const snapshotConditionId = parseNullableString(value.snapshotConditionId, `${label}.snapshotConditionId`);
  if (isFailure(snapshotConditionId)) return snapshotConditionId;
  const owner = parseNullableString(value.owner, `${label}.owner`);
  if (isFailure(owner)) return owner;
  const dueBy = parseNullableString(value.dueBy, `${label}.dueBy`);
  if (isFailure(dueBy)) return dueBy;
  const effect = value.effect === undefined ? null : value.effect;
  if (effect !== null && effect !== 'chosen' && effect !== 'discarded')
    return fail(`${label}.effect debe ser 'chosen', 'discarded' o null`);
  return { snapshotConditionId, pendingItem, question, expectedAnswer, effect, owner, dueBy };
}

function parseCampaignInput(value: unknown): DecisionCampaignInput | null | WireParseFailure {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return fail('campaignDraft debe ser un objeto o null');
  const extra = unknownKeys(value, ['objective', 'successDefinition', 'modality', 'costItems', 'openQuestions', 'commitments']);
  if (extra) return extra;

  const objective = parseNullableString(value.objective, 'campaignDraft.objective');
  if (isFailure(objective)) return objective;
  const successDefinition = parseNullableString(value.successDefinition, 'campaignDraft.successDefinition');
  if (isFailure(successDefinition)) return successDefinition;

  let modality: DecisionCampaignInput['modality'] = null;
  if (value.modality !== null && value.modality !== undefined) {
    if (!isRecord(value.modality)) return fail('campaignDraft.modality debe ser un objeto o null');
    const modalityExtra = unknownKeys(value.modality, ['kind', 'detail']);
    if (modalityExtra) return modalityExtra;
    const kind = value.modality.kind;
    if (kind !== 'sponsorship' && kind !== 'workshop' && kind !== 'co_hosted' && kind !== 'booth' && kind !== 'other')
      return fail('campaignDraft.modality.kind no admitido');
    const detail = parseNullableString(value.modality.detail, 'campaignDraft.modality.detail');
    if (isFailure(detail)) return detail;
    modality = { kind, detail };
  }

  let costItems: DecisionCampaignInput['costItems'] = null;
  if (value.costItems !== null && value.costItems !== undefined) {
    if (!Array.isArray(value.costItems)) return fail('campaignDraft.costItems debe ser una lista o null');
    costItems = [];
    for (const [index, item] of value.costItems.entries()) {
      if (!isRecord(item)) return fail(`campaignDraft.costItems[${index}] debe ser un objeto`);
      const itemExtra = unknownKeys(item, ['label', 'amount']);
      if (itemExtra) return itemExtra;
      const label = parseTrimmedString(item.label, `campaignDraft.costItems[${index}].label`);
      if (isFailure(label)) return label;
      // La forma del MoneyClaim (quoted/estimated/unknown; jamás un faltante
      // como 0) la valida el contrato al componer el registro.
      costItems.push({ label, amount: item.amount });
    }
  }

  let openQuestions: string[] | null = null;
  if (value.openQuestions !== null && value.openQuestions !== undefined) {
    const parsed = parseStringList(value.openQuestions, 'campaignDraft.openQuestions');
    if (isFailure(parsed)) return parsed;
    openQuestions = parsed;
  }

  const commitments: DecisionCampaignInput['commitments'] = [];
  if (value.commitments !== undefined) {
    if (!Array.isArray(value.commitments)) return fail('campaignDraft.commitments debe ser una lista');
    for (const [index, item] of value.commitments.entries()) {
      const label = `campaignDraft.commitments[${index}]`;
      if (!isRecord(item)) return fail(`${label} debe ser un objeto`);
      const itemExtra = unknownKeys(item, ['description', 'kind', 'owner', 'dueBy', 'confirmation']);
      if (itemExtra) return itemExtra;
      const description = parseTrimmedString(item.description, `${label}.description`);
      if (isFailure(description)) return description;
      if (item.kind !== 'estimate' && item.kind !== 'goal' && item.kind !== 'agreed')
        return fail(`${label}.kind debe ser 'estimate', 'goal' o 'agreed'`);
      const owner = parseNullableString(item.owner, `${label}.owner`);
      if (isFailure(owner)) return owner;
      const dueBy = parseNullableString(item.dueBy, `${label}.dueBy`);
      if (isFailure(dueBy)) return dueBy;
      let confirmation: (typeof commitments)[number]['confirmation'] = null;
      if (item.confirmation !== null && item.confirmation !== undefined) {
        if (!isRecord(item.confirmation)) return fail(`${label}.confirmation debe ser un objeto o null`);
        const confirmationExtra = unknownKeys(item.confirmation, ['method', 'sourceIds', 'confirmedBy', 'confirmedAt']);
        if (confirmationExtra) return confirmationExtra;
        const method = parseTrimmedString(item.confirmation.method, `${label}.confirmation.method`);
        if (isFailure(method)) return method;
        const sourceIds = parseStringList(item.confirmation.sourceIds, `${label}.confirmation.sourceIds`);
        if (isFailure(sourceIds)) return sourceIds;
        const confirmedBy = parseTrimmedString(item.confirmation.confirmedBy, `${label}.confirmation.confirmedBy`);
        if (isFailure(confirmedBy)) return confirmedBy;
        const confirmedAt = parseTrimmedString(item.confirmation.confirmedAt, `${label}.confirmation.confirmedAt`);
        if (isFailure(confirmedAt)) return confirmedAt;
        confirmation = { method, sourceIds, confirmedBy, confirmedAt };
      }
      commitments.push({ description, kind: item.kind, owner, dueBy, confirmation });
    }
  }

  return { objective, successDefinition, modality, costItems, openQuestions, commitments };
}

export type DecisionSaveParse = { ok: true; body: DecisionSaveBody } | WireParseFailure;

export function parseDecisionSaveBody(input: unknown): DecisionSaveParse {
  if (!isRecord(input)) return fail('cuerpo inválido: se esperaba un objeto JSON');
  const extra = unknownKeys(input, ['idempotencyKey', 'snapshotId', 'editionId', 'verdict', 'reasons', 'conditions', 'campaignDraft']);
  if (extra) return extra;
  const idempotencyKey = input.idempotencyKey;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128)
    return fail('idempotencyKey debe ser un string de 8 a 128 caracteres');
  const snapshotId = parseTrimmedString(input.snapshotId, 'snapshotId');
  if (isFailure(snapshotId)) return snapshotId;
  const editionId = parseTrimmedString(input.editionId, 'editionId');
  if (isFailure(editionId)) return editionId;
  if (input.verdict !== 'chosen' && input.verdict !== 'discarded' && input.verdict !== 'pending')
    return fail("verdict debe ser 'chosen', 'discarded' o 'pending'");
  const reasons = parseStringList(input.reasons, 'reasons');
  if (isFailure(reasons)) return reasons;
  if (reasons.length === 0) return fail('una decisión exige sus motivos: reasons no puede estar vacío');
  const conditions: DecisionConditionInput[] = [];
  if (input.conditions !== undefined) {
    if (!Array.isArray(input.conditions)) return fail('conditions debe ser una lista');
    for (const [index, item] of input.conditions.entries()) {
      const parsed = parseConditionInput(item, `conditions[${index}]`);
      if (isFailure(parsed)) return parsed;
      conditions.push(parsed);
    }
  }
  const campaignDraft = parseCampaignInput(input.campaignDraft);
  if (isFailure(campaignDraft)) return campaignDraft;
  return {
    ok: true,
    body: { idempotencyKey, snapshotId, editionId, verdict: input.verdict, reasons, conditions, campaignDraft },
  };
}

export type DecisionReviseParse = { ok: true; body: DecisionReviseBody } | WireParseFailure;

export function parseDecisionReviseBody(input: unknown): DecisionReviseParse {
  if (!isRecord(input)) return fail('cuerpo inválido: se esperaba un objeto JSON');
  const extra = unknownKeys(input, ['idempotencyKey', 'expectedRevision', 'verdict', 'reasons', 'addConditions', 'resolveConditions', 'campaignDraft']);
  if (extra) return extra;
  let idempotencyKey: string | null = null;
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128)
      return fail('idempotencyKey debe ser un string de 8 a 128 caracteres');
    idempotencyKey = input.idempotencyKey;
  }
  if (typeof input.expectedRevision !== 'number' || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    return fail('expectedRevision debe ser un entero ≥ 1: la revisión que la pestaña leyó');
  let verdict: DecisionReviseBody['verdict'] = null;
  if (input.verdict !== undefined && input.verdict !== null) {
    if (input.verdict !== 'chosen' && input.verdict !== 'discarded' && input.verdict !== 'pending')
      return fail("verdict debe ser 'chosen', 'discarded' o 'pending'");
    verdict = input.verdict;
  }
  let reasons: string[] | null = null;
  if (input.reasons !== undefined && input.reasons !== null) {
    const parsed = parseStringList(input.reasons, 'reasons');
    if (isFailure(parsed)) return parsed;
    if (parsed.length === 0) return fail('una revisión con reasons exige motivos no vacíos');
    reasons = parsed;
  }
  const addConditions: DecisionConditionInput[] = [];
  if (input.addConditions !== undefined) {
    if (!Array.isArray(input.addConditions)) return fail('addConditions debe ser una lista');
    for (const [index, item] of input.addConditions.entries()) {
      const parsed = parseConditionInput(item, `addConditions[${index}]`);
      if (isFailure(parsed)) return parsed;
      addConditions.push(parsed);
    }
  }
  const resolveConditions: DecisionReviseBody['resolveConditions'] = [];
  if (input.resolveConditions !== undefined) {
    if (!Array.isArray(input.resolveConditions)) return fail('resolveConditions debe ser una lista');
    for (const [index, item] of input.resolveConditions.entries()) {
      const label = `resolveConditions[${index}]`;
      if (!isRecord(item)) return fail(`${label} debe ser un objeto`);
      const itemExtra = unknownKeys(item, ['conditionId', 'resolvedNote']);
      if (itemExtra) return itemExtra;
      const conditionId = parseTrimmedString(item.conditionId, `${label}.conditionId`);
      if (isFailure(conditionId)) return conditionId;
      const resolvedNote = parseTrimmedString(item.resolvedNote, `${label}.resolvedNote`);
      if (isFailure(resolvedNote)) return resolvedNote;
      resolveConditions.push({ conditionId, resolvedNote });
    }
  }
  const campaignDraft = parseCampaignInput(input.campaignDraft);
  if (isFailure(campaignDraft)) return campaignDraft;
  return {
    ok: true,
    body: { idempotencyKey, expectedRevision: input.expectedRevision, verdict, reasons, addConditions, resolveConditions, campaignDraft },
  };
}
