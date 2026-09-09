// Configuración compartida de la cola durable de evaluaciones (ticket 08).
// La usan el runner de migraciones (crea la cola), la aceptación (encola) y el
// worker (procesa). Un solo lugar para nombre, política de reintentos y la
// validación del payload del job.

export const EVALUATION_QUEUE = 'evaluation-run';

// Versión del workflow persistida en cada run: si el procesamiento cambia de
// forma incompatible se versiona acá y el worker decide explícitamente.
export const EVALUATION_WORKFLOW_VERSION = 'evaluation-run/1';

// Límites de reintento explícitos (criterio del ticket): 1 intento + 3
// reintentos; un job activo expira a los 120 s si el worker muere sin avisar.
export const EVALUATION_QUEUE_OPTIONS = {
  retryLimit: 3,
  retryDelay: 2,
  retryBackoff: false,
  expireInSeconds: 120,
} as const;

export const RUN_MAX_ATTEMPTS = EVALUATION_QUEUE_OPTIONS.retryLimit + 1;

export interface EvaluationJobData {
  runId: string;
  tenantId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validación de jobs: el worker no procesa payloads con forma desconocida.
// Devuelve null en vez de lanzar para que el consumidor decida (descartar con
// log, no reintentar a ciegas).
export function validateEvaluationJobData(data: unknown): EvaluationJobData | null {
  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== 2) return null;
  const { runId, tenantId } = candidate;
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) return null;
  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) return null;
  return { runId, tenantId };
}
