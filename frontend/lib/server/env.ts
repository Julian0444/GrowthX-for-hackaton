// Guard de variables de entorno (T7). NUNCA crashea: si falta una key, emite
// un warning y el sistema sigue en modo degradado (mock/seed). Las keys solo se
// usan en app/api/** y lib/server/**.

interface EnvSpec {
  name: string;
  purpose: string;
  requiredInProd?: boolean; // si falta EN PRODUCCIÓN, warning más fuerte
}

const SPECS: EnvSpec[] = [
  { name: 'APP_URL', purpose: 'base URL del webhook y tareas externas' },
  { name: 'PUBLIC_APP_URL', purpose: 'URL pública sin interstitial para links enviados por Linq' },
  { name: 'LINQ_API_KEY', purpose: 'envío real de mensajes por Linq' },
  { name: 'LINQ_WEBHOOK_SECRET', purpose: 'verificación de firma del webhook de Linq', requiredInProd: true },
  { name: 'TERAC_API_KEY', purpose: 'borradores y resultados A/B de Terac' },
  { name: 'EXA_API_KEY', purpose: 'discovery live de eventos y enriquecimiento de fuentes públicas con Exa' },
  { name: 'GEMINI_API_KEY', purpose: 'razonamiento y decisión explicable con Gemini (structured output)' },
  { name: 'APIFY_TOKEN', purpose: 'señales mundiales de Google Trends, GitHub y X' },
];

let alreadyChecked = false;

export interface EnvReport {
  missing: string[];
  warnings: string[];
}

interface PublicUrlEnv {
  PUBLIC_APP_URL?: string;
  APP_URL?: string;
}

export function resolvePublicAppUrl(
  env: PublicUrlEnv = process.env as PublicUrlEnv,
): string {
  return (env.PUBLIC_APP_URL ?? env.APP_URL ?? '').replace(/\/+$/, '');
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
