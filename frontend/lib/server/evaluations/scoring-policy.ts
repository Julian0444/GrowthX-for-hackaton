// Política de scoring versionada y features de la comparación (ticket 12).
//
// El scorer es DETERMINÍSTICO y solo corre con una política aplicable: produce
// orden, desempate, S_known (0-100 sobre dimensiones activas), Q (fracción del
// peso con dato conocido) y sensibilidad a faltantes. Sin política aplicable no
// hay ranking numérico: la comparación se persiste factual con «política
// pendiente» (D2). Un dato ausente es null con su razón, NUNCA 0.
//
// DECISIÓN ABIERTA D2: no existe ninguna política comercial aprobada. Por eso
// `approvedPolicyFor` devuelve null para todo objetivo, y las políticas de test
// se declaran `approval: 'test_only'` — sus pesos no se despliegan como
// política comercial ni habilitan publicar un ranking de inversión.

import type { ClaimRevision, EvaluationProfile, ObjectiveKind } from '../../contracts/evaluation.ts';
import type { EditionDossierRead } from '../catalog/read.ts';
import { activeWeightFraction, clamp01, weightedScore } from '../scoring/score-utils.ts';

// ============ Features (features/1) ============

export const FEATURE_SET_VERSION = 'features/1';

// Un feature usado por el scorer: valor null = no computable, con la razón del
// dato ausente persistida junto al snapshot (criterio del ticket).
export interface FeatureValue {
  key: FeatureKey;
  value: number | null;
  missingReason: string | null;
  claimRevisionIds: string[];
  note: string | null;
}

export type FeatureKey = 'audience_fit' | 'access_documented' | 'cost_fit';

const FEATURE_KEYS: FeatureKey[] = ['audience_fit', 'access_documented', 'cost_fit'];

const STOPWORDS = new Set(['de', 'la', 'el', 'en', 'the', 'for', 'and', 'con', 'para', 'una', 'los', 'del']);
const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.-]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

const latestClaims = (read: EditionDossierRead): ClaimRevision[] =>
  read.claims.map((chain) => chain.revisions[chain.revisions.length - 1]);

const supported = (claim: ClaimRevision): boolean =>
  ['announced', 'reported', 'observed', 'confirmed'].includes(claim.status) && claim.sourceIds.length > 0;

// Extracción determinística de features desde los claims del dossier. Se
// persiste SIEMPRE (con o sin política): es la parte factual de «qué usó (o
// habría usado) el scorer», con la razón de cada ausencia.
export function extractFeatures(profile: EvaluationProfile, dossier: EditionDossierRead): FeatureValue[] {
  const edition = dossier.editionRevisions[dossier.editionRevisions.length - 1];
  const claims = latestClaims(dossier).filter(
    (c) => c.subject.type === 'edition' && c.subject.editionId === edition.editionId,
  );

  const features: FeatureValue[] = [];

  // audience_fit: solapamiento de tokens entre la audiencia declarada del
  // perfil (+stack) y el claim de audiencia con soporte. Una audiencia
  // contradicha no alimenta el fit afirmativo.
  const audienceClaim = claims.find((c) => c.attribute === 'audience');
  if (!audienceClaim || !supported(audienceClaim) || audienceClaim.status === 'contradicted') {
    features.push({
      key: 'audience_fit',
      value: null,
      missingReason:
        audienceClaim?.status === 'contradicted'
          ? 'audiencia contradicha entre fuentes: sin valor admitido para el fit'
          : 'sin claim de audiencia con soporte',
      claimRevisionIds: audienceClaim ? [audienceClaim.id] : [],
      note: null,
    });
  } else {
    const wanted = new Set([...profile.stack, profile.audience.description, ...profile.audience.profiles].flatMap(tokens));
    const declared =
      audienceClaim.value.kind === 'text'
        ? tokens(audienceClaim.value.text)
        : audienceClaim.value.kind === 'number'
          ? tokens(audienceClaim.value.unit)
          : [];
    const hits = [...new Set(declared)].filter((t) => wanted.has(t)).length;
    features.push({
      key: 'audience_fit',
      value: wanted.size === 0 || declared.length === 0 ? null : clamp01(hits / Math.min(wanted.size, new Set(declared).size)),
      missingReason:
        wanted.size === 0 || declared.length === 0 ? 'la audiencia declarada no permite comparar tokens' : null,
      claimRevisionIds: [audienceClaim.id],
      note: `estado del claim: ${audienceClaim.status}`,
    });
  }

  // access_documented: existe un claim de acceso con soporte (1) o queda
  // pendiente (null). No mide apertura «buena»: mide que el acceso está
  // documentado y no en conflicto con las restricciones (el conflicto
  // confirmado excluye antes, en eligibility.ts).
  const accessClaim = claims.find((c) => c.attribute === 'access');
  if (accessClaim && supported(accessClaim) && accessClaim.value.kind === 'text') {
    features.push({
      key: 'access_documented',
      value: 1,
      missingReason: null,
      claimRevisionIds: [accessClaim.id],
      note: `estado del claim: ${accessClaim.status}`,
    });
  } else {
    features.push({
      key: 'access_documented',
      value: null,
      missingReason: 'modalidad de acceso sin soporte: queda pendiente, no se asume abierta ni cerrada',
      claimRevisionIds: accessClaim ? [accessClaim.id] : [],
      note: null,
    });
  }

  // cost_fit: fracción del presupuesto declarado que queda libre tras las
  // partidas CONOCIDAS (cada partida conocida es un límite inferior). Costo
  // desconocido o presupuesto no declarado → null con razón: un costo
  // desconocido JAMÁS cuenta como cero.
  const costClaims = claims.filter(
    (c) => c.attribute.startsWith('cost:') && supported(c) && c.value.kind === 'money',
  );
  if (costClaims.length === 0) {
    features.push({
      key: 'cost_fit',
      value: null,
      missingReason: 'costo desconocido: ninguna partida con soporte; no cuenta como cero',
      claimRevisionIds: claims.filter((c) => c.attribute.startsWith('cost:')).map((c) => c.id),
      note: null,
    });
  } else if (profile.budget.status !== 'declared') {
    features.push({
      key: 'cost_fit',
      value: null,
      missingReason: 'presupuesto no declarado en el perfil: no se puede evaluar el encaje de costo',
      claimRevisionIds: costClaims.map((c) => c.id),
      note: null,
    });
  } else {
    const budget = profile.budget;
    const sameCurrency = costClaims.filter(
      (c) => c.value.kind === 'money' && c.value.currency === budget.currency,
    );
    if (sameCurrency.length === 0) {
      features.push({
        key: 'cost_fit',
        value: null,
        missingReason: `las partidas conocidas están en otra moneda que el presupuesto (${budget.currency}): sin conversión no hay encaje`,
        claimRevisionIds: costClaims.map((c) => c.id),
        note: null,
      });
    } else {
      const knownTotal = sameCurrency.reduce(
        (sum, c) => sum + (c.value.kind === 'money' ? c.value.amount : 0),
        0,
      );
      features.push({
        key: 'cost_fit',
        value: budget.amount > 0 ? clamp01(1 - knownTotal / budget.amount) : 0,
        missingReason: null,
        claimRevisionIds: sameCurrency.map((c) => c.id),
        note: `partidas conocidas: ${budget.currency} ${knownTotal} (límite inferior; puede haber partidas sin publicar)`,
      });
    }
  }

  return features;
}

// ============ Política versionada ============

export interface ScoringPolicy {
  policyId: string;
  policyVersion: string;
  objective: ObjectiveKind;
  approval:
    | { status: 'approved'; approvedBy: string; approvedAt: string }
    | { status: 'test_only'; note: string };
  // Pesos por feature del set features/1. La renormalización sobre dimensiones
  // activas la hace weightedScore (null nunca es 0).
  weights: Record<FeatureKey, number>;
}

// DECISIÓN ABIERTA D2: no hay política comercial aprobada para ningún
// objetivo. Publicar un ranking de inversión espera esa aprobación; mientras
// tanto la comparación factual y la decisión condicional cierran sin score.
export function approvedPolicyFor(objective: ObjectiveKind): ScoringPolicy | null {
  // Ningún objetivo tiene política aprobada todavía; el parámetro existe para
  // que la firma no cambie cuando D2 se resuelva.
  void objective;
  return null;
}

export interface ScoredCandidate {
  editionId: string;
  sKnown: number;
  coverage: number;
  sensitivityNote: string | null;
  // Rango posible si los faltantes se resolvieran (peor caso 0, mejor caso 1
  // por dimensión ausente): alimenta la nota de sensibilidad, no el orden.
  worstCase: number;
  bestCase: number;
  missingKeys: FeatureKey[];
}

export interface PolicyApplication {
  scored: ScoredCandidate[]; // en el orden OFICIAL
  ordering: string[]; // editionIds en el orden oficial (desempate incluido)
  abstained: { editionId: string; reason: 'insufficient_data'; note: string }[];
}

const breakdownOf = (features: FeatureValue[]): Record<FeatureKey, number | null> => {
  const breakdown = {} as Record<FeatureKey, number | null>;
  for (const key of FEATURE_KEYS) {
    breakdown[key] = features.find((f) => f.key === key)?.value ?? null;
  }
  return breakdown;
};

// Desempate determinístico (misma convención que el ticket 06): ante empate
// exacto de S_known decide el id estable por puntos de código, nunca el orden
// de llegada de los candidatos.
const byScoreThenId = (a: ScoredCandidate, b: ScoredCandidate): number => {
  if (b.sKnown !== a.sKnown) return b.sKnown - a.sKnown;
  return a.editionId < b.editionId ? -1 : a.editionId > b.editionId ? 1 : 0;
};

// Aplica la política a candidatos NO excluidos (la exclusión ocurrió antes,
// en eligibility.ts; un excluido jamás llega acá). Con todas las dimensiones
// ausentes el scorer se ABSTIENE (insufficient_data): abstenerse no es 0.
export function applyScoringPolicy(
  policy: ScoringPolicy,
  candidates: { editionId: string; features: FeatureValue[] }[],
): PolicyApplication {
  const scored: ScoredCandidate[] = [];
  const abstained: PolicyApplication['abstained'] = [];

  for (const candidate of candidates) {
    const breakdown = breakdownOf(candidate.features);
    const missingKeys = FEATURE_KEYS.filter((key) => breakdown[key] === null);
    if (missingKeys.length === FEATURE_KEYS.length) {
      abstained.push({
        editionId: candidate.editionId,
        reason: 'insufficient_data',
        note: 'sin ninguna dimensión con dato: el scorer se abstiene en vez de puntuar 0',
      });
      continue;
    }
    const sKnown = weightedScore(breakdown, policy.weights);
    const coverage = activeWeightFraction(breakdown, policy.weights);
    const fill = (value: number): Record<FeatureKey, number | null> => {
      const filled = { ...breakdown };
      for (const key of missingKeys) filled[key] = value;
      return filled;
    };
    const worstCase = missingKeys.length === 0 ? sKnown : weightedScore(fill(0), policy.weights);
    const bestCase = missingKeys.length === 0 ? sKnown : weightedScore(fill(1), policy.weights);
    scored.push({
      editionId: candidate.editionId,
      sKnown,
      coverage,
      sensitivityNote: null, // se completa abajo, con el orden ya decidido
      worstCase,
      bestCase,
      missingKeys,
    });
  }

  scored.sort(byScoreThenId);

  // Sensibilidad a faltantes: qué dimensiones faltan y si resolverlas podría
  // invertir el orden con algún vecino (rango del peor/mejor caso solapado).
  for (const [index, candidate] of scored.entries()) {
    if (candidate.missingKeys.length === 0) continue;
    const flips: string[] = [];
    const above = scored[index - 1];
    if (above && candidate.bestCase > above.worstCase) flips.push(above.editionId);
    const below = scored[index + 1];
    if (below && candidate.worstCase < below.bestCase) flips.push(below.editionId);
    const range = `S_known podría moverse entre ${candidate.worstCase} y ${candidate.bestCase} al resolver ${candidate.missingKeys.join(', ')}`;
    candidate.sensitivityNote =
      flips.length > 0 ? `${range}; el orden con ${flips.join(' y ')} podría invertirse` : range;
  }

  return {
    scored,
    ordering: scored.map((candidate) => candidate.editionId),
    abstained,
  };
}
