// Ticket 07 — contratos versionados del recorrido persistido.
//
// Demuestra: payload válido, fecha incierta, costo incompleto, país,
// contradicción, score ausente, compromiso sin soporte, versión desconocida y
// round-trip por JSON; y que la proyección de lectura lleva «pendiente» a la
// pantalla sin convertirlo en 0, hoy o una ciudad.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCampaignDraft,
  parseClaimRevision,
  parseEvaluationDecision,
  parseEvaluationProfile,
  parseEvaluationReadBundle,
  parseEvaluationSnapshot,
  parseEventEditionRevision,
  parseOrganizerRevision,
  parseParticipationRevision,
  type ValidationResult,
} from '../../lib/contracts/evaluation-validation.ts';
import { projectEvaluationRead } from '../../lib/api/opportunity-adapter.ts';
import type { EvaluationReadBundle } from '../../lib/contracts/evaluation.ts';

// ============ Ejemplo: perfil y dossier INCOMPLETOS pero bien formados ============
// Presupuesto desconocido, definición de éxito pendiente (D1), sin política
// (D2), una edición con fecha sin zona y alcance país, otra sin fecha, un
// costo sin cotizar y un claim de audiencia contradicho.

function buildBundle(): EvaluationReadBundle {
  return {
    profile: {
      contractVersion: '1',
      id: 'profile-terac-1',
      profileVersion: 1,
      createdAt: '2026-09-07T21:00:00Z',
      product: 'Agente de research para growth',
      audience: { description: 'Growth y DevRel de startups dev-tool', profiles: ['Growth', 'DevRel'] },
      stack: ['TypeScript', 'PostgreSQL'],
      budget: { status: 'unknown', note: 'el comprador no declaró presupuesto' },
      window: { from: '2026-10-01', to: null },
      restrictions: ['sin eventos cuyo eje sea el alcohol'],
      objective: { kind: 'hiring', confirmation: 'provisional', successDefinition: { status: 'pending' } },
      comparableCompanies: [
        { companyId: 'comp-vercel', name: 'Vercel', relation: 'comparable', confirmation: 'indicated' },
        { companyId: null, name: 'Terac', relation: 'comparable', confirmation: 'confirmed' },
      ],
    },
    snapshot: {
      contractVersion: '1',
      id: 'snap-1',
      kind: 'investment_comparison',
      profileId: 'profile-terac-1',
      profileVersion: 1,
      evaluatedAt: '2026-09-07T22:28:00Z',
      claimRevisionIds: ['clm-access-1', 'clm-audience-2', 'clm-cost-tier-1', 'clm-cost-catering-1', 'clm-track-1'],
      organizerRevisionIds: ['orgrev-luna-1', 'orgrev-baypy-1'],
      editionRevisionIds: ['edrev-ai-night-1', 'edrev-devfest-1', 'edrev-hack-1'],
      participationRevisionIds: ['prtrev-vercel-1'],
      policy: { status: 'none', note: 'sin política aprobada para hiring (DECISIÓN ABIERTA D2)' },
      alternatives: [
        {
          editionId: 'ed-sf-ai-night',
          organizerId: 'org-luna',
          eligibility: { status: 'eligible' },
          conditions: [
            {
              id: 'cond-cost',
              description: 'costo total incompleto: falta cotizar catering',
              blocksEligibility: false,
              resolution: 'cotización del organizador',
            },
          ],
          scoring: { status: 'not_scored', reason: 'no_policy', note: null },
        },
        {
          editionId: 'ed-devfest-usa',
          organizerId: 'org-baypy',
          eligibility: { status: 'conditional', note: 'sin ciudad verificable ni zona horaria de inicio' },
          conditions: [
            {
              id: 'cond-city',
              description: 'ciudad sin respaldo: el soporte tiene alcance país',
              blocksEligibility: true,
              resolution: 'una fuente que nombre la ciudad',
            },
          ],
          scoring: { status: 'not_scored', reason: 'no_policy', note: null },
        },
        {
          editionId: 'ed-hack-tbd',
          organizerId: 'org-luna',
          eligibility: { status: 'conditional', note: 'fecha pendiente de anuncio' },
          conditions: [
            {
              id: 'cond-date',
              description: 'fecha del evento pendiente de anuncio',
              blocksEligibility: true,
              resolution: 'anuncio de fecha del organizador',
            },
          ],
          scoring: { status: 'not_scored', reason: 'no_policy', note: null },
        },
      ],
      ordering: {
        kind: 'presentation_only',
        editionIds: ['ed-sf-ai-night', 'ed-devfest-usa', 'ed-hack-tbd'],
        note: 'orden de presentación por completitud de datos; sin política no es un ranking',
      },
      outcome: { kind: 'completed' },
      narrative: null,
    },
    claims: [
      {
        contractVersion: '1',
        id: 'clm-access-1',
        claimId: 'claim-access-ai-night',
        subject: { type: 'edition', editionId: 'ed-sf-ai-night' },
        attribute: 'access',
        value: { kind: 'text', text: 'Entrada con registro previo' },
        status: 'announced',
        sourceIds: ['src-luma-listing'],
        method: 'http_get',
        note: null,
        reviewer: null,
        reviewedAt: '2026-09-07T22:00:00Z',
        previousRevisionId: null,
      },
      {
        // Contradicción: lo anunciado (150) contra lo reportado del antecedente (60).
        contractVersion: '1',
        id: 'clm-audience-2',
        claimId: 'claim-audience-ai-night',
        subject: { type: 'edition', editionId: 'ed-sf-ai-night' },
        attribute: 'audience',
        value: { kind: 'number', amount: 150, unit: 'asistentes anunciados' },
        status: 'contradicted',
        sourceIds: ['src-luma-listing', 'src-recap-blog'],
        method: null,
        note: 'la página anuncia 150; el recap de la edición anterior reporta 60',
        reviewer: 'julian',
        reviewedAt: '2026-09-07T22:10:00Z',
        previousRevisionId: 'clm-audience-1',
      },
      {
        contractVersion: '1',
        id: 'clm-cost-tier-1',
        claimId: 'claim-cost-tier-ai-night',
        subject: { type: 'edition', editionId: 'ed-sf-ai-night' },
        attribute: 'cost:sponsor_tier',
        value: { kind: 'money', amount: 2500, currency: 'USD' },
        status: 'announced',
        sourceIds: ['src-luma-listing'],
        method: 'http_get',
        note: null,
        reviewer: null,
        reviewedAt: '2026-09-07T22:00:00Z',
        previousRevisionId: null,
      },
      {
        // Costo incompleto: la partida existe y su valor queda pendiente.
        contractVersion: '1',
        id: 'clm-cost-catering-1',
        claimId: 'claim-cost-catering-ai-night',
        subject: { type: 'edition', editionId: 'ed-sf-ai-night' },
        attribute: 'cost:catering',
        value: { kind: 'pending', note: 'el organizador no publicó el costo' },
        status: 'pending',
        sourceIds: [],
        method: null,
        note: null,
        reviewer: null,
        reviewedAt: '2026-09-07T22:00:00Z',
        previousRevisionId: null,
      },
      {
        // Referencia a una fuente que NO viaja en el bundle: válida como objeto
        // (su existencia la comprueban 08/09).
        contractVersion: '1',
        id: 'clm-track-1',
        claimId: 'claim-track-luna',
        subject: { type: 'organizer', organizerId: 'org-luna' },
        attribute: 'track_record',
        value: { kind: 'text', text: '4 ediciones corridas en los últimos 12 meses' },
        status: 'reported',
        sourceIds: ['src-fuera-del-bundle'],
        method: null,
        note: null,
        reviewer: null,
        reviewedAt: '2026-09-07T22:15:00Z',
        previousRevisionId: null,
      },
    ],
    sources: [
      {
        contractVersion: '1',
        id: 'src-luma-listing',
        url: 'https://lu.ma/sf-ai-night-5',
        locator: 'section#details',
        provider: 'luma',
        collector: 'growthx-importer',
        fetchedAt: '2026-09-07T22:00:00Z',
        publishedAt: '2026-08-30',
        method: 'http_get',
        geoScope: 'city',
        content: { kind: 'excerpt', excerpt: 'AI Night #5 — Mission District, SF. Community tier $2,500.' },
        usageRestrictions: [],
      },
      {
        contractVersion: '1',
        id: 'src-recap-blog',
        url: 'https://example.com/recap-ai-night-4',
        locator: null,
        provider: 'blog del organizador',
        collector: 'curación manual',
        fetchedAt: '2026-09-07T22:05:00Z',
        publishedAt: '2026-08-01',
        method: 'manual_curation',
        geoScope: 'country',
        content: { kind: 'hash', sha256: '3b7a1f0c' },
        usageRestrictions: ['no republicar el texto completo'],
      },
      {
        contractVersion: '1',
        id: 'src-organizer-page',
        url: 'https://lunadev.example.com/about',
        locator: null,
        provider: 'sitio del organizador',
        collector: 'curación manual',
        fetchedAt: '2026-09-07T22:07:00Z',
        publishedAt: null,
        method: 'manual_curation',
        geoScope: 'city',
        content: { kind: 'none' },
        usageRestrictions: [],
      },
    ],
    organizers: [
      {
        contractVersion: '1',
        id: 'orgrev-luna-1',
        organizerId: 'org-luna',
        displayName: 'Luna Dev Collective',
        aliases: [
          { alias: 'Luna DC', confirmation: 'confirmed', sourceIds: ['src-organizer-page'] },
          { alias: 'Luna Devs SF', confirmation: 'proposed', sourceIds: [] },
        ],
        claimRevisionIds: ['clm-track-1'],
        revisedAt: '2026-09-07T22:15:00Z',
        previousRevisionId: null,
      },
      {
        contractVersion: '1',
        id: 'orgrev-baypy-1',
        organizerId: 'org-baypy',
        displayName: 'Bay Py Builders',
        aliases: [],
        claimRevisionIds: [],
        revisedAt: '2026-09-07T22:16:00Z',
        previousRevisionId: null,
      },
    ],
    editions: [
      {
        contractVersion: '1',
        id: 'edrev-ai-night-1',
        editionId: 'ed-sf-ai-night',
        organizerIds: ['org-luna'],
        name: 'SF AI Night #5',
        canonicalUrl: 'https://lu.ma/sf-ai-night-5',
        provider: 'luma',
        startDate: { precision: 'instant', iso: '2026-10-15T18:00:00-07:00', timezone: 'America/Los_Angeles' },
        location: { scope: 'city', name: 'San Francisco' },
        coordinates: { lat: 37.7749, lng: -122.4194 },
        claimRevisionIds: ['clm-access-1', 'clm-audience-2', 'clm-cost-tier-1', 'clm-cost-catering-1'],
        revisedAt: '2026-09-07T22:00:00Z',
        previousRevisionId: null,
      },
      {
        // Fecha incierta (día sin zona) y localización de alcance PAÍS.
        contractVersion: '1',
        id: 'edrev-devfest-1',
        editionId: 'ed-devfest-usa',
        organizerIds: ['org-baypy'],
        name: 'DevFest Builders',
        canonicalUrl: 'https://example.com/devfest',
        provider: null,
        startDate: { precision: 'date_only', date: '2026-11-20', timezone: null },
        location: { scope: 'country', name: 'United States' },
        coordinates: null,
        claimRevisionIds: [],
        revisedAt: '2026-09-07T22:01:00Z',
        previousRevisionId: null,
      },
      {
        // Fecha desconocida; ciudad respaldada pero sin coordenadas.
        contractVersion: '1',
        id: 'edrev-hack-1',
        editionId: 'ed-hack-tbd',
        organizerIds: ['org-luna'],
        name: 'Hack Night (fecha por confirmar)',
        canonicalUrl: null,
        provider: null,
        startDate: { precision: 'unknown' },
        location: { scope: 'city', name: 'San Francisco' },
        coordinates: null,
        claimRevisionIds: [],
        revisedAt: '2026-09-07T22:02:00Z',
        previousRevisionId: null,
      },
    ],
    companies: [
      { contractVersion: '1', id: 'comp-vercel', name: 'Vercel', websiteUrl: 'https://vercel.com' },
    ],
    participations: [
      {
        // Logo observado en el recap: NO es patrocinio pagado ni trae resultados.
        contractVersion: '1',
        id: 'prtrev-vercel-1',
        participationId: 'part-vercel-ai-night',
        companyId: 'comp-vercel',
        editionId: 'ed-sf-ai-night',
        role: 'logo_present',
        roleStatus: 'observed',
        sourceIds: ['src-recap-blog'],
        announcedDetail: null,
        reportedExecution: null,
        commercialOutcome: { status: 'unknown' },
        revisedAt: '2026-09-07T22:20:00Z',
        previousRevisionId: null,
      },
    ],
    decision: {
      contractVersion: '1',
      id: 'dec-1',
      snapshotId: 'snap-1',
      editionId: 'ed-sf-ai-night',
      verdict: 'chosen',
      reasons: ['única edición con fecha y ciudad respaldadas dentro de la ventana'],
      conditions: [
        {
          id: 'dcond-1',
          description: '¿el tier community incluye mesa de demo?',
          answerWouldChangeTo: 'discarded',
          status: 'open',
          resolvedNote: null,
          owner: 'growth',
          dueBy: '2026-10-01',
        },
        {
          // Responsable y plazo NO se conocen: ausentes de verdad (null), sin
          // string vacío ni default (ticket 13).
          id: 'dcond-2',
          description: 'Capacidad de la sala confirmada por el venue',
          answerWouldChangeTo: null,
          status: 'resolved',
          resolvedNote: 'el organizador publicó la capacidad en el listado',
          owner: null,
          dueBy: null,
        },
      ],
      decidedBy: { userId: 'user-julian', resolvedBy: 'server_session' },
      decidedAt: '2026-09-07T23:00:00Z',
      revision: 1,
      previousRevisionId: null,
    },
    campaign: {
      contractVersion: '1',
      id: 'camp-1',
      decisionId: 'dec-1',
      objective: 'Conocer y filtrar candidatos senior de backend',
      successDefinition: null,
      modality: { status: 'defined', kind: 'sponsorship', detail: 'tier community' },
      costItems: [
        {
          id: 'cost-tier',
          label: 'sponsor tier',
          amount: { status: 'quoted', amount: 2500, currency: 'USD', sourceIds: ['src-luma-listing'] },
        },
        {
          id: 'cost-catering',
          label: 'catering',
          amount: { status: 'unknown', note: 'a cotizar con el organizador' },
        },
      ],
      openQuestions: ['¿cuántos asistentes reales tuvo la edición #4?'],
      commitments: [
        {
          id: 'cmt-est',
          description: 'Esperamos ~40 conversaciones con candidatos',
          kind: 'estimate',
          owner: null,
          dueBy: null,
          confirmation: null,
        },
        {
          id: 'cmt-agreed',
          description: 'Logo en el sitio del evento y mención en la apertura',
          kind: 'agreed',
          owner: 'organizador',
          dueBy: '2026-10-10',
          confirmation: {
            method: 'email de confirmación del organizador',
            sourceIds: ['src-organizer-page'],
            confirmedBy: 'organizadora (Luna DC)',
            confirmedAt: '2026-09-06T18:00:00Z',
          },
        },
      ],
    },
  };
}

function assertOk<T>(result: ValidationResult<T>): T {
  assert.ok(result.ok, `se esperaba válido; issues: ${result.ok ? '' : JSON.stringify(result.issues, null, 2)}`);
  return result.value;
}

function assertRejected(result: ValidationResult<unknown>, pathOrMessagePart: string): void {
  assert.equal(result.ok, false, `se esperaba rechazo con «${pathOrMessagePart}» y el payload pasó`);
  if (result.ok) return;
  assert.ok(
    result.issues.some((i) => i.path.includes(pathOrMessagePart) || i.message.includes(pathOrMessagePart)),
    `ningún issue menciona «${pathOrMessagePart}»: ${JSON.stringify(result.issues, null, 2)}`,
  );
}

// Copia mutable sin tipado para fabricar payloads inválidos.
function loose(value: unknown): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>;
}

test('payload válido: el bundle incompleto pero bien formado pasa entero y sin mutaciones', () => {
  const bundle = buildBundle();
  const value = assertOk(parseEvaluationReadBundle(structuredClone(bundle)));
  assert.deepEqual(value, bundle);
  // Cada agregado también valida por su puerta versionada propia.
  assertOk(parseEvaluationProfile(bundle.profile));
  assertOk(parseEvaluationSnapshot(bundle.snapshot));
  assertOk(parseEvaluationDecision(bundle.decision));
  assertOk(parseCampaignDraft(bundle.campaign));
});

test('payload inválido se rechaza con ruta y motivo; las claves desconocidas no se ignoran', () => {
  const bundle = buildBundle();

  const sinBudget = loose(bundle.profile);
  delete sinBudget.budget;
  assertRejected(parseEvaluationProfile(sinBudget), '$.budget');

  const estadoInventado = loose(bundle.claims[0]);
  estadoInventado.status = 'verified';
  assertRejected(parseClaimRevision(estadoInventado), '$.status');

  const ordenRoto = loose(bundle.snapshot);
  (ordenRoto.ordering as Record<string, unknown>).editionIds = ['ed-sf-ai-night', 'ed-sf-ai-night', 'ed-hack-tbd'];
  assertRejected(parseEvaluationSnapshot(ordenRoto), 'ordering.editionIds');

  // El contrato de campaña NO tiene costo total ni ROI: colarlos es inválido.
  const conTotal = loose(bundle.campaign);
  conTotal.totalCostUsd = 2500;
  assertRejected(parseCampaignDraft(conTotal), 'totalCostUsd');
  const conRoi = loose(bundle.campaign);
  conRoi.roi = { band: [1, 2] };
  assertRejected(parseCampaignDraft(conRoi), 'roi');

  // Tampoco el organizador admite un puntaje de reputación: no es un campo.
  const conReputacion = loose(bundle.organizers[0]);
  conReputacion.reputationScore = 87;
  assertRejected(parseOrganizerRevision(conReputacion), 'reputationScore');
});

test('una versión de contrato desconocida se rechaza; no se interpreta como la actual', () => {
  const bundle = buildBundle();

  const v2 = loose(bundle.profile);
  v2.contractVersion = '2';
  const result = parseEvaluationProfile(v2);
  assert.equal(result.ok, false);
  if (!result.ok) {
    // Un solo error, el de versión: no se siguió validando como si fuera v1.
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].path, '$.contractVersion');
    assert.match(result.issues[0].message, /no interpreta otra versión como la actual/);
  }

  const sinVersion = loose(bundle.snapshot);
  delete sinVersion.contractVersion;
  assertRejected(parseEvaluationSnapshot(sinVersion), '$.contractVersion');
});

test('fecha incierta se conserva incierta: ni zona inventada ni fecha de hoy', () => {
  const bundle = buildBundle();
  assertOk(parseEvaluationReadBundle(bundle));
  const projection = projectEvaluationRead(bundle);

  const devfest = projection.dossiers.find((d) => d.editionId === 'ed-devfest-usa');
  assert.ok(devfest);
  assert.equal(devfest.date.state, 'ambiguous'); // día sin zona: ambiguo explícito
  if (devfest.date.state === 'ambiguous') {
    assert.equal(devfest.date.display, '2026-11-20');
    assert.match(devfest.date.note, /sin zona horaria/);
  }

  const hack = projection.dossiers.find((d) => d.editionId === 'ed-hack-tbd');
  assert.ok(hack);
  assert.equal(hack.date.state, 'pending'); // sin fecha: pendiente, sin display
  assert.ok(!('display' in hack.date), 'una fecha pendiente no fabrica ningún valor mostrable');
});

test('costo incompleto: la partida pendiente viaja como pendiente y no existe un total', () => {
  const bundle = buildBundle();
  const projection = projectEvaluationRead(bundle);

  const campaign = projection.campaign;
  assert.ok(campaign);
  const catering = campaign.costItems.find((c) => c.label === 'catering');
  assert.ok(catering);
  assert.equal(catering.value.state, 'pending');
  assert.equal(campaign.costCompleteness, 'has_unknown_items');
  // Ni la vista ni el contrato tienen dónde poner un total o un ROI.
  assert.ok(!('totalCost' in campaign) && !('roi' in campaign));

  // La misma partida en el dossier: pendiente, no 0.
  const aiNight = projection.dossiers.find((d) => d.editionId === 'ed-sf-ai-night');
  assert.ok(aiNight);
  const costCatering = aiNight.costs.find((c) => c.label === 'catering');
  assert.ok(costCatering);
  assert.equal(costCatering.value.state, 'pending');
  const costTier = aiNight.costs.find((c) => c.label === 'sponsor_tier');
  assert.ok(costTier);
  assert.equal(costTier.value.state, 'known');
});

test('una localización nacional no coloca el evento en una ciudad ni en el mapa', () => {
  const bundle = buildBundle();
  const projection = projectEvaluationRead(bundle);

  const devfest = projection.dossiers.find((d) => d.editionId === 'ed-devfest-usa');
  assert.ok(devfest);
  assert.equal(devfest.location.state, 'known');
  if (devfest.location.state === 'known') {
    assert.equal(devfest.location.display, 'United States'); // el país, no una ciudad
    assert.equal(devfest.location.scope, 'country');
    assert.match(devfest.location.pendingNote ?? '', /ciudad pendiente/);
  }

  // Mapa local secundario: solo la edición con respaldo urbano y coordenadas.
  assert.deepEqual(projection.map.points.map((p) => p.editionId), ['ed-sf-ai-night']);
  const sinPunto = projection.map.listedWithoutPoint.map((p) => p.editionId).sort();
  assert.deepEqual(sinPunto, ['ed-devfest-usa', 'ed-hack-tbd']); // accesibles en la lista, sin punto inventado

  // Validación: coordenadas con alcance país se rechazan.
  const conPunto = loose(bundle.editions[1]);
  conPunto.coordinates = { lat: 39.8, lng: -98.6 };
  assertRejected(parseEventEditionRevision(conPunto), 'coordinates');
});

test('una contradicción viaja como contradicción, con su motivo visible', () => {
  const bundle = buildBundle();
  const projection = projectEvaluationRead(bundle);

  const aiNight = projection.dossiers.find((d) => d.editionId === 'ed-sf-ai-night');
  assert.ok(aiNight);
  assert.equal(aiNight.audience.state, 'known');
  if (aiNight.audience.state === 'known') {
    assert.equal(aiNight.audience.claimStatus, 'contradicted');
    assert.match(aiNight.audience.pendingNote ?? '', /anuncia 150.*reporta 60/);
  }

  // Contradicho sin motivo: inválido.
  const sinMotivo = loose(bundle.claims[1]);
  sinMotivo.note = null;
  assertRejected(parseClaimRevision(sinMotivo), '$.note');
});

test('score ausente se distingue de cero; «sin evento elegible» se distingue de error técnico', () => {
  const bundle = buildBundle();
  const projection = projectEvaluationRead(bundle);

  for (const dossier of projection.dossiers) {
    assert.equal(dossier.score.state, 'no_policy'); // D2 pendiente: estado, no 0
    assert.ok(!('sKnown' in dossier.score), 'sin política no hay ningún número de score');
  }
  assert.equal(projection.summary.policy.status, 'none');

  // Puntuar sin política es inválido en el propio snapshot.
  const puntuadoSinPolitica = loose(bundle.snapshot);
  (puntuadoSinPolitica.alternatives as Record<string, unknown>[])[0].scoring = {
    status: 'scored',
    sKnown: 84,
    coverage: 0.7,
    sensitivityNote: null,
  };
  assertRejected(parseEvaluationSnapshot(puntuadoSinPolitica), 'sin política no se puntúa');

  // Outcomes: ambos válidos y distintos; la proyección los conserva tal cual.
  const sinElegibles = loose(bundle.snapshot);
  sinElegibles.outcome = { kind: 'no_eligible_candidates', reasons: ['todas las ediciones vencidas en la ventana'] };
  assertOk(parseEvaluationSnapshot(sinElegibles));
  const falloTecnico = loose(bundle.snapshot);
  falloTecnico.outcome = { kind: 'technical_failure', error: 'timeout del proveedor de fuentes' };
  assertOk(parseEvaluationSnapshot(falloTecnico));
  const bundleSinElegibles = { ...buildBundle(), snapshot: sinElegibles as unknown as EvaluationReadBundle['snapshot'] };
  assert.equal(projectEvaluationRead(bundleSinElegibles).summary.outcome.kind, 'no_eligible_candidates');
});

test('un compromiso acordado sin soporte se rechaza; una estimación no se disfraza de acuerdo', () => {
  const bundle = buildBundle();

  const acordadoSinSoporte = loose(bundle.campaign);
  (acordadoSinSoporte.commitments as Record<string, unknown>[])[1].confirmation = null;
  assertRejected(parseCampaignDraft(acordadoSinSoporte), 'confirmation');

  const acordadoSinFuentes = loose(bundle.campaign);
  (acordadoSinFuentes.commitments as Record<string, unknown>[])[1].confirmation = {
    method: 'de palabra',
    sourceIds: [],
    confirmedBy: 'organizadora (Luna DC)',
    confirmedAt: '2026-09-06T18:00:00Z',
  };
  assertRejected(parseCampaignDraft(acordadoSinFuentes), 'confirmation.sourceIds');

  // «Acordado» exige QUIÉN confirmó y CUÁNDO (ticket 13): sin cualquiera de
  // los dos, la confirmación se rechaza — método y fuentes no alcanzan.
  const acordadoSinQuien = loose(bundle.campaign);
  delete ((acordadoSinQuien.commitments as Record<string, unknown>[])[1].confirmation as Record<string, unknown>).confirmedBy;
  assertRejected(parseCampaignDraft(acordadoSinQuien), 'confirmation.confirmedBy');

  const acordadoSinCuando = loose(bundle.campaign);
  delete ((acordadoSinCuando.commitments as Record<string, unknown>[])[1].confirmation as Record<string, unknown>).confirmedAt;
  assertRejected(parseCampaignDraft(acordadoSinCuando), 'confirmation.confirmedAt');

  const estimacionConfirmada = loose(bundle.campaign);
  (estimacionConfirmada.commitments as Record<string, unknown>[])[0].confirmation = {
    method: 'ojo de buen cubero',
    sourceIds: ['src-luma-listing'],
    confirmedBy: 'nadie en realidad',
    confirmedAt: '2026-09-06T18:00:00Z',
  };
  assertRejected(parseCampaignDraft(estimacionConfirmada), 'confirmation');

  // La vista separa lo acordado soportado de lo estimado.
  const projection = projectEvaluationRead(bundle);
  assert.ok(projection.campaign);
  const porKind = Object.fromEntries(projection.campaign.commitments.map((c) => [c.kind, c.supported]));
  assert.equal(porKind.agreed, true);
  assert.equal(porKind.estimate, false);
});

test('identidades separadas: aliases exigen confirmación con soporte y un logo no crea patrocinio ni resultados', () => {
  const bundle = buildBundle();

  const aliasSinSoporte = loose(bundle.organizers[0]);
  (aliasSinSoporte.aliases as Record<string, unknown>[])[0].sourceIds = [];
  assertRejected(parseOrganizerRevision(aliasSinSoporte), 'similitud de nombre no confirma');

  const logoConResultado = loose(bundle.participations[0]);
  logoConResultado.commercialOutcome = { status: 'reported', summary: 'sumó 3 clientes', sourceIds: ['src-recap-blog'] };
  assertRejected(parseParticipationRevision(logoConResultado), 'un logo ambiguo no crea resultados');

  const patrocinioInferido = loose(bundle.participations[0]);
  patrocinioInferido.role = 'paid_sponsor';
  patrocinioInferido.roleStatus = 'inferred';
  assertRejected(parseParticipationRevision(patrocinioInferido), 'no se infiere');

  // La lista de organizadores separa confirmados de propuestos y no trae reputación.
  const projection = projectEvaluationRead(bundle);
  const luna = projection.organizerList.find((o) => o.organizerId === 'org-luna');
  assert.ok(luna);
  assert.deepEqual(luna.confirmedAliases, ['Luna DC']);
  assert.deepEqual(luna.proposedAliases, ['Luna Devs SF']);
  assert.ok(!('reputationScore' in luna) && !('confidence' in luna));
});

test('la decisión exige autor del servidor, motivos y relación de revisión coherente', () => {
  const bundle = buildBundle();

  const autorDelCliente = loose(bundle.decision);
  autorDelCliente.decidedBy = { userId: 'user-julian', resolvedBy: 'request_body' };
  assertRejected(parseEvaluationDecision(autorDelCliente), 'decidedBy.resolvedBy');

  const sinMotivos = loose(bundle.decision);
  sinMotivos.reasons = [];
  assertRejected(parseEvaluationDecision(sinMotivos), 'motivos');

  const revisionRota = loose(bundle.decision);
  revisionRota.revision = 2;
  assertRejected(parseEvaluationDecision(revisionRota), 'previousRevisionId');

  // «Si se conocen» significa null cuando no se conocen: un string vacío no es
  // un responsable, y el plazo debe ser una fecha real (ticket 13).
  const responsableVacio = loose(bundle.decision);
  (responsableVacio.conditions as Record<string, unknown>[])[0].owner = '';
  assertRejected(parseEvaluationDecision(responsableVacio), 'owner');

  const plazoInventado = loose(bundle.decision);
  (plazoInventado.conditions as Record<string, unknown>[])[0].dueBy = 'pronto';
  assertRejected(parseEvaluationDecision(plazoInventado), 'dueBy');
});

test('las reglas de objeto no comprueban integridad relacional (eso es 08/09)', () => {
  const bundle = buildBundle();
  // Claim con fuente que no existe en ningún lado: objeto VÁLIDO. Que exista y
  // pertenezca al tenant se comprueba con la base (08/09), no con este validador.
  const claim = bundle.claims.find((c) => c.id === 'clm-track-1');
  assert.ok(claim);
  assert.deepEqual(claim.sourceIds, ['src-fuera-del-bundle']);
  assertOk(parseClaimRevision(claim));
  assertOk(parseEvaluationReadBundle(bundle));

  // La proyección tampoco inventa la referencia: un claim citando una fuente
  // irresoluble se muestra con su valor y SIN fecha de obtención fabricada.
  const conFuenteIrresoluble = buildBundle();
  conFuenteIrresoluble.claims[0].sourceIds = ['src-que-no-viaja'];
  const projection = projectEvaluationRead(conFuenteIrresoluble);
  const aiNight = projection.dossiers.find((d) => d.editionId === 'ed-sf-ai-night');
  assert.ok(aiNight);
  assert.equal(aiNight.access.state, 'known');
  if (aiNight.access.state === 'known') {
    assert.equal(aiNight.access.obtainedAt, null);
    assert.deepEqual(aiNight.access.sourceIds, ['src-que-no-viaja']);
  }
});

test('round-trip por JSON: serializar, releer y validar conserva el agregado idéntico', () => {
  const bundle = buildBundle();
  const wire = JSON.stringify(bundle);
  const reread: unknown = JSON.parse(wire);
  const value = assertOk(parseEvaluationReadBundle(reread));
  assert.deepEqual(value, bundle);
  // Y la proyección de lo releído es idéntica a la del original.
  assert.deepEqual(projectEvaluationRead(value), projectEvaluationRead(bundle));
});

test('la proyección conserva pendientes sin los defaults engañosos del contrato legado', () => {
  const bundle = buildBundle();
  const projection = projectEvaluationRead(bundle);

  // Presupuesto desconocido: pendiente, sin ningún número fabricado.
  assert.equal(projection.profile.budget.state, 'pending');
  assert.ok(!('display' in projection.profile.budget));

  // Definición de éxito pendiente: no se vuelve adopción (ni aparece 'adoption'
  // en ninguna parte de la lectura; el objetivo del ejemplo es hiring provisional).
  assert.equal(projection.profile.successDefinition.state, 'pending');
  assert.equal(projection.profile.objective.kind, 'hiring');
  assert.equal(projection.profile.objective.confirmation, 'provisional');
  assert.ok(!JSON.stringify(projection).includes('adoption'));

  // La pantalla puede diferenciar presentación de ranking, y la lectura declara
  // qué tipo de evaluación es.
  assert.equal(projection.kind, 'investment_comparison');
  assert.equal(projection.ordering.kind, 'presentation_only');

  // Decisión condicional visible: elegida con una condición abierta.
  assert.ok(projection.summary.decision);
  assert.equal(projection.summary.decision.verdict, 'chosen');
  assert.equal(projection.summary.decision.conditional, true);
  assert.equal(projection.summary.decision.openConditions, 1);

  // El dossier completo de la edición respaldada sí llega con valores y soporte.
  const aiNight = projection.dossiers.find((d) => d.editionId === 'ed-sf-ai-night');
  assert.ok(aiNight);
  assert.equal(aiNight.organizer.state, 'known');
  assert.equal(aiNight.date.state, 'known');
  assert.equal(aiNight.access.state, 'known');
  if (aiNight.access.state === 'known') {
    assert.equal(aiNight.access.claimStatus, 'announced'); // anunciado ≠ observado
    assert.deepEqual(aiNight.access.sourceIds, ['src-luma-listing']);
    assert.equal(aiNight.access.obtainedAt, '2026-09-07T22:00:00Z'); // cuándo se obtuvo
  }
});
