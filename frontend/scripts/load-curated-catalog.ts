// Carga interna EXPLÍCITA del catálogo curado (ticket 09).
//
//   node scripts/load-curated-catalog.ts --manifest <ruta.json> --tenant <slug>
//   node scripts/load-curated-catalog.ts --fixture --tenant growthx-dev
//
// Este script es el único mecanismo de entrada del catálogo: no hay UI de
// organizador, ni CSV de outcomes, ni scraping. Corre con el rol growthx_app
// (GROWTHX_DATABASE_URL) bajo RLS — sin privilegios de propietario ni bypass —
// y dentro del tenant indicado. La carga es una transacción única e
// idempotente: repetir el mismo manifiesto no duplica eventos ni revisiones.
//
// --fixture carga el manifiesto SINTÉTICO etiquetado (fixture-manifest.ts):
// demuestra el mecanismo y NO acredita eventos reales (DECISIÓN ABIERTA D4).

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { closePools, getAppPool } from '../lib/server/db/pool.ts';
import { FIXTURE_CURATION_MANIFEST } from '../lib/server/catalog/fixture-manifest.ts';
import { parseCurationManifest, type CurationManifest } from '../lib/server/catalog/manifest.ts';
import { listCatalogEditions } from '../lib/server/catalog/read.ts';
import { loadCuratedCatalog } from '../lib/server/catalog/store.ts';

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

async function resolveManifest(): Promise<CurationManifest> {
  if (process.argv.includes('--fixture')) {
    // El fixture también pasa por el parser: mismo camino que un manifiesto real.
    const parsed = parseCurationManifest(JSON.parse(JSON.stringify(FIXTURE_CURATION_MANIFEST)));
    if (!parsed.ok) {
      throw new Error(
        `el manifiesto fixture no valida (bug):\n${parsed.issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n')}`,
      );
    }
    return parsed.manifest;
  }
  const manifestPath = argValue('--manifest');
  if (!manifestPath) {
    throw new Error(
      'Uso: node scripts/load-curated-catalog.ts (--manifest <ruta.json> | --fixture) --tenant <slug>',
    );
  }
  const raw: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  const parsed = parseCurationManifest(raw);
  if (!parsed.ok) {
    throw new Error(
      `manifiesto rechazado:\n${parsed.issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n')}`,
    );
  }
  return parsed.manifest;
}

async function main(): Promise<void> {
  const tenantSlug = argValue('--tenant');
  if (!tenantSlug) {
    throw new Error('Falta --tenant <slug> (p. ej. growthx-dev, sembrado por pnpm db:seed-dev).');
  }
  if (!process.env.GROWTHX_DATABASE_URL) {
    throw new Error('Falta GROWTHX_DATABASE_URL (rol growthx_app). Ver frontend/db/README.md.');
  }
  const manifest = await resolveManifest();

  const pool = getAppPool();
  const { rows } = await pool.query('select id from growthx.tenants where slug = $1', [tenantSlug]);
  if (rows.length === 0) throw new Error(`tenant «${tenantSlug}» inexistente.`);
  const tenantId = rows[0].id as string;

  const summary = await loadCuratedCatalog(pool, tenantId, manifest);
  console.log(`[catalog] manifiesto «${summary.manifestName}» (${summary.material}) → ${summary.status}`);
  if (summary.status === 'already_loaded') {
    console.log('[catalog] mismo hash ya cargado bajo el tenant: no-op idempotente.');
  } else {
    for (const [section, counts] of Object.entries(summary.counts)) {
      console.log(`[catalog]   ${section}: +${counts.inserted} nuevas, ${counts.unchanged} sin cambios`);
    }
  }

  // Estado del catálogo tras la carga: cobertura declarada, nunca fabricada.
  const evaluatedAt = new Date().toISOString();
  const list = await listCatalogEditions(pool, tenantId, evaluatedAt);
  console.log(`[catalog] ediciones: ${list.editions.length} · vigentes al ${evaluatedAt}: ${list.upcomingCount}`);
  if (list.note) console.log(`[catalog] nota: ${list.note}`);
  if (list.upcomingCount < 2 || list.upcomingCount > 5) {
    console.warn(
      `[catalog] AVISO: el criterio del catálogo real pide 2–5 eventos futuros verificados (hay ${list.upcomingCount}).`,
    );
  }
  const organizersWithAntecedent = new Set(
    list.editions
      .filter((edition) => edition.validity.validity === 'past')
      .flatMap((edition) => edition.organizers.map((organizer) => organizer.organizerId)),
  );
  if (organizersWithAntecedent.size < 2) {
    console.warn(
      `[catalog] AVISO: cobertura insuficiente — ${organizersWithAntecedent.size} organizador(es) con antecedente documentado (se piden ≥2). No se fabrica trayectoria.`,
    );
  }
  if (manifest.material === 'synthetic') {
    console.log('[catalog] material sintético etiquetado: NO acredita eventos reales (D4 pendiente).');
  }
}

main()
  .catch((error: unknown) => {
    console.error(`[catalog] ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => void closePools());
