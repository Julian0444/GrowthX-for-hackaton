import assert from 'node:assert/strict';
import { test } from 'node:test';
import { declaredDateLabel, stableIds, progressSummary, opportunitySummary, alternativeReason } from '../../lib/research/presentation.ts';
import { mapRead, mapRun } from '../fixtures/sf-map.ts';

test('DP10 partial results keep their arrival order across polls, deduplicate and remove absent identities', () => {
  assert.deepEqual(stableIds(['a','b'], ['c','b','a','c']), ['a','b','c']);
  assert.deepEqual(stableIds(['a','b'], ['c','b']), ['b','c']);
  assert.deepEqual(stableIds([], ['c','a']), ['c','a']);
});
test('DP10 readable dates preserve the declared local calendar day and ambiguity', () => {
  assert.match(declaredDateLabel({precision:'instant', iso:'2026-09-12T01:00:00Z', timezone:'America/Los_Angeles'}), /Sep 11, 2026.*6:00.*PM/);
  assert.match(declaredDateLabel({precision:'date_only',date:'2026-09-12',timezone:null}), /Sep 12, 2026.*Timezone pending/);
  assert.match(declaredDateLabel({precision:'ambiguous',text:'September 12 or 13',earliest:null,latest:null}), /September 12 or 13.*ambiguous/);
  assert.equal(declaredDateLabel({precision:'unknown'}), 'Date pending');
});
test('DP10 progress derives from persisted stages and published evidence, not elapsed timers', () => {
  const run = mapRun('progress', [], 'running');
  const empty = progressSummary(run, 0);
  assert.match(empty.findings, /^0 events with saved evidence/);
  assert.doesNotMatch(empty.findings, /confirmed|verified/i);
  const failed = {...run, state:'failed' as const, steps:[{seq:1,name:'fetch_event_page',state:'failed' as const,attempts:1,startedAt:null,finishedAt:null,error:'HTTP 503'}]};
  assert.equal(progressSummary(failed, 1).label, 'Interrupted');
  assert.equal(progressSummary(failed, 1).stage, 'Reading event page');
  assert.equal(progressSummary(failed, 1).limited, true);
});
test('DP10 unknown price remains a visible next action, not a compatible total', () => {
  const read = mapRead('cost');
  for (const chain of read.claims.filter(c => c.revisions.at(-1)?.attribute.startsWith('cost:'))) { chain.revisions[0].status = 'pending'; chain.revisions[0].value = {kind:'pending', note:'Quote missing'}; }
  const summary = opportunitySummary(read);
  assert.equal(summary.incompleteCost, true);
  assert.match(summary.pending, /Full participation cost is unknown/);
  assert.match(summary.nextAction, /quote/);
});

test('DP10 the background name comes from a prior edition, never the current edition in the same evidence basis', () => {
  const ref = (editionId: string) => ({editionId, editionRevisionId: editionId+'-r1', claimRevisionIds:[], relationshipIds:[], sourceIds:[]});
  const reason = alternativeReason({editionId:'current',matchedCriteria:['antecedente_pertinente'],antecedents:[{text:'Saved explanation',basis:[ref('current'),ref('past')]}]}, [{id:'current-r1',name:'Upcoming hackathon'},{id:'past-r1',name:'Secure Agents Buildathon'}]);
  assert.match(reason, /Relevant background: Secure Agents Buildathon/);
  assert.doesNotMatch(reason, /Upcoming hackathon/);
});
