// Validación de runtime de los contratos de evaluación persistida (ticket 07).
//
// Un payload inválido se RECHAZA con ruta y motivo; jamás se corrige en
// silencio. `contractVersion` se comprueba ANTES que la forma: una versión
// desconocida se rechaza con su propio error y nunca se interpreta como la
// actual. Las claves que el contrato v1 no define también se rechazan: podrían
// ser de una versión futura y leerlas ignorándolas sería interpretarla.
//
// Estas reglas son de OBJETO (forma y coherencia interna). La integridad
// relacional —pertenencia al tenant, existencia de los ids referenciados— se
// comprueba en los tickets 08 y 09: acá un `sourceIds` con un id irresoluble es
// válido; «probar» referencias con un validador JSON sería un falso cierre.
//
// Validador propio y pequeño a propósito: combinadores suficientes para estos
// contratos, sin dependencia nueva (el ticket la permitía; no hizo falta).

import type {
  AudienceDeclaration,
  BudgetDeclaration,
  CampaignCommitment,
  CampaignCostItem,
  CampaignDraftRecord,
  ClaimRevision,
  ClaimStatus,
  ClaimSubject,
  ClaimValue,
  CompanyRecord,
  ComparableCompanyRef,
  DeclaredDate,
  DecisionCondition,
  EditionLocation,
  EligibilityResult,
  EvaluationContractVersion,
  EvaluationDecision,
  EvaluationProfile,
  EvaluationReadBundle,
  EvaluationSnapshot,
  EvaluationWindow,
  EventEditionRevision,
  GeoScope,
  MoneyClaim,
  ObjectiveDeclaration,
  OrganizerAlias,
  OrganizerRevision,
  ParticipationRevision,
  PendingCondition,
  PolicyRef,
  SnapshotAlternative,
  SnapshotOrdering,
  SnapshotOutcome,
  SourceRecord,
} from './evaluation';
import type { NarrativeState } from './growxth';

// La única versión que este lector entiende. Agregar la «2» exige decidir la
// migración explícitamente, no reinterpretar payloads.
export const SUPPORTED_CONTRACT_VERSION: EvaluationContractVersion = '1';

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

// ============ Combinadores ============

const INVALID = Symbol('evaluation-contract-invalid');
type Invalid = typeof INVALID;

interface Schema<T> {
  optional?: boolean;
  read(input: unknown, path: string, issues: ValidationIssue[]): T | Invalid;
}

type Infer<S extends Schema<unknown>> = S extends Schema<infer T> ? T : never;

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function fail(issues: ValidationIssue[], path: string, message: string): Invalid {
  issues.push({ path, message });
  return INVALID;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

function nonEmptyString(): Schema<string> {
  return {
    read: (input, path, issues) => {
      if (typeof input !== 'string') return fail(issues, path, `se esperaba string, llegó ${typeName(input)}`);
      if (input.trim().length === 0) return fail(issues, path, 'string vacío: el contrato exige contenido, no un hueco disfrazado');
      return input;
    },
  };
}

// NaN/Infinity no existen en JSON y suelen ser huecos disfrazados de número.
function finiteNumber(): Schema<number> {
  return {
    read: (input, path, issues) =>
      typeof input === 'number' && Number.isFinite(input)
        ? input
        : fail(issues, path, `se esperaba número finito, llegó ${typeName(input) === 'number' ? String(input) : typeName(input)}`),
  };
}

function numberBetween(min: number, max: number): Schema<number> {
  const base = finiteNumber();
  return {
    read: (input, path, issues) => {
      const value = base.read(input, path, issues);
      if (value === INVALID) return INVALID;
      if (value < min || value > max) return fail(issues, path, `fuera de rango [${min}, ${max}]: ${value}`);
      return value;
    },
  };
}

function positiveInt(): Schema<number> {
  return {
    read: (input, path, issues) =>
      typeof input === 'number' && Number.isInteger(input) && input >= 1
        ? input
        : fail(issues, path, 'se esperaba entero ≥ 1'),
  };
}

function boolean(): Schema<boolean> {
  return {
    read: (input, path, issues) =>
      typeof input === 'boolean' ? input : fail(issues, path, `se esperaba boolean, llegó ${typeName(input)}`),
  };
}

function literal<const V extends readonly (string | number | boolean)[]>(...values: V): Schema<V[number]> {
  return {
    read: (input, path, issues) => {
      for (const v of values) if (input === v) return input as V[number];
      return fail(issues, path, `valor «${String(input)}» no admitido; se admite: ${values.map(String).join(' | ')}`);
    },
  };
}

function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return {
    read: (input, path, issues) => (input === null ? null : schema.read(input, path, issues)),
  };
}

// Extensiones v1 opcionales conservan los payloads históricos sin rellenarlos.
function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  return { optional: true, read: (input, path, issues) => input === undefined ? undefined : schema.read(input, path, issues) };
}

function array<T>(schema: Schema<T>): Schema<T[]> {
  return {
    read: (input, path, issues) => {
      if (!Array.isArray(input)) return fail(issues, path, `se esperaba array, llegó ${typeName(input)}`);
      const out: T[] = [];
      let bad = false;
      input.forEach((item, index) => {
        const value = schema.read(item, `${path}[${index}]`, issues);
        if (value === INVALID) bad = true;
        else out.push(value);
      });
      return bad ? INVALID : out;
    },
  };
}

function object<S extends { [key: string]: Schema<unknown> }>(shape: S): Schema<{ [K in keyof S]: Infer<S[K]> }> {
  const keys = Object.keys(shape);
  return {
    read: (input, path, issues) => {
      if (!isPlainRecord(input)) return fail(issues, path, `se esperaba objeto, llegó ${typeName(input)}`);
      const out: Record<string, unknown> = {};
      let bad = false;
      for (const key of keys) {
        if (!hasOwn(input, key)) {
          if (shape[key].optional) continue;
          issues.push({ path: `${path}.${key}`, message: 'campo requerido ausente' });
          bad = true;
          continue;
        }
        const value = shape[key].read(input[key], `${path}.${key}`, issues);
        if (value === INVALID) bad = true;
        else out[key] = value;
      }
      for (const key of Object.keys(input)) {
        if (!hasOwn(shape, key)) {
          issues.push({
            path: `${path}.${key}`,
            message: 'campo desconocido para el contrato v1: se rechaza, no se ignora en silencio',
          });
          bad = true;
        }
      }
      return bad ? INVALID : (out as { [K in keyof S]: Infer<S[K]> });
    },
  };
}

// Union discriminada por una clave literal; cada rama valida su forma completa.
function discriminated<S extends { [tag: string]: Schema<unknown> }>(
  key: string,
  cases: S,
): Schema<Infer<S[keyof S]>> {
  return {
    read: (input, path, issues) => {
      if (!isPlainRecord(input)) return fail(issues, path, `se esperaba objeto, llegó ${typeName(input)}`);
      const tag = input[key];
      if (typeof tag !== 'string' || !hasOwn(cases, tag)) {
        return fail(
          issues,
          `${path}.${key}`,
          `discriminante «${String(tag)}» no admitido; se admite: ${Object.keys(cases).join(' | ')}`,
        );
      }
      return cases[tag].read(input, path, issues) as Infer<S[keyof S]> | Invalid;
    },
  };
}

// Reglas de coherencia interna sobre un valor ya bien formado.
function refine<T>(
  schema: Schema<T>,
  rule: (value: T, addIssue: (subPath: string, message: string) => void) => void,
): Schema<T> {
  return {
    read: (input, path, issues) => {
      const value = schema.read(input, path, issues);
      if (value === INVALID) return INVALID;
      let bad = false;
      rule(value, (subPath, message) => {
        issues.push({ path: subPath ? `${path}.${subPath}` : path, message });
        bad = true;
      });
      return bad ? INVALID : value;
    },
  };
}

// Instante ISO 8601 con hora ("2026-09-08T00:00:00Z" o con offset).
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
// Día calendario ISO ("2026-09-08").
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoInstant(): Schema<string> {
  return {
    read: (input, path, issues) => {
      if (typeof input !== 'string') return fail(issues, path, `se esperaba string ISO 8601, llegó ${typeName(input)}`);
      if (!ISO_INSTANT.test(input) || Number.isNaN(Date.parse(input)))
        return fail(issues, path, `«${input}» no es un instante ISO 8601 con zona explícita`);
      return input;
    },
  };
}

function isoDay(): Schema<string> {
  return {
    read: (input, path, issues) => {
      if (typeof input !== 'string') return fail(issues, path, `se esperaba string YYYY-MM-DD, llegó ${typeName(input)}`);
      if (!ISO_DAY.test(input) || Number.isNaN(Date.parse(`${input}T00:00:00Z`)))
        return fail(issues, path, `«${input}» no es un día calendario ISO válido`);
      return input;
    },
  };
}

function isoDayOrInstant(): Schema<string> {
  const day = isoDay();
  const instant = isoInstant();
  return {
    read: (input, path, issues) => {
      if (typeof input === 'string' && ISO_DAY.test(input)) return day.read(input, path, issues);
      return instant.read(input, path, issues);
    },
  };
}

// Código de moneda explícito (ISO 4217): un importe sin moneda no es un importe.
function currencyCode(): Schema<string> {
  return {
    read: (input, path, issues) => {
      if (typeof input !== 'string' || !/^[A-Z]{3}$/.test(input))
        return fail(issues, path, `moneda «${String(input)}» inválida; se espera código ISO 4217 (p. ej. "USD")`);
      return input;
    },
  };
}

// ============ Piezas compartidas ============

const contractVersionSchema = literal(SUPPORTED_CONTRACT_VERSION);
const idSchema = nonEmptyString();
const idArraySchema = array(idSchema);

const geoScopeSchema: Schema<GeoScope> = literal('venue', 'city', 'region', 'country', 'global', 'unknown');

const claimStatusSchema: Schema<ClaimStatus> = literal(
  'announced',
  'reported',
  'observed',
  'inferred',
  'confirmed',
  'pending',
  'contradicted',
);

const declaredDateSchema: Schema<DeclaredDate> = discriminated('precision', {
  instant: object({ precision: literal('instant'), iso: isoInstant(), timezone: nonEmptyString() }),
  date_only: object({ precision: literal('date_only'), date: isoDay(), timezone: nullable(nonEmptyString()) }),
  ambiguous: object({
    precision: literal('ambiguous'),
    text: nonEmptyString(),
    earliest: nullable(isoInstant()),
    latest: nullable(isoInstant()),
  }),
  unknown: object({ precision: literal('unknown') }),
});

const uncertainMoneyFields = {
  amount: finiteNumber(), currency: currencyCode(), sourceIds: idArraySchema,
  basis: nonEmptyString(), note: nullable(nonEmptyString()),
};

const moneyClaimSchema: Schema<MoneyClaim> = refine(
  discriminated('status', {
    quoted: object({
      status: literal('quoted'),
      amount: finiteNumber(),
      currency: currencyCode(),
      sourceIds: idArraySchema,
    }),
    estimated: object({
      status: literal('estimated'),
      amount: finiteNumber(),
      currency: currencyCode(),
      basis: nonEmptyString(),
    }),
    inferred: object({ status: literal('inferred'), ...uncertainMoneyFields }),
    contradicted: object({ status: literal('contradicted'), ...uncertainMoneyFields }),
    unknown: object({ status: literal('unknown'), note: nullable(nonEmptyString()) }),
  }),
  (value, addIssue) => {
    if (value.status === 'quoted' && value.sourceIds.length === 0)
      addIssue('sourceIds', 'un importe cotizado exige al menos una fuente de soporte');
    if (value.status === 'contradicted' && (value.note === null || value.sourceIds.length === 0))
      addIssue('note', 'un costo contradicho conserva motivo y fuentes');
    if (value.status !== 'unknown' && value.amount < 0)
      addIssue('amount', 'un importe no puede ser negativo');
  },
);

const pendingConditionSchema: Schema<PendingCondition> = object({
  id: idSchema,
  description: nonEmptyString(),
  blocksEligibility: boolean(),
  resolution: nullable(nonEmptyString()),
});

// ============ Perfil ============

const budgetSchema: Schema<BudgetDeclaration> = refine(
  discriminated('status', {
    declared: object({ status: literal('declared'), amount: finiteNumber(), currency: currencyCode() }),
    unknown: object({ status: literal('unknown'), note: nullable(nonEmptyString()) }),
  }),
  (value, addIssue) => {
    // 0 es un cero DECLARADO legítimo; negativo no es un presupuesto.
    if (value.status === 'declared' && value.amount < 0) addIssue('amount', 'presupuesto negativo');
  },
);

const objectiveSchema: Schema<ObjectiveDeclaration> = object({
  kind: literal('adoption', 'feedback', 'hiring', 'awareness'),
  confirmation: literal('provisional', 'confirmed'),
  successDefinition: discriminated('status', {
    defined: object({ status: literal('defined'), text: nonEmptyString() }),
    pending: object({ status: literal('pending') }),
  }),
});

const audienceSchema: Schema<AudienceDeclaration> = object({
  description: nonEmptyString(),
  profiles: array(nonEmptyString()),
});

const windowSchema: Schema<EvaluationWindow> = refine(
  object({ from: nullable(isoDayOrInstant()), to: nullable(isoDayOrInstant()) }),
  (value, addIssue) => {
    if (value.from !== null && value.to !== null && Date.parse(value.from) > Date.parse(value.to))
      addIssue('', 'ventana invertida: from es posterior a to');
  },
);

const comparableCompanySchema: Schema<ComparableCompanyRef> = object({
  companyId: nullable(idSchema),
  name: nonEmptyString(),
  relation: literal('comparable', 'competitor'),
  confirmation: literal('indicated', 'confirmed'),
});

const evaluationProfileSchema: Schema<EvaluationProfile> = object({
  contractVersion: contractVersionSchema,
  id: idSchema,
  profileVersion: positiveInt(),
  createdAt: isoInstant(),
  product: nonEmptyString(),
  audience: audienceSchema,
  stack: array(nonEmptyString()),
  budget: budgetSchema,
  window: windowSchema,
  restrictions: array(nonEmptyString()),
  objective: objectiveSchema,
  comparableCompanies: array(comparableCompanySchema),
});

// ============ Fuente, claim y revisión ============

const sourceRecordSchema: Schema<SourceRecord> = object({
  contractVersion: contractVersionSchema,
  id: idSchema,
  url: nullable(nonEmptyString()),
  locator: nullable(nonEmptyString()),
  provider: nonEmptyString(),
  collector: nonEmptyString(),
  fetchedAt: isoInstant(),
  publishedAt: nullable(isoDayOrInstant()),
  method: nonEmptyString(),
  geoScope: geoScopeSchema,
  content: discriminated('kind', {
    excerpt: object({ kind: literal('excerpt'), excerpt: nonEmptyString() }),
    hash: object({ kind: literal('hash'), sha256: nonEmptyString() }),
    none: object({ kind: literal('none') }),
  }),
  usageRestrictions: array(nonEmptyString()),
});

const claimSubjectSchema: Schema<ClaimSubject> = discriminated('type', {
  organizer: object({ type: literal('organizer'), organizerId: idSchema }),
  edition: object({ type: literal('edition'), editionId: idSchema }),
  company: object({ type: literal('company'), companyId: idSchema }),
  participation: object({ type: literal('participation'), participationId: idSchema }),
  profile: object({ type: literal('profile'), profileId: idSchema }),
});

const claimValueSchema: Schema<ClaimValue> = discriminated('kind', {
  text: object({ kind: literal('text'), text: nonEmptyString() }),
  number: object({ kind: literal('number'), amount: finiteNumber(), unit: nonEmptyString() }),
  money: object({ kind: literal('money'), amount: finiteNumber(), currency: currencyCode() }),
  date: object({ kind: literal('date'), date: declaredDateSchema }),
  location: object({ kind: literal('location'), scope: geoScopeSchema, name: nullable(nonEmptyString()) }),
  pending: object({ kind: literal('pending'), note: nullable(nonEmptyString()) }),
});

// Estados que afirman algo sobre el mundo: exigen evidencia vinculada.
const STATUSES_REQUIRING_SOURCES: readonly ClaimStatus[] = ['announced', 'reported', 'observed', 'confirmed', 'contradicted'];

const claimRevisionSchema: Schema<ClaimRevision> = refine(
  object({
    contractVersion: contractVersionSchema,
    id: idSchema,
    claimId: idSchema,
    subject: claimSubjectSchema,
    attribute: nonEmptyString(),
    costComposition: optional(discriminated('kind', {
      additive: object({ kind: literal('additive') }),
      alternative: object({ kind: literal('alternative'), groupId: idSchema, optionId: idSchema }),
    })),
    value: claimValueSchema,
    status: claimStatusSchema,
    sourceIds: idArraySchema,
    method: nullable(nonEmptyString()),
    note: nullable(nonEmptyString()),
    reviewer: nullable(nonEmptyString()),
    reviewedAt: isoInstant(),
    previousRevisionId: nullable(idSchema),
  }),
  (claim, addIssue) => {
    if (claim.costComposition && !claim.attribute.startsWith('cost:'))
      addIssue('costComposition', 'solo una partida de costo admite composición');
    if (claim.attribute.startsWith('cost:') && claim.value.kind === 'money' && claim.value.amount < 0)
      addIssue('value.amount', 'un costo no puede ser negativo');
    if (STATUSES_REQUIRING_SOURCES.includes(claim.status) && claim.sourceIds.length === 0)
      addIssue('sourceIds', `un claim «${claim.status}» exige evidencia vinculada`);
    if (claim.status === 'contradicted' && claim.note === null)
      addIssue('note', 'una contradicción exige un motivo visible: qué contradice a qué');
    if (claim.status === 'inferred' && claim.method === null)
      addIssue('method', 'una inferencia exige declarar su método');
    if (claim.value.kind === 'pending' && claim.status !== 'pending')
      addIssue('status', 'un valor pendiente no puede llevar un estado que afirme un valor');
  },
);

// ============ Identidades del foco SF ============

const organizerAliasSchema: Schema<OrganizerAlias> = refine(
  object({
    alias: nonEmptyString(),
    confirmation: literal('proposed', 'confirmed'),
    sourceIds: idArraySchema,
  }),
  (alias, addIssue) => {
    if (alias.confirmation === 'confirmed' && alias.sourceIds.length === 0)
      addIssue('sourceIds', 'un alias confirmado exige soporte; la similitud de nombre no confirma');
  },
);

const organizerRevisionSchema: Schema<OrganizerRevision> = object({
  contractVersion: contractVersionSchema,
  id: idSchema,
  organizerId: idSchema,
  displayName: nonEmptyString(),
  aliases: array(organizerAliasSchema),
  claimRevisionIds: idArraySchema,
  revisedAt: isoInstant(),
  previousRevisionId: nullable(idSchema),
});

const editionLocationSchema: Schema<EditionLocation> = refine(
  object({ scope: geoScopeSchema, name: nullable(nonEmptyString()) }),
  (location, addIssue) => {
    if (location.scope !== 'unknown' && location.name === null)
      addIssue('name', 'un alcance afirmado exige el nombre del lugar en ese alcance');
  },
);

const eventEditionRevisionSchema: Schema<EventEditionRevision> = refine(
  object({
    contractVersion: contractVersionSchema,
    id: idSchema,
    editionId: idSchema,
    organizerIds: idArraySchema,
    name: nonEmptyString(),
    canonicalUrl: nullable(nonEmptyString()),
    provider: nullable(nonEmptyString()),
    startDate: declaredDateSchema,
    location: editionLocationSchema,
    coordinates: nullable(object({ lat: numberBetween(-90, 90), lng: numberBetween(-180, 180) })),
    claimRevisionIds: idArraySchema,
    revisedAt: isoInstant(),
    previousRevisionId: nullable(idSchema),
  }),
  (edition, addIssue) => {
    // Un punto en el mapa exige respaldo urbano: una localización nacional o
    // regional no coloca el evento en una ciudad.
    if (edition.coordinates !== null && edition.location.scope !== 'venue' && edition.location.scope !== 'city')
      addIssue('coordinates', `coordenadas con alcance «${edition.location.scope}»: sin respaldo urbano no hay punto`);
  },
);

const companyRecordSchema: Schema<CompanyRecord> = object({
  contractVersion: contractVersionSchema,
  id: idSchema,
  name: nonEmptyString(),
  websiteUrl: nullable(nonEmptyString()),
});

const participationRevisionSchema: Schema<ParticipationRevision> = refine(
  object({
    contractVersion: contractVersionSchema,
    id: idSchema,
    participationId: idSchema,
    companyId: idSchema,
    editionId: idSchema,
    role: literal('paid_sponsor', 'in_kind_sponsor', 'speaker', 'host', 'co_organizer', 'logo_present'),
    roleStatus: claimStatusSchema,
    sourceIds: idArraySchema,
    announcedDetail: nullable(nonEmptyString()),
    reportedExecution: nullable(nonEmptyString()),
    commercialOutcome: discriminated('status', {
      reported: object({ status: literal('reported'), summary: nonEmptyString(), sourceIds: idArraySchema }),
      unknown: object({ status: literal('unknown') }),
    }),
    revisedAt: isoInstant(),
    previousRevisionId: nullable(idSchema),
  }),
  (participation, addIssue) => {
    if (STATUSES_REQUIRING_SOURCES.includes(participation.roleStatus) && participation.sourceIds.length === 0)
      addIssue('sourceIds', `un rol «${participation.roleStatus}» exige evidencia vinculada`);
    if (participation.role === 'paid_sponsor' && participation.roleStatus === 'inferred')
      addIssue('roleStatus', 'un patrocinio pagado no se infiere: un logo ambiguo o la similitud no lo documentan');
    if (participation.role === 'logo_present' && participation.commercialOutcome.status !== 'unknown')
      addIssue('commercialOutcome', 'un logo ambiguo no crea resultados: documentá el rol real antes de atribuirle un resultado');
    if (participation.commercialOutcome.status === 'reported' && participation.commercialOutcome.sourceIds.length === 0)
      addIssue('commercialOutcome.sourceIds', 'un resultado reportado exige quién lo reporta (fuente)');
  },
);

// ============ Snapshot ============

const policyRefSchema: Schema<PolicyRef> = discriminated('status', {
  applied: object({ status: literal('applied'), policyId: idSchema, policyVersion: nonEmptyString() }),
  none: object({ status: literal('none'), note: nonEmptyString() }),
});

const eligibilitySchema: Schema<EligibilityResult> = refine(
  discriminated('status', {
    eligible: object({ status: literal('eligible') }),
    conditional: object({ status: literal('conditional'), note: nullable(nonEmptyString()) }),
    excluded: object({ status: literal('excluded'), reasons: array(nonEmptyString()) }),
  }),
  (value, addIssue) => {
    if (value.status === 'excluded' && value.reasons.length === 0)
      addIssue('reasons', 'una exclusión exige sus motivos');
  },
);

const alternativeScoringSchema: Schema<SnapshotAlternative['scoring']> = discriminated('status', {
  scored: object({
    status: literal('scored'),
    sKnown: numberBetween(0, 100),
    coverage: numberBetween(0, 1),
    sensitivityNote: nullable(nonEmptyString()),
  }),
  not_scored: object({
    status: literal('not_scored'),
    reason: literal('no_policy', 'excluded_before_scoring', 'insufficient_data'),
    note: nullable(nonEmptyString()),
  }),
});

const snapshotAlternativeSchema: Schema<SnapshotAlternative> = refine(
  object({
    editionId: idSchema,
    organizerId: nullable(idSchema),
    eligibility: eligibilitySchema,
    conditions: array(pendingConditionSchema),
    scoring: alternativeScoringSchema,
  }),
  (alternative, addIssue) => {
    if (alternative.eligibility.status === 'conditional' && alternative.conditions.length === 0)
      addIssue('conditions', 'una alternativa condicionada exige al menos una condición pendiente');
  },
);

const orderingSchema: Schema<SnapshotOrdering> = discriminated('kind', {
  ranked: object({
    kind: literal('ranked'),
    policyId: idSchema,
    policyVersion: nonEmptyString(),
    editionIds: idArraySchema,
  }),
  presentation_only: object({
    kind: literal('presentation_only'),
    editionIds: idArraySchema,
    note: nonEmptyString(),
  }),
});

const outcomeSchema: Schema<SnapshotOutcome> = discriminated('kind', {
  completed: object({ kind: literal('completed') }),
  no_eligible_candidates: object({ kind: literal('no_eligible_candidates'), reasons: array(nonEmptyString()) }),
  technical_failure: object({ kind: literal('technical_failure'), error: nonEmptyString() }),
});

const narrativeStateSchema: Schema<NarrativeState> = refine(
  object({
    status: literal('deterministic_only', 'validated', 'rejected'),
    note: nullable(nonEmptyString()),
    selectedEvidenceIds: idArraySchema,
  }),
  (narrative, addIssue) => {
    if (narrative.status !== 'validated' && narrative.selectedEvidenceIds.length > 0)
      addIssue('selectedEvidenceIds', 'solo una redacción validada conserva selección de evidencia');
  },
);

const evaluationSnapshotSchema: Schema<EvaluationSnapshot> = refine(
  object({
    contractVersion: contractVersionSchema,
    id: idSchema,
    kind: literal('organizer_research', 'investment_comparison'),
    profileId: idSchema,
    profileVersion: positiveInt(),
    evaluatedAt: isoInstant(),
    claimRevisionIds: idArraySchema,
    organizerRevisionIds: idArraySchema,
    editionRevisionIds: idArraySchema,
    participationRevisionIds: idArraySchema,
    policy: policyRefSchema,
    alternatives: array(snapshotAlternativeSchema),
    ordering: orderingSchema,
    outcome: outcomeSchema,
    narrative: nullable(narrativeStateSchema),
  }),
  (snapshot, addIssue) => {
    // Coherencia INTERNA del agregado (no es integridad relacional): el orden
    // oficial ordena exactamente las alternativas del propio snapshot.
    const alternativeIds = snapshot.alternatives.map((a) => a.editionId);
    if (new Set(alternativeIds).size !== alternativeIds.length)
      addIssue('alternatives', 'alternativas con editionId duplicado');
    const orderedIds = snapshot.ordering.editionIds;
    if (new Set(orderedIds).size !== orderedIds.length) addIssue('ordering.editionIds', 'orden con ids duplicados');
    const sameSet =
      orderedIds.length === alternativeIds.length && orderedIds.every((id) => alternativeIds.includes(id));
    if (!sameSet)
      addIssue('ordering.editionIds', 'el orden oficial debe ordenar exactamente las alternativas del snapshot');
    if (snapshot.ordering.kind === 'ranked') {
      if (snapshot.policy.status !== 'applied')
        addIssue('ordering', 'sin política aplicada no hay ranking: solo orden de presentación');
      else if (
        snapshot.ordering.policyId !== snapshot.policy.policyId ||
        snapshot.ordering.policyVersion !== snapshot.policy.policyVersion
      )
        addIssue('ordering', 'el ranking cita una política distinta de la aplicada por el snapshot');
    }
    if (snapshot.policy.status !== 'applied') {
      for (const [index, alternative] of snapshot.alternatives.entries()) {
        // Sin política no hay score: «sin política» es un estado, no un cero.
        if (alternative.scoring.status === 'scored')
          addIssue(`alternatives[${index}].scoring`, 'score sin política aplicada: sin política no se puntúa');
      }
    }
  },
);

// ============ Decisión y campaña ============

// Responsable y plazo «si se conocen» (ticket 13): nullable de verdad — un
// string vacío no es un responsable y no se admite como hueco disfrazado.
const decisionConditionSchema: Schema<DecisionCondition> = object({
  id: idSchema,
  description: nonEmptyString(),
  answerWouldChangeTo: nullable(literal('chosen', 'discarded')),
  status: literal('open', 'resolved'),
  resolvedNote: nullable(nonEmptyString()),
  owner: nullable(nonEmptyString()),
  dueBy: nullable(isoDayOrInstant()),
});

const evaluationDecisionSchema: Schema<EvaluationDecision> = refine(
  object({
    contractVersion: contractVersionSchema,
    id: idSchema,
    snapshotId: idSchema,
    editionId: idSchema,
    verdict: literal('chosen', 'discarded', 'pending'),
    reasons: array(nonEmptyString()),
    conditions: array(decisionConditionSchema),
    decidedBy: object({ userId: idSchema, resolvedBy: literal('server_session') }),
    decidedAt: isoInstant(),
    revision: positiveInt(),
    previousRevisionId: nullable(idSchema),
  }),
  (decision, addIssue) => {
    if (decision.reasons.length === 0) addIssue('reasons', 'una decisión exige sus motivos');
    if (decision.revision === 1 && decision.previousRevisionId !== null)
      addIssue('previousRevisionId', 'la primera revisión no tiene anterior');
    if (decision.revision > 1 && decision.previousRevisionId === null)
      addIssue('previousRevisionId', 'una revisión posterior conserva la relación con la anterior');
  },
);

const campaignCommitmentSchema: Schema<CampaignCommitment> = refine(
  object({
    id: idSchema,
    description: nonEmptyString(),
    kind: literal('estimate', 'goal', 'agreed'),
    owner: nullable(nonEmptyString()),
    dueBy: nullable(isoDayOrInstant()),
    // «Acordado» exige QUIÉN confirmó y CUÁNDO además del método y la
    // evidencia (ticket 13): los cuatro juntos o se rechaza.
    confirmation: nullable(
      object({
        method: nonEmptyString(),
        sourceIds: idArraySchema,
        confirmedBy: nonEmptyString(),
        confirmedAt: isoInstant(),
      }),
    ),
  }),
  (commitment, addIssue) => {
    if (commitment.kind === 'agreed') {
      if (commitment.confirmation === null)
        addIssue('confirmation', 'un compromiso ACORDADO exige soporte: quién confirmó, cuándo, método y evidencia de confirmación');
      else if (commitment.confirmation.sourceIds.length === 0)
        addIssue('confirmation.sourceIds', 'un compromiso acordado exige evidencia de confirmación verificable');
    } else if (commitment.confirmation !== null) {
      addIssue('confirmation', `una ${commitment.kind === 'estimate' ? 'estimación' : 'meta'} no lleva confirmación: confirmarla la disfrazaría de acuerdo`);
    }
  },
);

const campaignCostItemSchema: Schema<CampaignCostItem> = refine(object({
  id: idSchema,
  label: nonEmptyString(),
  amount: moneyClaimSchema,
  evidence: optional(claimRevisionSchema),
}), (item, addIssue) => {
  const evidence = item.evidence;
  if (!evidence) return; // registros v1 anteriores: no inventar procedencia
  if (!evidence.attribute.startsWith('cost:')) addIssue('evidence', 'la evidencia debe ser una partida de costo');
  if ((evidence.status === 'inferred' || evidence.status === 'contradicted') && item.amount.status !== evidence.status)
    addIssue('amount.status', 'la campaña debe conservar el estado inferido o contradicho de su evidencia');
  if (evidence.status === 'pending' && item.amount.status !== 'unknown')
    addIssue('amount.status', 'un costo pendiente no se convierte en importe conocido');
  if (evidence.value.kind === 'money' && item.amount.status !== 'unknown' &&
      (evidence.value.amount !== item.amount.amount || evidence.value.currency !== item.amount.currency))
    addIssue('amount', 'el importe y moneda deben coincidir con la revisión conservada');
});

const campaignDraftSchema: Schema<CampaignDraftRecord> = object({
  contractVersion: contractVersionSchema,
  id: idSchema,
  decisionId: idSchema,
  objective: nonEmptyString(),
  successDefinition: nullable(nonEmptyString()),
  modality: discriminated('status', {
    defined: object({
      status: literal('defined'),
      kind: literal('sponsorship', 'workshop', 'co_hosted', 'booth', 'other'),
      detail: nullable(nonEmptyString()),
    }),
    pending: object({ status: literal('pending') }),
  }),
  costItems: array(campaignCostItemSchema),
  openQuestions: array(nonEmptyString()),
  commitments: array(campaignCommitmentSchema),
});

// ============ Puertas de entrada ============

function describeVersion(value: unknown): string {
  return typeof value === 'string' ? `«${value}»` : `de tipo ${typeName(value)}`;
}

// La versión se comprueba ANTES que la forma: un payload de versión desconocida
// se rechaza con este único error y no se sigue validando como si fuera v1.
function versionedParser<T>(name: string, schema: Schema<T>): (input: unknown) => ValidationResult<T> {
  return (input) => {
    if (!isPlainRecord(input)) {
      return { ok: false, issues: [{ path: '$', message: `se esperaba objeto ${name}, llegó ${typeName(input)}` }] };
    }
    if (input.contractVersion !== SUPPORTED_CONTRACT_VERSION) {
      return {
        ok: false,
        issues: [
          {
            path: '$.contractVersion',
            message: `versión de contrato ${describeVersion(input.contractVersion)} desconocida para ${name}: este lector entiende «${SUPPORTED_CONTRACT_VERSION}» y no interpreta otra versión como la actual`,
          },
        ],
      };
    }
    const issues: ValidationIssue[] = [];
    const value = schema.read(input, '$', issues);
    return value === INVALID ? { ok: false, issues } : { ok: true, value };
  };
}

export const parseEvaluationProfile = versionedParser('EvaluationProfile', evaluationProfileSchema);
export const parseSourceRecord = versionedParser('SourceRecord', sourceRecordSchema);
export const parseClaimRevision = versionedParser('ClaimRevision', claimRevisionSchema);
export const parseOrganizerRevision = versionedParser('OrganizerRevision', organizerRevisionSchema);
export const parseEventEditionRevision = versionedParser('EventEditionRevision', eventEditionRevisionSchema);
export const parseCompanyRecord = versionedParser('CompanyRecord', companyRecordSchema);
export const parseParticipationRevision = versionedParser('ParticipationRevision', participationRevisionSchema);
export const parseEvaluationSnapshot = versionedParser('EvaluationSnapshot', evaluationSnapshotSchema);
export const parseEvaluationDecision = versionedParser('EvaluationDecision', evaluationDecisionSchema);
export const parseCampaignDraft = versionedParser('CampaignDraftRecord', campaignDraftSchema);

// Valida el agregado completo que una lectura entrega a la proyección. Cada
// miembro se valida con su parser versionado; los ids ENTRE miembros no se
// resuelven acá (integridad relacional: tickets 08 y 09).
export function parseEvaluationReadBundle(input: unknown): ValidationResult<EvaluationReadBundle> {
  if (!isPlainRecord(input)) {
    return { ok: false, issues: [{ path: '$', message: `se esperaba objeto EvaluationReadBundle, llegó ${typeName(input)}` }] };
  }
  const issues: ValidationIssue[] = [];
  const prefixed = (prefix: string, result: ValidationResult<unknown>): boolean => {
    if (result.ok) return true;
    for (const issue of result.issues) issues.push({ path: `${prefix}${issue.path.slice(1)}`, message: issue.message });
    return false;
  };
  const member = (key: string): unknown => (hasOwn(input, key) ? input[key] : undefined);
  const listMember = (key: string, parse: (item: unknown) => ValidationResult<unknown>): boolean => {
    const value = member(key);
    if (!Array.isArray(value)) {
      issues.push({ path: `$.${key}`, message: `se esperaba array, llegó ${typeName(value)}` });
      return false;
    }
    let ok = true;
    value.forEach((item, index) => {
      if (!prefixed(`$.${key}[${index}]`, parse(item))) ok = false;
    });
    return ok;
  };
  const nullableMember = (key: string, parse: (item: unknown) => ValidationResult<unknown>): boolean => {
    const value = member(key);
    if (value === null) return true;
    if (value === undefined) return false; // el chequeo de miembros requeridos lo reporta
    return prefixed(`$.${key}`, parse(value));
  };

  let ok = prefixed('$.profile', parseEvaluationProfile(member('profile')));
  ok = prefixed('$.snapshot', parseEvaluationSnapshot(member('snapshot'))) && ok;
  ok = listMember('claims', parseClaimRevision) && ok;
  ok = listMember('sources', parseSourceRecord) && ok;
  ok = listMember('organizers', parseOrganizerRevision) && ok;
  ok = listMember('editions', parseEventEditionRevision) && ok;
  ok = listMember('companies', parseCompanyRecord) && ok;
  ok = listMember('participations', parseParticipationRevision) && ok;
  ok = nullableMember('decision', parseEvaluationDecision) && ok;
  ok = nullableMember('campaign', parseCampaignDraft) && ok;
  for (const key of Object.keys(input)) {
    if (!['profile', 'snapshot', 'claims', 'sources', 'organizers', 'editions', 'companies', 'participations', 'decision', 'campaign'].includes(key)) {
      issues.push({ path: `$.${key}`, message: 'miembro desconocido para EvaluationReadBundle v1' });
      ok = false;
    }
  }
  for (const key of ['decision', 'campaign']) {
    if (!hasOwn(input, key)) {
      issues.push({ path: `$.${key}`, message: 'miembro requerido ausente (usá null si no hay)' });
      ok = false;
    }
  }
  return ok ? { ok: true, value: input as unknown as EvaluationReadBundle } : { ok: false, issues };
}
