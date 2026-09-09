// Guard de variables de entorno (T7). NUNCA crashea: si falta una key, emite
// un warning y el sistema sigue en modo degradado (mock/seed). Las keys solo se
// usan en app/api/** y lib/server/**.

interface EnvSpec {
  name: string;
  purpose: string;
  requiredInProd?: boolean; // si falta EN PRODUCCIÓN, warning más fuerte
}

const SPECS: EnvSpec[] = [
  { name: 'EXA_API_KEY', purpose: 'discovery live de eventos y enriquecimiento de fuentes públicas con Exa' },
  { name: 'GEMINI_API_KEY', purpose: 'razonamiento y decisión explicable con Gemini (structured output)' },
  { name: 'APIFY_TOKEN', purpose: 'señales mundiales de Google Trends, GitHub y X' },
  // Recorrido persistido (ticket 08). Sin estas URLs, /api/evaluations responde
  // 503 tipado y el resto de la app sigue en el recorrido v0. El worker y el
  // runner de migraciones validan las suyas al arrancar (son procesos
  // explícitos). Ver frontend/db/README.md.
  { name: 'GROWTHX_DATABASE_URL', purpose: 'PostgreSQL rol growthx_app: rutas /api/evaluations y sesiones' },
  { name: 'GROWTHX_WORKER_DATABASE_URL', purpose: 'PostgreSQL rol growthx_worker: negocio del worker bajo RLS' },
  { name: 'GROWTHX_QUEUE_DATABASE_URL', purpose: 'PostgreSQL rol growthx_queue: cola pg-boss del worker' },
];

let alreadyChecked = false;

export interface EnvReport {
  missing: string[];
  warnings: string[];
}

export function checkEnv(): EnvReport {
  const isProd = process.env.NODE_ENV === 'production';
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const spec of SPECS) {
    if (!process.env[spec.name]) {
      missing.push(spec.name);
      const level = spec.requiredInProd && isProd ? 'FALTA (requerida en prod)' : 'falta (modo degradado)';
      warnings.push(`[env] ${spec.name} ${level} — ${spec.purpose}`);
    }
  }
  return { missing, warnings };
}

// Corre el chequeo una sola vez por proceso y loguea (nunca lanza).
export function checkEnvOnce(): EnvReport {
  const report = checkEnv();
  if (!alreadyChecked) {
    alreadyChecked = true;
    for (const w of report.warnings) console.warn(w);
  }
  return report;
}
