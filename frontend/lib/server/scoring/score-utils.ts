// Utilidades de scoring compartidas (§4 del brief). Sin I/O.
//
// Regla clave: una dimensión que NO se puede calcular es `null`, nunca 0. El
// score se computa SOLO sobre las dimensiones activas, renormalizando los pesos
// sobre ellas. Sin esto, el ranking favorece a los eventos corporativos que
// publican sponsor decks — el sesgo exacto que este producto corrige.

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Fracción de `target` cubierta por `source` (0..1), o null si falta cualquiera
// de los dos conjuntos (no se puede calcular overlap contra vacío).
export function coverageRatio(source: string[], target: string[]): number | null {
  if (source.length === 0 || target.length === 0) return null;
  const have = new Set(source.map(norm));
  const hits = target.filter((t) => have.has(norm(t))).length;
  return clamp01(hits / target.length);
}

export function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

// Renormalización obligatoria. Devuelve un score 0..100. Si TODAS las
// dimensiones son null, el total activo es 0 → score 0 (el pipeline decide si
// una oportunidad totalmente sin señal se descarta).
export function weightedScore<K extends string>(
  breakdown: Record<K, number | null>,
  weights: Record<K, number>,
): number {
  const keys = Object.keys(weights) as K[];
  const active = keys.filter((k) => breakdown[k] !== null);
  const totalWeight = active.reduce((s, k) => s + weights[k], 0);
  if (totalWeight === 0) return 0;
  const sum = active.reduce(
    (s, k) => s + (breakdown[k] as number) * (weights[k] / totalWeight),
    0,
  );
  return Math.round(clamp01(sum) * 100);
}
