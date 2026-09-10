import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { FIXTURE_CURATION_MANIFEST as catalog } from '../../lib/server/catalog/fixture-manifest.ts';
import type { EditionDossierRead } from '../../lib/api/atlas-client.ts';

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
const components = Promise.all([
  import('../../components/atlas/evidence-links.tsx'),
  import('../../components/research-dashboard/research-dossier.tsx'),
]);

test('las fuentes sintéticas visibles conservan procedencia pero no envían a páginas inexistentes', async () => {
  const [{ SourceRecordLinks }] = await components;
  const html = renderToStaticMarkup(createElement(SourceRecordLinks, { sources: catalog.sources }));
  assert.doesNotMatch(html, /<a\b/, 'el catálogo sintético no publica enlaces externos navegables');
  assert.match(html, /luma \(synthetic\)/);
  assert.match(html, /Fuente de prueba/);
});

test('el dossier sintético no ofrece abrir un listado inexistente', async () => {
  const [, { EditionDossier }] = await components;
  const read: EditionDossierRead = {
    contractVersion: '1', evaluatedAt: catalog.verifiedAt, editionId: catalog.editions[0].editionId,
    editionRevisions: [catalog.editions[0]], validity: { validity: 'upcoming', reason: 'reloj de prueba' },
    organizers: [], claims: [], participations: [], companies: [], sources: catalog.sources,
    curation: { material: 'synthetic', authorizedBy: catalog.authorizedBy, verifiedAt: catalog.verifiedAt, manifestName: catalog.name, note: catalog.note },
  };
  const html = renderToStaticMarkup(createElement(EditionDossier, { read, onEdition() {}, onOrganizer() {} }));
  assert.doesNotMatch(html, /<a[^>]+href="https:\/\/luma\.example/);
  assert.match(html, /Listado de prueba/);
});

test('un enlace público real se conserva y un esquema ejecutable nunca se publica', async () => {
  const [{ SourceRecordLinks }] = await components;
  const source = { ...catalog.sources[0], provider: 'luma', url: 'https://lu.ma/evento-publico', method: 'http_get+jsonld_extraction' };
  const html = renderToStaticMarkup(createElement(SourceRecordLinks, { sources: [source] }));
  assert.match(html, /href="https:\/\/lu.ma\/evento-publico"/);
  const invalid = renderToStaticMarkup(createElement(SourceRecordLinks, { sources: [{ ...source, url: 'javascript:alert(1)' }] }));
  assert.doesNotMatch(invalid, /<a\b/);
});

test('el transporte de demo y su captura histórica no se presentan como obtención real de Luma', async () => {
  const [{ SourceRecordLinks }] = await components;
  const source = { ...catalog.sources[0], provider: 'luma', url: 'https://lu.ma/demo', method: 'test_fixture+jsonld_extraction' };
  const html = renderToStaticMarkup(createElement(SourceRecordLinks, { sources: [source] }));
  assert.doesNotMatch(html, /<a\b/);
  assert.match(html, /Fuente de prueba/);
  const historical = { ...source, method: 'http_get+jsonld_extraction', content: {
    kind: 'hash' as const, sha256: '5a5fa514b5e86b8f3f0a85950cd994309b39e7685045b6b5e749a1e1ad6871d2',
  } };
  assert.doesNotMatch(renderToStaticMarkup(createElement(SourceRecordLinks, { sources: [historical] })), /<a\b/);
});

test('el listado reconoce aliases Luma y una revisión real posterior no hereda el fixture histórico', async () => {
  const [, { EditionDossier }] = await components;
  const fixtureSource = { ...catalog.sources[0], id: 'fixture-source', provider: 'luma', url: 'https://luma.com/listing/?ref=qa', method: 'test_fixture+jsonld_extraction' };
  const realSource = { ...fixtureSource, id: 'real-source', method: 'http_get+jsonld_extraction' };
  const fixtureClaim = { ...catalog.claims[0], id: 'fixture-claim', sourceIds: [fixtureSource.id] };
  const realClaim = { ...fixtureClaim, id: 'real-claim', previousRevisionId: fixtureClaim.id, sourceIds: [realSource.id] };
  const read: EditionDossierRead = {
    contractVersion: '1', evaluatedAt: catalog.verifiedAt, editionId: catalog.editions[0].editionId,
    editionRevisions: [{ ...catalog.editions[0], canonicalUrl: 'https://lu.ma/listing', claimRevisionIds: [fixtureClaim.id] }],
    validity: { validity: 'upcoming', reason: 'reloj de prueba' }, organizers: [],
    claims: [{ claimId: fixtureClaim.claimId, revisions: [fixtureClaim] }],
    participations: [], companies: [], sources: [fixtureSource],
    curation: { material: 'imported', authorizedBy: catalog.authorizedBy, verifiedAt: catalog.verifiedAt, manifestName: 'import-check', note: null },
  };
  const render = () => renderToStaticMarkup(createElement(EditionDossier, { read, onEdition() {}, onOrganizer() {} }));
  assert.doesNotMatch(render(), /<a[^>]+href="https:\/\/lu.ma\/listing"/);
  assert.match(render(), /Listado de prueba/);
  read.sources.push(realSource);
  read.claims[0].revisions.push(realClaim);
  read.editionRevisions.push({ ...read.editionRevisions[0], id: 'real-edition-revision', previousRevisionId: read.editionRevisions[0].id, claimRevisionIds: [realClaim.id] });
  assert.match(render(), /href="https:\/\/lu.ma\/listing"/);
});
