import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import type { CampaignDraftRecord } from '../../lib/contracts/evaluation.ts';
import { projectCampaignDraft } from '../../lib/api/opportunity-adapter.ts';
import { locationSupport } from '../../lib/evidence/claim-support.ts';
import { baseClaims, dossier } from '../fixtures/trust.ts';
// Renderiza los componentes reales sin servidor ni DB. Node elimina tipos,
// pero necesita transformar JSX y resolver los imports sin extensión de Next.
const root = new URL('../../', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    const target = specifier.startsWith('@/') ? new URL(specifier.slice(2), root)
      : specifier.startsWith('.') && context.parentURL?.startsWith(root)
        ? new URL(specifier, context.parentURL) : null;
    if (target && !/\.[a-z]+$/i.test(target.pathname)) {
      for (const extension of ['.ts', '.tsx']) {
        if (existsSync(fileURLToPath(`${target.href}${extension}`))) return next(`${target.href}${extension}`, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(root) && url.endsWith('.tsx')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    }
    return next(url, context);
  },
});

test('campaña y texto copiable conservan incertidumbre, base y advertencia', async () => {
 const { composeManualCampaignDraft, CampaignDraftPanel } = await import('../../components/atlas/campaign-panel.tsx');
 for (const status of ['inferred','contradicted'] as const) {
  const record:CampaignDraftRecord={contractVersion:'1',id:'camp',decisionId:'decision',objective:'Evaluar workshop',successDefinition:null,modality:{status:'pending'},costItems:[
   {id:'cost',label:'Sponsorship',amount:{status,amount:3000,currency:'USD',basis:'historical_estimate',note:'Falta respuesta del organizador',sourceIds:['s']}},
   {id:'pending',label:'Travel',amount:{status:'unknown',note:'Precio pendiente'}},
  ],openQuestions:['Confirmar audiencia y costo completo'],commitments:[]};
  const view=projectCampaignDraft(record,dossier().sources);
  const text=composeManualCampaignDraft(view);
  assert.match(text,new RegExp(status==='inferred'?'Inferred':'Contradicted'));
  assert.match(text,/historical_estimate/);
  assert.match(text,/not a quote/);
  assert.match(text,/Travel: Pending/);
  const html=renderToStaticMarkup(createElement(CampaignDraftPanel,{view,onBack(){},onToast(){}}));
  assert.match(html,/not a quote/);
  assert.match(html,/Precio pendiente/);
 }
});

test('ubicación announced y confirmed comparten soporte pero no confirmación humana', async () => {
 const { SfEventMap }=await import('../../components/research-dashboard/sf-event-map.tsx');
 for(const status of ['announced','confirmed','contradicted'] as const) {
  const claims=baseClaims.map(c=>c.attribute==='location'?{...c,status,reviewer:status==='confirmed'?'Persona':null,note:status==='contradicted'?'Otra ciudad':null}:c);
  const read=dossier(claims); read.editionRevisions[0].coordinates={lat:37.77,lng:-122.42};
  read.editionRevisions[0].publicLocation={originalAddress:null,address:null,venue:'Sede sintética',city:'San Francisco',precision:'venue',method:'manual',provider:'test',resolvedAt:read.evaluatedAt,sourceIds:['s'],status,limitation:status==='contradicted'?'Otra ciudad':null};
  const policy=locationSupport(claims.find(c=>c.attribute==='location')!);
  assert.equal(policy.usable,status!=='contradicted');
  assert.equal(policy.humanConfirmed,status==='confirmed');
  const html=renderToStaticMarkup(createElement(SfEventMap,{editions:[read],onEdition(){}}));
  assert.ok(html.includes(`data-map-point-count="${status==='contradicted'?0:1}"`));
  if(status!=='contradicted') assert.ok(html.includes('Location does not imply a recommendation')); // markers are mounted by the real browser test
 }
});
