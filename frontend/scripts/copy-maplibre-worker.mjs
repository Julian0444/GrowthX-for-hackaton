import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Next's asset pipeline does not emit the worker's sibling module. Serve the
// two installed, version-matched modules from the same origin in both bundlers.
const packagePath = createRequire(import.meta.url).resolve('maplibre-gl/package.json');
const { version } = JSON.parse(readFileSync(packagePath, 'utf8'));
const dist = path.join(path.dirname(packagePath), 'dist');
const dest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/maplibre', version);
mkdirSync(dest, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
