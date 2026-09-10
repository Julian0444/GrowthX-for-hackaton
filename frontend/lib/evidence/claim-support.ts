import type { ClaimRevision, ClaimStatus } from '../contracts/evaluation.ts';

// Soporte documental ≠ revisión humana. Una fuente anunciada es utilizable
// con su etiqueta original; fortalecerla a confirmed nunca quita soporte.
export function hasAffirmativeSupport(claim: { status: ClaimStatus; sourceIds: string[] }): boolean {
  return ['announced', 'reported', 'observed', 'confirmed'].includes(claim.status) && claim.sourceIds.length > 0;
}

// Política compartida con DP-08/09. No certifica coordenadas ni precisión:
// eso requiere procedencia geográfica. No deriva revisión humana del estado.
export function locationSupport(claim: ClaimRevision) {
  return {
    usable: claim.attribute === 'location' && claim.value.kind === 'location' &&
      ['city', 'venue'].includes(claim.value.scope) && claim.value.name !== null && hasAffirmativeSupport(claim),
    status: claim.status,
    humanConfirmed: claim.status === 'confirmed' && claim.reviewer !== null && claim.method !== null,
  };
}
