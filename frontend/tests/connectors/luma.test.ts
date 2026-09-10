import assert from 'node:assert/strict';
import { test } from 'node:test';
import { declaredDateFromLuma, fetchLumaEvent } from '../../lib/server/catalog/luma-adapter.ts';
import { parseLumaFetchOutput } from '../../lib/server/evaluations/luma-step.ts';

const EVENT_URL = 'https://lu.ma/import-check';
const NOW = '2026-09-09T12:00:00.000Z';

test('Luma: un día inexistente permanece desconocido en fechas simples, locales e instantes', () => {
  for (const invalid of ['2027-02-29', '2027-02-31', '2027-04-31', '2027-02-31T18:00:00-07:00', '2027-02-31T18:00:00']) {
    assert.deepEqual(declaredDateFromLuma(invalid), { precision: 'unknown' }, invalid);
  }
  assert.deepEqual(declaredDateFromLuma('2028-02-29'), { precision: 'date_only', date: '2028-02-29', timezone: null });
  assert.deepEqual(declaredDateFromLuma('2028-02-29T18:00:00-07:00'), {
    precision: 'instant', iso: '2028-02-29T18:00:00-07:00', timezone: '-07:00',
  });
  assert.equal(declaredDateFromLuma('2028-02-29T18:00:00').precision, 'ambiguous');
});

function htmlTransport(html: string): typeof fetch {
  return async () => new Response(html, { headers: { 'content-type': 'text/html' } });
}

test('Luma: un título OG de página vacía o calendario no crea un dossier de evento', async () => {
  for (const title of ['Page not found · Luma', 'San Francisco · Luma']) {
    await assert.rejects(
      fetchLumaEvent(EVENT_URL, {
        fetchImpl: htmlTransport(`<meta property="og:title" content="${title}">`),
      }),
      /extracción fallida/,
    );
  }
});

test('Luma: una redirección a la portada con metadatos genéricos no crea un evento', async () => {
  const calls: string[] = [];
  await assert.rejects(
    fetchLumaEvent(EVENT_URL, {
      fetchImpl: async (input) => {
        calls.push(String(input));
        return calls.length === 1
          ? new Response(null, { status: 302, headers: { location: '/' } })
          : new Response('<meta property="og:title" content="Luma · Delightful Events">');
      },
    }),
    /extracción fallida/,
  );
  assert.deepEqual(calls, [EVENT_URL, 'https://lu.ma/']);
});

test('Luma: JSON-LD parcial identifica el evento y conserva sus campos ausentes', async () => {
  const output = await fetchLumaEvent(EVENT_URL, {
    fetchImpl: htmlTransport('<script type="application/ld+json">{"@type":"Event","name":"Community Night"}</script>'),
  });
  assert.equal(output.fields.name, 'Community Night');
  assert.equal(output.fields.startsAt, null);
  assert.equal(output.fields.city, null);
  assert.equal(output.extraction.status, 'partial');
});

test('Luma: tickets InStock no confirman acceso abierto ni eliminan el pendiente de aprobación', async () => {
  const output = await fetchLumaEvent(EVENT_URL, {
    fetchImpl: htmlTransport(`<script type="application/ld+json">${JSON.stringify({
      '@type': 'Event', name: 'Approval Required Event',
      offers: { '@type': 'Offer', availability: 'https://schema.org/InStock' },
    })}</script><p>Approval Required: your registration is subject to host approval.</p>`),
  });
  assert.equal(output.fields.registrationStatus, null);
  assert.ok(!output.extraction.fieldsExtracted.includes('registrationStatus'));
  assert.ok(output.extraction.warnings.some((warning) => warning.includes('no confirma acceso abierto')));
});

test('Luma: encuentra JSON-LD Event en @graph con comillas simples y tipos expandidos', async () => {
  const output = await fetchLumaEvent(EVENT_URL, {
    fetchImpl: htmlTransport(`<script data-note="structured" type = 'application/ld+json'>${JSON.stringify({
      '@graph': [
        { '@type': 'WebSite', name: 'Luma' },
        { '@type': ['https://schema.org/Event'], name: 'Community Night', startDate: '2027-04-20T18:00:00-07:00', location: { address: { addressLocality: 'San Francisco' } } },
      ],
    })}</script>`),
  });
  assert.equal(output.fields.name, 'Community Night');
  assert.equal(output.fields.city, 'San Francisco');
  assert.equal(output.extraction.status, 'complete');
});

test('Luma: OG puede completar el nombre de un Event confirmado, independientemente del orden de atributos', async () => {
  const output = await fetchLumaEvent(EVENT_URL, {
    fetchImpl: htmlTransport(`<meta content='Community Night' property='og:title'><script type="application/ld+json">{"@type":"Event"}</script>`),
  });
  assert.equal(output.fields.name, 'Community Night');
  assert.equal(output.extraction.status, 'partial');
});

test('Luma: el transporte fixture conserva su procedencia tras guardar y reanudar el step', async () => {
  const html = '<script type="application/ld+json">{"@type":"Event","name":"Community Night"}</script>';
  const fixture = await fetchLumaEvent(EVENT_URL, {
    fetchImpl: htmlTransport(html),
    isFixture: true,
    now: () => new Date(NOW),
  });
  assert.equal(fixture.isFixture, true);
  assert.equal(parseLumaFetchOutput(JSON.parse(JSON.stringify(fixture))).isFixture, true);
  assert.throws(() => parseLumaFetchOutput({ ...fixture, isFixture: 'true' }), /forma desconocida/);

  const normal = await fetchLumaEvent(EVENT_URL, { fetchImpl: htmlTransport(html) });
  assert.equal(normal.isFixture, undefined, 'el HTML y la URL no deciden la procedencia del transporte');
  assert.equal(parseLumaFetchOutput(normal).isFixture, undefined, 'los steps anteriores sin marca siguen siendo legibles');
});
