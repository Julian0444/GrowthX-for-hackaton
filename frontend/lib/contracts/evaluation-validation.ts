import type { ComparisonReading, AlternativeReading, ComparisonReason } from './comparison.ts';
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
  EvidenceReference, PublicEventLocation, EditionRelationship, ResearchPlan, ResearchProgress, ProviderConsumption,
} from './evaluation';
import type { NarrativeState } from './growxth';
import { DISCOVERY_LIMITS, type DiscoveryPlan, type DiscoveryResponse, type DiscoveryQuery } from './discovery.ts';

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
      if (typeof input !== 'string') return fail(issues, path, `expected string, received ${typeName(input)}`);
      if (input.trim().length === 0) return fail(issues, path, 'empty string: the contract requires content, not a disguised gap');
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
        : fail(issues, path, `expected finite number, received ${typeName(input) === 'number' ? String(input) : typeName(input)}`),
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

function nonNegativeInt(): Schema<number> {
  return refine(numberBetween(0, Number.MAX_SAFE_INTEGER), (value, issue) => {
    if (!Number.isInteger(value)) issue('', 'se esperaba entero ≥ 0');
  });
}

function boolean(): Schema<boolean> {
  return {
    read: (input, path, issues) =>
      typeof input === 'boolean' ? input : fail(issues, path, `expected boolean, received ${typeName(input)}`),
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
      if (!Array.isArray(input)) return fail(issues, path, `expected array, received ${typeName(input)}`);
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
      if (!isPlainRecord(input)) return fail(issues, path, `expected object, received ${typeName(input)}`);
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
            message: 'unknown field for contract v1: rejected rather than silently ignored',
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
      if (!isPlainRecord(input)) return fail(issues, path, `expected object, received ${typeName(input)}`);
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
      if (typeof input !== 'string') return fail(issues, path, `expected ISO 8601 string, received ${typeName(input)}`);
      if (!ISO_INSTANT.test(input) || Number.isNaN(Date.parse(input)))
        return fail(issues, path, `«${input}» is not an ISO 8601 instant with an explicit time zone`);
      return input;
    },
  };
}

function isoDay(): Schema<string> {
  return {
    read: (input, path, issues) => {
      if (typeof input !== 'string') return fail(issues, path, `expected YYYY-MM-DD string, received ${typeName(input)}`);
      if (!ISO_DAY.test(input) || Number.isNaN(Date.parse(`${input}T00:00:00Z`)) || new Date(`${input}T00:00:00Z`).toISOString().slice(0, 10) !== input)
        return fail(issues, path, `«${input}» is not a valid ISO calendar day`);
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
        return fail(issues, path, `moneda «${String(input)}» is invalid; expected an ISO 4217 code (for example, "USD")`);
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
  geography: optional(object({ city: literal('San Francisco'), timezone: literal('America/Los_Angeles') })),
  formats: optional(array(nonEmptyString())),
});

// ============ Fuente, claim y revisión ============

const evidenceReferenceSchema: Schema<EvidenceReference> = refine(object({
  sourceId: idSchema, fragmentId: nullable(idSchema), locator: nullable(nonEmptyString()),
}), (ref, issue) => {
  if (!ref.fragmentId && !ref.locator) issue('', 'support requires a fragment or specific locator');
});

function verifyEvidenceRefs(refs: EvidenceReference[], sourceIds: string[], issue: (path: string, message: string) => void) {
  if (refs.some(ref => !sourceIds.includes(ref.sourceId))) issue('evidence', 'each fragment must belong to a linked source');
}

const sourceRecordSchema: Schema<SourceRecord> = refine(object({
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
  requestedUrl: optional(nullable(nonEmptyString())),
  canonicalUrl: optional(nullable(nonEmptyString())),
  title: optional(nullable(nonEmptyString())),
  fragments: optional(array(object({ id: idSchema, text: nonEmptyString(), locator: nonEmptyString() }))),
  retrieval: optional(object({ status: literal('obtained', 'partial', 'error', 'insufficient'), limitation: nullable(nonEmptyString()), freshness: literal('current', 'stale', 'unknown') })),
}), (source, issue) => {
  if (new Set(source.fragments?.map(f => f.id)).size !== (source.fragments?.length ?? 0)) issue('fragments', 'IDs de fragmento duplicados');
  if (source.retrieval && source.retrieval.status !== 'obtained' && !source.retrieval.limitation) issue('retrieval.limitation', 'partial, insufficient, or failed coverage requires an explanation');
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
    evidence: optional(array(evidenceReferenceSchema)),
    method: nullable(nonEmptyString()),
    note: nullable(nonEmptyString()),
    reviewer: nullable(nonEmptyString()),
    reviewedAt: isoInstant(),
    previousRevisionId: nullable(idSchema),
  }),
  (claim, addIssue) => {
    verifyEvidenceRefs(claim.evidence ?? [], claim.sourceIds, addIssue);
    if (claim.costComposition && !claim.attribute.startsWith('cost:'))
      addIssue('costComposition', 'only a cost item supports composition');
    if (claim.attribute.startsWith('cost:') && claim.value.kind === 'money' && claim.value.amount < 0)
      addIssue('value.amount', 'un costo no puede ser negativo');
    if (STATUSES_REQUIRING_SOURCES.includes(claim.status) && claim.sourceIds.length === 0)
      addIssue('sourceIds', `un claim «${claim.status}» exige evidencia vinculada`);
    if (claim.status === 'contradicted' && claim.note === null)
      addIssue('note', 'a contradiction requires a visible reason stating the conflicting evidence');
    if (claim.status === 'inferred' && claim.method === null)
      addIssue('method', 'an inference requires a declared method');
    if (claim.value.kind === 'pending' && claim.status !== 'pending')
      addIssue('status', 'a pending value cannot have a status affirming a value');
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
  companyId: optional(idSchema),
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

const publicLocationSchema: Schema<PublicEventLocation> = refine(object({
  resolution: optional(object({
    outcome: literal('published', 'resolved', 'pending', 'failed'),
    query: nullable(nonEmptyString()), normalizedQuery: nullable(nonEmptyString()),
    sourceVersion: nonEmptyString(), claimRevisionIds: idArraySchema, checkedAt: isoInstant(),
    cache: literal('hit', 'miss', 'not_applicable'), accuracy: literal('published', 'interpolated', 'unknown'),
    providerVersion: nullable(nonEmptyString()), matchedAddress: nullable(nonEmptyString()),
    countyGeoid: nullable(nonEmptyString()), failureCode: nullable(nonEmptyString()),
  })),
  originalAddress: nullable(nonEmptyString()),
  address: nullable(object({ streetAddress: nullable(nonEmptyString()), locality: nullable(nonEmptyString()), region: nullable(nonEmptyString()), postalCode: nullable(nonEmptyString()), country: nullable(nonEmptyString()) })),
  venue: nullable(nonEmptyString()), city: nullable(nonEmptyString()),
  precision: literal('venue', 'address', 'street', 'city', 'unknown'),
  method: literal('published_coordinates', 'geocoded', 'manual', 'unknown'),
  provider: nullable(nonEmptyString()), resolvedAt: nullable(isoInstant()),
  sourceIds: idArraySchema, status: claimStatusSchema, limitation: nullable(nonEmptyString()),
}), (location, issue) => {
  if (['venue', 'address', 'street'].includes(location.precision) && (!location.sourceIds.length || location.method === 'unknown')) issue('precision', 'specific precision requires a source and method');
  if (['address', 'street'].includes(location.precision) && !location.originalAddress && !location.address?.streetAddress) issue('address', 'address or street precision requires the public address');
  if (location.precision === 'city' && !location.city) issue('city', 'city precision requires a declared city');
  if (location.method === 'geocoded' && (!location.provider || !location.resolvedAt)) issue('method', 'geocoding requires provider and date');
  if (location.resolution?.outcome === 'resolved' && (location.method !== 'geocoded' || !location.resolution.query || !location.resolution.claimRevisionIds.length)) issue('resolution', 'resolution requires a query, method, and original claims');
  if (location.status === 'contradicted' && !location.limitation) issue('limitation', 'conflicting location requires an explanation');
});

const relationshipSchema: Schema<EditionRelationship> = refine(object({
  id: idSchema, editionId: idSchema,
  entity: discriminated('type', {
    organizer: object({ type: literal('organizer'), organizerId: idSchema }),
    company: object({ type: literal('company'), companyId: idSchema }),
    project: object({ type: literal('project'), projectId: idSchema, name: nonEmptyString(), url: nonEmptyString() }),
  }),
  role: literal('organizer', 'co_organizer', 'host', 'calendar', 'sponsor', 'presenter', 'venue', 'venue_partner', 'infrastructure_partner', 'logo_present', 'published_project'),
  status: claimStatusSchema, scope: literal('edition', 'global_program'),
  sourceIds: idArraySchema, evidence: array(evidenceReferenceSchema), claimRevisionIds: idArraySchema, limitation: nullable(nonEmptyString()),
}), (relation, issue) => {
  verifyEvidenceRefs(relation.evidence, relation.sourceIds, issue);
  if (STATUSES_REQUIRING_SOURCES.includes(relation.status) && (!relation.sourceIds.length || !relation.evidence.length)) issue('evidence', 'documented relationship requires source and fragment or locator');
  if ((relation.role === 'published_project') !== (relation.entity.type === 'project')) issue('entity', 'proyecto y rol deben corresponder');
  if (['organizer', 'co_organizer', 'calendar'].includes(relation.role) && relation.entity.type !== 'organizer') issue('entity', 'organizer or calendar role requires organizer identity');
  if (['sponsor', 'presenter', 'venue', 'venue_partner', 'infrastructure_partner', 'logo_present'].includes(relation.role) && relation.entity.type !== 'company') issue('entity', 'este rol exige identidad de empresa');
  if (['inferred', 'contradicted', 'pending'].includes(relation.status) && !relation.limitation) issue('limitation', 'preserve the relationship limitation');
});

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
    publicLocation: optional(publicLocationSchema),
    relationships: optional(array(relationshipSchema)),
    claimRevisionIds: idArraySchema,
    revisedAt: isoInstant(),
    previousRevisionId: nullable(idSchema),
  }),
  (edition, addIssue) => {
    const relations = edition.relationships ?? [];
    if (relations.some(r => r.editionId !== edition.editionId)) addIssue('relationships', 'the relationship belongs to another edition');
    if (new Set(relations.map(r => r.id)).size !== relations.length) addIssue('relationships', 'relaciones duplicadas');
    if (relations.some(r => r.claimRevisionIds.some(id => !edition.claimRevisionIds.includes(id)))) addIssue('relationships', 'claims must be fixed by the edition revision');
    // Un punto en el mapa exige respaldo urbano: una localización nacional o
    // regional no coloca el evento en una ciudad.
    if (edition.coordinates !== null && edition.location.scope !== 'venue' && edition.location.scope !== 'city')
      addIssue('coordinates', `coordinates with scope «${edition.location.scope}»: no urban evidence means no marker`);
  },
);

const researchPlanSchema: Schema<ResearchPlan> = refine(object({
  contractVersion: contractVersionSchema, profileId: idSchema, profileVersion: positiveInt(),
  questions: array(object({ id: idSchema, topic: literal('fit', 'objective', 'success', 'eligibility', 'history', 'restriction'), text: nonEmptyString() })),
  providerLimits: array(object({ provider: nonEmptyString(), enabled: boolean(), maxRequests: nonNegativeInt(), maxCost: nullable(object({ amount: numberBetween(0, Number.MAX_SAFE_INTEGER), currency: currencyCode() })), scope: literal('run') })),
}), (plan, issue) => {
  if (new Set(plan.providerLimits.map(l => l.provider)).size !== plan.providerLimits.length) issue('providerLimits', 'proveedores duplicados');
  if (new Set(plan.questions.map(q => q.id)).size !== plan.questions.length) issue('questions', 'preguntas duplicadas');
});

const researchProgressSchema: Schema<ResearchProgress> = refine(object({
  contractVersion: contractVersionSchema, runId: idSchema,
  status: literal('queued', 'running', 'partial', 'completed', 'insufficient', 'failed'), stage: nonEmptyString(), terminal: boolean(), attempts: nonNegativeInt(),
  findings: array(refine(object({ id: idSchema, editionId: idSchema, editionRevisionId: idSchema, status: literal('partial', 'supported', 'insufficient', 'error'), claimRevisionIds: idArraySchema, sourceIds: idArraySchema, limitation: nullable(nonEmptyString()) }), (finding, issue) => {
    if (finding.status === 'supported' && (!finding.sourceIds.length || !finding.claimRevisionIds.length)) issue('status', 'hallazgo sustentado exige claims y fuentes persistidos');
    if (finding.status !== 'supported' && !finding.limitation) issue('limitation', 'an incomplete finding must explain its limitation');
  })),
  limitations: array(nonEmptyString()), material: literal('real', 'synthetic'), updatedAt: isoInstant(),
}), (progress, issue) => {
  if (['completed', 'failed', 'insufficient'].includes(progress.status) && !progress.terminal) issue('terminal', 'this state ends the research run');
  if (['queued', 'running'].includes(progress.status) && progress.terminal) issue('terminal', 'trabajo en cola o en curso no es terminal');
  if (new Set(progress.findings.map(f => f.id)).size !== progress.findings.length) issue('findings', 'hallazgos duplicados');
  if (['partial', 'failed', 'insufficient'].includes(progress.status) && !progress.limitations.length) issue('limitations', 'incomplete state requires an explanation');
  if (progress.status === 'completed' && (!progress.findings.length || progress.findings.some(f => f.status !== 'supported'))) issue('status', 'completed requires supported findings; use insufficient when coverage is missing');
});

const providerConsumptionSchema: Schema<ProviderConsumption> = object({
  provider: nonEmptyString(), runId: idSchema, operationId: idSchema,
  requests: discriminated('status', { known: object({ status: literal('known'), count: nonNegativeInt() }), unknown: object({ status: literal('unknown'), reason: nonEmptyString() }) }),
  cost: discriminated('status', { known: object({ status: literal('known'), amount: numberBetween(0, Number.MAX_SAFE_INTEGER), currency: currencyCode() }), unknown: object({ status: literal('unknown'), reason: nonEmptyString() }) }),
  recordedAt: isoInstant(),
});

const discoveryQuerySchema: Schema<DiscoveryQuery> = object({ id: idSchema, purpose: literal('opportunities', 'background', 'conditions'), text: nonEmptyString(), questionIds: idArraySchema });
const discoveryPlanSchema: Schema<DiscoveryPlan> = refine(object({
  version: literal(1), profileId: idSchema, profileVersion: numberBetween(1, Number.MAX_SAFE_INTEGER),
  criteria: object({ product: nonEmptyString(), audience: nonEmptyString(), objective: literal('adoption','feedback','hiring','awareness'), window: object({ from: nullable(nonEmptyString()), to: nullable(nonEmptyString()) }), city: nonEmptyString(), timezone: nonEmptyString(), formats: array(nonEmptyString()), restrictions: array(nonEmptyString()) }),
  queries: array(discoveryQuerySchema),
  limits: object({ maxQueries: numberBetween(1, DISCOVERY_LIMITS.maxQueries), resultsPerQuery: numberBetween(1, DISCOVERY_LIMITS.resultsPerQuery), requestTimeoutMs: numberBetween(1, DISCOVERY_LIMITS.requestTimeoutMs), durationMs: numberBetween(1, DISCOVERY_LIMITS.durationMs) }),
}), (plan, issue) => {
  if (Object.values(plan.limits).some(n => !Number.isInteger(n))) issue('limits', 'integer limits required');
  if (plan.queries.length !== plan.limits.maxQueries || new Set(plan.queries.map(q => q.id)).size !== plan.queries.length) issue('queries', 'unique bounded queries required');
});
const discoveryResponseSchema: Schema<DiscoveryResponse> = object({
  requestId: nullable(nonEmptyString()), costUsd: nullable(numberBetween(0, Number.MAX_SAFE_INTEGER)), discardedResults: nonNegativeInt(),
  pages: array(object({ url: nonEmptyString(), canonicalUrl: nonEmptyString(), title: nonEmptyString(), publishedAt: nullable(isoInstant()), author: nullable(nonEmptyString()), excerpt: nullable(nonEmptyString()), sourceId: idSchema })),
});

export function parseDiscoveryPlan(input: unknown): ValidationResult<DiscoveryPlan> { return parseWith(discoveryPlanSchema, input); }
export function parseDiscoveryResponse(input: unknown): ValidationResult<DiscoveryResponse> { return parseWith(discoveryResponseSchema, input); }

function parseWith<T>(schema: Schema<T>, input: unknown): ValidationResult<T> {
  const issues: ValidationIssue[] = [];
  const value = schema.read(input, '$', issues);
  return value === INVALID ? { ok: false, issues } : { ok: true, value };
}

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
      addIssue('commercialOutcome', 'an ambiguous logo does not establish outcomes: document the actual role before attributing an outcome');
    if (participation.commercialOutcome.status === 'reported' && participation.commercialOutcome.sourceIds.length === 0)
      addIssue('commercialOutcome.sourceIds', 'a reported outcome requires the reporting source');
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
      addIssue('reasons', 'an exclusion requires reasons');
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
      addIssue('conditions', 'a conditional alternative requires at least one pending condition');
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
      addIssue('selectedEvidenceIds', 'only validated narration retains an evidence selection');
  },
);

const comparisonEvidenceSchema = object({
  editionId: idSchema, editionRevisionId: idSchema, claimRevisionIds: idArraySchema,
  relationshipIds: idArraySchema, sourceIds: idArraySchema,
});
const comparisonReasonSchema: Schema<ComparisonReason> = object({ text: nonEmptyString(), basis: array(comparisonEvidenceSchema) });
const alternativeReadingSchema: Schema<AlternativeReading> = object({
  editionId: idSchema, relevance: comparisonReasonSchema, antecedents: array(comparisonReasonSchema),
  modality: object({ status: literal('published', 'proposed', 'pending'), text: nonEmptyString(), basis: array(comparisonEvidenceSchema) }),
  evidenceQuality: object({ status: literal('supported', 'limited', 'insufficient'), note: nonEmptyString() }),
  cost: nonEmptyString(), nextQuestion: nonEmptyString(), matchedCriteria: array(nonEmptyString()),
});
const comparisonReadingSchema: Schema<ComparisonReading> = object({
  version: literal('research-comparison/1'), alternatives: array(alternativeReadingSchema),
  priority: object({ kind: literal('investigate_first', 'unordered', 'insufficient'), editionIds: idArraySchema,
    explanation: nonEmptyString(), criteria: array(nonEmptyString()) }),
  differences: nullable(object({ previousSnapshotId: idSchema,
    briefChanges: array(object({ field: nonEmptyString(), before: nonEmptyString(), after: nonEmptyString() })),
    alternatives: array(object({ editionId: idSchema, changes: array(nonEmptyString()) })), note: nonEmptyString() })),
});

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
    decisionReading: optional(comparisonReadingSchema),
    sourceIds: optional(idArraySchema),
  }),
  (snapshot, addIssue) => {
    // Coherencia INTERNA del agregado (no es integridad relacional): el orden
    // oficial ordena exactamente las alternativas del propio snapshot.
    const alternativeIds = snapshot.alternatives.map((a) => a.editionId);
    if (new Set(alternativeIds).size !== alternativeIds.length)
      addIssue('alternatives', 'alternatives have duplicate editionId');
    const orderedIds = snapshot.ordering.editionIds;
    if (new Set(orderedIds).size !== orderedIds.length) addIssue('ordering.editionIds', 'ordering has duplicate IDs');
    const sameSet =
      orderedIds.length === alternativeIds.length && orderedIds.every((id) => alternativeIds.includes(id));
    if (!sameSet)
      addIssue('ordering.editionIds', 'the official ordering must include exactly the snapshot alternatives');
    if (snapshot.ordering.kind === 'ranked') {
      if (snapshot.policy.status !== 'applied')
        addIssue('ordering', 'without an applied policy there is only presentation order, not ranking');
      else if (
        snapshot.ordering.policyId !== snapshot.policy.policyId ||
        snapshot.ordering.policyVersion !== snapshot.policy.policyVersion
      )
        addIssue('ordering', 'the ranking cites a different policy from the one applied by the snapshot');
    }
    if (snapshot.decisionReading) {
      const reading = snapshot.decisionReading;
      const ids = reading.alternatives.map(a => a.editionId);
      if (ids.length !== alternativeIds.length || new Set(ids).size !== ids.length || ids.some(id => !alternativeIds.includes(id)))
        addIssue('decisionReading.alternatives', 'the reading must cover exactly the alternatives');
      if (reading.priority.editionIds.some(id => !alternativeIds.includes(id) || snapshot.alternatives.find(a => a.editionId === id)?.eligibility.status === 'excluded'))
        addIssue('decisionReading.priority', 'no se priorizan candidatos ajenos o excluidos');
      if ((reading.priority.kind === 'investigate_first') !== (reading.priority.editionIds.length > 0))
        addIssue('decisionReading.priority', 'priority without candidates or candidates without priority');
      for (const alt of reading.alternatives) for (const reason of [alt.relevance, alt.modality, ...alt.antecedents]) for (const ref of reason.basis) {
        if (!snapshot.editionRevisionIds.includes(ref.editionRevisionId) || ref.claimRevisionIds.some(id => !snapshot.claimRevisionIds.includes(id)) || ref.sourceIds.some(id => !snapshot.sourceIds?.includes(id)))
          addIssue('decisionReading', 'evidencia fuera de las revisiones y fuentes fijadas');
      }
    }
    if (snapshot.policy.status !== 'applied') {
      for (const [index, alternative] of snapshot.alternatives.entries()) {
        // Sin política no hay score: «sin política» es un estado, no un cero.
        if (alternative.scoring.status === 'scored')
          addIssue(`alternatives[${index}].scoring`, 'score without an applied policy: no policy means no scoring');
      }
    }
  },
);

// ============ Decisión y campaña ============

// Responsable y plazo «si se conocen» (ticket 13): nullable de verdad — un
// string vacío no es un responsable y no se admite como hueco disfrazado.
const buyerResponseSchema = object({
  attributedTo: nonEmptyString(), support: nonEmptyString(), sourceIds: idArraySchema,
  recordedBy: idSchema, recordedAt: isoInstant(),
});
const decisionConditionSchema: Schema<DecisionCondition> = object({
  id: idSchema,
  description: nonEmptyString(),
  answerWouldChangeTo: nullable(literal('chosen', 'discarded')),
  status: literal('open', 'resolved'),
  resolvedNote: nullable(nonEmptyString()),
  response: optional(buyerResponseSchema),
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
    intent: optional(nullable(literal('explore_first'))),
    reasons: array(nonEmptyString()),
    conditions: array(decisionConditionSchema),
    decidedBy: object({ userId: idSchema, resolvedBy: literal('server_session') }),
    decidedAt: isoInstant(),
    revision: positiveInt(),
    previousRevisionId: nullable(idSchema),
  }),
  (decision, addIssue) => {
    if (decision.intent === 'explore_first' && decision.verdict !== 'pending') addIssue('intent', 'explore_first is pending participation, not an investment choice');
    if (new Set(decision.conditions.map(c => c.id)).size !== decision.conditions.length) addIssue('conditions', 'duplicate condition identities');
    if (decision.reasons.length === 0) addIssue('reasons', 'a decision requires reasons');
    if (decision.revision === 1 && decision.previousRevisionId !== null)
      addIssue('previousRevisionId', 'the first revision has no predecessor');
    if (decision.revision > 1 && decision.previousRevisionId === null)
      addIssue('previousRevisionId', 'a later revision preserves its link to the preceding revision');
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
        addIssue('confirmation', 'an AGREED commitment requires support: who confirmed, when, method, and confirmation evidence');
      else if (commitment.confirmation.sourceIds.length === 0)
        addIssue('confirmation.sourceIds', 'an agreed commitment requires verifiable confirmation evidence');
    } else if (commitment.confirmation !== null) {
      addIssue('confirmation', `una ${commitment.kind === 'estimate' ? 'estimate' : 'meta'} has no confirmation: confirming it would misrepresent it as an agreement`);
    }
  },
);

const campaignCostItemSchema: Schema<CampaignCostItem> = refine(object({
  id: idSchema,
  label: nonEmptyString(),
  amount: moneyClaimSchema,
  evidence: optional(claimRevisionSchema),
  declaration: optional(buyerResponseSchema),
}), (item, addIssue) => {
  const evidence = item.evidence;
  if (!evidence) return; // registros v1 anteriores: no inventar procedencia
  if (!evidence.attribute.startsWith('cost:')) addIssue('evidence', 'the evidence must be a cost item');
  if ((evidence.status === 'inferred' || evidence.status === 'contradicted') && item.amount.status !== evidence.status)
    addIssue('amount.status', 'the campaign must preserve the inferred or contradicted status of its evidence');
  if (evidence.status === 'pending' && item.amount.status !== 'unknown')
    addIssue('amount.status', 'a pending cost does not become a known amount');
  if (evidence.value.kind === 'money' && item.amount.status !== 'unknown' &&
      (evidence.value.amount !== item.amount.amount || evidence.value.currency !== item.amount.currency))
    addIssue('amount', 'the amount and currency must match the saved revision');
});

const campaignDraftSchema: Schema<CampaignDraftRecord> = object({
  contractVersion: contractVersionSchema,
  id: idSchema,
  decisionId: idSchema,
  objective: nonEmptyString(),
  owner: optional(nullable(nonEmptyString())),
  successDefinition: nullable(nonEmptyString()),
  modality: discriminated('status', {
    defined: object({
      status: literal('defined'),
      kind: literal('sponsorship', 'workshop', 'co_hosted', 'booth', 'other'),
      detail: nullable(nonEmptyString()),
      basis: optional(literal('proposed', 'offered')),
      declaration: optional(buyerResponseSchema),
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
      return { ok: false, issues: [{ path: '$', message: `expected object ${name}, received ${typeName(input)}` }] };
    }
    if (input.contractVersion !== SUPPORTED_CONTRACT_VERSION) {
      return {
        ok: false,
        issues: [
          {
            path: '$.contractVersion',
            message: `contract version ${describeVersion(input.contractVersion)} is unknown for ${name}: this reader supports «${SUPPORTED_CONTRACT_VERSION}» and does not interpret another version as current`,
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
export const parseResearchPlan = versionedParser('ResearchPlan', researchPlanSchema);
export const parseResearchProgress = versionedParser('ResearchProgress', researchProgressSchema);
export function parseProviderConsumption(input: unknown): ValidationResult<ProviderConsumption> {
  const issues: ValidationIssue[] = [];
  const value = providerConsumptionSchema.read(input, '$', issues);
  return value === INVALID ? { ok: false, issues } : { ok: true, value };
}

// Valida el agregado completo que una lectura entrega a la proyección. Cada
// miembro se valida con su parser versionado; los ids ENTRE miembros no se
// resuelven acá (integridad relacional: tickets 08 y 09).
export function parseEvaluationReadBundle(input: unknown): ValidationResult<EvaluationReadBundle> {
  if (!isPlainRecord(input)) {
    return { ok: false, issues: [{ path: '$', message: `se esperaba objeto EvaluationReadBundle, received ${typeName(input)}` }] };
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
      issues.push({ path: `$.${key}`, message: `expected array, received ${typeName(value)}` });
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
      issues.push({ path: `$.${key}`, message: 'unknown member for EvaluationReadBundle v1' });
      ok = false;
    }
  }
  for (const key of ['decision', 'campaign']) {
    if (!hasOwn(input, key)) {
      issues.push({ path: `$.${key}`, message: 'missing required member (use null if absent)' });
      ok = false;
    }
  }
  return ok ? { ok: true, value: input as unknown as EvaluationReadBundle } : { ok: false, issues };
}
