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
  'Elegible no significa recomendado: recomendar gasto exige una edición futura y una modalidad concretas, y una decisión registrada.';


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
      contradictedDate ? `Fecha contradicha: ${dateClaims.filter(c => c.status === 'contradicted').map(c => c.note).join('; ')}` : 'Fecha sin soporte suficiente.',
      '¿Qué fuente resuelve la fecha y su zona horaria?', true));
  }
  if (!contradictedDate && dossier.validity.validity === 'past') {
    exclusionReasons.push(`Fecha vencida: ${dossier.validity.reason}`);
  } else if (dossier.validity.validity === 'date_pending' || dossier.validity.validity === 'date_ambiguous') {
    conditions.push(
      condition(
        editionId,
        'fecha',
        `Fecha ${dossier.validity.validity === 'date_pending' ? 'pendiente' : 'ambigua'}: ${dossier.validity.reason}`,
        '¿Cuál es la fecha exacta (con zona horaria) de la edición?',
        true,
      ),
    );
  }

  if (edition.startDate.precision === 'date_only') {
    conditions.push(condition(editionId, 'fecha-hora', 'Fecha sin hora exacta; conservar el día declarado y confirmar hora y zona.', '¿A qué hora y en qué zona comienza la edición?', true));
  }

  // ---- Ventana del perfil: un día declarado fuera de la ventana es un
  // conflicto confirmado de fecha contra las restricciones del perfil ----
  const day = declaredCalendarDay(edition.startDate);
  if (!contradictedDate && day !== null) {
    if (profile.window.from !== null && day < profile.window.from)
      exclusionReasons.push(`La fecha declarada (${day}) es anterior a la ventana del perfil (${profile.window.from}).`);
    if (profile.window.to !== null && day > profile.window.to)
      exclusionReasons.push(`La fecha declarada (${day}) es posterior a la ventana del perfil (${profile.window.to}).`);
  } else if (day === null && edition.startDate.precision === 'instant') {
    conditions.push(condition(
      editionId,
      'zona-horaria',
      'La zona horaria declarada no permite verificar el día del evento contra la ventana del perfil.',
      '¿Cuál es la zona horaria verificable de la edición?',
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
      `Edición en otra ciudad (${name ?? 'desconocida'}): no es una inversión elegible en SF. Un antecedente de otra ciudad no satisface la regla; sigue consultable como antecedente.`,
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
            ? 'La ubicación está contradicha entre fuentes: sin ciudad respaldada no hay elegibilidad en SF.'
            : 'Sin fuente urbana que respalde la ciudad: la ubicación queda pendiente y el evento no se sitúa en SF por hipótesis.',
          '¿Qué fuente urbana verificable respalda que la edición ocurre en San Francisco?',
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
      `Acceso incompatible confirmado: la restricción del perfil «${restrictionHit.restriction}» coincide con el acceso documentado («${restrictionHit.claim.value.text}»).`,
    );
  } else if (supportedAccess.length === 0 || uncertainAccess) {
    conditions.push(
      condition(
        editionId,
        'acceso',
        'Modalidad de acceso sin soporte: no se sabe si el registro es abierto, por invitación o pago.',
        '¿El registro es abierto, por invitación o de pago? ¿Con qué fuente se confirma?',
        true,
      ),
    );
  }

  // Costos acumulables y paquetes alternativos se evalúan una sola vez.
  const costs = assessCosts(claims, profile.budget);
  exclusionReasons.push(...costs.conflicts);
  for (const note of costs.pending) conditions.push(condition(
    editionId, 'costo', note, '¿Cuál es el costo completo, la moneda y el paquete a contratar?', true,
  ));
  if (profile.budget.status !== 'declared') {
    conditions.push(
      condition(
        editionId,
        'presupuesto',
        'El perfil no declara presupuesto: un conflicto de costo no puede confirmarse ni descartarse.',
        '¿Cuál es el presupuesto declarado (monto y moneda) para esta evaluación?',
        false,
      ),
    );
  }

  // ---- Audiencia contradicha: condición con el motivo de la contradicción ----
  const contradictedAudience = claims.find((c) => c.attribute === 'audience' && c.status === 'contradicted');
  const audienceClaims = claims.filter(c => c.attribute === 'audience');
  if (!audienceClaims.some(c => supported(c) && (c.value.kind === 'text' || c.value.kind === 'number')) || audienceClaims.some(c => !supported(c))) {
    conditions.push(condition(editionId, 'audiencia-pendiente', 'Audiencia pendiente o sin soporte suficiente para evaluar el ajuste al perfil.', '¿Qué audiencia documentada participa en esta edición?', false));
  }
  if (contradictedAudience) {
    conditions.push(
      condition(
        editionId,
        'audiencia',
        `Audiencia contradicha entre fuentes: ${contradictedAudience.note ?? 'discrepancia sin resolver'}.`,
        '¿Qué fuente resuelve la discrepancia de audiencia (registro real, lista de asistentes)?',
        false,
      ),
    );
  }

  const eligibility: EligibilityResult =
    exclusionReasons.length > 0
      ? { status: 'excluded', reasons: exclusionReasons }
      : conditions.length > 0
        ? { status: 'conditional', note: 'Condicionado por información faltante; ninguna condición se resuelve por puntaje.' }
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
