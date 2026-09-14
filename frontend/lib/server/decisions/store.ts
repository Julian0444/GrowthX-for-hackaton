// Repositorio persistido de decisiones condicionales y su campaña en borrador
// (ticket 13). Server-only, PostgreSQL bajo RLS del tenant.
//
// Sustituye al store en memoria de la Launch Room (§L5): la decisión nueva NO
// tiene consensus ni confidenceDelta — qué tan seguro está el mundo lo dicen
// las evidencias del snapshot, y confirmar repetidamente una condición no suma
// ninguna confianza. Una decisión es un juicio humano REGISTRADO contra un
// snapshot oficial existente (arista 12 → 13): motivos obligatorios,
// condiciones con responsable/plazo si se conocen, autor resuelto por el
// servidor desde la sesión.
//
// Reglas que este repositorio hace estructurales:
// - APPEND-ONLY: cada guardado es una revisión inmutable; PATCH agrega una
//   revisión nueva con la revisión esperada. Obsoleta → conflicto, jamás
//   sobrescritura silenciosa (unique (tenant, decision, revision) decide la
//   carrera entre dos pestañas).
// - Elegir un candidato EXCLUIDO por restricción confirmada no es una
//   operación: corregir el dato exige nueva evidencia y otra evaluación (otro
//   run con otro snapshot), no un click.
// - Elegir con condiciones pendientes del snapshot (acceso, audiencia, costo)
//   se guarda como elección CONDICIONAL: las condiciones del snapshot no
//   cubiertas por la persona se conservan abiertas en la decisión.
// - Decisión y borrador de campaña se confirman en UNA transacción, con clave
//   de idempotencia; explorar primero crea un borrador de investigación,
//   descartar o dejar pendiente sin esa intención no crea ninguna campaña.
// - Registrar una condición o su resolución NO envía ningún mensaje.

import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type {
  BuyerResponse,
  CampaignDraftRecord,
  ClaimRevision,
  DecisionCondition,
  EvaluationDecision,
  EvaluationProfile,
  EvaluationSnapshot,
  MoneyClaim,
  SnapshotAlternative,
} from '../../contracts/evaluation.ts';
import {
  parseCampaignDraft,
  parseClaimRevision,
  parseEvaluationDecision,
  parseEvaluationProfile,
  parseEvaluationSnapshot,
  type ValidationResult,
} from '../../contracts/evaluation-validation.ts';
import { hasAffirmativeSupport } from '../../evidence/claim-support.ts';
import { withTenantTransaction } from '../db/pool.ts';
import { readSnapshotSourceIds } from '../evaluations/snapshot-store.ts';
import type { DecisionCampaignInput, DecisionConditionInput, DecisionReviseBody, DecisionSaveBody } from './wire.ts';

export interface DecisionSessionContext {
  tenantId: string;
  userId: string;
}

// Lectura completa que devuelven guardar, revisar y leer: decisión (última
// revisión), cadena de revisiones conservadas, campaña de la última revisión y
// los ids del snapshot/alternativa — todo revalidado contra el contrato 07.
export interface DecisionReadPayload {
  decision: EvaluationDecision;
  revisions: EvaluationDecision[];
  campaign: CampaignDraftRecord | null;
  decisionId: string;
  snapshotId: string;
  editionId: string;
}

export type SaveDecisionOutcome =
  | { status: 'saved'; read: DecisionReadPayload; deduplicated: boolean }
  | { status: 'snapshot_not_found' }
  | { status: 'invalid'; message: string }
  | { status: 'excluded_conflict'; message: string }
  | { status: 'already_decided'; decisionId: string; currentRevision: number; message: string }
  | { status: 'idempotency_conflict'; message: string };

export type ReviseDecisionOutcome =
  | { status: 'revised'; read: DecisionReadPayload; deduplicated: boolean }
  | { status: 'not_found' }
  | { status: 'invalid'; message: string }
  | { status: 'excluded_conflict'; message: string }
  | { status: 'stale_revision'; currentRevision: number; message: string }
  | { status: 'idempotency_conflict'; message: string };

const EXCLUDED_MESSAGE =
  'An event excluded by a confirmed restriction cannot become a viable choice with a click: correcting the information requires new evidence and reevaluation in a new run and snapshot.';

function mustParse<T>(kind: string, result: ValidationResult<T>): T {
  if (!result.ok) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`${kind} violates the contract: ${detail}`);
  }
  return result.value;
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505' &&
    ((error as { constraint?: string }).constraint === constraint ||
      String((error as { message?: string }).message ?? '').includes(constraint))
  );
}

// Compone la descripción visible de una condición desde sus partes: el dato
// pendiente, la pregunta al organizador y la respuesta esperada quedan
// GUARDADAS en el registro (nada se envía a nadie).
function composeConditionDescription(input: DecisionConditionInput): string {
  let description = input.pendingItem;
  if (input.question) description += ` — Organizer question: ${input.question}`;
  if (input.expectedAnswer) description += ` — Expected answer: ${input.expectedAnswer}`;
  return description;
}

function conditionFromInput(input: DecisionConditionInput): DecisionCondition {
  return {
    id: input.snapshotConditionId ?? `dcond-${randomUUID()}`,
    description: composeConditionDescription(input),
    answerWouldChangeTo: input.effect,
    status: 'open',
    resolvedNote: null,
    owner: input.owner,
    dueBy: input.dueBy,
  };
}

// Elegir con pendientes del snapshot = elección condicional: las condiciones
// de la alternativa que la persona no detalló se conservan abiertas tal cual
// las registró la evaluación (trazables por su id).
function withSnapshotConditions(
  conditions: DecisionCondition[],
  alternative: SnapshotAlternative,
): DecisionCondition[] {
  // Material conditions remain visible even when the human discards an option.
  const present = new Set(conditions.map((condition) => condition.id));
  const inherited = alternative.conditions
    .filter((condition) => !present.has(condition.id))
    .map((condition) => ({
      id: condition.id,
      description: condition.resolution
        ? `${condition.description} — Answer needed to resolve this: ${condition.resolution}`
        : condition.description,
      answerWouldChangeTo: null,
      status: 'open' as const,
      resolvedNote: null,
      owner: null,
      dueBy: null,
    }));
  return [...conditions, ...inherited];
}

function buyerResponse(ctx: DecisionSessionContext, attribution?: {attributedTo: string; support: string; sourceIds: string[]}): BuyerResponse {
  return {attributedTo: attribution?.attributedTo ?? 'Buyer', support: attribution?.support ?? 'Buyer statement only; no external support supplied',
    sourceIds: attribution?.sourceIds ?? [], recordedBy: ctx.userId, recordedAt: new Date().toISOString()};
}

// References must be in this immutable snapshot, not merely guessable IDs in another tenant.
async function validateSupport(client: pg.PoolClient, snapshot: EvaluationSnapshot, campaign: DecisionCampaignInput | null, resolutions: DecisionReviseBody['resolveConditions']): Promise<string | null> {
  if (campaign?.modality?.basis === 'offered' && !campaign.modality.attribution) return 'An offered modality needs attribution and support.';
  const ids = new Set(snapshot.sourceIds ?? []);
  const references = [
    ...resolutions.flatMap(r => r.attribution?.sourceIds ?? []),
    ...(campaign?.modality?.attribution?.sourceIds ?? []),
    ...(campaign?.costItems ?? []).flatMap(c => [...(c.attribution?.sourceIds ?? []), ...(typeof c.amount === 'object' && c.amount !== null && 'sourceIds' in c.amount && Array.isArray(c.amount.sourceIds) ? c.amount.sourceIds : [])]),
    ...(campaign?.commitments ?? []).flatMap(c => c.confirmation?.sourceIds ?? []),
  ];
  if (references.some(id => !ids.has(id))) {
    for (const id of await readSnapshotSourceIds(client, snapshot)) ids.add(id);
  }
  if (references.some(id => typeof id !== 'string' || !ids.has(id))) return 'Support must reference sources from this saved snapshot.';
  return null;
}

// ============ Composición del borrador de campaña ============

function moneyClaimFromCostClaim(claim: ClaimRevision): MoneyClaim {
  if (claim.value.kind === 'money') {
    if (claim.status === 'inferred' || claim.status === 'contradicted') return {
      status: claim.status, amount: claim.value.amount, currency: claim.value.currency,
      sourceIds: claim.sourceIds, basis: claim.method ?? 'method not documented', note: claim.note,
    };
    if (claim.status === 'pending') return { status: 'unknown', note: claim.note ?? 'Amount pending confirmation; this is not a quote' };
    if (hasAffirmativeSupport(claim))
      return { status: 'quoted', amount: claim.value.amount, currency: claim.value.currency, sourceIds: claim.sourceIds };
    return {
      status: 'estimated',
      amount: claim.value.amount,
      currency: claim.value.currency,
      basis: `claim ${claim.status} without a linked source`,
    };
  }
  return {
    status: 'unknown',
    note: claim.value.kind === 'pending' && claim.value.note ? claim.value.note : 'item without known cost; not added as zero',
  };
}

// Compone el CampaignDraftRecord completo (server-side): lo que la persona no
// aportó sale del snapshot y del perfil como pendiente honesto — el objetivo
// provisional queda «por confirmar» (D1), las partidas desconocidas quedan
// unknown (jamás 0) y nada se presenta como acuerdo sin confirmación.
function composeCampaignDraft(args: {
  decisionId: string;
  input: DecisionCampaignInput | null;
  previous: CampaignDraftRecord | null;
  profile: EvaluationProfile;
  conditions: DecisionCondition[];
  editionCostClaims: ClaimRevision[];
  ctx: DecisionSessionContext;
}): CampaignDraftRecord {
  const { decisionId, input, previous, profile, conditions, editionCostClaims, ctx } = args;
  if (input === null && previous !== null) {
    // Revisión sin borrador nuevo: el borrador vigente se confirma tal cual
    // junto a la revisión (misma identidad de campaña).
    return { ...previous, decisionId, openQuestions: [...new Set([...previous.openQuestions.filter(q => !conditions.some(c => c.status === 'resolved' && c.description === q)), ...conditions.filter(c => c.status === 'open').map(c => c.description)])] };
  }
  const objectiveFallback =
    previous?.objective ??
    `${profile.objective.kind}${profile.objective.confirmation === 'provisional' ? ' (provisional brief objective; buyer confirmation pending)' : ''}`;
  const successFallback =
    previous?.successDefinition ??
    (profile.objective.successDefinition.status === 'defined' ? profile.objective.successDefinition.text : null);
  const inheritedCosts = previous?.costItems.filter(item => item.evidence) ?? editionCostClaims.map((claim, index) => ({
    id: `cost-${index + 1}-${randomUUID().slice(0, 8)}`, label: claim.attribute.slice('cost:'.length),
    amount: moneyClaimFromCostClaim(claim), evidence: claim,
  }));
  const costItems = input?.costItems != null
    ? [...inheritedCosts, ...input.costItems.map(item => ({id: `cost-${randomUUID()}`, label: item.label,
        amount: item.amount as MoneyClaim, declaration: buyerResponse(ctx, item.attribution)}))]
    : (previous?.costItems ?? inheritedCosts);
  const openQuestions =
    input?.openQuestions ??
    previous?.openQuestions ??
    conditions.filter((condition) => condition.status === 'open').map((condition) => condition.description);
  return {
    contractVersion: '1',
    id: previous?.id ?? `camp-${randomUUID()}`,
    decisionId,
    objective: input?.objective ?? objectiveFallback,
    ...(input?.owner !== undefined ? {owner: input.owner} : previous?.owner !== undefined ? {owner: previous.owner} : {}),
    successDefinition: input !== null ? input.successDefinition : successFallback,
    modality:
      input?.modality != null
        ? { status: 'defined', kind: input.modality.kind, detail: input.modality.detail, basis: input.modality.basis ?? 'proposed', declaration: buyerResponse(ctx, input.modality.attribution) }
        : (input !== null ? {status:'pending'} : previous?.modality ?? { status: 'pending' }),
    costItems,
    openQuestions: [...new Set([...openQuestions.filter(q => !conditions.some(c => c.status === 'resolved' && c.description === q)), ...conditions.filter(c => c.status === 'open').map(c => c.description)])],
    commitments: (input?.commitments ?? previous?.commitments ?? []).map((commitment, index) => ({
      id: 'id' in commitment && typeof commitment.id === 'string' ? commitment.id : `cmt-${index + 1}-${randomUUID().slice(0, 8)}`,
      description: commitment.description,
      kind: commitment.kind,
      owner: commitment.owner,
      dueBy: commitment.dueBy,
      confirmation: commitment.confirmation,
    })),
  };
}

// ============ Lecturas ============

interface DecisionRow {
  id: string;
  decision_id: string;
  snapshot_id: string;
  edition_id: string;
  revision: number;
  payload: unknown;
  payload_hash: string;
  idempotency_key: string | null;
}

async function readChain(client: pg.PoolClient, decisionId: string): Promise<DecisionRow[]> {
  const { rows } = await client.query(
    `select id, decision_id, snapshot_id, edition_id, revision, payload, payload_hash, idempotency_key
       from growthx.decisions where decision_id = $1 order by revision`,
    [decisionId],
  );
  return rows as DecisionRow[];
}

async function readPayloadFromChain(client: pg.PoolClient, chain: DecisionRow[]): Promise<DecisionReadPayload> {
  const revisions = chain.map((row) => mustParse('EvaluationDecision', parseEvaluationDecision(row.payload)));
  const latest = chain[chain.length - 1];
  const { rows: campaignRows } = await client.query(
    'select payload from growthx.campaign_drafts where decision_revision_id = $1',
    [latest.id],
  );
  const campaign =
    campaignRows.length > 0 ? mustParse('CampaignDraftRecord', parseCampaignDraft(campaignRows[0].payload)) : null;
  return {
    decision: revisions[revisions.length - 1],
    revisions,
    campaign,
    decisionId: latest.decision_id,
    snapshotId: latest.snapshot_id,
    editionId: latest.edition_id,
  };
}

async function readByIdempotencyKey(
  client: pg.PoolClient,
  key: string,
): Promise<{ row: DecisionRow; read: DecisionReadPayload } | null> {
  const { rows } = await client.query(
    `select id, decision_id, snapshot_id, edition_id, revision, payload, payload_hash, idempotency_key
       from growthx.decisions where idempotency_key = $1`,
    [key],
  );
  if (rows.length === 0) return null;
  const row = rows[0] as DecisionRow;
  const chain = await readChain(client, row.decision_id);
  return { row, read: await readPayloadFromChain(client, chain) };
}

async function loadSnapshot(client: pg.PoolClient, snapshotId: string): Promise<EvaluationSnapshot | null> {
  const { rows } = await client.query('select payload from growthx.snapshots where id = $1', [snapshotId]);
  if (rows.length === 0) return null;
  return mustParse('EvaluationSnapshot', parseEvaluationSnapshot(rows[0].payload));
}

async function loadProfile(client: pg.PoolClient, profileId: string): Promise<EvaluationProfile> {
  const { rows } = await client.query('select payload from growthx.profiles where id = $1', [profileId]);
  if (rows.length === 0) throw new Error(`perfil ${profileId} inexistente bajo el tenant`);
  return mustParse('EvaluationProfile', parseEvaluationProfile(rows[0].payload));
}

async function loadEditionCostClaims(
  client: pg.PoolClient,
  snapshot: EvaluationSnapshot,
  editionId: string,
): Promise<ClaimRevision[]> {
  if (snapshot.claimRevisionIds.length === 0) return [];
  const { rows } = await client.query('select payload from growthx.claim_revisions where id = any($1)', [
    snapshot.claimRevisionIds,
  ]);
  return rows
    .map((row) => mustParse('ClaimRevision', parseClaimRevision(row.payload)))
    .filter(
      (claim) =>
        claim.subject.type === 'edition' &&
        claim.subject.editionId === editionId &&
        claim.attribute.startsWith('cost:'),
    )
    .sort((a, b) => (a.attribute < b.attribute ? -1 : a.attribute > b.attribute ? 1 : 0));
}

async function insertRevision(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  decision: EvaluationDecision,
  decisionIdentity: string,
  idempotencyKey: string | null,
  payloadHash: string,
): Promise<void> {
  await client.query(
    `insert into growthx.decisions
       (tenant_id, id, decision_id, snapshot_id, edition_id, revision, previous_revision_id,
        verdict, decided_by, decided_at, contract_version, idempotency_key, payload_hash, payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      tenantId,
      decision.id,
      decisionIdentity,
      decision.snapshotId,
      decision.editionId,
      decision.revision,
      decision.previousRevisionId,
      decision.verdict,
      userId,
      decision.decidedAt,
      decision.contractVersion,
      idempotencyKey,
      payloadHash,
      JSON.stringify(decision),
    ],
  );
}

async function insertCampaign(
  client: pg.PoolClient,
  tenantId: string,
  decisionIdentity: string,
  decisionRevisionId: string,
  campaign: CampaignDraftRecord,
): Promise<void> {
  await client.query(
    `insert into growthx.campaign_drafts (tenant_id, id, decision_id, decision_revision_id, contract_version, payload)
     values ($1, $2, $3, $4, $5, $6)`,
    [tenantId, campaign.id, decisionIdentity, decisionRevisionId, campaign.contractVersion, JSON.stringify(campaign)],
  );
}

// ============ Operaciones ============

// Guarda la PRIMERA decisión sobre una alternativa del snapshot, con su
// borrador de campaña si es una elección, en UNA transacción idempotente.
export async function saveDecision(
  pool: pg.Pool,
  ctx: DecisionSessionContext,
  body: DecisionSaveBody,
): Promise<SaveDecisionOutcome> {
  const payloadHash = hashPayload(body);
  try {
    return await withTenantTransaction(pool, ctx.tenantId, async (client): Promise<SaveDecisionOutcome> => {
      const existingByKey = await readByIdempotencyKey(client, body.idempotencyKey);
      if (existingByKey) {
        if (existingByKey.row.payload_hash === payloadHash)
          return { status: 'saved', read: existingByKey.read, deduplicated: true };
        return {
          status: 'idempotency_conflict',
          message: 'This idempotency key was already used with different content: an edited decision needs another key.',
        };
      }

      const snapshot = await loadSnapshot(client, body.snapshotId);
      if (!snapshot) return { status: 'snapshot_not_found' };
      const alternative = snapshot.alternatives.find((candidate) => candidate.editionId === body.editionId);
      if (!alternative)
        return {
          status: 'invalid',
          message: `the edition «${body.editionId}» is not an alternative in this snapshot: decisions must refer to evaluated options`,
        };
      if (body.verdict === 'chosen' && alternative.eligibility.status === 'excluded')
        return { status: 'excluded_conflict', message: EXCLUDED_MESSAGE };
      if (body.campaignDraft !== null && body.verdict !== 'chosen' && body.intent !== 'explore_first')
        return {
          status: 'invalid',
          message: 'discarding or leaving pending does not create a campaign: a draft accompanies only a chosen option',
        };

      const { rows: existingRows } = await client.query(
        'select decision_id, (select max(revision) from growthx.decisions d2 where d2.decision_id = d.decision_id) as current from growthx.decisions d where snapshot_id = $1 and edition_id = $2 and revision = 1',
        [body.snapshotId, body.editionId],
      );
      if (existingRows.length > 0) {
        return {
          status: 'already_decided',
          decisionId: existingRows[0].decision_id as string,
          currentRevision: Number(existingRows[0].current),
          message:
            'This alternative already has a recorded decision: a correction needs a new revision (PATCH with the expected revision), not another decision.',
        };
      }

      const supportError = await validateSupport(client, snapshot, body.campaignDraft, []);
      if (supportError) return {status: 'invalid', message: supportError};
      if (body.conditions.some(c => c.snapshotConditionId && !alternative.conditions.some(a => a.id === c.snapshotConditionId))) return {status:'invalid', message:'Unknown snapshot condition'};
      const decisionIdentity = randomUUID();
      const conditions = withSnapshotConditions(body.conditions.map(conditionFromInput), alternative);
      const decisionResult = parseEvaluationDecision({
        contractVersion: '1',
        id: randomUUID(),
        snapshotId: body.snapshotId,
        editionId: body.editionId,
        verdict: body.verdict,
        ...(body.intent !== undefined ? {intent: body.intent} : {}),
        reasons: body.reasons,
        conditions,
        decidedBy: { userId: ctx.userId, resolvedBy: 'server_session' },
        decidedAt: new Date().toISOString(),
        revision: 1,
        previousRevisionId: null,
      } satisfies EvaluationDecision);
      if (!decisionResult.ok)
        return {
          status: 'invalid',
          message: decisionResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
        };
      const decision = decisionResult.value;

      let campaign: CampaignDraftRecord | null = null;
      if (body.verdict === 'chosen' || body.intent === 'explore_first') {
        const profile = await loadProfile(client, snapshot.profileId);
        const editionCostClaims = await loadEditionCostClaims(client, snapshot, body.editionId);
        const campaignResult = parseCampaignDraft(
          composeCampaignDraft({
            decisionId: decisionIdentity,
            input: body.campaignDraft,
            previous: null,
            profile,
            conditions,
            editionCostClaims,
            ctx,
          }),
        );
        if (!campaignResult.ok)
          return {
            status: 'invalid',
            message: campaignResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
          };
        campaign = campaignResult.value;
      }

      // Decisión y borrador en LA MISMA transacción: una caída acá no deja una
      // decisión elegida sin campaña (todo o nada).
      await insertRevision(client, ctx.tenantId, ctx.userId, decision, decisionIdentity, body.idempotencyKey, payloadHash);
      if (campaign) await insertCampaign(client, ctx.tenantId, decisionIdentity, decision.id, campaign);

      return {
        status: 'saved',
        read: {
          decision,
          revisions: [decision],
          campaign,
          decisionId: decisionIdentity,
          snapshotId: body.snapshotId,
          editionId: body.editionId,
        },
        deduplicated: false,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'decisions_one_per_alternative')) {
      // Carrera entre dos POST simultáneos: ganó el otro; leemos su resultado.
      return withTenantTransaction(pool, ctx.tenantId, async (client): Promise<SaveDecisionOutcome> => {
        const { rows } = await client.query(
          'select decision_id from growthx.decisions where snapshot_id = $1 and edition_id = $2 and revision = 1',
          [body.snapshotId, body.editionId],
        );
        if (rows.length === 0) throw error;
        const chain = await readChain(client, rows[0].decision_id as string);
        return {
          status: 'already_decided',
          decisionId: rows[0].decision_id as string,
          currentRevision: chain[chain.length - 1].revision,
          message: 'Another tab recorded the decision first: read it and update it using the expected revision.',
        };
      });
    }
    if (isUniqueViolation(error, 'decisions_idempotency')) {
      return withTenantTransaction(pool, ctx.tenantId, async (client): Promise<SaveDecisionOutcome> => {
        const existing = await readByIdempotencyKey(client, body.idempotencyKey);
        if (!existing) throw error;
        if (existing.row.payload_hash === payloadHash) return { status: 'saved', read: existing.read, deduplicated: true };
        return {
          status: 'idempotency_conflict',
          message: 'This idempotency key was already used with different content: an edited decision needs another key.',
        };
      });
    }
    throw error;
  }
}

// Agrega una revisión con control de concurrencia por revisión esperada. Las
// revisiones anteriores se conservan (append-only); resolver una condición ya
// resuelta se rechaza — confirmar repetidamente no suma nada.
export async function reviseDecision(
  pool: pg.Pool,
  ctx: DecisionSessionContext,
  decisionId: string,
  body: DecisionReviseBody,
): Promise<ReviseDecisionOutcome> {
  const payloadHash = hashPayload({ decisionId, ...body });
  try {
    return await withTenantTransaction(pool, ctx.tenantId, async (client): Promise<ReviseDecisionOutcome> => {
      if (body.idempotencyKey) {
        const existingByKey = await readByIdempotencyKey(client, body.idempotencyKey);
        if (existingByKey) {
          if (existingByKey.row.payload_hash === payloadHash)
            return { status: 'revised', read: existingByKey.read, deduplicated: true };
          return {
            status: 'idempotency_conflict',
            message: 'This idempotency key was already used with different content: an edited revision needs another key.',
          };
        }
      }

      const chain = await readChain(client, decisionId);
      if (chain.length === 0) return { status: 'not_found' };
      const latestRow = chain[chain.length - 1];
      const latest = mustParse('EvaluationDecision', parseEvaluationDecision(latestRow.payload));
      if (latest.revision !== body.expectedRevision)
        return {
          status: 'stale_revision',
          currentRevision: latest.revision,
          message: `The decision is already at revision ${latest.revision}: another tab updated it. Read it again before editing; saved reasons are not silently overwritten.`,
        };

      const snapshot = await loadSnapshot(client, latest.snapshotId);
      if (!snapshot) return { status: 'not_found' };
      const alternative = snapshot.alternatives.find((candidate) => candidate.editionId === latest.editionId);
      if (!alternative) return { status: 'not_found' };

      const verdict = body.verdict ?? latest.verdict;
      const intent = body.intent !== undefined ? body.intent : (body.verdict && body.verdict !== latest.verdict ? null : latest.intent);
      if (verdict === 'chosen' && alternative.eligibility.status === 'excluded')
        return { status: 'excluded_conflict', message: EXCLUDED_MESSAGE };
      if (body.campaignDraft !== null && verdict !== 'chosen' && intent !== 'explore_first')
        return {
          status: 'invalid',
          message: 'discarding or leaving pending does not create a campaign: a draft accompanies only a chosen option',
        };

      const supportError = await validateSupport(client, snapshot, body.campaignDraft, body.resolveConditions);
      if (supportError) return {status: 'invalid', message: supportError};
      let conditions: DecisionCondition[] = latest.conditions.map((condition) => ({ ...condition }));
      for (const resolve of body.resolveConditions) {
        const target = conditions.find((condition) => condition.id === resolve.conditionId);
        if (!target)
          return { status: 'invalid', message: `the condition «${resolve.conditionId}» does not exist in this decision` };
        if (target.status === 'resolved')
          return {
            status: 'invalid',
            message: `the condition «${resolve.conditionId}» is already resolved: confirming it again adds nothing (the recorded resolution is preserved)`,
          };
        target.status = 'resolved';
        target.resolvedNote = resolve.resolvedNote;
        target.response = buyerResponse(ctx, resolve.attribution);
      }
      if (body.addConditions.some(c => c.snapshotConditionId && !alternative.conditions.some(a => a.id === c.snapshotConditionId))) return {status:'invalid', message:'Unknown snapshot condition'};
      conditions = withSnapshotConditions([...conditions, ...body.addConditions.map(conditionFromInput)], alternative);

      const decisionResult = parseEvaluationDecision({
        contractVersion: '1',
        id: randomUUID(),
        snapshotId: latest.snapshotId,
        editionId: latest.editionId,
        verdict,
        ...(intent !== undefined ? {intent} : {}),
        reasons: body.reasons ?? latest.reasons,
        conditions,
        decidedBy: { userId: ctx.userId, resolvedBy: 'server_session' },
        decidedAt: new Date().toISOString(),
        revision: latest.revision + 1,
        previousRevisionId: latest.id,
      } satisfies EvaluationDecision);
      if (!decisionResult.ok)
        return {
          status: 'invalid',
          message: decisionResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
        };
      const decision = decisionResult.value;

      let campaign: CampaignDraftRecord | null = null;
      if (verdict === 'chosen' || intent === 'explore_first') {
        const { rows: previousCampaignRows } = await client.query(
          `select payload from growthx.campaign_drafts
            where decision_id = $1
            order by created_at desc, decision_revision_id desc limit 1`,
          [decisionId],
        );
        const previous =
          previousCampaignRows.length > 0
            ? mustParse('CampaignDraftRecord', parseCampaignDraft(previousCampaignRows[0].payload))
            : null;
        const profile = await loadProfile(client, snapshot.profileId);
        const editionCostClaims = await loadEditionCostClaims(client, snapshot, latest.editionId);
        const campaignResult = parseCampaignDraft(
          composeCampaignDraft({
            decisionId,
            input: body.campaignDraft,
            previous,
            profile,
            conditions,
            editionCostClaims,
            ctx,
          }),
        );
        if (!campaignResult.ok)
          return {
            status: 'invalid',
            message: campaignResult.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
          };
        campaign = campaignResult.value;
      }

      await insertRevision(client, ctx.tenantId, ctx.userId, decision, decisionId, body.idempotencyKey, payloadHash);
      if (campaign) await insertCampaign(client, ctx.tenantId, decisionId, decision.id, campaign);

      return {
        status: 'revised',
        read: {
          decision,
          revisions: [...chain.map((row) => mustParse('EvaluationDecision', parseEvaluationDecision(row.payload))), decision],
          campaign,
          decisionId,
          snapshotId: latest.snapshotId,
          editionId: latest.editionId,
        },
        deduplicated: false,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error, 'decisions_tenant_id_decision_id_revision_key') || isUniqueViolation(error, 'decisions_tenant_id_decision_id_previous_revision_id_key') || isUniqueViolation(error, 'decisions_idempotency')) {
      // Dos pestañas revisaron a la vez con la misma revisión esperada: una
      // ganó; esta recibe conflicto en vez de sobrescribir en silencio.
      return withTenantTransaction(pool, ctx.tenantId, async (client): Promise<ReviseDecisionOutcome> => {
        if (body.idempotencyKey) {
          const existing = await readByIdempotencyKey(client, body.idempotencyKey);
          if (existing && existing.row.payload_hash === payloadHash) return {status:'revised', read:existing.read, deduplicated:true};
          if (existing) return {status:'idempotency_conflict', message:'Idempotency key already used with different content'};
        }
        const chain = await readChain(client, decisionId);
        if (chain.length === 0) throw error;
        return {
          status: 'stale_revision',
          currentRevision: chain[chain.length - 1].revision,
          message: 'Another tab recorded its revision first: read the decision again before editing.',
        };
      });
    }
    throw error;
  }
}

// Lectura persistida y autorizada: sustituye la lectura en memoria de la
// Launch Room para este recorrido. null = no existe bajo este tenant (la ruta
// responde 404 sin confirmar existencia ajena).
export async function readDecision(
  pool: pg.Pool,
  tenantId: string,
  decisionId: string,
  revision?: number,
): Promise<DecisionReadPayload | null> {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const all = await readChain(client, decisionId);
    const chain = revision === undefined ? all : all.filter(row => row.revision <= revision);
    if (chain.length === 0 || (revision !== undefined && chain.at(-1)?.revision !== revision)) return null;
    return readPayloadFromChain(client, chain);
  });
}

// Decisiones registradas contra un snapshot (una por alternativa decidida):
// permite que el panel recupere el estado de decisión al reabrir el run.
export async function readDecisionsBySnapshot(
  pool: pg.Pool,
  tenantId: string,
  snapshotId: string,
): Promise<DecisionReadPayload[]> {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      'select distinct decision_id from growthx.decisions where snapshot_id = $1',
      [snapshotId],
    );
    const reads: DecisionReadPayload[] = [];
    for (const row of rows as { decision_id: string }[]) {
      const chain = await readChain(client, row.decision_id);
      if (chain.length > 0) reads.push(await readPayloadFromChain(client, chain));
    }
    return reads.sort((a, b) => (a.editionId < b.editionId ? -1 : a.editionId > b.editionId ? 1 : 0));
  });
}
