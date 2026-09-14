import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapOpportunity, groupMapPoints, located } from '../../lib/research/map-opportunities.ts';
import { runEditionDossiers, editionAtRevision } from '../../lib/research/run-editions.ts';
import { mapRead, mapRun, mapComparison } from '../fixtures/sf-map.ts';

test('DP-09 uses DP-08 policy for announced/confirmed, approximate, city-only and contradicted locations', () => {
  for (const status of ['announced','confirmed','contradicted'] as const) assert.equal(!!mapOpportunity(mapRead('a',{status})).point,status !== 'contradicted');
  assert.equal(mapOpportunity(mapRead('a',{approximate:true})).point?.approximate,true);
  assert.match(mapOpportunity(mapRead('a',{noPoint:true})).withoutPointReason!,/City only; venue pending/);
  const foreign=mapRead(); foreign.editionRevisions[0].publicLocation!.city='Berlin';
  assert.equal(mapOpportunity(foreign).point,null);
});
test('DP-09 projects only the run, never unrelated catalog editions; discovery and running imports stay empty', () => {
  const a=mapRead('a'),b=mapRead('b');const run=mapRun('run',[a]);
  assert.deepEqual(runEditionDossiers(run,[a,b]).map(r=>r.editionId),['a']);
  run.result=null;run.workflowVersion='sf-discovery/1';assert.deepEqual(runEditionDossiers(run,[a,b]),[]);
  run.result={kind:'luma_event_ingest',version:1,editionId:'a',editionRevisionId:'a-r1'};
  assert.deepEqual(runEditionDossiers(run,[a,b]).map(r=>r.editionId),['a']);
  run.result={kind:'background_research',version:1,editionId:'a',editionRevisionIds:['a-r1'],organizerIds:[],status:'completed',limitations:[],sourceCount:1,attemptedUrls:[],material:'imported'};
  assert.deepEqual(runEditionDossiers(run,[a,b]).map(r=>r.editionId),['a']);
});
test('DP-09 run revision and comparison snapshot keep original geography after catalog update', () => {
  const old=mapRead('a'),current=structuredClone(old);current.editionRevisions.push({...structuredClone(old.editionRevisions[0]),id:'a-r2',previousRevisionId:'a-r1',coordinates:{lat:37.76,lng:-122.44}});
  const fixed=editionAtRevision(current,'a-r1',old.evaluatedAt)!;
  assert.deepEqual(mapOpportunity(fixed).point?.geojson.coordinates,[-122.3944,37.7872]);
  assert.equal(editionAtRevision(current,'missing',old.evaluatedAt),null);
  const result=runEditionDossiers(mapComparison('saved',[old]),[current,mapRead('b')]);
  assert.equal(result.length,1);assert.equal(result[0].editionRevisions[0].id,'a-r1');
  assert.deepEqual(mapOpportunity(result[0]).point?.geojson.coordinates,[-122.3944,37.7872]);
});
test('DP-09 nearby/coincident venues group without changing identity or coordinate axes', () => {
  const entries=[mapRead('b'),mapRead('a',{approximate:true}),mapRead('c',{lng:-122.46})].map(r=>mapOpportunity(r)).filter(located);
  const groups=groupMapPoints(entries,([x,y])=>({x:x*10000,y:y*10000}));assert.equal(groups.length,2);
  assert.deepEqual(groups[0].entries.map(e=>e.view.editionId),['a','b']);assert.deepEqual(groups[0].coordinates,[-122.3944,37.7872]);
  assert.equal(groups[0].entries[0].point.approximate,true);assert.equal(groups[0].entries[1].point.approximate,false);
});
