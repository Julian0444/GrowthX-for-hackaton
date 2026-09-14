import type { EditionDossierRead, EvaluationRunView, ComparisonRunResult, EventIngestRunResult } from '../api/atlas-client.ts';
import { snapshotEditionDossiers } from '../api/opportunity-adapter.ts';
import { backgroundResult } from '../contracts/background.ts';
import type { SfResearchResult } from '../../components/research-dashboard/research-types.ts';
import { classifyDeclaredDate } from '../temporal/declared-date.ts';

// Catalog reads carry revision chains. An import/background run names the
// exact editions it produced, including DP-08's geographic revisions. Never
// fall back to the catalog head when one of those revisions is unavailable.
export function editionAtRevision(read: EditionDossierRead, revisionId: string, evaluatedAt: string): EditionDossierRead | null {
  const edition = read.editionRevisions.find(e => e.id === revisionId);
  if (!edition) return null;
  const claims = read.claims.flatMap(chain => {
    const revisions = chain.revisions.filter(c => edition.claimRevisionIds.includes(c.id));
    return revisions.length ? [{ ...chain, revisions }] : [];
  });
  return { ...read, evaluatedAt, editionRevisions: [edition], claims,
    validity: classifyDeclaredDate(edition.startDate, evaluatedAt) };
}

export function runEditionDossiers(run: EvaluationRunView | null, catalog: EditionDossierRead[]): EditionDossierRead[] {
  // No run means the separately labelled current-catalog view.
  if (!run) return catalog;
  const result = run.result;
  const kind = result && typeof result === 'object' && 'kind' in result ? result.kind : null;
  if (kind === 'investment_comparison') return snapshotEditionDossiers((result as ComparisonRunResult).bundle);
  if (result && typeof result === 'object' && 'kind' in result && result.kind === 'sf_organizer_research') {
    return (result as SfResearchResult).editions;
  }
  const imported = kind === 'luma_event_ingest' ? result as EventIngestRunResult : null;
  const background = backgroundResult(result);
  const ids = imported ? [imported.editionRevisionId] : background?.editionRevisionIds ?? [];
  const reads = ids.flatMap(id => {
    const read = catalog.find(r => r.editionRevisions.some(e => e.id === id));
    const fixed = read && editionAtRevision(read, id, run.updatedAt);
    return fixed ? [fixed] : [];
  });
  return reads.filter((read, index) => reads.findIndex(r => r.editionId === read.editionId) === index);
}
