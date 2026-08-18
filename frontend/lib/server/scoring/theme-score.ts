// Theme scorer (§4). Función PURA sin I/O. Puntúa un tema EMPAREJADO con una
// comunidad (communityCapability depende de la comunidad que lo correría).
//
// Pesos: momentum .30 · criticalPath .30 · communityCapability .25 ·
//        saturationGap .15
//
// criticalPath = ¿el dev puede terminar sin tocar el producto? Un score alto
// significa que el producto queda EN el camino crítico de lo que el dev
// construye (bueno para adopción).

import type {
  Community,
  Evidence,
  Reason,
  SearchRequest,
  Theme,
  ThemeBreakdown,
} from '@/lib/contracts/growxth';
import { clamp01, coverageRatio, weightedScore } from './score-utils.ts';

export const THEME_WEIGHTS: Record<keyof ThemeBreakdown, number> = {
  momentum: 0.3,
  criticalPath: 0.3,
  communityCapability: 0.25,
  saturationGap: 0.15,
};

export interface ThemeScoreInput {
  theme: Theme;
  community: Community;
  evidence: Evidence[];
  request: SearchRequest;
}

export interface ThemeScoreResult {
  score: number;
  breakdown: ThemeBreakdown;
  reasons: Reason[];
}

// momentum: ratio 90d vs ventana previa. 1.0 = plano → 0; 2.0 (+100%) → 1.0.
// Si no hay githubMomentum, cae a newsSalience (ya normalizada 0..1). Ambos
// null → null.
function scoreMomentum(theme: Theme): number | null {
  if (theme.githubMomentum != null) {
    return clamp01(theme.githubMomentum - 1);
  }
  if (theme.newsSalience != null) {
    return clamp01(theme.newsSalience);
  }
  return null;
}

// criticalPath: si las capacidades que exige el tema caen dentro del stack del
// ICP, el producto (que apunta a ese stack) tiende a quedar en el camino
// crítico. Sin requiredCapabilities no se puede afirmar → null.
function scoreCriticalPath(theme: Theme, request: SearchRequest): number | null {
  if (theme.requiredCapabilities.length === 0) return null;
  return coverageRatio(request.icpStack, theme.requiredCapabilities);
}

// saturationGap: menos eventos con este tema en SF (180d) = más gap.
function scoreSaturationGap(theme: Theme): number | null {
  if (theme.saturationSF == null) return null;
  return clamp01(1 / (1 + theme.saturationSF));
}

export function scoreTheme(input: ThemeScoreInput): ThemeScoreResult {
  const { theme, community, evidence, request } = input;

  const owned = evidence.filter((e) => theme.evidenceIds.includes(e.id));
  const support = owned.map((e) => e.id);

  const breakdown: ThemeBreakdown = {
    momentum: scoreMomentum(theme),
    criticalPath: scoreCriticalPath(theme, request),
    communityCapability: coverageRatio(community.stack, theme.requiredCapabilities),
    saturationGap: scoreSaturationGap(theme),
  };

  const score = weightedScore(breakdown, THEME_WEIGHTS);

  const reasons: Reason[] = [];
  if (support.length > 0) {
    if (breakdown.momentum != null && breakdown.momentum >= 0.4) {
      const pct =
        theme.githubMomentum != null
          ? `${Math.round((theme.githubMomentum - 1) * 100)}% on GitHub over 90 days`
          : `high visibility in public news and CFPs`;
      reasons.push({
        text: `Momentum for "${theme.label}": ${pct}.`,
        evidenceIds: support,
      });
    }
    if (breakdown.saturationGap != null && breakdown.saturationGap >= 0.5) {
      reasons.push({
        text: `Low SF saturation (${theme.saturationSF} events in 180 days) leaves room to own "${theme.label}".`,
        evidenceIds: support,
      });
    }
    if (
      breakdown.communityCapability != null &&
      breakdown.communityCapability >= 0.5
    ) {
      reasons.push({
        text: `${community.name} has the capabilities to run a "${theme.label}" activation.`,
        evidenceIds: support,
      });
    }
  }

  return { score, breakdown, reasons };
}
