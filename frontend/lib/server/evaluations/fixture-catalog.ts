// Catálogo CONTROLADO de prueba para la primera ruta del worker (ticket 08).
//
// Es material PREPARADO (status 'prepared' del vocabulario de auditoría): sirve
// para demostrar el mecanismo durable — aceptar, procesar, persistir,
// recuperar — y NO representa organizadores ni eventos reales publicados. La
// decisión abierta D4 (catálogo real verificado de SF) sigue pendiente; cuando
// se resuelva, esta fuente se reemplaza por el catálogo materializado bajo el
// tenant. Ninguna entrada lleva fecha de edición: quedan «pendientes de
// verificación», nunca fechas inventadas.

export interface FixtureOrganizer {
  organizerId: string;
  displayName: string;
  focusTags: string[]; // tema/stack declarado del organizador (material preparado)
  audienceTags: string[];
  editions: { editionId: string; name: string; note: string }[];
}

export const FIXTURE_CATALOG_NOTE =
  'Catálogo de prueba (material preparado, status prepared): demuestra el mecanismo durable; ' +
  'no representa organizadores ni eventos reales. D4 pendiente.';

export const FIXTURE_CATALOG: FixtureOrganizer[] = [
  {
    organizerId: 'fixture-org-mission-devs',
    displayName: 'Mission District Devs (fixture)',
    focusTags: ['python', 'ai', 'ml', 'data'],
    audienceTags: ['backend', 'ml engineers'],
    editions: [
      {
        editionId: 'fixture-ed-mission-devs-01',
        name: 'Mission Devs Meetup (fixture)',
        note: 'edición de prueba; fecha y lugar por verificar',
      },
    ],
  },
  {
    organizerId: 'fixture-org-soma-frontend',
    displayName: 'SoMa Frontend Circle (fixture)',
    focusTags: ['javascript', 'typescript', 'react', 'frontend'],
    audienceTags: ['frontend', 'fullstack'],
    editions: [
      {
        editionId: 'fixture-ed-soma-frontend-01',
        name: 'SoMa Frontend Night (fixture)',
        note: 'edición de prueba; fecha y lugar por verificar',
      },
    ],
  },
];

export interface CatalogCandidate {
  organizerId: string;
  displayName: string;
  matchedAttributes: string[]; // razones por atributo (nunca un índice de confianza)
  pending: string[]; // qué falta confirmar
  editions: { editionId: string; name: string; note: string }[];
}

export interface CatalogResearchResult {
  kind: 'catalog_research';
  catalogNote: string;
  candidates: CatalogCandidate[];
  coverage: { organizersInCatalog: number; matched: number };
}

// Matching estructurado mínimo: solapamiento de stack declarado. Sin
// coincidencias se informa el límite del catálogo (candidates vacío + nota),
// no se inventa afinidad.
export function researchFixtureCatalog(input: {
  stack: string[];
  audienceDescription: string;
}): CatalogResearchResult {
  const stackLower = input.stack.map((item) => item.toLowerCase());
  const candidates: CatalogCandidate[] = [];
  for (const organizer of FIXTURE_CATALOG) {
    const matchedStack = organizer.focusTags.filter((tag) =>
      stackLower.some((item) => item.includes(tag) || tag.includes(item)),
    );
    if (matchedStack.length === 0 && stackLower.length > 0) continue;
    const matchedAttributes =
      matchedStack.length > 0
        ? matchedStack.map((tag) => `stack declarado del organizador incluye «${tag}»`)
        : ['sin stack declarado en el perfil; se lista la cobertura completa del catálogo'];
    candidates.push({
      organizerId: organizer.organizerId,
      displayName: organizer.displayName,
      matchedAttributes,
      pending: [
        'fechas de próximas ediciones por verificar',
        'audiencia declarada sin confirmación de terceros',
      ],
      editions: organizer.editions,
    });
  }
  return {
    kind: 'catalog_research',
    catalogNote: FIXTURE_CATALOG_NOTE,
    candidates,
    coverage: { organizersInCatalog: FIXTURE_CATALOG.length, matched: candidates.length },
  };
}
