import assert from 'node:assert/strict';
import { parseEvaluationProfile, parseClaimRevision, parseEventEditionRevision, parseEvaluationSnapshot } from '/Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/lib/contracts/evaluation-validation.ts';
import { evaluateEligibility } from '/Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/lib/server/evaluations/eligibility.ts';
import { futureSfConditions } from '/Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/lib/server/evaluations/research.ts';
import { composeSnapshotNarrative } from '/Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/lib/server/evaluations/model-adapter.ts';
const now='2026-09-10T01:00:00Z';
const profile={contractVersion:'1',id:'p',profileVersion:1,createdAt:now,product:'Devtool',audience:{description:'Python developers',profiles:[]},stack:['Python'],budget:{status:'declared',amount:5000,currency:'USD'},window:{from:null,to:null},restrictions:[],objective:{kind:'adoption',confirmation:'provisional',successDefinition:{status:'pending'}},comparableCompanies:[]};
function claim(attribute,value,status='observed') {return {contractVersion:'1',id:`c-${attribute}`,claimId:`c-${attribute}`,subject:{type:'edition',editionId:'e'},attribute,value,status,sourceIds:status==='pending'?[]:['s'],method:'manual_curation',note:null,reviewer:'Reviewer',reviewedAt:now,previousRevisionId:null};}
const date={precision:'instant',iso:'2026-10-02T01:00:00Z',timezone:'America/Los_Angeles'};
const baseClaims=[claim('date',{kind:'date',date}),claim('location',{kind:'location',scope:'city',name:'San Francisco'}),claim('access',{kind:'text',text:'Open registration'}),claim('audience',{kind:'text',text:'Python developers'}),claim('cost:sponsorship',{kind:'money',amount:3000,currency:'USD'})];
function dossier(cs=baseClaims) {return {contractVersion:'1',evaluatedAt:now,editionId:'e',editionRevisions:[{contractVersion:'1',id:'er1',editionId:'e',name:'Event',organizerIds:[],canonicalUrl:null,provider:null,startDate:date,location:{scope:'city',name:'San Francisco'},coordinates:null,claimRevisionIds:cs.map(x=>x.id),revisedAt:now,previousRevisionId:null}],validity:{validity:'upcoming',reason:'Future test instant'},organizers:[],claims:cs.map(c=>({claimId:c.claimId,revisions:[c]})),participations:[],companies:[],sources:[{contractVersion:'1',id:'s',url:'https://example.com/test',locator:null,provider:'test',collector:'test',fetchedAt:now,publishedAt:null,method:'manual_curation',geoScope:'city',content:{kind:'none'},usageRestrictions:[]}],curation:null};}
const cases=[
 ['control_supported',baseClaims],
 ['known_total_exceeds_budget',[...baseClaims,claim('cost:staff',{kind:'money',amount:3000,currency:'USD'})]],
 ['known_cost_plus_unknown_line',[...baseClaims,claim('cost:staff',{kind:'pending',note:'Staff cost not supplied'},'pending')]],
 ['foreign_currency_only',baseClaims.map(c=>c.attribute.startsWith('cost:')?claim(c.attribute,{kind:'money',amount:99999,currency:'EUR'}):c)],
 ['audience_pending',baseClaims.map(c=>c.attribute==='audience'?claim('audience',{kind:'pending',note:'Unknown'},'pending'):c)],
 ['date_contradicted',baseClaims.map(c=>c.attribute==='date'?{...c,status:'contradicted',note:'Sources disagree'}:c)],
];
assert.equal(parseEvaluationProfile(profile).ok,true);
for(const [name,cs] of cases){for(const c of cs) assert.equal(parseClaimRevision(c).ok,true,JSON.stringify(parseClaimRevision(c)));assert.equal(parseEventEditionRevision(dossier(cs).editionRevisions[0]).ok,true);const r=evaluateEligibility({profile,dossier:dossier(cs)});console.log(JSON.stringify({probe:name,result:r.eligibility,conditions:r.conditions}));assert.equal(r.eligibility.status,'eligible');}
const windowProfile={...profile,window:{from:'2026-10-01',to:'2026-10-01'}};
const future=futureSfConditions(dossier(),windowProfile);const comparison=evaluateEligibility({profile:windowProfile,dossier:dossier()});
assert(future.includes('Fuera de la ventana indicada'));assert.equal(comparison.eligibility.status,'eligible');console.log(JSON.stringify({probe:'same_event_window_disagreement',research:future,comparison:comparison.eligibility}));
const confirmed=futureSfConditions(dossier(baseClaims.map(c=>({...c,status:'confirmed'}))),profile);assert(confirmed.some(x=>x.includes('ubicación')));console.log(JSON.stringify({probe:'confirmed_stronger_evidence_not_supported',research:confirmed}));
const snapshot={contractVersion:'1',id:'snap',kind:'investment_comparison',profileId:'p',profileVersion:1,evaluatedAt:now,claimRevisionIds:['c-date'],organizerRevisionIds:[],editionRevisionIds:['er1'],participationRevisionIds:[],policy:{status:'none',note:'No policy'},alternatives:[{editionId:'e',organizerId:null,eligibility:{status:'eligible'},conditions:[],scoring:{status:'not_scored',reason:'no_policy',note:null}}],ordering:{kind:'presentation_only',editionIds:['e'],note:'No policy'},outcome:{kind:'completed'},narrative:null};
assert.equal(parseEvaluationSnapshot(snapshot).ok,true,JSON.stringify(parseEvaluationSnapshot(snapshot)));
for(const summary of ['El patrocinio cuesta 10 USD y la audiencia está confirmada.','El evento garantiza contrataciones y el acceso exclusivo ya está confirmado.']) {
 const result=await composeSnapshotNarrative({snapshot,claims:[baseClaims[0]]},{apiKey:'test-only-never-sent',transport:async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({proposals:[{editionId:'e',summary,selectedClaimRevisionIds:['c-date']}]})}]}}]})});
 assert.equal(result.status,'validated');assert.equal(result.proposals[0].withheldNote,null);console.log(JSON.stringify({probe:'unsupported_narrative_validated',summary,result:result.status,withheld:result.proposals[0].withheldNote}));
}
const {saveDecision}=await import('/Users/jirustaroure/Desktop/GrowthX for hackaton/frontend/lib/server/decisions/store.ts');
for(const status of ['inferred','contradicted']){
 const cost={...claim('cost:sponsorship',{kind:'money',amount:1500,currency:'USD'},status),note:status==='contradicted'?'Current quote disputed':null};
 assert.equal(parseClaimRevision(cost).ok,true,JSON.stringify(parseClaimRevision(cost)));
 const s={...snapshot,claimRevisionIds:[cost.id]};
 // In-memory query stub; does NOT open a connection or write to PostgreSQL.
 const fakeClient={release(){},async query(sql){
 if(sql==='begin'||sql==='commit'||sql==='rollback'||sql.includes('set_config'))return {rows:[]};
 if(sql.includes('select payload from growthx.snapshots'))return {rows:[{payload:s}]};
 if(sql.includes('select payload from growthx.profiles'))return {rows:[{payload:profile}]};
 if(sql.includes('select payload from growthx.claim_revisions'))return {rows:[{payload:cost}]};
 if(sql.includes('from growthx.decisions')||sql.trim().startsWith('insert into'))return {rows:[]};
 throw Error(`unexpected fake query: ${sql}`);
 }};
 const outcome=await saveDecision({connect:async()=>fakeClient},{tenantId:'test-tenant',userId:'test-user'},{idempotencyKey:`probe-${status}`,snapshotId:s.id,editionId:'e',verdict:'chosen',reasons:['Probe'],conditions:[],campaignDraft:null});
 assert.equal(outcome.status,'saved',JSON.stringify(outcome));assert.equal(outcome.read.campaign.costItems[0].amount.status,'quoted');
 console.log(JSON.stringify({probe:'campaign_promotes_cost_to_quoted',inputStatus:status,output:outcome.read.campaign.costItems[0].amount}));
}
