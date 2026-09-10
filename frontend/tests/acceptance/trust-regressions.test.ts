import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEvaluationProfile, parseClaimRevision, parseEventEditionRevision, parseEvaluationSnapshot } from '../../lib/contracts/evaluation-validation.ts';
import { evaluateEligibility } from '../../lib/server/evaluations/eligibility.ts';
import { futureSfConditions } from '../../lib/server/evaluations/research.ts';
import { composeSnapshotNarrative } from '../../lib/server/evaluations/model-adapter.ts';
import { now, profile, claim, baseClaims, dossier } from '../fixtures/trust.ts';
import type { ClaimRevision, EvaluationSnapshot } from '../../lib/contracts/evaluation.ts';

const cases: [string, ClaimRevision[], string][] = [
 ['control con soporte',baseClaims,'eligible'],
 ['USD 3000 + USD 3000 > USD 5000',[...baseClaims,claim('cost:staff',{kind:'money',amount:3000,currency:'USD'})],'excluded'],
 ['partida pendiente',[...baseClaims,claim('cost:staff',{kind:'pending',note:'Costo pendiente'},'pending')],'conditional'],
 ['moneda incomparable',baseClaims.map(c=>c.attribute.startsWith('cost:')?claim(c.attribute,{kind:'money',amount:99999,currency:'EUR'}):c),'conditional'],
 ['audiencia pendiente',baseClaims.map(c=>c.attribute==='audience'?claim('audience',{kind:'pending',note:'Unknown'},'pending'):c),'conditional'],
 ['audiencia ausente',baseClaims.filter(c=>c.attribute!=='audience'),'conditional'],
 ['fecha contradicha',baseClaims.map(c=>c.attribute==='date'?{...c,status:'contradicted',note:'Fuentes discrepan'}:c),'conditional'],
];
for (const [name, cs, expected] of cases) test(name,()=> {
 assert.equal(parseEvaluationProfile(profile).ok,true);
 for (const c of cs) assert.equal(parseClaimRevision(c).ok,true);
 assert.equal(evaluateEligibility({profile,dossier:dossier(cs)}).eligibility.status,expected);
});
test('contratos del caso reproducido', () => { assert.ok(parseEventEditionRevision(dossier().editionRevisions[0]).ok); assert.ok(parseEvaluationSnapshot(snapshot).ok); });
test('investigación conserva confirmed',()=>assert.deepEqual(futureSfConditions(dossier(baseClaims.map(c=>({...c,status:'confirmed'}))),profile),[]));
test('investigación usa el día local de SF',()=>assert.deepEqual(futureSfConditions(dossier(),{...profile,window:{from:'2026-10-01',to:'2026-10-01'}}),[]));
const snapshot: EvaluationSnapshot={contractVersion:'1',id:'snap',kind:'investment_comparison',profileId:'p',profileVersion:1,evaluatedAt:now,claimRevisionIds:['c-date'],organizerRevisionIds:[],editionRevisionIds:['er1'],participationRevisionIds:[],policy:{status:'none',note:'No policy'},alternatives:[{editionId:'e',organizerId:null,eligibility:{status:'eligible'},conditions:[],scoring:{status:'not_scored',reason:'no_policy',note:null}}],ordering:{kind:'presentation_only',editionIds:['e'],note:'No policy'},outcome:{kind:'completed'},narrative:null};
for(const summary of ['El patrocinio cuesta 10 USD y la audiencia está confirmada.','El evento garantiza contrataciones y el acceso exclusivo ya está confirmado.']) test(summary,async()=> {
 const result=await composeSnapshotNarrative({snapshot,claims:[baseClaims[0]]},{apiKey:'test-only',transport:async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({proposals:[{editionId:'e',summary,selectedClaimRevisionIds:['c-date']}]})}]}}]})});
 assert.ok(result.status!=='validated'||result.proposals.every(p=>p.summary!==summary));
});

test('paquetes alternativos no se suman; partidas de la misma opción sí', () => {
 const shared = baseClaims.filter(c => !c.attribute.startsWith('cost:'));
 const option = (name: string, amount: number, optionId: string): ClaimRevision => ({
  ...claim(`cost:${name}`, { kind: 'money', amount, currency: 'USD' }),
  costComposition: { kind: 'alternative', groupId: 'sponsorship', optionId },
 });
 const separate = [option('bronze', 3000, 'bronze'), option('silver', 3000, 'silver')];
 assert.equal(evaluateEligibility({ profile, dossier: dossier([...shared, ...separate]) }).eligibility.status, 'conditional');
 const combined = [option('fee', 3000, 'bronze'), option('staff', 3000, 'bronze')];
 assert.equal(evaluateEligibility({ profile, dossier: dossier([...shared, ...combined]) }).eligibility.status, 'excluded');
 const common = claim('cost:travel', { kind: 'money', amount: 2500, currency: 'USD' });
 assert.equal(evaluateEligibility({ profile, dossier: dossier([...shared, ...separate, common]) }).eligibility.status, 'excluded');
 const unknown = { ...option('unknown', 0, 'unknown'), value: { kind: 'pending' as const, note: 'sin cotización' }, status: 'pending' as const, sourceIds: [] };
 assert.equal(evaluateEligibility({ profile, dossier: dossier([...shared, option('expensive', 6000, 'expensive'), unknown]) }).eligibility.status, 'conditional');
});

test('un costo conocido + moneda extranjera o estimación no acreditan presupuesto completo', () => {
 for (const item of [claim('cost:travel', {kind:'money', amount: 100, currency:'EUR'}), claim('cost:travel', {kind:'money', amount: 100, currency:'USD'}, 'inferred')]) {
  const read = dossier([...baseClaims, item]);
  assert.equal(evaluateEligibility({profile,dossier:read}).eligibility.status,'conditional');
  assert.deepEqual(futureSfConditions(read,profile), [], 'los faltantes comerciales no ocultan una edición futura investigable');
 }
});

test('acceso pendiente y contradicho conserva condición, no incompatibilidad', () => {
 for(const status of ['pending','contradicted'] as const) {
  const cs = baseClaims.map(c => c.attribute === 'access' ? {...c, status, note:'Sin resolver'} : c);
  const result = evaluateEligibility({profile:{...profile,restrictions:['Open registration']}, dossier:dossier(cs)});
  assert.equal(result.eligibility.status,'conditional');
  assert.ok(result.conditions.some(c=>/acceso/i.test(c.description)));
 }
});

test('fecha contradicha no excluye por el valor disputado aun fuera de ventana', () => {
 const cs=baseClaims.map(c=>c.attribute==='date'?{...c,status:'contradicted' as const,note:'Dos fechas distintas'}:c);
 const p={...profile,window:{from:'2027-01-01',to:'2027-01-31'}};
 const read=dossier(cs);
 read.validity={validity:'past',reason:'Instante disputado'};
 assert.equal(evaluateEligibility({profile:p,dossier:read}).eligibility.status,'conditional');
 assert.deepEqual(futureSfConditions(read,p),evaluateEligibility({profile:p,dossier:read}).conditions.map(c=>c.description));
});

test('fechas ambiguas, desconocidas y zonas inválidas siguen pendientes en ambos caminos', () => {
 for (const startDate of [
  {precision:'ambiguous' as const,text:'Octubre o noviembre',earliest:null,latest:null},
  {precision:'unknown' as const},
  {precision:'instant' as const,iso:'2026-10-02T01:00:00Z',timezone:'zona inválida'},
 ]) {
  const read=dossier();
  read.editionRevisions[0].startDate=startDate;
  read.validity={validity:'date_ambiguous',reason:'Fecha por resolver'};
  const p={...profile,window:{from:'2026-10-01',to:'2026-10-01'}};
  assert.equal(evaluateEligibility({profile:p,dossier:read}).eligibility.status,'conditional');
  assert.ok(futureSfConditions(read,p).some(c=>/fecha|zona/i.test(c)));
 }
});

test('narrativa positiva publica exactamente fecha, atributo y estado seleccionados', async () => {
 const result=await composeSnapshotNarrative({snapshot,claims:[baseClaims[0]]},{apiKey:'test-only',transport:async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({proposals:[{editionId:'e',summary:'Fecha publicada del evento',selectedClaimRevisionIds:['c-date']}]})}]}}]})});
 assert.equal(result.status,'validated');
 assert.equal(result.proposals[0].summary,'date [observed]: 2026-10-02T01:00:00Z · America/Los_Angeles');
 assert.equal(result.proposals[0].withheldNote,null);
});

test('un atributo de costo con valor fecha no es un claim admitido', async () => {
 const wrong={...baseClaims[0],attribute:'cost:sponsorship'};
 const result=await composeSnapshotNarrative({snapshot,claims:[wrong]},{apiKey:'test-only',transport:async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({proposals:[{editionId:'e',summary:'Precio 10 USD',selectedClaimRevisionIds:['c-date']}]})}]}}]})});
 assert.equal(result.status,'rejected');
});

test('la composición de costos es explícita y los contratos v1 anteriores siguen legibles', () => {
 const cost=baseClaims.find(c=>c.attribute.startsWith('cost:'))!;
 assert.deepEqual(parseClaimRevision(cost), {ok:true,value:cost});
 assert.ok(!parseClaimRevision({...cost,costComposition:{kind:'alternative',groupId:'sponsors'}}).ok);
 assert.ok(!parseClaimRevision({...baseClaims[0],costComposition:{kind:'additive'}}).ok);
 const alternative={...cost,costComposition:{kind:'alternative',groupId:'sponsors',optionId:'bronze'}};
 assert.deepEqual(parseClaimRevision(alternative),{ok:true,value:alternative});
});

test('una narrativa de costo conserva su atributo, importe y estado inferido', async () => {
 const cost={...baseClaims.find(c=>c.attribute.startsWith('cost:'))!,status:'inferred' as const,note:'Estimación por antecedente'};
 const result=await composeSnapshotNarrative({snapshot:{...snapshot,claimRevisionIds:[cost.id]},claims:[cost]},{apiKey:'test-only',transport:async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({proposals:[{editionId:'e',summary:'Precio confirmado con contratación garantizada',selectedClaimRevisionIds:[cost.id]}]})}]}}]})});
 assert.equal(result.status,'validated');
 assert.equal(result.proposals[0].summary,'cost:sponsorship [inferred]: USD 3000 · Estimación por antecedente');
 assert.doesNotMatch(result.proposals[0].summary,/confirmado|garantizada/);
});
