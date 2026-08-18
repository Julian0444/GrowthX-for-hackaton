// Gemini decision engine: convierte el ranking determinístico + evidencia
// (Trends/GitHub/X vía Apify + eventos live de Exa) en una decisión explicable:
// headline, reasoning citando evidencia real y copy de campaña, todo vía
// structured output (responseSchema). Degradación: sin GEMINI_API_KEY o ante
// fallo, devuelve la respuesta original con un warning. Nunca lanza.

import type {
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
          rank: { type: 'integer' },
          headline: { type: 'string' },
          reasoning: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          campaignVariantA: { type: 'string' },
          campaignVariantB: { type: 'string' },
        },
        required: ['id', 'rank', 'headline', 'reasoning', 'evidenceIds'],
      },
    },
  },
  required: ['decisions'],
} as const;

interface GeminiDecision {
  id: string;
  rank: number;
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
    'For EACH candidate id, decide where this budget activates the most developers. Return decisions with:',
    '- rank: 1 = best market for this specific product/budget/goal.',
    '- headline: one imperative line (<120 chars) naming the concrete play in that city.',
    '- reasoning: 2-3 sentences (<320 chars) grounded ONLY in the provided signals/evidence. Weigh audience fit, momentum, sponsor competition and cost efficiency vs an SF-default spend. Never invent facts.',
    '- evidenceIds: the ids from the provided evidence that support your reasoning (only ids that were given).',
    '- campaignVariantA / campaignVariantB: two short outreach copy variants (<300 chars) tailored to that city and product.',
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
      decisions.push({
        id: item.id,
        rank: typeof item.rank === 'number' ? item.rank : 99,
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

function applyDecision(
  opportunity: Opportunity,
  decision: GeminiDecision,
  knownEvidence: Set<string>,
): Opportunity {
  const cited = decision.evidenceIds.filter((id) => knownEvidence.has(id));
  const fallback = opportunity.reasons.flatMap((reason) => reason.evidenceIds);
  const evidenceIds = cited.length > 0 ? cited : fallback;
  if (evidenceIds.length === 0) return opportunity;
  return {
    ...opportunity,
    play: { ...opportunity.play, headline: compact(decision.headline, 160) },
    reasons: [
      { text: compact(decision.reasoning, 340), evidenceIds },
      ...opportunity.reasons,
    ],
    campaign: {
      ...opportunity.campaign,
      variantA: decision.campaignVariantA
        ? compact(decision.campaignVariantA, 320)
        : opportunity.campaign.variantA,
      variantB: decision.campaignVariantB
        ? compact(decision.campaignVariantB, 320)
        : opportunity.campaign.variantB,
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

    const byId = new Map(decisions.map((decision) => [decision.id, decision]));
    const knownEvidence = new Set(Object.keys(response.evidence));
    const opportunities = response.opportunities
      .map((opportunity) => {
        const decision = byId.get(opportunity.id);
        return decision ? applyDecision(opportunity, decision, knownEvidence) : opportunity;
      })
      .sort((a, b) => (byId.get(a.id)?.rank ?? 99) - (byId.get(b.id)?.rank ?? 99));

    return { ...response, opportunities };
  } catch {
    return {
      ...response,
      warnings: [
        ...response.warnings,
        'Gemini reasoning temporarily unavailable; showing the deterministic signal ranking.',
      ],
    };
  }
}
