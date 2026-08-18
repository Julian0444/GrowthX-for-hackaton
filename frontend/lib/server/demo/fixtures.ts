// Fixture canónico de GrowXth (T0). Es la forma real contra la que integra el
// frontend desde el minuto uno, antes de que exista el pipeline. Debe validar
// contra los tipos de lib/contracts/growxth.ts sin excepciones.
//
// Datos de San Francisco, plausibles pero curados a mano. Cada reason lleva
// evidenceIds no vacío; el mapa de evidence resuelve todos los ids referidos;
// El contrato conserva el objeto roi por compatibilidad, pero el producto no
// presenta presupuestos ni costos mientras no existan precios verificables.

import type {
  Evidence,
  Opportunity,
  SearchRequest,
  SearchResponse,
} from '@/lib/contracts/growxth';

// Fijo a propósito: los fixtures son deterministas (sin Date.now()).
const GENERATED_AT = '2026-07-24T17:00:00.000Z';

const QUERY: SearchRequest = {
  product: 'Postgres-native background jobs for Python backends',
  icpStack: ['Python', 'Postgres', 'FastAPI', 'Backend'],
  budgetUsd: 0,
  goal: 'adoption',
};

const EVIDENCE: Record<string, Evidence> = {
  // ---- SF Python Meetup ----
  'ev-pymtp-listing': {
    id: 'ev-pymtp-listing',
    source: 'luma',
    kind: 'event_listing',
    url: 'https://lu.ma/sfpython-july',
    title: 'SF Python — July Monthly Meetup',
    observedAt: '2026-07-20T09:12:00.000Z',
    location: 'San Francisco, CA',
    confidence: 0.9,
    rightsBasis: 'public_api',
    status: 'observed',
    excerpt:
      'Monthly gathering, ~120 RSVPs, lightning talks on async Python and data infra. Hosted at a SoMa venue.',
  },
  'ev-pymtp-cadence': {
    id: 'ev-pymtp-cadence',
    source: 'exa',
    kind: 'web_page',
    url: 'https://www.meetup.com/sfpython/events/',
    title: 'SF Python — past events archive',
    observedAt: '2026-07-21T14:03:00.000Z',
    location: 'San Francisco, CA',
    confidence: 0.85,
    rightsBasis: 'public_web',
    status: 'observed',
    excerpt:
      '11 events run in the trailing 12 months, roughly monthly, consistent organizer team since 2011.',
  },
  'ev-pymtp-terac': {
    id: 'ev-pymtp-terac',
    source: 'terac',
    kind: 'human_interview',
    url: null,
    title: 'Terac panel — SF backend engineers, API-integration behavior',
    observedAt: '2026-07-22T18:40:00.000Z',
    location: 'San Francisco, CA',
    confidence: 0.78,
    rightsBasis: 'consented_panel',
    status: 'observed',
    excerpt:
      '9 of 14 interviewed SF Python devs had shipped at least one third-party API integration to production in the last quarter.',
  },
  'ev-pymtp-github': {
    id: 'ev-pymtp-github',
    source: 'github',
    kind: 'repo_activity',
    url: 'https://github.com/search?q=topic:background-jobs+language:python',
    title: 'GitHub — python background-jobs topic momentum',
    observedAt: '2026-07-19T00:00:00.000Z',
    location: null,
    confidence: 0.7,
    rightsBasis: 'public_api',
    status: 'observed',
    excerpt:
      'New repos tagged background-jobs (Python) up ~1.6x over the trailing 90d vs the prior window.',
  },

  // ---- Local-First SF ----
  'ev-lofi-listing': {
    id: 'ev-lofi-listing',
    source: 'luma',
    kind: 'event_listing',
    url: 'https://lu.ma/localfirst-sf',
    title: 'Local-First SF — sync engines night',
    observedAt: '2026-07-18T11:22:00.000Z',
    location: 'San Francisco, CA',
    confidence: 0.82,
    rightsBasis: 'public_api',
    status: 'observed',
    excerpt:
      'Quarterly deep-dive series, ~70 attendees, talks on CRDTs and offline-first sync.',
  },
  'ev-lofi-news': {
    id: 'ev-lofi-news',
    source: 'exa',
    kind: 'web_page',
    url: 'https://www.localfirstweb.dev/',
    title: 'Local-first web — ecosystem roundup',
    observedAt: '2026-07-17T08:00:00.000Z',
    location: null,
    confidence: 0.68,
    rightsBasis: 'public_web',
    status: 'observed',
    excerpt:
      'Local-first sync remains a high-salience topic across dev newsletters and conference CFPs this quarter.',
  },
  'ev-lofi-sat': {
    id: 'ev-lofi-sat',
    source: 'exa',
    kind: 'web_page',
    url: 'https://lu.ma/discover?q=local-first%20san%20francisco',
    title: 'Luma discovery — local-first events in SF, trailing 180d',
    observedAt: '2026-07-21T16:15:00.000Z',
    location: 'San Francisco, CA',
    confidence: 0.6,
    rightsBasis: 'public_web',
    status: 'estimated',
    excerpt:
      'Only 2 local-first themed events found in SF over the last 180 days — low saturation, open space to own the topic.',
  },

  // ---- Rust SF (evento a co-crear, sin precio de tier) ----
  'ev-rust-community': {
    id: 'ev-rust-community',
    source: 'exa',
    kind: 'web_page',
    url: 'https://www.meetup.com/rust-bay-area/',
    title: 'Rust Bay Area — community profile',
    observedAt: '2026-07-16T13:30:00.000Z',
    location: 'San Francisco, CA',
    confidence: 0.72,
    rightsBasis: 'public_web',
    status: 'observed',
    excerpt:
      'Active Rust community, ~1,800 members, 6 events in the last year. No public sponsor tier sheet.',
  },
  'ev-rust-github': {
    id: 'ev-rust-github',
    source: 'github',
    kind: 'repo_activity',
    url: 'https://github.com/search?q=topic:async+language:rust',
    title: 'GitHub — Rust async runtime momentum',
    observedAt: '2026-07-15T00:00:00.000Z',
    location: null,
    confidence: 0.65,
    rightsBasis: 'public_api',
    status: 'observed',
    excerpt:
      'Async-runtime tagged Rust repos up ~1.3x over the trailing 90d; steady but not spiking.',
  },
  'ev-rust-prepared': {
    id: 'ev-rust-prepared',
    source: 'seed',
    kind: 'prepared_fixture',
    url: null,
    title: 'Curated seed — Rust SF ICP fit estimate',
    observedAt: '2026-07-14T00:00:00.000Z',
    location: 'San Francisco, CA',
    confidence: 0.4,
    rightsBasis: 'manual_curation',
    status: 'prepared',
    excerpt:
      'Hand-curated estimate: ICP fit for a Python-backend product among Rust devs is modest; no tier price available for a co-created event.',
  },
};

const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'opp-sfpython',
    title: 'Co-host with SF Python',
    subtitle: 'Postgres-native background jobs · ~60 backend/Python devs',
    lat: 37.7817,
    lng: -122.4039,
    play: {
      headline:
        'Co-host with SF Python · tema Postgres-native background jobs · ~60 devs backend/Python',
      communityId: 'com-sfpython',
      themeId: 'theme-bg-jobs',
      eventId: 'evt-sfpython-july',
      audienceSpec: {
        targetSize: 60,
        profile: ['Backend / Python', '2+ años'],
        qualifier: 'al menos una integración de API en prod',
        teracNote:
          '9 de 14 devs entrevistados enviaron una integración de API a producción el último trimestre.',
      },
    },
    score: 87,
    breakdown: {
      community: {
        stackOverlap: 0.95,
        cadenceReliability: 0.9,
        access: 0.8,
        exclusivityGap: 0.7,
        durability: 0.9,
        confidence: 0.85,
      },
      theme: {
        momentum: 0.8,
        criticalPath: 0.9,
        communityCapability: 0.85,
        saturationGap: 0.6,
      },
    },
    reasons: [
      {
        text: 'El stack de la comunidad (Python/Postgres) calza casi perfecto con el ICP del producto.',
        evidenceIds: ['ev-pymtp-listing', 'ev-pymtp-cadence'],
      },
      {
        text: 'Cadencia mensual corrida de verdad — 11 eventos en 12 meses con el mismo equipo organizador.',
        evidenceIds: ['ev-pymtp-cadence'],
      },
      {
        text: 'Estudio Terac: la mayoría de los devs del panel ya integran APIs de terceros en producción.',
        evidenceIds: ['ev-pymtp-terac'],
      },
      {
        text: 'Momentum de GitHub en background-jobs de Python subiendo ~1.6x en 90 días.',
        evidenceIds: ['ev-pymtp-github'],
      },
    ],
    roi: {
      tierPriceUsd: null,
      expectedAttendance: 120,
      icpFitRate: 0.5,
      icpFitBasis: 'terac',
      costPerQualifiedDev: null,
      band: null,
      note: 'Pricing not verified',
    },
    confidence: 84,
    status: 'observed',
    humanValidated: false,
    distanceMiles: null,
    event: {
      id: 'evt-sfpython-july',
      name: 'SF Python — July Monthly Meetup',
      url: 'https://lu.ma/sfpython-july',
      startsAt: '2026-07-28T18:30:00.000Z',
      venueArea: 'SoMa',
    },
    campaign: {
      id: 'camp-opp-sfpython',
      opportunityId: 'opp-sfpython',
      title: 'SF Python × Postgres-native background jobs',
      variantA:
        'Join SF Python to see how Postgres-native background jobs help Python teams ship faster. Leave with a practical workflow you can try the same day.',
      variantB:
        'Building Python backends? Leave SF Python with one working background-jobs playbook—not another product pitch.',
    },
  },
  {
    id: 'opp-localfirst',
    title: 'Sponsor Local-First SF',
    subtitle: 'Sync engines night · ~35 offline-first devs',
    lat: 37.7899,
    lng: -122.4009,
    play: {
      headline:
        'Partner with Local-First SF · tema sync engines para backends Python · ~35 devs offline-first',
      communityId: 'com-localfirst',
      themeId: 'theme-local-first',
      eventId: 'evt-localfirst-sync',
      audienceSpec: {
        targetSize: 35,
        profile: ['Full-stack', 'Offline-first / CRDT'],
        qualifier: 'trabajando en apps con sincronización de datos',
        teracNote: null,
      },
    },
    score: 74,
    breakdown: {
      community: {
        stackOverlap: 0.6,
        cadenceReliability: 0.65,
        access: 0.75,
        exclusivityGap: 0.9,
        durability: 0.6,
        confidence: 0.7,
      },
      theme: {
        momentum: 0.75,
        criticalPath: 0.6,
        communityCapability: 0.7,
        saturationGap: 0.9,
      },
    },
    reasons: [
      {
        text: 'Saturación muy baja: solo 2 eventos local-first en SF en 180 días — espacio abierto para dueñar el tema.',
        evidenceIds: ['ev-lofi-sat'],
      },
      {
        text: 'El tema local-first sync tiene alta saliencia en newsletters y CFPs este trimestre.',
        evidenceIds: ['ev-lofi-news'],
      },
      {
        text: 'Serie trimestral con ~70 asistentes por noche.',
        evidenceIds: ['ev-lofi-listing'],
      },
    ],
    roi: {
      tierPriceUsd: null,
      expectedAttendance: 70,
      icpFitRate: 0.5,
      icpFitBasis: 'github',
      costPerQualifiedDev: null,
      band: null,
      note: 'Pricing not verified',
    },
    confidence: 66,
    status: 'estimated',
    humanValidated: false,
    distanceMiles: null,
    event: {
      id: 'evt-localfirst-sync',
      name: 'Local-First SF — sync engines night',
      url: 'https://lu.ma/localfirst-sf',
      startsAt: '2026-08-04T18:30:00.000Z',
      venueArea: 'SoMa',
    },
    campaign: {
      id: 'camp-opp-localfirst',
      opportunityId: 'opp-localfirst',
      title: 'Local-First SF × sync engines',
      variantA:
        'Join Local-First SF for a practical session on sync engines for Python backends. Leave with a workflow you can try the same day.',
      variantB:
        'Shipping offline-first software? Leave Local-First SF with one working sync pattern—not another product pitch.',
    },
  },
  {
    id: 'opp-rust',
    title: 'Co-crear un evento con Rust Bay Area',
    subtitle: 'Async infra night · audiencia a calificar',
    lat: 37.7749,
    lng: -122.4194,
    play: {
      headline:
        'Co-crear con Rust Bay Area · tema async infra · audiencia backend a calificar',
      communityId: 'com-rust',
      themeId: 'theme-async-rust',
      eventId: null,
      audienceSpec: {
        targetSize: null,
        profile: ['Systems / Rust', 'Backend'],
        qualifier: null,
        teracNote: null,
      },
    },
    score: 58,
    breakdown: {
      community: {
        stackOverlap: 0.35,
        cadenceReliability: 0.55,
        access: 0.5,
        exclusivityGap: 0.8,
        durability: 0.6,
        confidence: 0.6,
      },
      theme: {
        momentum: 0.6,
        criticalPath: 0.5,
        communityCapability: null,
        saturationGap: 0.7,
      },
    },
    reasons: [
      {
        text: 'Comunidad activa (~1,800 miembros, 6 eventos/año) pero sin sponsor deck público — habría que co-crear el evento.',
        evidenceIds: ['ev-rust-community'],
      },
      {
        text: 'Momentum de async en Rust estable (~1.3x en 90 días), sin pico.',
        evidenceIds: ['ev-rust-github'],
      },
      {
        text: 'Fit de ICP estimado a mano: modesto para un producto de backend Python entre devs de Rust.',
        evidenceIds: ['ev-rust-prepared'],
      },
    ],
    roi: {
      tierPriceUsd: null,
      expectedAttendance: 50,
      icpFitRate: 0.3,
      icpFitBasis: 'prepared',
      costPerQualifiedDev: null,
      band: null,
      note: 'No disponible',
    },
    confidence: 41,
    status: 'prepared',
    humanValidated: false,
    distanceMiles: null,
    event: null,
    campaign: {
      id: 'camp-opp-rust',
      opportunityId: 'opp-rust',
      title: 'Rust Bay Area × async infrastructure',
      variantA:
        'Join Rust Bay Area for a practical async infrastructure night. Leave with a workflow you can test the same day.',
      variantB:
        'Building async systems? Help shape a Rust Bay Area session around the patterns you actually need.',
    },
  },
];

export function getFixtureSearchResponse(): SearchResponse {
  return {
    requestId: 'req-fixture-0001',
    query: QUERY,
    opportunities: OPPORTUNITIES,
    evidence: EVIDENCE,
    coverage: {
      eventsEvaluated: 18,
      communitiesEvaluated: 7,
      organizersEvaluated: 9,
      themesEvaluated: 15,
      sourcesUsed: ['exa', 'luma', 'github', 'terac', 'seed'],
      sourcesFailed: ['linq'],
    },
    warnings: [
      'Linq no respondió a tiempo; los envíos de mensajería quedan pendientes.',
      'El ROI de la jugada de Rust Bay Area es "No disponible" hasta tener precio de tier.',
    ],
    generatedAt: GENERATED_AT,
    degraded: false,
  };
}
