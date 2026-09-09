// Encolado durable de runs (ticket 08). Server-only.
//
// La aceptación es ATÓMICA: el INSERT del job de pg-boss viaja por el MISMO
// cliente/transacción que insertó perfil, run y steps (opción `db` por llamada
// de pg-boss). No puede existir una respuesta 202 con un trabajo perdido entre
// commit y encolado: son el mismo commit.
//
// La instancia send-only corre con el rol growthx_app (grants mínimas: SELECT
// sobre pgboss.version/pgboss.queue e INSERT sobre la tabla de jobs de la
// cola). No migra, no supervisa ni agenda: administrar la cola es del rol
// growthx_queue, que a su vez no tiene acceso a datos de negocio.

import type pg from 'pg';
import { PgBoss } from 'pg-boss';
import { EVALUATION_QUEUE, type EvaluationJobData } from './queue-config.ts';

export interface EvaluationQueue {
  // Inserta el job DENTRO de la transacción del cliente recibido.
  sendRunJob(client: pg.ClientBase, job: EvaluationJobData): Promise<void>;
}

let sendOnlyBoss: Promise<PgBoss> | null = null;

async function getSendOnlyBoss(): Promise<PgBoss> {
  if (!sendOnlyBoss) {
    sendOnlyBoss = (async () => {
      const url = process.env.GROWTHX_DATABASE_URL;
      if (!url) throw new Error('Falta GROWTHX_DATABASE_URL para encolar evaluaciones');
      const boss = new PgBoss({
        connectionString: url,
        schema: 'pgboss',
        max: 2,
        migrate: false,
        supervise: false,
        schedule: false,
      });
      boss.on('error', (error) => console.warn(`[queue] pg-boss (send-only): ${error.message}`));
      await boss.start();
      return boss;
    })();
    // Si el arranque falla (p. ej. base caída), el próximo intento reintenta.
    sendOnlyBoss.catch(() => {
      sendOnlyBoss = null;
    });
  }
  return sendOnlyBoss;
}

export const transactionalEvaluationQueue: EvaluationQueue = {
  async sendRunJob(client, job) {
    const boss = await getSendOnlyBoss();
    const jobId = await boss.send(EVALUATION_QUEUE, { ...job }, {
      // El insert del job se ejecuta con el cliente de la transacción de
      // aceptación: commit y encolado son indivisibles.
      db: {
        executeSql: async (text: string, values?: unknown[]) =>
          client.query(text, values as unknown[] | undefined),
      },
      // Un job activo/en cola por run: reentregas de la aceptación no duplican.
      singletonKey: job.runId,
    });
    if (jobId === null) {
      // singletonKey ya en cola: para un run recién insertado no debería pasar;
      // se trata como fallo de aceptación (la transacción entera se revierte).
      throw new Error(`La cola rechazó el job del run ${job.runId} (singleton duplicado)`);
    }
  },
};

// Cierra la instancia send-only (tests / apagado ordenado).
export async function stopEvaluationQueue(): Promise<void> {
  if (!sendOnlyBoss) return;
  const pending = sendOnlyBoss;
  sendOnlyBoss = null;
  try {
    const boss = await pending;
    await boss.stop({ graceful: false });
  } catch {
    // ya estaba caída; nada que cerrar
  }
}
