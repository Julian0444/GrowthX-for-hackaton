import type { EditionLocation, DeclaredDate } from '../../lib/contracts/evaluation';
import type { EditionDossierRead } from '../../lib/api/atlas-client';

// SF se verifica en la edición; jamás se consulta la sede del organizador.
export function isSanFrancisco(location: EditionLocation): boolean {
  return location.scope === 'city' && location.name !== null &&
    /^(san francisco|sf)(?:$|[ ,(])/i.test(location.name.trim());
}
export function dateLabel(date: DeclaredDate): string {
  if (date.precision === 'instant') return `${date.iso} · ${date.timezone}`;
  if (date.precision === 'date_only') return `${date.date} · ${date.timezone ?? 'zona horaria pendiente'}`;
  if (date.precision === 'ambiguous') return `${date.text} · fecha ambigua`;
  return 'Fecha pendiente';
}
export function latestEdition(read: EditionDossierRead) {
  return read.editionRevisions[read.editionRevisions.length - 1];
}
