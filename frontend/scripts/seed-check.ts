// Validador del grafo semilla (T1). Corre desde frontend/:
//   npx tsx scripts/seed-check.ts
// (o cualquier runner de TS; usa el alias @/ de tsconfig).
//
// Chequea: ids únicos por colección + integridad referencial cruzada (sin ids
// colgantes). Reporta conteos y sale 0 si todo cierra, 1 si hay problemas.
// Con arrays vacíos: 0 problemas, sale 0.

// Import relativo con extensión (no el alias @/): este script corre con `node`
// directo, sin el resolver de tsconfig paths.
import { loadGraph } from '../lib/server/graph/load-graph.ts';

interface Problem {
  file: string;
  message: string;
}

function checkDuplicateIds(
  file: string,
  items: { id: string }[],
  problems: Problem[],
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id) {
      problems.push({ file, message: 'Item sin "id".' });
      continue;
    }
    if (seen.has(item.id)) {
      problems.push({ file, message: `id duplicado: "${item.id}".` });
    }
    seen.add(item.id);
  }
}

function checkRefs(
  fromFile: string,
  refs: { ownerId: string; field: string; ids: string[] }[],
  targetIds: Set<string>,
  targetName: string,
  problems: Problem[],
): void {
  for (const ref of refs) {
    for (const id of ref.ids) {
      if (!targetIds.has(id)) {
        problems.push({
          file: fromFile,
          message: `"${ref.ownerId}".${ref.field} apunta a ${targetName} inexistente: "${id}".`,
        });
      }
    }
  }
}

function main(): void {
  const graph = loadGraph();
  const problems: Problem[] = [];

  const eventIds = new Set(graph.events.map((e) => e.id));
  const communityIds = new Set(graph.communities.map((c) => c.id));
  const organizerIds = new Set(graph.organizers.map((o) => o.id));

  checkDuplicateIds('sf-events.json', graph.events, problems);
  checkDuplicateIds('sf-communities.json', graph.communities, problems);
  checkDuplicateIds('sf-organizers.json', graph.organizers, problems);

  // Eventos -> comunidades / organizadores
  checkRefs(
    'sf-events.json',
    graph.events.map((e) => ({ ownerId: e.id, field: 'communityIds', ids: e.communityIds })),
    communityIds,
    'community',
    problems,
  );
  checkRefs(
    'sf-events.json',
    graph.events.map((e) => ({ ownerId: e.id, field: 'organizerIds', ids: e.organizerIds })),
    organizerIds,
    'organizer',
    problems,
  );

  // Comunidades -> organizadores
  checkRefs(
    'sf-communities.json',
    graph.communities.map((c) => ({ ownerId: c.id, field: 'organizerIds', ids: c.organizerIds })),
    organizerIds,
    'organizer',
    problems,
  );

  // Organizadores -> eventos / comunidades
  checkRefs(
    'sf-organizers.json',
    graph.organizers.map((o) => ({ ownerId: o.id, field: 'organizesEventIds', ids: o.organizesEventIds })),
    eventIds,
    'event',
    problems,
  );
  checkRefs(
    'sf-organizers.json',
    graph.organizers.map((o) => ({ ownerId: o.id, field: 'communityIds', ids: o.communityIds })),
    communityIds,
    'community',
    problems,
  );

  console.log('GrowXth seed-check');
  console.log('------------------');
  console.log(`events:      ${graph.events.length}`);
  console.log(`communities: ${graph.communities.length}`);
  console.log(`organizers:  ${graph.organizers.length}`);
  console.log('');

  if (problems.length === 0) {
    console.log('OK — sin ids colgantes ni duplicados.');
    process.exit(0);
  }

  console.error(`${problems.length} problema(s):`);
  for (const p of problems) {
    console.error(`  [${p.file}] ${p.message}`);
  }
  process.exit(1);
}

main();
