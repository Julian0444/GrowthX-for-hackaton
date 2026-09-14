import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildAlternativeReading,buildComparisonReading} from '../../lib/server/evaluations/decision-reading.ts';
import {evaluateEligibility} from '../../lib/server/evaluations/eligibility.ts';
import {comparisonFixture} from '../fixtures/comparison.ts';
import {baseClaims,claim,dossier,profile} from '../fixtures/trust.ts';
import type {SnapshotAlternative} from '../../lib/contracts/evaluation.ts';
import type {EditionDossierRead} from '../../lib/server/catalog/read.ts';
const alternative=(d:EditionDossierRead,p=profile):SnapshotAlternative=>({...evaluateEligibility({profile:p,dossier:d}),scoring:{status:'not_scored',reason:'no_policy',note:null}});

test('DP07 historical technical evidence favors research; sponsor remains its actual role and source',()=>{
 const f=comparisonFixture();assert.ok(f.ait);assert.ok(f.vultr);
 const reading=buildComparisonReading(f.profile,[f.ait,f.vultr],f.dossiers,[alternative(f.ait,f.profile),alternative(f.vultr,f.profile)]);
 assert.equal(reading.priority.kind,'investigate_first');assert.deepEqual(reading.priority.editionIds,[f.ait.editionId]);
 const ait=reading.alternatives.find(a=>a.editionId===f.ait.editionId)!;assert.match(ait.relevance.text,/Observabilidad|observabilidad/);assert.ok(ait.antecedents.length);assert.ok(ait.antecedents[0].basis.some(r=>r.relationshipIds.length&&r.sourceIds.length));assert.match(ait.cost,/unknown|pending/);assert.match(ait.modality.text,/voluntary/);
 const vultr=reading.alternatives.find(a=>a.editionId===f.vultr.editionId)!;assert.match(vultr.antecedents.map(a=>a.text).join(' '),/Paris.*sponsor \[reported\]/);assert.ok(!vultr.matchedCriteria.includes('antecedente_pertinente'));
 const reversed=buildComparisonReading(f.profile,[f.vultr,f.ait],[...f.dossiers].reverse(),[alternative(f.vultr,f.profile),alternative(f.ait,f.profile)]);assert.deepEqual(reversed.priority,reading.priority);
});
test('DP07 new payments/hiring brief changes reason, proposed activity and useful question without borrowing previous buyer inference',()=>{
 const f=comparisonFixture();const p={...f.profile,product:'Pagos para comercios',audience:{description:'Equipos de pagos',profiles:[]},stack:[],objective:{...f.profile.objective,kind:'hiring' as const}};
 const reading=buildComparisonReading(p,[f.ait,f.vultr],f.dossiers,[alternative(f.ait,p),alternative(f.vultr,p)]);
 assert.equal(reading.priority.kind,'insufficient');assert.ok(reading.alternatives.every(a=>a.evidenceQuality.status==='insufficient'));assert.match(reading.alternatives[0].relevance.text,/Pagos para comercios.*hiring/);assert.match(reading.alternatives[0].nextQuestion,/program or project/);
 const feedback={...f.profile,objective:{...f.profile.objective,kind:'feedback' as const}};assert.match(buildAlternativeReading(feedback,f.ait,f.dossiers,alternative(f.ait,feedback)).modality.text,/feedback session/);
});
test('DP07 contradicted/missing references, wrong identity and award-only evidence cannot support priority',()=>{
 const f=comparisonFixture();for(const d of f.dossiers)for(const c of d.claims)if(c.revisions[0].attribute.startsWith('program:')||c.revisions[0].attribute.startsWith('project:'))c.revisions[0].status='contradicted';
 const r=buildComparisonReading(f.profile,[f.ait,f.vultr],f.dossiers,[alternative(f.ait,f.profile),alternative(f.vultr,f.profile)]);assert.equal(r.priority.kind,'insufficient');
 const broken=comparisonFixture();for(const d of broken.dossiers)for(const c of d.claims)c.revisions[0].sourceIds=['absent'];assert.equal(buildAlternativeReading(broken.profile,broken.ait,broken.dossiers,alternative(broken.ait,broken.profile)).evidenceQuality.status,'insufficient');
 const wrong=comparisonFixture();wrong.ait.editionRevisions[0].relationships=[];assert.equal(buildAlternativeReading(wrong.profile,wrong.ait,wrong.dossiers,alternative(wrong.ait,wrong.profile)).antecedents.length,0);
});
test('DP07 city pending remains conditional without point; free restrictions and unknown audience reach result',()=>{
 const d=dossier(baseClaims.filter(c=>!['location','audience'].includes(c.attribute)));d.editionRevisions[0].location={scope:'unknown',name:null};
 const p={...profile,restrictions:['Solo contactos con opt-in'],formats:['workshop']};const a=alternative(d,p);
 assert.equal(a.eligibility.status,'conditional');assert.equal(d.editionRevisions[0].coordinates,null);assert.match(a.conditions.map(c=>c.description).join(' '),/location remains pending.*Audience evidence is pending.*opt-in.*workshop/);
 const r=buildAlternativeReading(p,d,[],a);assert.match(r.nextQuestion,/San Francisco/);assert.equal(r.modality.status,'pending');
});
test('DP07 cost gates run before priority: additive costs exclude, mixed/incomplete/contradicted stay conditional',()=>{
 const full=dossier([...baseClaims,claim('cost:activation',{kind:'money',amount:3000,currency:'USD'})]);assert.equal(alternative(full).eligibility.status,'excluded');
 for(const extra of [claim('cost:travel',{kind:'pending',note:'Missing quote'},'pending'),claim('cost:travel',{kind:'money',amount:500,currency:'EUR'}),claim('cost:travel',{kind:'money',amount:500,currency:'USD'},'contradicted')]) {
   const d=dossier([...baseClaims,extra]);const a=alternative(d);assert.equal(a.eligibility.status,'conditional');const r=buildAlternativeReading(profile,d,[],a);assert.match(r.cost,/Incomplete cost|Currency is not comparable/);
 }
 const f=comparisonFixture();const a=alternative(f.ait,f.profile);a.eligibility={status:'excluded',reasons:['Confirmed budget conflict']};const r=buildComparisonReading(f.profile,[f.ait,f.vultr],f.dossiers,[a,alternative(f.vultr,f.profile)]);assert.ok(!r.priority.editionIds.includes(f.ait.editionId));
});
test('DP07 affirmed claim strengthening preserves support, equal evidence remains unordered',()=>{
 const f=comparisonFixture();for(const d of f.dossiers)for(const c of d.claims)if(c.revisions[0].status==='announced')c.revisions[0].status='confirmed';
 const a=alternative(f.ait,f.profile);assert.equal(buildAlternativeReading(f.profile,f.ait,f.dossiers,a).evidenceQuality.status,'supported');
 assert.equal(buildComparisonReading(f.profile,[f.ait],f.dossiers,[a]).priority.kind,'unordered');
});
