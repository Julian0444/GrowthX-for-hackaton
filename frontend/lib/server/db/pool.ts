// Pools PostgreSQL por rol de aplicación (ticket 08). Server-only.
//
// Tres roles sin privilegios de propietario/bypass:
// - growthx_app    (GROWTHX_DATABASE_URL): rutas Next; único con acceso a las
//   tablas de identidad (sessions/memberships) para resolver la sesión.
// - growthx_worker (GROWTHX_WORKER_DATABASE_URL): negocio del worker, limitado
//   al tenant del run resuelto por el servidor (contexto por transacción).
// - growthx_queue  (GROWTHX_QUEUE_DATABASE_URL): administra pg-boss; NO tiene
//   grants sobre el esquema de negocio.
//
// Modo degradado (regla de env.ts): si falta la URL no se crashea al importar;
// isEvaluationDbConfigured() permite responder 503 tipado en las rutas.
//
// Imports relativos con extensión .ts: estos módulos corren también bajo
// `node` directo (worker, tests) sin el resolver de tsconfig paths.

import pg from 'pg';

export class EvaluationDbUnavailableError extends Error {
  constructor(envName: string) {
    super(
      `Base de evaluaciones no configurada: falta ${envName}. ` +
        'Ver frontend/db/README.md (pnpm db:up && pnpm db:migrate).',
    );
    this.name = 'EvaluationDbUnavailableError';
  }
}

const pools = new Map<string, pg.Pool>();

function poolFor(envName: string): pg.Pool {
  const url = process.env[envName];
  if (!url) throw new EvaluationDbUnavailableError(envName);
  let pool = pools.get(envName);
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 5 });
    // Un error de conexión ociosa no debe tumbar el proceso.
    pool.on('error', (error) => {
      console.warn(`[db] error en pool ${envName}: ${error.message}`);
    });
    pools.set(envName, pool);
  }
  return pool;
}

export function isEvaluationDbConfigured(): boolean {
  return Boolean(process.env.GROWTHX_DATABASE_URL);
}

export function getAppPool(): pg.Pool {
  return poolFor('GROWTHX_DATABASE_URL');
}

export function getWorkerPool(): pg.Pool {
  return poolFor('GROWTHX_WORKER_DATABASE_URL');
}

export async function closePools(): Promise<void> {
  const open = [...pools.values()];
  pools.clear();
  await Promise.all(open.map((pool) => pool.end()));
}

// Transacción con contexto de tenant fijado por set_config(..., is_local=true):
// se limpia solo en COMMIT/ROLLBACK, así la conexión vuelve al pool sin
// contexto residual. Toda lectura/escritura de negocio pasa por acá; sin
// contexto, la RLS no muestra ninguna fila.
export async function withTenantTransaction<T>(
  pool: pg.Pool,
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('growthx.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // la conexión pudo haberse caído; release(true) la descarta
    }
    throw error;
  } finally {
    client.release();
  }
}
