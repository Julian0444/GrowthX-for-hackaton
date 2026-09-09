// Redacción con Gemini sobre el snapshot determinístico (ticket 05). El modelo
// NO tiene autoridad sobre hechos publicables: la razón factual visible sigue
// siendo la explicación determinística (hechos admitidos compuestos por
// plantillas). El modelo solo puede SELECCIONAR hechos citando evidencia ya
// admitida por la misma oportunidad, y proponer titular/copy de campaña sin
// cifras propias. Una decisión con cita inexistente, ajena o ausente se
// rechaza ENTERA: se recupera la explicación determinística respaldada con
// advertencia visible; jamás se «arreglan» las citas de una narrativa fallida.
// Degradación: sin GEMINI_API_KEY, ante fallo del proveedor, JSON inválido o
// rechazo total, devuelve la respuesta original con warning y estado de
// redacción explícito. Nunca lanza y nunca cambia score ni elegibilidad.
// El orden tampoco es del modelo (ticket 06, oráculo O5): el array llega en el
// orden oficial del scorer (con su desempate determinístico) y la redacción se
// aplica por id posición a posición, sin reordenar jamás. Un `rank` o `score`
// que el modelo devuelva es dato inesperado sin autoridad.

import type {
  NarrativeState,
  Opportunity,
  SearchRequest,
  SearchResponse,
} from '@/lib/contracts/growxth';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 20000;

function compact(value: string, max = 320): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          headline: { type: 'string' },
          reasoning: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          campaignVariantA: { type: 'string' },
          campaignVariantB: { type: 'string' },
        },
        required: ['id', 'headline', 'reasoning', 'evidenceIds'],
      },
    },
  },
  required: ['decisions'],
} as const;

interface GeminiDecision {
  id: string;
  headline: string;
  reasoning: string;
  evidenceIds: string[];
  campaignVariantA?: string;
  campaignVariantB?: string;
}

function buildPrompt(request: SearchRequest, response: SearchResponse): string {
  const markets = response.opportunities.map((opportunity) => ({
    id: opportunity.id,
    market: opportunity.market ?? { city: opportunity.title, country: '', countryCode: '' },
    deterministicScore: opportunity.score,
    evidenceConfidence: opportunity.confidence,
    signals: opportunity.reasons.map((reason) => reason.text),
    evidence: opportunity.reasons
      .flatMap((reason) => reason.evidenceIds)
      .filter((id, i, all) => all.indexOf(id) === i)
      .map((id) => {
        const item = response.evidence[id];
        return item
          ? { id, source: item.source, title: item.title, location: item.location, excerpt: item.excerpt ?? null }
          : null;
      })
      .filter(Boolean),
  }));

  return [
    'You are Growth Atlas, a decision engine for developer-marketing spend.',
    'A team described their product and budget; live market signals were collected (Google Trends, GitHub, X via Apify) and live event listings were discovered with Exa.',
    '',
    `Team input: product="${compact(request.product || 'developer product', 120)}", stack=${JSON.stringify(request.icpStack.slice(0, 4))}, budgetUsd=${request.budgetUsd || 'unknown'}, goal=${request.goal}.`,
    '',
    `Candidate markets with signals and evidence: ${JSON.stringify(markets)}`,
    '',
    'For EACH candidate id, write the decision narrative for activating developers with this budget in that market. The ordering of markets is already decided by the deterministic scorer and is not yours to change. Return decisions with:',
    '- headline: one imperative line (<120 chars) naming the concrete play in that city.',
    '- reasoning: 2-3 sentences (<320 chars) grounded ONLY in the provided signals/evidence. Weigh audience fit, momentum, sponsor competition and cost efficiency vs an SF-default spend. Never invent facts.',
    '- evidenceIds: ONLY ids listed under that same candidate. Citing anything else (or nothing) voids the whole decision server-side.',
    '- campaignVariantA / campaignVariantB: two short outreach copy variants (<300 chars) tailored to that city and product. Do not include numbers, prices or attendance figures: unbacked figures make the proposal be withheld.',
  ].join('\n');
}

function parseDecisions(payload: unknown): GeminiDecision[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') return [];
  try {
    const parsed = JSON.parse(text) as { decisions?: unknown[] };
    const decisions: GeminiDecision[] = [];
    for (const raw of parsed.decisions ?? []) {
      if (typeof raw !== 'object' || raw === null) continue;
      const item = raw as Record<string, unknown>;
      if (typeof item.id !== 'string' || typeof item.headline !== 'string' || typeof item.reasoning !== 'string') {
        continue;
      }
      // Solo se copian los campos del contrato útil: cualquier otro dato que
      // el modelo agregue (un rank, un score) se descarta sin autoridad.
      decisions.push({
        id: item.id,
        headline: item.headline,
        reasoning: item.reasoning,
        evidenceIds: Array.isArray(item.evidenceIds)
          ? item.evidenceIds.filter((id): id is string => typeof id === 'string')
          : [],
        campaignVariantA: typeof item.campaignVariantA === 'string' ? item.campaignVariantA : undefined,
        campaignVariantB: typeof item.campaignVariantB === 'string' ? item.campaignVariantB : undefined,
      });
    }
    return decisions;
  } catch {
    return [];
  }
}

// Hechos admitidos de una oportunidad: la evidencia citada por su explicación
// determinística. La redacción solo puede seleccionar dentro de ese conjunto.
function admittedEvidenceIds(opportunity: Opportunity): Set<string> {
  return new Set(opportunity.reasons.flatMap((reason) => reason.evidenceIds));
}

// Guardia conservadora sobre propuestas de acción (titular / copy de campaña):
// una cifra (número, %, moneda) en texto libre del modelo es un hecho
// cuantificado —costo, audiencia, compromiso— que ningún hecho admitido
// respalda, así que la propuesta se retiene. Deliberadamente estricta: no
// promete verificación semántica.
const UNBACKED_FIGURE = /[0-9%$€£]/;

interface DecisionReview {
  status: 'validated' | 'rejected';
  motive: string | null;
  selectedEvidenceIds: string[];
}

// Contrato de salida del ticket 05: los hechos publicables se limitan a
// atributos admitidos y a referencias que los respaldan. Que un id exista no
// demuestra que respalde el texto: por eso el texto libre del modelo nunca se
// publica como razón (ver applyValidatedDecision) y acá solo se valida que la
// SELECCIÓN de evidencia sea admitida. Cualquier cita inválida rechaza la
// decisión completa, sin filtrar ni sustituir citas.
function reviewDecision(
  decision: GeminiDecision,
  opportunity: Opportunity,
  knownEvidence: Set<string>,
): DecisionReview {
  const cited = [...new Set(decision.evidenceIds)];
  if (cited.length === 0) {
    return { status: 'rejected', motive: 'the narrative cites no evidence', selectedEvidenceIds: [] };
  }
  const unknown = cited.find((id) => !knownEvidence.has(id));
  if (unknown) {
    return {
      status: 'rejected',
      motive: `the narrative cites evidence that does not exist ("${unknown}")`,
      selectedEvidenceIds: [],
    };
  }
  const admitted = admittedEvidenceIds(opportunity);
  const foreign = cited.find((id) => !admitted.has(id));
  if (foreign) {
    return {
      status: 'rejected',
      motive: `the narrative cites evidence that does not back this candidate ("${foreign}")`,
      selectedEvidenceIds: [],
    };
  }
  return { status: 'validated', motive: null, selectedEvidenceIds: cited };
}

function withNarrative(opportunity: Opportunity, narrative: NarrativeState): Opportunity {
  return { ...opportunity, narrative };
}

function deterministicOnly(opportunity: Opportunity, note: string): Opportunity {
  return withNarrative(opportunity, { status: 'deterministic_only', note, selectedEvidenceIds: [] });
}

// Rechazo = recuperación COMPLETA de la explicación determinística respaldada:
// no se publica nada de la decisión (ni razón, ni titular, ni campaña).
function rejectDecision(opportunity: Opportunity, motive: string): Opportunity {
  return withNarrative(opportunity, { status: 'rejected', note: motive, selectedEvidenceIds: [] });
}

// Una decisión validada tampoco publica el texto libre del modelo como razón:
// los hechos visibles siguen siendo las razones determinísticas. El modelo
// aporta su selección de hechos (registrada en narrative) y propuestas de
// acción, retenidas si cargan cifras que ningún hecho admitido respalda.
function applyValidatedDecision(
  opportunity: Opportunity,
  decision: GeminiDecision,
  selectedEvidenceIds: string[],
): Opportunity {
  const withheld: string[] = [];
  const propose = (label: string, text: string | undefined, max: number, fallback: string): string => {
    if (!text) return fallback;
    if (UNBACKED_FIGURE.test(text)) {
      withheld.push(label);
      return fallback;
    }
    return compact(text, max);
  };
  const headline = propose('headline', decision.headline, 160, opportunity.play.headline);
  const variantA = propose('campaign variant A', decision.campaignVariantA, 320, opportunity.campaign.variantA);
  const variantB = propose('campaign variant B', decision.campaignVariantB, 320, opportunity.campaign.variantB);
  return {
    ...opportunity,
    play: { ...opportunity.play, headline },
    campaign: { ...opportunity.campaign, variantA, variantB },
    narrative: {
      status: 'validated',
      note:
        withheld.length > 0
          ? `Action proposals withheld for carrying figures no admitted fact backs: ${withheld.join(', ')}.`
          : null,
      selectedEvidenceIds,
    },
  };
}

export async function reasonWithGemini(
  request: SearchRequest,
  response: SearchResponse,
): Promise<SearchResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ...response,
      opportunities: response.opportunities.map((opportunity) =>
        deterministicOnly(opportunity, 'Model narrative unavailable (GEMINI_API_KEY missing); deterministic explanation only.'),
      ),
      warnings: [
        ...response.warnings,
        'Gemini reasoning unavailable (GEMINI_API_KEY missing); showing the deterministic signal ranking only.',
      ],
    };
  }
  if (response.opportunities.length === 0) return response;

  try {
    const geminiResponse = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(request, response) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!geminiResponse.ok) throw new Error(`Gemini ${geminiResponse.status}`);
    const decisions = parseDecisions(await geminiResponse.json());
    if (decisions.length === 0) throw new Error('Gemini returned no usable decisions');

    // La respuesta se aplica POR ID sobre el array oficial: una decisión
    // repetida sobreescribe la anterior (última gana) sin duplicar la
    // oportunidad, y una decisión para un id no evaluado nunca crea una.
    const byId = new Map(decisions.map((decision) => [decision.id, decision]));
    const knownEvidence = new Set(Object.keys(response.evidence));
    const warnings = [...response.warnings];
    let validated = 0;
    const reviewed = response.opportunities.map((opportunity) => {
      const decision = byId.get(opportunity.id);
      if (!decision) {
        return deterministicOnly(opportunity, 'The model returned no decision for this candidate; deterministic explanation only.');
      }
      const review = reviewDecision(decision, opportunity, knownEvidence);
      if (review.status === 'rejected') {
        warnings.push(
          `Model narrative for ${opportunity.id} was rejected (${review.motive}); the full deterministic evidence-backed explanation is shown instead.`,
        );
        return rejectDecision(opportunity, review.motive ?? 'unsupported narrative');
      }
      validated += 1;
      return applyValidatedDecision(opportunity, decision, review.selectedEvidenceIds);
    });

    // Ninguna decisión validada = el modelo no aportó nada publicable (también
    // cubre una descripción con instrucciones de ignorar la evidencia que el
    // modelo haya obedecido): degradación explícita sin tocar orden ni
    // elegibilidad.
    if (validated === 0) {
      return {
        ...response,
        opportunities: reviewed,
        warnings: [
          ...warnings,
          'Gemini narrative rejected for every candidate; keeping the deterministic ranking and its evidence-backed explanations.',
        ],
      };
    }

    // Orden oficial intacto (ticket 06): `reviewed` conserva posición a
    // posición el array del scorer; la redacción validada solo cambió
    // titular/campaña/narrative de cada id, nunca el orden ni los scores.
    return { ...response, opportunities: reviewed, warnings };
  } catch {
    return {
      ...response,
      opportunities: response.opportunities.map((opportunity) =>
        deterministicOnly(opportunity, 'Model narrative unavailable (provider failure or invalid output); deterministic explanation only.'),
      ),
      warnings: [
        ...response.warnings,
        'Gemini reasoning temporarily unavailable; showing the deterministic signal ranking.',
      ],
    };
  }
}
