import type { DeclaredDate } from '../contracts/evaluation.ts';

// Presentation only: preserve the declared timezone, uncertainty and saved text.
export function readableDate(value: string | null | undefined): string {
  if (!value) return 'Date pending';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}
export function declaredDateLabel(date: DeclaredDate): string {
  if (date.precision === 'unknown') return 'Date pending';
  if (date.precision === 'ambiguous') return `${date.text} · Date disputed or ambiguous`;
  if (date.precision === 'date_only') return `${readableDate(date.date)} · ${date.timezone ?? 'Timezone pending'}`;
  if (date.precision !== 'instant') return 'Date pending';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: date.timezone, timeZoneName: 'short' }).format(new Date(date.iso));
  } catch {
    // Numeric offsets are not accepted by every Intl runtime. Use the declared
    // local calendar day, never silently relabel it as UTC or SF.
    return `${readableDate(date.iso.slice(0, 10))} · ${date.iso.slice(11, 16)} (${date.timezone})`;
  }
}

