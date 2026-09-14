import type { EditionLocation } from '../../lib/contracts/evaluation';
import type { EditionDossierRead } from '../../lib/api/atlas-client';

// SF se verifica en la edición; jamás se consulta la sede del organizador.
export function isSanFrancisco(location: EditionLocation): boolean {
  return location.scope === 'city' && location.name !== null &&
    /^(san francisco|sf)(?:$|[ ,(])/i.test(location.name.trim());
}
export { declaredDateLabel as dateLabel } from '../../lib/temporal/display-date.ts';
export function latestEdition(read: EditionDossierRead) {
  return read.editionRevisions[read.editionRevisions.length - 1];
}
