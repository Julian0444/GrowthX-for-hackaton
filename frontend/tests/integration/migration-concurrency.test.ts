import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { runMigrations } from '../../lib/server/db/migrate.ts';

test('migraciones en bases distintas toleran un ALTER ROLE concurrente del mismo cluster', { timeout: 30000 }, async t => {
  const adminUrl = process.env.GROWTHX_ADMIN_DATABASE_URL ?? 'postgres://growthx:growthx@127.0.0.1:54329/growthx';
  const control = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 3000 });
  try {
    await control.connect();
  } catch {
    await control.end();
    t.skip('PostgreSQL local no disponible para la regresión de concurrencia de migraciones.');
    return;
  }
  const suffix = randomUUID().replaceAll('-', '');
  const database = `growthx_migration_test_${suffix}`;
  const application = `migration-test-${suffix}`;
  let migration: Promise<{ error: unknown | null }> | null = null;
  let databaseCreated = false;
  try {
    await runMigrations(adminUrl);
    await control.query(`create database ${database}`);
    databaseCreated = true;
    const targetUrl = new URL(adminUrl);
    targetUrl.pathname = `/${database}`;
    targetUrl.searchParams.set('application_name', application);
    // Mismo lock que el runner, en la base principal. No protege los roles
    // compartidos frente a un runner que adquiere el lock en otra base.
    await control.query("select pg_advisory_lock(hashtext('growthx.migrations'))");
    const { rows } = await control.query("select rolcanlogin from pg_roles where rolname = 'growthx_app'");
    await control.query('begin');
    // Escribe el mismo valor: no cambia permisos ni credenciales del rol.
    await control.query(`alter role growthx_app ${rows[0].rolcanlogin ? 'login' : 'nologin'}`);
    migration = runMigrations(targetUrl.toString()).then(() => ({ error: null }), error => ({ error }));
    const deadline = Date.now() + 5000;
    let blocked = false;
    while (Date.now() < deadline) {
      // La transacción mantiene el bloqueo de catálogo; refrescar el snapshot
      // de estadísticas permite observar el cliente iniciado después.
      await control.query('select pg_stat_clear_snapshot()');
      const state = await control.query(
        "select 1 from pg_stat_activity where application_name = $1 and wait_event_type = 'Lock' and query ilike 'alter role growthx_app%'",
        [application],
      );
      if (state.rows.length > 0) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(blocked, 'el runner de la segunda base alcanzó el ALTER ROLE concurrente');
    await control.query('commit');
    const result = await migration;
    assert.ifError(result.error);
    // La corrida que enfrentó el conflicto completó todos los archivos y es
    // reabrible/idempotente; no se dio por exitosa una inicialización parcial.
    assert.deepEqual((await runMigrations(targetUrl.toString())).appliedFiles, []);
  } finally {
    await control.query('rollback');
    if (migration) await migration;
    await control.query("select pg_advisory_unlock(hashtext('growthx.migrations'))");
    if (databaseCreated) await control.query(`drop database ${database} with (force)`);
    await control.end();
  }
});
