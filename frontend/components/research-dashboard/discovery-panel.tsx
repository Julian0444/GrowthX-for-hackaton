"use client"
import { englishSystemText } from "../../lib/research/english"
import { useState } from "react"
import { stableIds, readableDate } from "../../lib/research/presentation"
import type { DiscoveryView } from '../../lib/contracts/discovery';
import { BackgroundResearchButton } from './background-panel';

const money = (n: number) => `USD ${n.toFixed(3)}`;
const status = { queued: 'Queued', running: 'Finding sources', partial: 'Sources ready for reading', completed: 'Completed', insufficient: 'Insufficient coverage', failed: 'Search interrupted' };
export function DiscoveryPanel({ discovery, onResearch }: { discovery: DiscoveryView; onResearch?: (id: string) => void }) {
  const { progress, plan, candidates, operations, budget } = discovery;
  const [order, setOrder] = useState(() => candidates.map(c => c.id));
  const nextOrder = stableIds(order, candidates.map(c => c.id));
  if (order.join('|') !== nextOrder.join('|')) setOrder(nextOrder);
  const ordered = [...candidates].sort((a,b) => nextOrder.indexOf(a.id) - nextOrder.indexOf(b.id));
  return <section className="discovery-panel" data-testid="discovery-panel" aria-label="Research sources">
    <div className="discovery-heading"><div><span className="eyebrow">Web research · brief v{plan.profileVersion}</span><h2>{status[progress.status]}</h2></div><span>{candidates.length} pages · {operations.length}/{plan.limits.maxQueries} queries</span></div>
    <p>{progress.terminal ? 'Search finished. These sources are saved; choose a page to research its event and background.' : 'Results are saved as they arrive. You can close this tab and return.'}</p>
    {progress.material === 'synthetic' && <p role="note">Controlled test transport. These results do not establish live research.</p>}
    {progress.limitations.map(limitation => <p className="discovery-limitation" key={englishSystemText(limitation)}>{englishSystemText(limitation)}</p>)}
    <div className="discovery-sources">{ordered.map(candidate => {
      const sources = discovery.sources.filter(s => candidate.sourceIds.includes(s.id));
      return <article key={candidate.id} data-testid="discovery-candidate" data-candidate-id={candidate.id} data-source-ids={candidate.sourceIds.join(',')}>
        <span className="eyebrow">Source candidate · reading pending</span>
        <h3><a href={candidate.canonicalUrl} target="_blank" rel="noreferrer">{candidate.title}</a></h3>
        <p className="discovery-url">{candidate.canonicalUrl}</p>
        {sources[0]?.content.kind === 'excerpt' && <blockquote>{sources[0].content.excerpt}</blockquote>}
        <p>Found while researching: {candidate.queryIds.map(id => plan.queries.find(q => q.id === id)?.purpose === 'background' ? 'background' : id === 'conditions' ? 'conditions' : 'opportunities').join(', ')}.</p>
        <details><summary>Source provenance</summary>{sources.map(source => <div key={source.id}><p>Obtained: {readableDate(source.fetchedAt)} · Exa Search · partial content</p><p>Published: {source.publishedAt ? readableDate(source.publishedAt) : 'Unknown'} (not the event date).</p><p className="research-meta">{source.id}</p></div>)}</details>
        <a className="research-link" href={candidate.canonicalUrl} target="_blank" rel="noreferrer">Open source ↗</a>
        {onResearch && sources[0] && <BackgroundResearchButton profileRunId={progress.runId} proposedSourceId={sources[0].id} onAccepted={onResearch} />}
      </article>;
    })}</div>
    <details data-testid="discovery-audit"><summary>Queries, limits and research consumption</summary>
      <p>Maximum {plan.limits.maxQueries} queries, {plan.limits.resultsPerQuery} results per query and {plan.limits.durationMs / 1000} seconds. Participation budget is separate.</p>
      <p>Cost reported by Exa: {money(budget.reportedCost)}{budget.unknownCostOperations ? ` + ${budget.unknownCostOperations} attempt(s) with unknown cost` : ''}. Provider estimate; not an invoice.</p>
      <p>Reservation for this research: {money(budget.reservedByRun)}. Shared initiative cap: {money(budget.initiativeLimit)}. {budget.remainingAfterLastReservation === null ? 'This research reserved no funds.' : `Remaining research allowance after last reservation: ${money(budget.remainingAfterLastReservation)}.`} Not the Exa account balance.</p>
      <ol>{plan.queries.map(query => { const op = operations.find(o => o.query.id === query.id); return <li key={query.id}><p>{query.text}</p><p>Status: {op ? ({ dispatched: 'sent; response pending', succeeded: 'response saved', failed: 'failed', uncertain: 'uncertain after interruption' })[op.state] : 'not executed'}. {op?.limitation && englishSystemText(op.limitation)}</p>{op && <p>Cost: {op.consumption.cost.status === 'known' ? money(op.consumption.cost.amount) : 'unknown'} · this query is not retried automatically.</p>}</li>; })}</ol>
    </details>
  </section>;
}
