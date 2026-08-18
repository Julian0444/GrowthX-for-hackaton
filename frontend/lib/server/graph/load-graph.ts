// Loader del grafo semilla (T1). Lee los tres archivos JSONC de data/seed y
// devuelve el grafo tipado. Es I/O puro: no valida integridad (eso lo hace
// scripts/seed-check.ts) ni deriva nada — solo parsea y tipa.
//
// Los archivos de data/seed llevan un comentario de forma arriba, así que NO
// son JSON estricto: los parseamos como JSONC quitando SOLO líneas de comentario
// completas (`^\s*//`). Nunca se quita nada inline, por lo que los `https://`
// dentro de los strings de datos quedan intactos.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  Community,
  Evidence,
  Organizer,
  SFEvent,
  Theme,
} from '@/lib/contracts/growxth';

export interface SeedGraph {
  events: SFEvent[];
  communities: Community[];
  organizers: Organizer[];
  sourceMeta: {
    source: string;
    fetchedAt: string;
  } | null;
}

const SEED_FILES = {
  events: 'sf-events.json',
  communities: 'sf-communities.json',
  organizers: 'sf-organizers.json',
} as const;

// Archivos opcionales: los temas los genera scripts/compute-topic-momentum.ts
// (topics.json) y la evidencia semilla es opcional. Si no existen, [].
const OPTIONAL_FILES = {
  themes: 'topics.json',
  evidence: 'evidence.json',
  sourceMeta: 'sf-source-meta.json',
} as const;

// Quita solo líneas cuyo primer carácter no-espacio es `//`. Deja intactos los
// `//` que aparecen dentro de strings (URLs). No soporta comentarios de bloque
// ni comas colgantes a propósito: los seed files son JSON estándar + cabecera.
function parseJsonc(text: string, file: string): unknown {
  const stripped = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  try {
    return JSON.parse(stripped);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Seed file ${file} is not valid JSON(C): ${msg}`);
  }
}

// Encuentra data/seed corriendo desde frontend/ o desde la raíz del repo.
function findSeedDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, 'data', 'seed');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const nested = join(process.cwd(), 'frontend', 'data', 'seed');
  if (existsSync(nested)) return nested;
  throw new Error(
    `Could not locate data/seed starting from ${process.cwd()}. ` +
      'Run from the frontend/ directory or the repo root.',
  );
}

function readArray<T>(seedDir: string, file: string): T[] {
  const raw = readFileSync(join(seedDir, file), 'utf8');
  const parsed = parseJsonc(raw, file);
  if (!Array.isArray(parsed)) {
    throw new Error(`Seed file ${file} must contain a top-level JSON array.`);
  }
  return parsed as T[];
}

function readOptionalArray<T>(seedDir: string, file: string): T[] {
  const path = join(seedDir, file);
  if (!existsSync(path)) return [];
  const parsed = parseJsonc(readFileSync(path, 'utf8'), file);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function readOptionalObject<T extends object>(seedDir: string, file: string): T | null {
  const path = join(seedDir, file);
  if (!existsSync(path)) return null;
  const parsed = parseJsonc(readFileSync(path, 'utf8'), file);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : null;
}

export function loadGraph(seedDir: string = findSeedDir()): SeedGraph {
  return {
    events: readArray<SFEvent>(seedDir, SEED_FILES.events),
    communities: readArray<Community>(seedDir, SEED_FILES.communities),
    organizers: readArray<Organizer>(seedDir, SEED_FILES.organizers),
    sourceMeta: readOptionalObject<NonNullable<SeedGraph['sourceMeta']>>(
      seedDir,
      OPTIONAL_FILES.sourceMeta,
    ),
  };
}

// Lector genérico de un array semilla opcional (JSONC). [] si no existe.
// Lo usan conectores como Terac para leer sus propios archivos de data/seed.
export function readSeedArray<T>(file: string, seedDir: string = findSeedDir()): T[] {
  return readOptionalArray<T>(seedDir, file);
}

export function loadThemes(seedDir: string = findSeedDir()): Theme[] {
  return readOptionalArray<Theme>(seedDir, OPTIONAL_FILES.themes);
}

export function loadEvidence(seedDir: string = findSeedDir()): Evidence[] {
  return readOptionalArray<Evidence>(seedDir, OPTIONAL_FILES.evidence);
}

// Evidencia web por comunidad (generada por scripts/enrich_exa.py). Opcional:
// {} si el archivo no existe (Exa falló o no había key) — el sistema sigue igual.
export function loadCommunityEvidence(
  seedDir: string = findSeedDir(),
): Record<string, Evidence[]> {
  const path = join(seedDir, 'community-evidence.json');
  if (!existsSync(path)) return {};
  const parsed = parseJsonc(readFileSync(path, 'utf8'), 'community-evidence.json');
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, Evidence[]>;
  }
  return {};
}
