import type { DeclaredDate } from '../contracts/evaluation.ts';
import { classifyEventValidity, type EventValidity } from './event-validity.ts';
type EditionValidityView = { validity: EventValidity; reason: string };

export function classifyDeclaredDate(date: DeclaredDate, evaluationInstant: string): EditionValidityView {
  switch (date.precision) {
    case 'instant': {
      const result = classifyEventValidity(date.iso, evaluationInstant);
      return { validity: result.validity, reason: result.reason };
    }
    case 'date_only': {
      const result = classifyEventValidity(date.date, evaluationInstant);
      return { validity: result.validity, reason: result.reason };
    }
    case 'ambiguous': {
      const evaluation = Date.parse(evaluationInstant);
      const earliest = date.earliest !== null ? Date.parse(date.earliest) : Number.NaN;
      const latest = date.latest !== null ? Date.parse(date.latest) : Number.NaN;
      if (Number.isFinite(latest) && latest < evaluation) {
        return {
          validity: 'past',
          reason: `Declared range ends (${date.latest}) before the evaluation instant; expired as an opportunity, kept as antecedent.`,
        };
      }
      if (Number.isFinite(earliest) && earliest >= evaluation) {
        return {
          validity: 'upcoming',
          reason: `Declared range starts (${date.earliest}) at or after the evaluation instant.`,
        };
      }
      return {
        validity: 'date_ambiguous',
        reason: `Declared date "${date.text}" is ambiguous around the evaluation instant; it stays pending instead of guessing.`,
      };
    }
    case 'unknown':
      return {
        validity: 'date_pending',
        reason: 'No declared start date; the date stays pending and is never replaced by the current time.',
      };
  }
}
