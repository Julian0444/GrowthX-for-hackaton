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

import type { DecisionConditionInput, DecisionCampaignInput, DecisionSaveBody, DecisionReviseBody } from '../../contracts/decision.ts';
export type { DecisionConditionInput, DecisionCampaignInput, DecisionSaveBody, DecisionReviseBody } from '../../contracts/decision.ts';

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
      `unsupported keys: ${resolved.join(', ')} — the server resolves author and tenant from the session; consensus and confidence are not fields of a persisted decision`,
    );
  return fail(`unsupported body keys: ${extra.join(', ')}`);
}

function parseTrimmedString(value: unknown, label: string): string | WireParseFailure {
  if (typeof value !== 'string' || value.trim().length === 0) return fail(`${label} must be a nonempty string`);
  return value.trim();
}

function parseNullableString(value: unknown, label: string): string | null | WireParseFailure {
  if (value === null || value === undefined) return null;
  return parseTrimmedString(value, label);
}

function parseStringList(value: unknown, label: string): string[] | WireParseFailure {
  if (!Array.isArray(value)) return fail(`${label} must be a list of strings`);
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0) return fail(`${label} contains an empty or non-string value`);
    items.push(item.trim());
  }
  return items;
}

function isFailure(value: unknown): value is WireParseFailure {
  return isRecord(value) && value.ok === false && typeof value.error === 'string';
}

function parseConditionInput(value: unknown, label: string): DecisionConditionInput | WireParseFailure {
  if (!isRecord(value)) return fail(`${label} must be an object`);
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
    return fail(`${label}.effect must be 'chosen', 'discarded', or null`);
  return { snapshotConditionId, pendingItem, question, expectedAnswer, effect, owner, dueBy };
}

function parseAttribution(value: unknown): {attributedTo: string; support: string; sourceIds: string[]} | undefined | WireParseFailure {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return fail('attribution must be an object');
  const extra = unknownKeys(value, ['attributedTo', 'support', 'sourceIds']);
  if (extra) return extra;
  const attributedTo = parseTrimmedString(value.attributedTo, 'attributedTo');
  if (isFailure(attributedTo)) return attributedTo;
  const support = parseTrimmedString(value.support, 'support');
  if (isFailure(support)) return support;
  const sourceIds = parseStringList(value.sourceIds ?? [], 'sourceIds');
  if (isFailure(sourceIds)) return sourceIds;
  return { attributedTo, support, sourceIds };
}

function parseCampaignInput(value: unknown): DecisionCampaignInput | null | WireParseFailure {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return fail('campaignDraft must be an object or null');
  const extra = unknownKeys(value, ['objective', 'owner', 'successDefinition', 'modality', 'costItems', 'openQuestions', 'commitments']);
  if (extra) return extra;

  const owner = parseNullableString(value.owner, 'campaignDraft.owner');
  if (isFailure(owner)) return owner;
  const objective = parseNullableString(value.objective, 'campaignDraft.objective');
  if (isFailure(objective)) return objective;
  const successDefinition = parseNullableString(value.successDefinition, 'campaignDraft.successDefinition');
  if (isFailure(successDefinition)) return successDefinition;

  let modality: DecisionCampaignInput['modality'] = null;
  if (value.modality !== null && value.modality !== undefined) {
    if (!isRecord(value.modality)) return fail('campaignDraft.modality must be an object or null');
    const modalityExtra = unknownKeys(value.modality, ['kind', 'detail', 'basis', 'attribution']);
    if (modalityExtra) return modalityExtra;
    const kind = value.modality.kind;
    if (kind !== 'sponsorship' && kind !== 'workshop' && kind !== 'co_hosted' && kind !== 'booth' && kind !== 'other')
      return fail('campaignDraft.modality.kind no admitido');
    const detail = parseNullableString(value.modality.detail, 'campaignDraft.modality.detail');
    if (isFailure(detail)) return detail;
    if (value.modality.basis !== undefined && value.modality.basis !== 'proposed' && value.modality.basis !== 'offered') return fail('invalid modality basis');
    const attribution = parseAttribution(value.modality.attribution);
    if (isFailure(attribution)) return attribution;
    if (value.modality.basis === 'offered' && !attribution) return fail('an offered modality needs attribution and support');
    modality = { kind, detail, ...(value.modality.basis ? {basis: value.modality.basis} : {}), ...(attribution ? {attribution} : {}) };
  }

  let costItems: DecisionCampaignInput['costItems'] = null;
  if (value.costItems !== null && value.costItems !== undefined) {
    if (!Array.isArray(value.costItems)) return fail('campaignDraft.costItems must be a list or null');
    costItems = [];
    for (const [index, item] of value.costItems.entries()) {
      if (!isRecord(item)) return fail(`campaignDraft.costItems[${index}] must be an object`);
      const itemExtra = unknownKeys(item, ['label', 'amount', 'attribution']);
      if (itemExtra) return itemExtra;
      const label = parseTrimmedString(item.label, `campaignDraft.costItems[${index}].label`);
      if (isFailure(label)) return label;
      // La forma del MoneyClaim (quoted/estimated/unknown; jamás un faltante
      // como 0) la valida el contrato al componer el registro.
      const attribution = parseAttribution(item.attribution);
      if (isFailure(attribution)) return attribution;
      costItems.push({ label, amount: item.amount, ...(attribution ? {attribution} : {}) });
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
    if (!Array.isArray(value.commitments)) return fail('campaignDraft.commitments must be a list');
    for (const [index, item] of value.commitments.entries()) {
      const label = `campaignDraft.commitments[${index}]`;
      if (!isRecord(item)) return fail(`${label} must be an object`);
      const itemExtra = unknownKeys(item, ['description', 'kind', 'owner', 'dueBy', 'confirmation']);
      if (itemExtra) return itemExtra;
      const description = parseTrimmedString(item.description, `${label}.description`);
      if (isFailure(description)) return description;
      if (item.kind !== 'estimate' && item.kind !== 'goal' && item.kind !== 'agreed')
        return fail(`${label}.kind must be 'estimate', 'goal', or 'agreed'`);
      const owner = parseNullableString(item.owner, `${label}.owner`);
      if (isFailure(owner)) return owner;
      const dueBy = parseNullableString(item.dueBy, `${label}.dueBy`);
      if (isFailure(dueBy)) return dueBy;
      let confirmation: (typeof commitments)[number]['confirmation'] = null;
      if (item.confirmation !== null && item.confirmation !== undefined) {
        if (!isRecord(item.confirmation)) return fail(`${label}.confirmation must be an object or null`);
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

  return { objective, ...(value.owner !== undefined ? {owner} : {}), successDefinition, modality, costItems, openQuestions, commitments };
}

export type DecisionSaveParse = { ok: true; body: DecisionSaveBody } | WireParseFailure;

export function parseDecisionSaveBody(input: unknown): DecisionSaveParse {
  if (!isRecord(input)) return fail('invalid body: expected a JSON object');
  const extra = unknownKeys(input, ['idempotencyKey', 'snapshotId', 'editionId', 'verdict', 'intent', 'reasons', 'conditions', 'campaignDraft']);
  if (extra) return extra;
  const idempotencyKey = input.idempotencyKey;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128)
    return fail('idempotencyKey must be a string of 8 to 128 characters');
  const snapshotId = parseTrimmedString(input.snapshotId, 'snapshotId');
  if (isFailure(snapshotId)) return snapshotId;
  const editionId = parseTrimmedString(input.editionId, 'editionId');
  if (isFailure(editionId)) return editionId;
  if (input.verdict !== 'chosen' && input.verdict !== 'discarded' && input.verdict !== 'pending')
    return fail("verdict must be 'chosen', 'discarded', or 'pending'");
  if (input.intent !== undefined && input.intent !== null && input.intent !== 'explore_first') return fail('invalid decision intent');
  const reasons = parseStringList(input.reasons, 'reasons');
  if (isFailure(reasons)) return reasons;
  if (reasons.length === 0) return fail('a decision requires reasons: reasons cannot be empty');
  const conditions: DecisionConditionInput[] = [];
  if (input.conditions !== undefined) {
    if (!Array.isArray(input.conditions)) return fail('conditions must be a list');
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
    body: { idempotencyKey, snapshotId, editionId, verdict: input.verdict, ...(input.intent !== undefined ? {intent: input.intent as 'explore_first' | null} : {}), reasons, conditions, campaignDraft },
  };
}

export type DecisionReviseParse = { ok: true; body: DecisionReviseBody } | WireParseFailure;

export function parseDecisionReviseBody(input: unknown): DecisionReviseParse {
  if (!isRecord(input)) return fail('invalid body: expected a JSON object');
  const extra = unknownKeys(input, ['idempotencyKey', 'expectedRevision', 'verdict', 'intent', 'reasons', 'addConditions', 'resolveConditions', 'campaignDraft']);
  if (extra) return extra;
  let idempotencyKey: string | null = null;
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128)
      return fail('idempotencyKey must be a string of 8 to 128 characters');
    idempotencyKey = input.idempotencyKey;
  }
  if (typeof input.expectedRevision !== 'number' || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    return fail('expectedRevision must be an integer ≥ 1: the revision read by this tab');
  let verdict: DecisionReviseBody['verdict'] = null;
  if (input.verdict !== undefined && input.verdict !== null) {
    if (input.verdict !== 'chosen' && input.verdict !== 'discarded' && input.verdict !== 'pending')
      return fail("verdict must be 'chosen', 'discarded', or 'pending'");
    verdict = input.verdict;
  }
  if (input.intent !== undefined && input.intent !== null && input.intent !== 'explore_first') return fail('invalid decision intent');
  let reasons: string[] | null = null;
  if (input.reasons !== undefined && input.reasons !== null) {
    const parsed = parseStringList(input.reasons, 'reasons');
    if (isFailure(parsed)) return parsed;
    if (parsed.length === 0) return fail('a revision with reasons requires nonempty reasons');
    reasons = parsed;
  }
  const addConditions: DecisionConditionInput[] = [];
  if (input.addConditions !== undefined) {
    if (!Array.isArray(input.addConditions)) return fail('addConditions must be a list');
    for (const [index, item] of input.addConditions.entries()) {
      const parsed = parseConditionInput(item, `addConditions[${index}]`);
      if (isFailure(parsed)) return parsed;
      addConditions.push(parsed);
    }
  }
  const resolveConditions: DecisionReviseBody['resolveConditions'] = [];
  if (input.resolveConditions !== undefined) {
    if (!Array.isArray(input.resolveConditions)) return fail('resolveConditions must be a list');
    for (const [index, item] of input.resolveConditions.entries()) {
      const label = `resolveConditions[${index}]`;
      if (!isRecord(item)) return fail(`${label} must be an object`);
      const itemExtra = unknownKeys(item, ['conditionId', 'resolvedNote', 'attribution']);
      if (itemExtra) return itemExtra;
      const conditionId = parseTrimmedString(item.conditionId, `${label}.conditionId`);
      if (isFailure(conditionId)) return conditionId;
      const resolvedNote = parseTrimmedString(item.resolvedNote, `${label}.resolvedNote`);
      if (isFailure(resolvedNote)) return resolvedNote;
      const attribution = parseAttribution(item.attribution);
      if (isFailure(attribution)) return attribution;
      resolveConditions.push({ conditionId, resolvedNote, ...(attribution ? {attribution} : {}) });
    }
  }
  const campaignDraft = parseCampaignInput(input.campaignDraft);
  if (isFailure(campaignDraft)) return campaignDraft;
  return {
    ok: true,
    body: { idempotencyKey, expectedRevision: input.expectedRevision, verdict, ...(input.intent !== undefined ? {intent: input.intent as 'explore_first' | null} : {}), reasons, addConditions, resolveConditions, campaignDraft },
  };
}
