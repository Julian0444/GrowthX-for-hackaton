import type { EditionDossierRead } from '../api/atlas-client.ts';
import { projectEditionDossierView } from '../api/opportunity-adapter.ts';
import { hasSfLocality } from './location-policy.ts';

export function mapOpportunity(read: EditionDossierRead, relevance?: string) {
  const view = projectEditionDossierView(read);
  const inSf = hasSfLocality(view.publicLocation);
  const reason = read.claims.flatMap(c => c.revisions).find(c =>
    c.attribute === 'buyer:relevance' && c.subject.type === 'edition' && c.subject.editionId === read.editionId && c.status !== 'contradicted');
  return {
    read, view,
    point: inSf ? view.mapPoint : null,
    withoutPointReason: !inSf ? (view.withoutPointReason ?? 'Outside SF or city pending; no point on this map.') : view.withoutPointReason,
    relevance: relevance ?? (reason?.value.kind === 'text' ? reason.value.text : 'Pertinencia para el brief pendiente de evaluación; abrí las fuentes y condiciones.'),
  };
}

export type MapOpportunity = ReturnType<typeof mapOpportunity>;
export type LocatedOpportunity = MapOpportunity & { point: NonNullable<MapOpportunity['point']> };
export const located = (entry: MapOpportunity): entry is LocatedOpportunity => entry.point !== null;

// Screen-space grouping also handles nearby coordinates for the same venue.
// The marker stays at an actual documented point; grouping does not change
// stored coordinates, precision, identity, or geographic evidence.
export function groupMapPoints(points: LocatedOpportunity[], project: (coordinates: [number, number]) => { x: number; y: number }) {
  const groups: { id: string; entries: LocatedOpportunity[]; coordinates: [number, number]; x: number; y: number }[] = [];
  for (const entry of [...points].sort((a, b) => a.view.editionId.localeCompare(b.view.editionId))) {
    const coordinates = entry.point.geojson.coordinates;
    const screen = project(coordinates);
    const group = groups.find(g => Math.hypot(g.x - screen.x, g.y - screen.y) < 48);
    if (group) { group.entries.push(entry); group.id += `|${entry.view.editionId}`; }
    else groups.push({ id: entry.view.editionId, entries: [entry], coordinates, ...screen });
  }
  return groups;
}
