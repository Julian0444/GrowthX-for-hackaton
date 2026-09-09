// Política temporal del slice «evaluación persistida» (ticket 04).
//
// Una sola regla compartida por el servidor (elegibilidad antes del score) y la
// UI (proyección del adaptador, import de Luma) para que el mismo instante de
// evaluación produzca la misma clasificación en ambos lados.
//
// - El corte usa el instante de evaluación y la ventana de participación
//   declarada: con solo la fecha de inicio declarada, la ventana para decidir
//   un patrocinio se cierra cuando el evento empieza. Refinarla con endsAt o
//   restricciones de calendario del cliente queda para la DECISIÓN ABIERTA D2;
//   esta política solo elimina fechas inventadas y excluye lo inequívocamente
//   vencido.
// - La incertidumbre no se resuelve inventando zona: una fecha sin zona
//   explícita se evalúa contra el rango real de offsets UTC (−12:00 … +14:00).
//   Solo es `past` o `upcoming` si lo es bajo cualquier zona posible; si el
//   instante de evaluación cae dentro del rango posible, queda
//   `date_ambiguous` (pendiente).
// - Fecha ausente, vacía o no parseable queda `date_pending`: nunca se
//   sustituye por `new Date()` ni por la fecha de publicación u obtención.
//
// Sin imports de servidor: importable desde componentes cliente.

export type EventValidity = 'upcoming' | 'past' | 'date_pending' | 'date_ambiguous';

export interface EventValidityResult {
  validity: EventValidity;
  // Motivo visible: citable en warnings, tickets y UI.
  reason: string;
  // Rango UTC posible del inicio declarado. Con zona explícita el rango es un
  // único instante ([x, x]); null cuando no hay fecha verificable.
  startRange: { earliest: string; latest: string } | null;
}

// Offsets UTC reales en uso: de UTC−12:00 (oeste) a UTC+14:00 (este).
const MAX_OFFSET_EAST_MS = 14 * 60 * 60 * 1000;
const MAX_OFFSET_WEST_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ZONELESS_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const EXPLICIT_ZONE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

// Rango UTC en el que puede caer el inicio declarado, en ms epoch.
function startInstantRange(value: string): { earliest: number; latest: number } | null {
  if (DATE_ONLY.test(value)) {
    const dayStartUtc = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(dayStartUtc)) return null;
    // Día calendario en zona desconocida: el evento puede empezar en cualquier
    // instante de ese día local; el día arranca antes en UTC+14 y termina
    // después en UTC−12.
    return {
      earliest: dayStartUtc - MAX_OFFSET_EAST_MS,
      latest: dayStartUtc + DAY_MS + MAX_OFFSET_WEST_MS,
    };
  }
  if (ZONELESS_DATETIME.test(value)) {
    const asUtc = Date.parse(`${value.replace(' ', 'T')}Z`);
    if (Number.isNaN(asUtc)) return null;
    // Hora local conocida, zona desconocida: el instante real cae en
    // [T−14h, T+12h].
    return { earliest: asUtc - MAX_OFFSET_EAST_MS, latest: asUtc + MAX_OFFSET_WEST_MS };
  }
  if (EXPLICIT_ZONE_DATETIME.test(value)) {
    const exact = Date.parse(value.replace(' ', 'T'));
    if (Number.isNaN(exact)) return null;
    return { earliest: exact, latest: exact };
  }
  // Cualquier otro formato no es una fecha verificable para esta política.
  return null;
}

export function classifyEventValidity(
  startsAt: string | null | undefined,
  evaluationInstant: string,
): EventValidityResult {
  const evaluation = Date.parse(evaluationInstant);
  if (Number.isNaN(evaluation)) {
    throw new Error(`event-validity: instante de evaluación inválido "${evaluationInstant}"`);
  }

  const raw = typeof startsAt === 'string' ? startsAt.trim() : '';
  if (raw.length === 0) {
    return {
      validity: 'date_pending',
      reason: 'No declared start date; the date stays pending and is never replaced by the current time.',
      startRange: null,
    };
  }

  const range = startInstantRange(raw);
  if (!range) {
    return {
      validity: 'date_pending',
      reason: `Declared start "${raw}" is not a verifiable date; it stays pending.`,
      startRange: null,
    };
  }

  const startRange = {
    earliest: new Date(range.earliest).toISOString(),
    latest: new Date(range.latest).toISOString(),
  };
  if (range.latest < evaluation) {
    return {
      validity: 'past',
      reason: `Declared start (${raw}) is before the evaluation instant under every possible timezone; expired as an opportunity, kept as a historical antecedent.`,
      startRange,
    };
  }
  if (range.earliest >= evaluation) {
    return {
      validity: 'upcoming',
      reason: `Declared start (${raw}) is at or after the evaluation instant under every possible timezone.`,
      startRange,
    };
  }
  return {
    validity: 'date_ambiguous',
    reason: `Declared start (${raw}) has no explicit timezone and the evaluation instant falls inside its possible range; the classification stays pending instead of inventing a timezone.`,
    startRange,
  };
}
