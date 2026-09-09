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

import { PgBoss } from 'pg-boss';
import { closePools, getWorkerPool } from '../lib/server/db/pool.ts';
import {
  EVALUATION_QUEUE,
  validateEvaluationJobData,
} from '../lib/server/evaluations/queue-config.ts';
import {
  processEvaluationRun,
  WorkerStopRequested,
} from '../lib/server/evaluations/run-worker.ts';

async function main(): Promise<void> {
  const queueUrl = process.env.GROWTHX_QUEUE_DATABASE_URL;
  if (!queueUrl) throw new Error('Falta GROWTHX_QUEUE_DATABASE_URL (ver frontend/db/README.md)');
  if (!process.env.GROWTHX_WORKER_DATABASE_URL)
    throw new Error('Falta GROWTHX_WORKER_DATABASE_URL (ver frontend/db/README.md)');

  const exitAfterStep = process.env.GROWTHX_WORKER_EXIT_AFTER_STEP ?? null;
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
          await processEvaluationRun(data, { pool, exitAfterStep });
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
