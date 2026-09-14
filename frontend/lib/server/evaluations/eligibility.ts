// Elegibilidad previa al score (ticket 12). Server-only, determinístico.
//
// Regla de autoridad: un conflicto CONFIRMADO de fecha, acceso, presupuesto o
// ciudad excluye ANTES de puntuar — un excluido jamás llega al scorer y ningún
// puntaje lo habilita. La información insuficiente no excluye: genera
// condiciones pendientes con la respuesta concreta que las resolvería. Un
// costo desconocido nunca cuenta como cero.
//
// Regla SF (criterios de decisión del ticket): la edición elegible está en San
// Francisco con ubicación respaldada por una fuente urbana. Un antecedente en
// otra ciudad no la satisface; un organizador puede investigarse igual sin que
// eso publique una inversión elegible.

import { hasAffirmativeSupport as supported, locationSupport } from '../../evidence/claim-support.ts';
import { declaredCalendarDay } from '../../evidence/calendar.ts';
import { assessCosts } from '../../evidence/costs.ts';
import type {
  ClaimRevision,
  EligibilityResult,
  EvaluationProfile,
  PendingCondition,
} from '../../contracts/evaluation.ts';
import type { EditionDossierRead } from '../catalog/read.ts';
import { isSanFrancisco } from '../../../components/research-dashboard/research-model.ts';

export interface CandidateEligibility {
  editionId: string;
  organizerId: string | null;
  eligibility: EligibilityResult;
  conditions: PendingCondition[];
  researchBlockers: string[]; // conflictos conocidos o lugar/fecha sin resolver
  // Nota fija del contrato de esta etapa: elegible ≠ recomendado. Recomendar
  // gasto exige además una edición futura y una modalidad concretas (decisión
  // condicional de tickets posteriores).
  note: string;
}

export const ELIGIBLE_IS_NOT_RECOMMENDED =
  'Eligibility does not imply a recommendation: committing budget requires a specific future edition, participation format, and recorded decision.';


const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

const latestClaims = (read: EditionDossierRead): ClaimRevision[] =>
  read.claims.map((chain) => chain.revisions[chain.revisions.length - 1]);


let conditionSeq = 0;
const condition = (
  editionId: string,
  slug: string,
  description: string,
  resolution: string | null,
  blocksEligibility: boolean,
): PendingCondition => ({
  // id estable por edición+tema (el contador solo desambigua repetidos).
  id: `cond-${editionId}-${slug}-${(conditionSeq += 1)}`,
  description,
  blocksEligibility,
  resolution,
});

export function evaluateEligibility(input: {
  profile: EvaluationProfile;
  dossier: EditionDossierRead;
}): CandidateEligibility {
  conditionSeq = 0;
  const { profile, dossier } = input;
  const edition = dossier.editionRevisions[dossier.editionRevisions.length - 1];
  const editionId = edition.editionId;
  const claims = latestClaims(dossier).filter(
    (c) => c.subject.type === 'edition' && c.subject.editionId === editionId,
  );
  const exclusionReasons: string[] = [];
  const conditions: PendingCondition[] = [];

  // ---- Fecha: vigencia con la política temporal del ticket 04 ----
  // Vencida bajo cualquier zona posible = conflicto confirmado → excluye.
  // Pendiente o ambigua = condición, jamás una fecha inventada.
  const dateClaims = claims.filter(c => c.attribute === 'date');
  const contradictedDate = dateClaims.some(c => c.status === 'contradicted');
  if (contradictedDate || !dateClaims.some(c => supported(c) && c.value.kind === 'date')) {
    conditions.push(condition(editionId, 'fecha-soporte',
      contradictedDate ? `Conflicting date: ${dateClaims.filter(c => c.status === 'contradicted').map(c => c.note).join('; ')}` : 'Date lacks sufficient supporting evidence.',
      'Which source confirms the date and its time zone?', true));
  }
  if (!contradictedDate && dossier.validity.validity === 'past') {
    exclusionReasons.push(`Past event: ${dossier.validity.reason}`);
  } else if (dossier.validity.validity === 'date_pending' || dossier.validity.validity === 'date_ambiguous') {
    conditions.push(
      condition(
        editionId,
        'fecha',
        `Date ${dossier.validity.validity === 'date_pending' ? 'pending' : 'ambiguous'}: ${dossier.validity.reason}`,
        'What is the exact date and time zone of this edition?',
        true,
      ),
    );
  }

  if (edition.startDate.precision === 'date_only') {
    conditions.push(condition(editionId, 'fecha-hora', 'Date has no exact time; retain the declared day and confirm the time and time zone.', 'At what time and in which time zone does this edition begin?', true));
  }

  // ---- Ventana del perfil: un día declarado fuera de la ventana es un
  // conflicto confirmado de fecha contra las restricciones del perfil ----
  const day = declaredCalendarDay(edition.startDate);
  if (!contradictedDate && day !== null) {
    if (profile.window.from !== null && day < profile.window.from)
      exclusionReasons.push(`The declared date (${day}) is before the brief window (${profile.window.from}).`);
    if (profile.window.to !== null && day > profile.window.to)
      exclusionReasons.push(`The declared date (${day}) is after the brief window (${profile.window.to}).`);
  } else if (day === null && edition.startDate.precision === 'instant') {
    conditions.push(condition(
      editionId,
      'zona-horaria',
      'The declared time zone cannot establish the event day against the brief window.',
      'What verifiable time zone applies to this edition?',
      true,
    ));
  }

  // ---- Ciudad: SF con respaldo urbano ----
  const locationClaims = claims.filter((c) => c.attribute === 'location');
  const urbanSupported = locationClaims.filter(
    (c) =>
      locationSupport(c).usable &&
      c.value.kind === 'location' &&
      (c.value.scope === 'city' || c.value.scope === 'venue') &&
      c.value.name !== null,
  );
  const urbanElsewhere = urbanSupported.find(
    (c) => c.value.kind === 'location' && !isSanFrancisco({ scope: 'city', name: c.value.name }),
  );
  const declaredElsewhere =
    edition.location.scope === 'city' && edition.location.name !== null && !isSanFrancisco(edition.location);
  const contradictedLocation = locationClaims.some(c => c.status === 'contradicted');
  if (!contradictedLocation && (urbanElsewhere || declaredElsewhere)) {
    const name =
      urbanElsewhere && urbanElsewhere.value.kind === 'location'
        ? urbanElsewhere.value.name
        : edition.location.name;
    exclusionReasons.push(
      `Edition in another city (${name ?? 'unknown'}): ineligible for investment in SF. Evidence from another city remains available as historical background.`,
    );
  } else {
    const sfSupported = urbanSupported.some(
      (c) => c.value.kind === 'location' && isSanFrancisco({ scope: 'city', name: c.value.name }),
    );
    if (!sfSupported || contradictedLocation) {
      conditions.push(
        condition(
          editionId,
          'ciudad',
          contradictedLocation
            ? 'Sources disagree on location: SF eligibility requires a supported city.'
            : 'No source supports the city: location remains pending and the event is not assumed to be in SF.',
          'Which verifiable source establishes that this edition takes place in San Francisco?',
          true,
        ),
      );
    }
  }

  const scheduleConditions = [...conditions];

  // ---- Acceso: conflicto confirmado excluye; desconocido queda pendiente ----
  const accessClaims = claims.filter((c) => c.attribute === 'access');
  const supportedAccess = accessClaims.filter((c) => supported(c) && c.value.kind === 'text');
  const restrictionHit = supportedAccess
    .flatMap((claim) =>
      profile.restrictions
        .filter((r) => r.trim().length > 0 && claim.value.kind === 'text' && normalize(claim.value.text).includes(normalize(r)))
        .map((r) => ({ claim, restriction: r })),
    )
    .at(0);
  const uncertainAccess = accessClaims.some(c => !supported(c));
  if (!uncertainAccess && restrictionHit && restrictionHit.claim.value.kind === 'text') {
    exclusionReasons.push(
      `Confirmed access conflict: the brief restriction «${restrictionHit.restriction}» matches the documented access («${restrictionHit.claim.value.text}»).`,
    );
  } else if (supportedAccess.length === 0 || uncertainAccess) {
    conditions.push(
      condition(
        editionId,
        'acceso',
        'Access is unsupported: open registration, invitation requirements, and fees are unknown.',
        'Is registration open, invitation-only, or paid? Which source confirms this?',
        true,
      ),
    );
  }

  // Costos acumulables y paquetes alternativos se evalúan una sola vez.
  const costs = assessCosts(claims, profile.budget);
  exclusionReasons.push(...costs.conflicts);
  for (const note of costs.pending) conditions.push(condition(
    editionId, 'costo', note, 'What is the complete cost, currency, and participation package?', true,
  ));
  if (profile.budget.status !== 'declared') {
    conditions.push(
      condition(
        editionId,
        'presupuesto',
        'The brief does not declare a budget: a cost conflict cannot be confirmed or ruled out.',
        'What is the declared budget amount and currency for this evaluation?',
        false,
      ),
    );
  }

  // ---- Audiencia contradicha: condición con el motivo de la contradicción ----
  const contradictedAudience = claims.find((c) => c.attribute === 'audience' && c.status === 'contradicted');
  const audienceClaims = claims.filter(c => c.attribute === 'audience');
  if (!audienceClaims.some(c => supported(c) && (c.value.kind === 'text' || c.value.kind === 'number')) || audienceClaims.some(c => !supported(c))) {
    conditions.push(condition(editionId, 'audiencia-pendiente', 'Audience evidence is pending or insufficient to assess fit with the brief.', 'What documented audience participates in this edition?', false));
  }
  if (contradictedAudience) {
    conditions.push(
      condition(
        editionId,
        'audiencia',
        `Conflicting audience evidence: ${contradictedAudience.note ?? 'unresolved discrepancy'}.`,
        'Which source resolves the audience discrepancy (actual registrations or attendee list)?',
        false,
      ),
    );
  }

  // Restricciones libres son instrucciones del comprador; sin una regla
  // que las resuelva no se declaran satisfechas por afinidad temática.
  for (const restriction of profile.restrictions) {
    conditions.push(condition(editionId, 'restriccion', `Buyer restriction to verify: ${restriction}`,
      `How is «${restriction}» satisfied by the participation format of this edition?`, true));
  }
  if (profile.formats?.length) {
    const formats = claims.filter(c => ['format','modality'].includes(c.attribute));
    const matched = formats.some(c => supported(c) && c.value.kind === 'text' && profile.formats!.some(f => normalize(c.value.kind === 'text' ? c.value.text : '').includes(normalize(f))));
    if (!matched || formats.some(c => !supported(c))) conditions.push(condition(editionId, 'formato',
      `Requested format remains unconfirmed: ${profile.formats.join(', ')}.`, 'Is the requested format available, and under which conditions?', true));
  }

  const eligibility: EligibilityResult =
    exclusionReasons.length > 0
      ? { status: 'excluded', reasons: exclusionReasons }
      : conditions.length > 0
        ? { status: 'conditional', note: 'Conditional on missing information; a score cannot resolve an open condition.' }
        : { status: 'eligible' };

  return {
    editionId,
    organizerId: edition.organizerIds[0] ?? null,
    eligibility,
    conditions,
    researchBlockers: [...exclusionReasons, ...scheduleConditions.map(c => c.description)],
    note: ELIGIBLE_IS_NOT_RECOMMENDED,
  };
}
