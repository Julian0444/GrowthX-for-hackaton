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
  // Nota fija del contrato de esta etapa: elegible ≠ recomendado. Recomendar
  // gasto exige además una edición futura y una modalidad concretas (decisión
  // condicional de tickets posteriores).
  note: string;
}

export const ELIGIBLE_IS_NOT_RECOMMENDED =
  'Elegible no significa recomendado: recomendar gasto exige una edición futura y una modalidad concretas, y una decisión registrada.';

const AFFIRMATIVE = ['announced', 'reported', 'observed', 'confirmed'];

const supported = (claim: ClaimRevision): boolean =>
  AFFIRMATIVE.includes(claim.status) && claim.sourceIds.length > 0;

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
  if (dossier.validity.validity === 'past') {
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

  // ---- Ventana del perfil: un día declarado fuera de la ventana es un
  // conflicto confirmado de fecha contra las restricciones del perfil ----
  const day =
    edition.startDate.precision === 'instant'
      ? edition.startDate.iso.slice(0, 10)
      : edition.startDate.precision === 'date_only'
        ? edition.startDate.date
        : null;
  if (day !== null) {
    if (profile.window.from !== null && day < profile.window.from)
      exclusionReasons.push(`La fecha declarada (${day}) es anterior a la ventana del perfil (${profile.window.from}).`);
    if (profile.window.to !== null && day > profile.window.to)
      exclusionReasons.push(`La fecha declarada (${day}) es posterior a la ventana del perfil (${profile.window.to}).`);
  }

  // ---- Ciudad: SF con respaldo urbano ----
  const locationClaims = claims.filter((c) => c.attribute === 'location');
  const urbanSupported = locationClaims.filter(
    (c) =>
      supported(c) &&
      c.status !== 'announced' &&
      c.value.kind === 'location' &&
      (c.value.scope === 'city' || c.value.scope === 'venue') &&
      c.value.name !== null,
  );
  const urbanElsewhere = urbanSupported.find(
    (c) => c.value.kind === 'location' && !isSanFrancisco({ scope: 'city', name: c.value.name }),
  );
  const declaredElsewhere =
    edition.location.scope === 'city' && edition.location.name !== null && !isSanFrancisco(edition.location);
  if (urbanElsewhere || declaredElsewhere) {
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
    const contradictedLocation = locationClaims.some((c) => c.status === 'contradicted');
    if (!sfSupported || contradictedLocation) {
      conditions.push(
        condition(
          editionId,
          'ciudad',
          contradictedLocation
            ? 'La ubicación está contradicha entre fuentes: sin ciudad respaldada no hay elegibilidad en SF.'
            : 'Sin fuente urbana (no solo anunciada) que respalde la ciudad: la ubicación queda pendiente y el evento no se sitúa en SF por hipótesis.',
          '¿Qué fuente urbana verificable respalda que la edición ocurre en San Francisco?',
          true,
        ),
      );
    }
  }

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
  if (restrictionHit && restrictionHit.claim.value.kind === 'text') {
    exclusionReasons.push(
      `Acceso incompatible confirmado: la restricción del perfil «${restrictionHit.restriction}» coincide con el acceso documentado («${restrictionHit.claim.value.text}»).`,
    );
  } else if (supportedAccess.length === 0) {
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

  // ---- Presupuesto: una partida con soporte que excede el presupuesto
  // declarado es un conflicto confirmado; el costo desconocido queda pendiente
  // y NO cuenta como cero ----
  const costClaims = claims.filter((c) => c.attribute.startsWith('cost:'));
  const supportedCosts = costClaims.filter((c) => supported(c) && c.value.kind === 'money');
  if (profile.budget.status === 'declared') {
    const budget = profile.budget;
    for (const claim of supportedCosts) {
      if (claim.value.kind === 'money' && claim.value.currency === budget.currency && claim.value.amount > budget.amount) {
        exclusionReasons.push(
          `Presupuesto en conflicto confirmado: la partida «${claim.attribute.slice('cost:'.length)}» publicada (${claim.value.currency} ${claim.value.amount}) excede el presupuesto declarado (${budget.currency} ${budget.amount}).`,
        );
      }
    }
  }
  if (supportedCosts.length === 0) {
    conditions.push(
      condition(
        editionId,
        'costo',
        'Costo total desconocido: ninguna partida con soporte. No se suma como cero ni habilita por puntaje.',
        '¿Cuáles son las partidas de patrocinio y su costo? (tarifario o propuesta del organizador)',
        true,
      ),
    );
  }
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
    note: ELIGIBLE_IS_NOT_RECOMMENDED,
  };
}
