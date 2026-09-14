// Adaptador de modelo de la comparación (ticket 12). Server-only; corre en el
// worker DESPUÉS de confirmado el snapshot oficial inmutable.
//
// Contrato de autoridad: el modelo recibe SOLO claims seleccionados del
// snapshot y puede (a) proponer un resumen por alternativa y (b) seleccionar
// qué revisiones de claims lo respaldan. No crea hechos publicables, ni score,
// ni rank, ni eligibility, ni condiciones: cualquier campo de ese tipo en su
// salida es dato inesperado sin autoridad y queda registrado como descartado.
// Una cita inexistente o ajena a la alternativa rechaza la salida ENTERA (no se
// filtran ni sustituyen citas); una cifra sin respaldo en los claims citados
// retiene esa propuesta; el texto publicado se compone determinísticamente. Presupuesto acotado: UNA llamada directa a la API con
// timeout; sin tools de discovery. Todo fallo degrada determinísticamente y se
// registra: modelo, versión de prompt, duración, uso disponible y motivo.

import type { ClaimRevision, EvaluationSnapshot } from '../../contracts/evaluation.ts';

export const NARRATIVE_MODEL = 'gemini-2.5-flash';
export const NARRATIVE_PROMPT_VERSION = 'comparison-narrative/3';
const NARRATIVE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${NARRATIVE_MODEL}:generateContent`;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface NarrativeProposal {
  editionId: string;
  summary: string;
  selectedClaimRevisionIds: string[];
  // Propuesta retenida (cifra sin respaldo): se conserva el motivo, no el texto.
  withheldNote: string | null;
}

export interface DiscardedModelOutput {
  attemptedOrdering: boolean;
  attemptedScores: boolean;
  attemptedEligibility: boolean;
  unknownEditionIds: string[];
}

// Registro persistible de la etapa de redacción (payload de
// growthx.snapshot_narratives). Vive SEPARADO del snapshot y nunca lo altera.
export interface ComparisonNarrativeRecord {
  version: 1;
  snapshotId: string;
  status: 'validated' | 'rejected' | 'deterministic_only';
  motive: string | null;
  model: string;
  promptVersion: string;
  durationMs: number;
  usage: { promptTokens: number | null; responseTokens: number | null; totalTokens: number | null } | null;
  proposals: NarrativeProposal[];
  discarded: DiscardedModelOutput | null;
  warnings: string[];
}

export interface ModelAdapterOptions {
  transport?: typeof fetch;
  apiKey?: string | null; // default: process.env.GEMINI_API_KEY
  timeoutMs?: number;
  maxCalls?: number; // presupuesto de llamadas; default 1
  now?: () => number;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          editionId: { type: 'string' },
          summary: { type: 'string' },
          selectedClaimRevisionIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['editionId', 'summary', 'selectedClaimRevisionIds'],
      },
    },
  },
  required: ['proposals'],
} as const;

interface AdmittedClaimView {
  revisionId: string;
  attribute: string;
  status: string;
  rendered: string;
  note: string | null;
}

const renderClaimValue = (claim: ClaimRevision): string => {
  switch (claim.value.kind) {
    case 'text':
      return claim.value.text;
    case 'number':
      return `${claim.value.amount} ${claim.value.unit}`;
    case 'money':
      return `${claim.value.currency} ${claim.value.amount}`;
    case 'date':
      return claim.value.date.precision === 'instant'
        ? `${claim.value.date.iso} · ${claim.value.date.timezone}`
        : claim.value.date.precision === 'date_only'
          ? claim.value.date.date
          : claim.value.date.precision === 'ambiguous'
            ? claim.value.date.text
            : 'date pending';
    case 'location':
      return `${claim.value.name ?? 'pending'} (scope ${claim.value.scope})`;
    case 'pending':
      return `pending${claim.value.note ? `: ${claim.value.note}` : ''}`;
  }
};

// Atributos publicables y sus valores. IDs y forma JSON por sí solos no
// prueban soporte semántico. No admitimos un precio cuyo valor sea una fecha.
function admissibleValue(claim: ClaimRevision): boolean {
  if (claim.status !== 'pending' && claim.status !== 'inferred' && !claim.sourceIds.length) return false;
  const kinds = claim.attribute.startsWith('cost:') ? ['money', 'pending']
    : claim.attribute === 'date' ? ['date', 'pending']
    : claim.attribute === 'location' ? ['location', 'pending']
    : claim.attribute === 'audience' ? ['text', 'number', 'pending']
    : (['access', 'focus', 'stack', 'theme', 'format', 'modality'].includes(claim.attribute) || /^(program:|relationship:|project:.*:(?:technology|technologies|tool|tools|description)$)/.test(claim.attribute)) ? ['text', 'pending']
    : [];
  return kinds.includes(claim.value.kind);
}

// El texto libre del modelo jamás se publica como hecho. Solo selecciona
// revisiones admitidas; el servidor compone atributo, valor y estado juntos.
function factualSummary(cited: AdmittedClaimView[]): string {
  return cited.map(claim => `${claim.attribute} [${claim.status}]: ${claim.rendered}${claim.note ? ` · ${claim.note}` : ''}`).join('; ');
}

// Claims admitidos POR alternativa: los de la edición más los del organizador
// fijado por esa alternativa, siempre dentro de las revisiones del snapshot.
export function admittedClaimsByAlternative(
  snapshot: EvaluationSnapshot,
  claims: ClaimRevision[],
): Map<string, AdmittedClaimView[]> {
  const pinned = claims.filter((claim) => snapshot.claimRevisionIds.includes(claim.id) && admissibleValue(claim));
  const byAlternative = new Map<string, AdmittedClaimView[]>();
  for (const alternative of snapshot.alternatives) {
    const admitted = pinned.filter(
      (claim) =>
        (claim.subject.type === 'edition' && claim.subject.editionId === alternative.editionId) ||
        (alternative.organizerId !== null &&
          claim.subject.type === 'organizer' &&
          claim.subject.organizerId === alternative.organizerId) ||
        (snapshot.decisionReading?.alternatives.find(a => a.editionId === alternative.editionId)?.relevance.basis.some(ref => ref.claimRevisionIds.includes(claim.id)) ?? false),
    );
    byAlternative.set(
      alternative.editionId,
      admitted.map((claim) => ({
        revisionId: claim.id,
        attribute: claim.attribute,
        status: claim.status,
        rendered: `${claim.subject.type === 'edition' && claim.subject.editionId !== alternative.editionId ? `Historical edition ${claim.subject.editionId}: ` : ''}${renderClaimValue(claim)}`,
        note: claim.note,
      })),
    );
  }
  return byAlternative;
}

function buildPrompt(snapshot: EvaluationSnapshot, admitted: Map<string, AdmittedClaimView[]>): string {
  const candidates = snapshot.alternatives.map((alternative) => ({
    editionId: alternative.editionId,
    eligibility: alternative.eligibility.status,
    admittedClaims: admitted.get(alternative.editionId) ?? [],
  }));
  return [
    'You are the optional narrative stage of Growth Atlas over an ALREADY CONFIRMED immutable evaluation snapshot.',
    'Eligibility, conditions, scores and the official ordering were decided by deterministic policy BEFORE this call and are not yours to change or restate differently.',
    '',
    `Candidates with their admitted claim revisions: ${JSON.stringify(candidates)}`,
    '',
    'For each candidate editionId, return a proposal with:',
    '- summary: optional proposed wording for audit only. The server publishes a deterministic composition of selected attributes, values and original statuses; it never publishes your free text.',
    '- selectedClaimRevisionIds: ONLY revision ids listed under that same candidate. Citing anything else (or nothing) voids your whole output server-side.',
    'Activities marked proposed are buyer hypotheses, not published offers. Historical sponsors, prizes, credits or projects never establish prices, success rates, audience totals or commercial return.',
    'Do not return order, rank, score, eligibility or conditions: they carry no authority and are discarded.',
  ].join('\n');
}

interface RawProposal {
  editionId: string;
  summary: string;
  selectedClaimRevisionIds: string[];
}

function parseModelPayload(payload: unknown): {
  proposals: RawProposal[];
  discarded: DiscardedModelOutput;
  usage: ComparisonNarrativeRecord['usage'];
} | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const meta = (payload as { usageMetadata?: Record<string, unknown> }).usageMetadata;
  const usage: ComparisonNarrativeRecord['usage'] = meta
    ? {
        promptTokens: typeof meta.promptTokenCount === 'number' ? meta.promptTokenCount : null,
        responseTokens: typeof meta.candidatesTokenCount === 'number' ? meta.candidatesTokenCount : null,
        totalTokens: typeof meta.totalTokenCount === 'number' ? meta.totalTokenCount : null,
      }
    : null;
  const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') return null;
  let parsed: { proposals?: unknown[] };
  try {
    parsed = JSON.parse(text) as { proposals?: unknown[] };
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.proposals)) return null;
  const discarded: DiscardedModelOutput = {
    attemptedOrdering: false,
    attemptedScores: false,
    attemptedEligibility: false,
    unknownEditionIds: [],
  };
  const rootKeys = Object.keys(parsed as Record<string, unknown>);
  if (rootKeys.some((key) => /order|rank/i.test(key))) discarded.attemptedOrdering = true;
  const proposals: RawProposal[] = [];
  for (const raw of parsed.proposals) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.editionId !== 'string' || typeof item.summary !== 'string') continue;
    // Solo se copian los campos del contrato útil: rank/score/eligibility que
    // el modelo agregue se registran como intento descartado, sin autoridad.
    const keys = Object.keys(item);
    if (keys.some((key) => /rank|order/i.test(key))) discarded.attemptedOrdering = true;
    if (keys.some((key) => /score/i.test(key))) discarded.attemptedScores = true;
    if (keys.some((key) => /elig/i.test(key))) discarded.attemptedEligibility = true;
    proposals.push({
      editionId: item.editionId,
      summary: item.summary,
      selectedClaimRevisionIds: Array.isArray(item.selectedClaimRevisionIds)
        ? item.selectedClaimRevisionIds.filter((id): id is string => typeof id === 'string')
        : [],
    });
  }
  return { proposals, discarded, usage };
}

// Guardia léxica conservadora (misma familia que el ticket 05): todo grupo de
// dígitos del texto libre debe aparecer literal en algún claim citado; si no,
// la propuesta se retiene. No promete verificación semántica.
function unbackedFigure(summary: string, cited: AdmittedClaimView[]): string | null {
  const figures = summary.match(/\d[\d.,]*/g) ?? [];
  const backing = cited.map((claim) => claim.rendered).join(' · ');
  for (const figure of figures) {
    const digits = figure.replace(/[.,]+$/, '');
    if (!backing.includes(digits)) return digits;
  }
  return null;
}

function record(
  snapshotId: string,
  base: Partial<ComparisonNarrativeRecord>,
): ComparisonNarrativeRecord {
  return {
    version: 1,
    snapshotId,
    status: 'deterministic_only',
    motive: null,
    model: NARRATIVE_MODEL,
    promptVersion: NARRATIVE_PROMPT_VERSION,
    durationMs: 0,
    usage: null,
    proposals: [],
    discarded: null,
    warnings: [],
    ...base,
  };
}

// Nunca lanza: cualquier fallo o rechazo llega como registro con motivo. El
// snapshot recibido jamás se modifica.
export async function composeSnapshotNarrative(
  input: { snapshot: EvaluationSnapshot; claims: ClaimRevision[] },
  options: ModelAdapterOptions = {},
): Promise<ComparisonNarrativeRecord> {
  const { snapshot, claims } = input;
  const transport = options.transport ?? fetch;
  const apiKey = options.apiKey !== undefined ? options.apiKey : (process.env.GEMINI_API_KEY ?? null);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxCalls = options.maxCalls ?? 1;
  const now = options.now ?? Date.now;

  if (!apiKey) {
    return record(snapshot.id, {
      motive: 'GEMINI_API_KEY missing: model narrative unavailable; the deterministic explanation remains available.',
    });
  }
  if (snapshot.alternatives.length === 0 || maxCalls < 1) {
    return record(snapshot.id, {
      motive:
        maxCalls < 1
          ? 'Call budget exhausted before drafting; the deterministic explanation remains available.'
          : 'snapshot contains no alternatives: nothing to draft.',
    });
  }

  const admitted = admittedClaimsByAlternative(snapshot, claims);
  const startedAt = now();
  let payload: unknown;
  try {
    // UNA llamada directa a la API (sin tools, sin discovery), con timeout.
    const response = await transport(NARRATIVE_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(snapshot, admitted) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    return record(snapshot.id, {
      durationMs: Math.max(0, now() - startedAt),
      motive: `provider failure (${(error as Error).message}): deterministic fallback; snapshot unchanged.`,
    });
  }
  const durationMs = Math.max(0, now() - startedAt);

  const parsed = parseModelPayload(payload);
  if (!parsed) {
    return record(snapshot.id, {
      durationMs,
      motive: 'Invalid model output (unexpected JSON or structure): deterministic fallback.',
    });
  }
  const { proposals, discarded, usage } = parsed;

  const known = new Set(snapshot.alternatives.map((alternative) => alternative.editionId));
  const kept: RawProposal[] = [];
  for (const proposal of proposals) {
    if (!known.has(proposal.editionId)) {
      // Un candidato desconocido no crea alternativas ni rechaza el resto:
      // queda registrado como intento sin autoridad.
      discarded.unknownEditionIds.push(proposal.editionId);
      continue;
    }
    kept.push(proposal);
  }

  // Validación contra los claims del snapshot: inexistente, ajena o vacía
  // rechaza la salida ENTERA (sin filtrar ni sustituir citas).
  for (const proposal of kept) {
    const ownIds = new Set((admitted.get(proposal.editionId) ?? []).map((claim) => claim.revisionId));
    if (proposal.selectedClaimRevisionIds.length === 0) {
      return record(snapshot.id, {
        status: 'rejected',
        durationMs,
        usage,
        discarded,
        motive: `the proposal for ${proposal.editionId} cites no snapshot claim: entire output rejected.`,
        warnings: ['Model narrative rejected; the official snapshot and its order are unchanged.'],
      });
    }
    const invalid = proposal.selectedClaimRevisionIds.find((id) => !ownIds.has(id));
    if (invalid) {
      const exists = snapshot.claimRevisionIds.includes(invalid);
      return record(snapshot.id, {
        status: 'rejected',
        durationMs,
        usage,
        discarded,
        motive: exists
          ? `the proposal for ${proposal.editionId} cites a revision outside this alternative («${invalid}»): entire output rejected.`
          : `the proposal for ${proposal.editionId} cites a revision absent from the snapshot («${invalid}»): entire output rejected.`,
        warnings: ['Model narrative rejected; the official snapshot and its order are unchanged.'],
      });
    }
  }

  const warnings: string[] = [];
  const validated: NarrativeProposal[] = kept.map((proposal) => {
    const cited = (admitted.get(proposal.editionId) ?? []).filter((claim) =>
      proposal.selectedClaimRevisionIds.includes(claim.revisionId),
    );
    const figure = unbackedFigure(proposal.summary, cited);
    if (figure !== null) {
      warnings.push(
        `Proposal for ${proposal.editionId} withheld: the figure «${figure}» does not appear in any cited claim.`,
      );
      return {
        editionId: proposal.editionId,
        summary: '',
        selectedClaimRevisionIds: proposal.selectedClaimRevisionIds,
        withheldNote: `withheld: the figure «${figure}» is not supported by the cited claims.`,
      };
    }
    return {
      editionId: proposal.editionId,
      summary: factualSummary(cited),
      selectedClaimRevisionIds: proposal.selectedClaimRevisionIds,
      withheldNote: null,
    };
  });

  if (validated.length === 0) {
    return record(snapshot.id, {
      durationMs,
      usage,
      discarded,
      motive: 'the model returned no proposal for snapshot alternatives: deterministic fallback.',
    });
  }
  if (discarded.attemptedOrdering || discarded.attemptedScores || discarded.attemptedEligibility) {
    warnings.push(
      'The model attempted to return ordering, scores, or eligibility: discarded without authority; the official result is unchanged.',
    );
  }

  return record(snapshot.id, {
    status: 'validated',
    durationMs,
    usage,
    proposals: validated,
    discarded,
    warnings,
  });
}
