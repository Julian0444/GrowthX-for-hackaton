// Worker de evaluaciones (ticket 08): proceso Node SEPARADO de Next.
//
//   pnpm worker        (desde frontend/; requiere pnpm db:up && pnpm db:migrate)
//
// Usa pg-boss sobre la MISMA PostgreSQL del recorrido: la cola con el rol
// growthx_queue (dueño del esquema pgboss, sin acceso a datos de negocio) y el
// negocio con el rol growthx_worker bajo RLS, con el tenant del run resuelto
// por el servidor al aceptar. Ningún avance depende de un servidor Next
// manteniendo una promesa en memoria: matar este proceso y reiniciarlo retoma
// los runs pendientes desde PostgreSQL.
//
// Variables:
//   GROWTHX_QUEUE_DATABASE_URL    conexión del rol de cola (obligatoria)
//   GROWTHX_WORKER_DATABASE_URL   conexión del rol de negocio (obligatoria)
//   GROWTHX_WORKER_POLL_SECONDS   intervalo de polling (default 2, mínimo 0.5)
//   GROWTHX_WORKER_EXIT_AFTER_STEP  corte controlado tras completar ese paso
//     (demo del ticket y test de reanudación): el job vuelve a la cola y el
//     proceso sale; un arranque posterior sin la variable termina el run.
//
// Barreras de prueba del ticket 15 (matriz de caídas y aislamiento). Solo
// actúan si el arranque las pide explícitamente; en producción no se setean:
//   GROWTHX_WORKER_KILL_AT       punto de barrera (ver ProcessRunDeps.testBarrier)
//     en el que el proceso se mata a sí mismo con SIGKILL — abrupto de verdad:
//     sin stop graceful, sin confirmar el job, sin cerrar pools.
//   GROWTHX_WORKER_LUMA_FIXTURE  ruta a un JSON { url: respuesta } que reemplaza
//     el transporte HTTP del step de obtención Luma. Toda validación del
//     adaptador (allowlist, redirecciones, límites) sigue corriendo; solo el
//     transporte es controlado. URL no grabada → falla (nada sale a la red).

import { appendFileSync, readFileSync } from 'node:fs';
import { PgBoss } from 'pg-boss';
import { closePools, getWorkerPool } from '../lib/server/db/pool.ts';
import {
  EVALUATION_QUEUE,
  validateEvaluationJobData,
} from '../lib/server/evaluations/queue-config.ts';
import {
  processEvaluationRun,
  WorkerStopRequested,
  type ProcessRunDeps,
} from '../lib/server/evaluations/run-worker.ts';

// Entrada del fixture de transporte (ticket 15). El archivo se relee en CADA
// request: el test puede cambiar la respuesta entre reinicios del worker sin
// cambiar el entorno. `hang` deja la request en vuelo para siempre (el test
// mata el proceso «durante la obtención»); `marker` registra que la request
// llegó; `error` simula una fuente caída.
interface LumaFixtureEntry {
  status?: number;
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
  hang?: boolean;
  marker?: string;
  error?: string;
}

function fixtureTransport(fixturePath: string, callsFile: string | null): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (callsFile) appendFileSync(callsFile, `${url}\n`);
    const routes = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, LumaFixtureEntry>;
    const entry = routes[url];
    if (!entry) throw new TypeError(`transporte de fixture: URL no grabada «${url}» (nada sale a la red)`);
    if (entry.marker) appendFileSync(entry.marker, `${url}\n`);
    if (entry.hang) return new Promise<Response>(() => undefined);
    if (entry.error) throw new TypeError(entry.error);
    return new Response(entry.body ?? '', {
      status: entry.status ?? 200,
      headers: { 'content-type': entry.contentType ?? 'text/html', ...(entry.headers ?? {}) },
    });
  }) as typeof fetch;
}

async function main(): Promise<void> {
  const queueUrl = process.env.GROWTHX_QUEUE_DATABASE_URL;
  if (!queueUrl) throw new Error('Falta GROWTHX_QUEUE_DATABASE_URL (ver frontend/db/README.md)');
  if (!process.env.GROWTHX_WORKER_DATABASE_URL)
    throw new Error('Falta GROWTHX_WORKER_DATABASE_URL (ver frontend/db/README.md)');

  const exitAfterStep = process.env.GROWTHX_WORKER_EXIT_AFTER_STEP ?? null;
  const killAt = process.env.GROWTHX_WORKER_KILL_AT || null;
  const testBarrier: ProcessRunDeps['testBarrier'] = killAt
    ? (point) => {
        if (point !== killAt) return;
        // SIGKILL a sí mismo: ni graceful stop, ni ack del job, ni cierre de
        // pools — la caída abrupta que la matriz del ticket 15 exige.
        console.error(`[worker] barrera de prueba «${point}»: SIGKILL inmediato`);
        process.kill(process.pid, 'SIGKILL');
      }
    : undefined;
  const lumaFixture = process.env.GROWTHX_WORKER_LUMA_FIXTURE || null;
  const lumaIngest = lumaFixture
    ? { fetchImpl: fixtureTransport(lumaFixture, process.env.GROWTHX_WORKER_LUMA_CALLS_FILE || null), isFixture: true as const }
    : {};
  const pollingIntervalSeconds = Math.max(
    0.5,
    Number(process.env.GROWTHX_WORKER_POLL_SECONDS ?? '2') || 2,
  );

  const boss = new PgBoss({
    connectionString: queueUrl,
    schema: 'pgboss',
    migrate: false, // el esquema lo administra lib/server/db/migrate.ts
    schedule: false,
    supervise: true, // mantenimiento de la cola (expiración, archivado)
  });
  boss.on('error', (error) => console.error(`[worker] pg-boss: ${error.message}`));

  const pool = getWorkerPool();
  let stopRequested: (() => void) | null = null;
  const stopSignal = new Promise<void>((resolve) => {
    stopRequested = resolve;
  });

  await boss.start();
  await boss.work(
    EVALUATION_QUEUE,
    { batchSize: 1, pollingIntervalSeconds },
    async (jobs) => {
      for (const job of jobs) {
        const data = validateEvaluationJobData(job.data);
        if (!data) {
          // Validación de jobs: forma desconocida no se procesa ni se
          // reintenta a ciegas; queda el fallo persistido en la cola con log.
          console.error(`[worker] job ${job.id} con payload inválido; se marca fallido`);
          throw new Error('payload de job inválido para evaluation-run');
        }
        console.log(`[worker] job ${job.id} → run ${data.runId}`);
        try {
          await processEvaluationRun(data, { pool, exitAfterStep, testBarrier, lumaIngest });
          console.log(`[worker] run ${data.runId} procesado`);
        } catch (error) {
          if (error instanceof WorkerStopRequested) {
            console.warn(`[worker] ${error.message}; el job vuelve a la cola y el proceso sale`);
            stopRequested?.();
          }
          throw error; // pg-boss registra el fallo y programa el reintento
        }
      }
    },
  );
  console.log(
    `[worker] escuchando la cola «${EVALUATION_QUEUE}» (polling ${pollingIntervalSeconds}s)` +
      (exitAfterStep ? ` · corte controlado tras «${exitAfterStep}»` : ''),
  );

  const shutdown = async (code: number): Promise<never> => {
    // graceful: espera a que el job en curso confirme su estado en la cola
    // antes de cerrar; nada queda a medio registrar.
    await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => undefined);
    await closePools().catch(() => undefined);
    process.exit(code);
  };

  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));
  void stopSignal.then(() => shutdown(0));
}

main().catch((error: unknown) => {
  console.error(`[worker] ${(error as Error).message}`);
  process.exitCode = 1;
});
