// ROI (§4). Función pura. costPerQualifiedDev = tierPriceUsd /
// (expectedAttendance × icpFitRate). Falta CUALQUIER input → null + note
// "No disponible". NUNCA se estima el precio del tier.

import type { RoiEstimate } from '@/lib/contracts/growxth';

export interface RoiInput {
  tierPriceUsd: number | null;
  expectedAttendance: number | null;
  icpFitRate: number | null;
  icpFitBasis: RoiEstimate['icpFitBasis'];
}

const UNAVAILABLE = 'No disponible';

export function computeRoi(input: RoiInput): RoiEstimate {
  const { tierPriceUsd, expectedAttendance, icpFitRate, icpFitBasis } = input;

  const missing =
    tierPriceUsd == null ||
    tierPriceUsd <= 0 ||
    expectedAttendance == null ||
    expectedAttendance <= 0 ||
    icpFitRate == null ||
    icpFitRate <= 0;

  if (missing) {
    return {
      tierPriceUsd,
      expectedAttendance,
      icpFitRate,
      icpFitBasis,
      costPerQualifiedDev: null,
      band: null,
      note: UNAVAILABLE,
    };
  }

  const qualified = expectedAttendance * icpFitRate;
  const cost = tierPriceUsd / qualified;
  const costPerQualifiedDev = Math.round(cost * 100) / 100;

  // Banda ±15% redondeada a dólar entero: honesta sobre la incertidumbre sin
  // inventar precisión.
  const band: [number, number] = [
    Math.floor(cost * 0.85),
    Math.ceil(cost * 1.15),
  ];

  return {
    tierPriceUsd,
    expectedAttendance,
    icpFitRate,
    icpFitBasis,
    costPerQualifiedDev,
    band,
    note: null,
  };
}
