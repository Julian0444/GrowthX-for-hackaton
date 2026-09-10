import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { closePools, getAppPool } from '../../lib/server/db/pool.ts';

// Se ejecutan los handlers reales, pero la consulta de sesión se sustituye
// antes de cualquier petición. No se abre ninguna conexión a PostgreSQL.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  },
});

const handlers = (async () => {
  const [evaluations, run, ingest, catalog, edition, organizer, decisions, decision, saveOrganizer] = await Promise.all([
    import('../../app/api/evaluations/route.ts'),
    import('../../app/api/evaluations/[id]/route.ts'),
    import('../../app/api/events/ingest/route.ts'),
    import('../../app/api/catalog/editions/route.ts'),
    import('../../app/api/catalog/editions/[id]/route.ts'),
    import('../../app/api/organizers/[id]/route.ts'),
    import('../../app/api/decisions/route.ts'),
    import('../../app/api/decisions/[id]/route.ts'),
    import('../../app/api/evaluations/[id]/organizers/[organizerId]/route.ts'),
  ]);
  const id = '00000000-0000-4000-8000-000000000001';
  const params = { params: Promise.resolve({ id, organizerId: 'organizer-test' }) };
  return [
    { label: 'GET evaluaciones', method: 'GET', call: (request: Request) => evaluations.GET(request) },
    { label: 'POST evaluación', method: 'POST', call: (request: Request) => evaluations.POST(request) },
    { label: 'GET run', method: 'GET', call: (request: Request) => run.GET(request, params) },
    { label: 'POST importación', method: 'POST', call: (request: Request) => ingest.POST(request) },
    { label: 'GET catálogo', method: 'GET', call: (request: Request) => catalog.GET(request) },
    { label: 'GET edición', method: 'GET', call: (request: Request) => edition.GET(request, params) },
    { label: 'GET organizador', method: 'GET', call: (request: Request) => organizer.GET(request, params) },
    { label: 'GET decisiones', method: 'GET', call: (request: Request) => decisions.GET(request) },
    { label: 'POST decisión', method: 'POST', call: (request: Request) => decisions.POST(request) },
    { label: 'GET decisión', method: 'GET', call: (request: Request) => decision.GET(request, params) },
    { label: 'PATCH decisión', method: 'PATCH', call: (request: Request) => decision.PATCH(request, params) },
    { label: 'POST guardar organizador', method: 'POST', call: (request: Request) => saveOrganizer.POST(request, params) },
  ];
})();

test('fallo de la dependencia de sesión es 503; credencial ausente o inválida sigue siendo 401', async t => {
  const previous = process.env.GROWTHX_DATABASE_URL;
  process.env.GROWTHX_DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/unused';
  const pool = getAppPool();
  try {
    for (const handler of await handlers) {
      await t.test(handler.label, async subtest => {
        const query = subtest.mock.method(pool, 'query', async () => {
          throw new Error('Synthetic database outage; no connection attempted');
        });
        const request = (token: boolean) => new Request('http://localhost/api/test', {
          method: handler.method,
          headers: token ? { authorization: 'Bearer synthetic-test-token' } : {},
        });
        const unavailable = await handler.call(request(true));
        assert.equal(unavailable.status, 503, 'una caída de DB no invalida la sesión ni detiene el polling como 401');
        const anonymous = await handler.call(request(false));
        assert.equal(anonymous.status, 401);
        const malformed = await handler.call(new Request('http://localhost/api/test', {
          method: handler.method, headers: { cookie: 'growthx_session=%invalid' },
        }));
        assert.equal(malformed.status, 401, 'una cookie malformada no es una caída de la dependencia');
        assert.equal(query.mock.callCount(), 1, 'sin credencial no se consulta PostgreSQL');
        query.mock.restore();
        subtest.mock.method(pool, 'query', async () => ({ rows: [] }));
        const invalid = await handler.call(request(true));
        assert.equal(invalid.status, 401, 'un token inexistente sigue rechazado');
      });
    }
    await t.test('una sesión válida conserva el usuario y tenant resueltos por el servidor', async subtest => {
      subtest.mock.method(pool, 'query', async () => ({
        rows: [{ user_id: 'user-valid', tenant_id: 'tenant-valid', role: 'member' }],
      }));
      const { resolveHttpSession } = await import('../../lib/server/auth/http-session.ts');
      const result = await resolveHttpSession(new Request('http://localhost/api/test', {
        headers: { authorization: 'Bearer synthetic-valid-token' },
      }));
      assert.deepEqual(result, {
        ok: true, session: { userId: 'user-valid', tenantId: 'tenant-valid', role: 'member' },
      });
    });
  } finally {
    await closePools();
    if (previous === undefined) delete process.env.GROWTHX_DATABASE_URL;
    else process.env.GROWTHX_DATABASE_URL = previous;
  }
});
