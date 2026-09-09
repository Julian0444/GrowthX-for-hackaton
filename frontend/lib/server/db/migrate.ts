// Runner de migraciones del recorrido persistido (ticket 08).
//
// Corre como rol administrador (GROWTHX_ADMIN_DATABASE_URL) y es idempotente:
//   1. Asegura los roles de aplicación (growthx_app/growthx_worker/growthx_queue)
//      con contraseñas tomadas de env (defaults SOLO para el contenedor local de
//      desarrollo; en cualquier entorno compartido se pasan por env — decisión
//      abierta D5, ver frontend/db/README.md). En el repo no se guardan secretos.
//   2. Aplica db/migrations/*.sql en orden lexical, una transacción por archivo,
//      registrado en growthx.schema_migrations.
//   3. Instala el esquema de pg-boss BAJO SET ROLE growthx_queue (el rol de cola
//      es dueño de pgboss y de su mantenimiento; no tiene grants de negocio) y
//      crea la cola de evaluaciones.
//   4. Concede a growthx_app el camino mínimo de encolado transaccional:
//      SELECT sobre version/queue e INSERT+SELECT sobre la tabla de jobs de la
//      cola. Administrar la cola sigue siendo exclusivo de growthx_queue.
//
// Uso: pnpm db:migrate   (o `node lib/server/db/migrate.ts` desde frontend/)

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PgBoss, getConstructionPlans } from 'pg-boss';
import { EVALUATION_QUEUE, EVALUATION_QUEUE_OPTIONS } from '../evaluations/queue-config.ts';

const APP_ROLES = [
  { role: 'growthx_app', passwordEnv: 'GROWTHX_APP_DB_PASSWORD', devDefault: 'growthx_app_dev' },
  { role: 'growthx_worker', passwordEnv: 'GROWTHX_WORKER_DB_PASSWORD', devDefault: 'growthx_worker_dev' },
  { role: 'growthx_queue', passwordEnv: 'GROWTHX_QUEUE_DB_PASSWORD', devDefault: 'growthx_queue_dev' },
] as const;

function migrationsDir(): string {
  // Resuelto respecto de este archivo para funcionar igual desde Next, node
  // directo y tests: lib/server/db/ → ../../../db/migrations.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', '..', '..', 'db', 'migrations');
}

async function ensureRoles(client: pg.ClientBase): Promise<void> {
  for (const spec of APP_ROLES) {
    const password = process.env[spec.passwordEnv] ?? spec.devDefault;
    const { rows } = await client.query('select 1 from pg_roles where rolname = $1', [spec.role]);
    if (rows.length === 0) {
      // Identificador fijo de la lista blanca de arriba; la contraseña viaja
      // como literal escapado (CREATE ROLE no admite parámetros).
      await client.query(
        `create role ${spec.role} login password '${password.replaceAll("'", "''")}'`,
      );
    } else {
      await client.query(`alter role ${spec.role} login password '${password.replaceAll("'", "''")}'`);
    }
  }
}

async function applySqlMigrations(client: pg.ClientBase): Promise<string[]> {
  await client.query('create schema if not exists growthx');
  await client.query(`
    create table if not exists growthx.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`);
  const dir = migrationsDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const filename of files) {
    const { rows } = await client.query(
      'select 1 from growthx.schema_migrations where filename = $1',
      [filename],
    );
    if (rows.length > 0) continue;
    const sql = await readFile(path.join(dir, filename), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into growthx.schema_migrations (filename) values ($1)', [filename]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migración ${filename} falló: ${(error as Error).message}`);
    }
    applied.push(filename);
  }
  return applied;
}

async function ensureQueueSchema(client: pg.ClientBase): Promise<void> {
  // El rol de cola necesita poder crear el esquema pgboss.
  await client.query('grant create on database ' + quoteIdent(await currentDatabase(client)) + ' to growthx_queue');
  const { rows } = await client.query(
    "select 1 from information_schema.tables where table_schema = 'pgboss' and table_name = 'version'",
  );
  await client.query('set role growthx_queue');
  try {
    if (rows.length === 0) {
      await client.query(getConstructionPlans('pgboss'));
    }
    // Cola de evaluaciones con política de reintentos explícita (criterio de
    // validación de jobs y límites de reintento). Crear/actualizar es
    // idempotente: pg-boss upserta la cola.
    const boss = new PgBoss({
      db: { executeSql: async (text: string, values?: unknown[]) => client.query(text, values as unknown[] | undefined) },
      schema: 'pgboss',
      migrate: false,
      supervise: false,
      schedule: false,
    });
    await boss.start();
    try {
      await boss.createQueue(EVALUATION_QUEUE, EVALUATION_QUEUE_OPTIONS);
    } catch (error) {
      const message = (error as Error).message;
      if (!/already exists|duplicad/i.test(message)) throw error;
    }
    await boss.stop();
  } finally {
    await client.query('reset role');
  }
  // Camino mínimo de encolado transaccional para growthx_app (send-only):
  const { rows: queueRows } = await client.query(
    'select table_name from pgboss.queue where name = $1',
    [EVALUATION_QUEUE],
  );
  if (queueRows.length !== 1) throw new Error(`La cola ${EVALUATION_QUEUE} no quedó creada`);
  const jobTable = quoteIdent(queueRows[0].table_name as string);
  await client.query('grant usage on schema pgboss to growthx_app');
  await client.query('grant select on pgboss.version, pgboss.queue to growthx_app');
  await client.query(`grant select, insert on pgboss.${jobTable} to growthx_app`);
}

async function currentDatabase(client: pg.ClientBase): Promise<string> {
  const { rows } = await client.query('select current_database() as db');
  return rows[0].db as string;
}

function quoteIdent(name: string): string {
  return '"' + name.replaceAll('"', '""') + '"';
}

export interface MigrateResult {
  appliedFiles: string[];
}

export async function runMigrations(adminUrl?: string): Promise<MigrateResult> {
  const url = adminUrl ?? process.env.GROWTHX_ADMIN_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta GROWTHX_ADMIN_DATABASE_URL (URL de administrador para migrar). Ver frontend/db/README.md.',
    );
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Serializa corridas concurrentes (dos suites de integración en paralelo,
    // dos `pnpm db:migrate`): sin esto, los ALTER ROLE de ensureRoles chocan
    // con «tuple concurrently updated». El lock es de sesión y se libera solo
    // al cerrar la conexión (client.end del finally).
    await client.query("select pg_advisory_lock(hashtext('growthx.migrations'))");
    await ensureRoles(client);
    const appliedFiles = await applySqlMigrations(client);
    await ensureQueueSchema(client);
    return { appliedFiles };
  } finally {
    await client.end();
  }
}

// Ejecutable directo: `node lib/server/db/migrate.ts`
const isMain =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations()
    .then(({ appliedFiles }) => {
      console.log(
        appliedFiles.length > 0
          ? `Migraciones aplicadas: ${appliedFiles.join(', ')}`
          : 'Sin migraciones pendientes.',
      );
      console.log('Esquema pgboss y cola de evaluaciones verificados.');
    })
    .catch((error: unknown) => {
      console.error((error as Error).message);
      process.exitCode = 1;
    });
}
