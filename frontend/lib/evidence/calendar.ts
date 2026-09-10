import type { DeclaredDate } from '../contracts/evaluation.ts';

// La ventana del comprador usa días calendario de la zona declarada para la
// edición. El prefijo de un ISO en UTC puede pertenecer al día siguiente en SF.
export function declaredCalendarDay(date: DeclaredDate): string | null {
  if (date.precision === 'date_only') return date.date;
  if (date.precision !== 'instant') return null;
  const instant = Date.parse(date.iso);
  if (!Number.isFinite(instant)) return null;
  const offset = /^([+-])(\d{2}):?(\d{2})$/.exec(date.timezone);
  if (offset) {
    const hours = Number(offset[2]);
    const minutes = Number(offset[3]);
    if (hours > 23 || minutes > 59) return null;
    const shift = (hours * 60 + minutes) * 60_000 * (offset[1] === '-' ? -1 : 1);
    return new Date(instant + shift).toISOString().slice(0, 10);
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: date.timezone === 'Z' ? 'UTC' : date.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    // El contrato admite la zona declarada como texto: si no se reconoce,
    // no se reemplaza por UTC ni por la zona del proceso.
    return null;
  }
}

