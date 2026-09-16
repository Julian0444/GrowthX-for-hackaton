// Validacion estricta del contrato HTTP/persistido de sponsorship. Los campos
// desconocidos se rechazan para no interpretar silenciosamente una version
// futura como v1.

import type {
  SponsorshipActivation,
  SponsorshipAudience,
  SponsorshipContribution,
  SponsorshipFormat,
  SponsorshipInterestCreateBody,
  SponsorshipInterestRequest,
  SponsorshipMatchReason,
  SponsorshipMeasurementMetric,
  SponsorshipMeasurementPlan,
  SponsorshipOpportunity,
  SponsorshipOpportunityCreateBody,
  SponsorshipPackage,
} from '../../contracts/sponsorship.ts';

export type SponsorshipParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

const FORMATS = ['hackathon_track', 'workshop', 'demo', 'dinner', 'booth'] as const;
const GOALS = ['adoption', 'feedback', 'hiring', 'awareness'] as const;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`${path}.${key}: unknown field for contract v1`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) issues.push(`${path}.${key}: required field missing`);
  }
}

function text(
  value: unknown,
  path: string,
  issues: string[],
  options: { max?: number; nullable?: boolean } = {},
): string | null {
  if (value === null && options.nullable) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path}: expected a non-empty string`);
    return null;
  }
  if (value.length > (options.max ?? 500)) issues.push(`${path}: exceeds ${options.max ?? 500} characters`);
  return value;
}

function nullableText(value: unknown, path: string, issues: string[], max = 2_000): string | null {
  return text(value, path, issues, { nullable: true, max });
}

function stringList(
  value: unknown,
  path: string,
  issues: string[],
  options: { min?: number; max?: number; itemMax?: number } = {},
): string[] {
  if (!Array.isArray(value)) {
    issues.push(`${path}: expected an array`);
    return [];
  }
  const min = options.min ?? 0;
  const max = options.max ?? 20;
  if (value.length < min || value.length > max) issues.push(`${path}: expected ${min} to ${max} items`);
  const result = value.map((item, index) => text(item, `${path}[${index}]`, issues, { max: options.itemMax ?? 160 })).filter((item): item is string => item !== null);
  if (new Set(result.map((item) => item.toLocaleLowerCase('en-US'))).size !== result.length)
    issues.push(`${path}: duplicate values are not allowed`);
  return result;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  values: T,
  path: string,
  issues: string[],
): T[number] | null {
  if (typeof value !== 'string' || !values.includes(value)) {
    issues.push(`${path}: expected one of ${values.join(' | ')}`);
    return null;
  }
  return value as T[number];
}

function enumList<const T extends readonly string[]>(
  value: unknown,
  values: T,
  path: string,
  issues: string[],
): T[number][] {
  if (!Array.isArray(value) || value.length === 0 || value.length > values.length) {
    issues.push(`${path}: expected 1 to ${values.length} values`);
    return [];
  }
  const result = value.map((item, index) => enumValue(item, values, `${path}[${index}]`, issues)).filter((item): item is T[number] => item !== null);
  if (new Set(result).size !== result.length) issues.push(`${path}: duplicate values are not allowed`);
  return result;
}

function isoInstantOrNull(value: unknown, path: string, issues: string[]): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    issues.push(`${path}: expected an ISO 8601 instant with an explicit time zone or null`);
    return null;
  }
  return value;
}

function urlOrNull(value: unknown, path: string, issues: string[]): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 2_048) {
    issues.push(`${path}: expected an http(s) URL or null`);
    return null;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    return value;
  } catch {
    issues.push(`${path}: expected an http(s) URL or null`);
    return null;
  }
}

function currency(value: unknown, path: string, issues: string[]): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    issues.push(`${path}: expected an ISO 4217 currency code`);
    return 'USD';
  }
  return value;
}

function parseAudience(input: unknown, path: string, issues: string[]): SponsorshipAudience | null {
  if (!record(input)) {
    issues.push(`${path}: expected an object`);
    return null;
  }
  exactKeys(input, ['description', 'estimatedSize', 'evidenceStatus', 'sourceUrl'], ['description', 'estimatedSize', 'evidenceStatus', 'sourceUrl'], path, issues);
  const description = text(input.description, `${path}.description`, issues, { max: 1_000 });
  let estimatedSize: number | null = null;
  if (input.estimatedSize !== null) {
    if (typeof input.estimatedSize !== 'number' || !Number.isInteger(input.estimatedSize) || input.estimatedSize < 1 || input.estimatedSize > 1_000_000)
      issues.push(`${path}.estimatedSize: expected an integer from 1 to 1000000 or null`);
    else estimatedSize = input.estimatedSize;
  }
  const evidenceStatus = enumValue(input.evidenceStatus, ['source_verified', 'organizer_declared', 'estimated'] as const, `${path}.evidenceStatus`, issues);
  const sourceUrl = urlOrNull(input.sourceUrl, `${path}.sourceUrl`, issues);
  if (evidenceStatus === 'source_verified' && sourceUrl === null)
    issues.push(`${path}.sourceUrl: source_verified audience requires a supporting URL`);
  if (!description || !evidenceStatus) return null;
  return { description, estimatedSize, evidenceStatus, sourceUrl };
}

function parseContribution(input: unknown, path: string, issues: string[]): SponsorshipContribution | null {
  if (!record(input)) {
    issues.push(`${path}: expected an object`);
    return null;
  }
  if (input.kind === 'cash') {
    exactKeys(input, ['kind', 'amount', 'currency'], ['kind', 'amount', 'currency'], path, issues);
    const amount = input.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)
      issues.push(`${path}.amount: expected a positive finite amount`);
    const parsedCurrency = currency(input.currency, `${path}.currency`, issues);
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
    return { kind: 'cash', amount, currency: parsedCurrency };
  }
  if (input.kind === 'in_kind') {
    exactKeys(input, ['kind', 'description'], ['kind', 'description'], path, issues);
    const description = text(input.description, `${path}.description`, issues, { max: 500 });
    return description ? { kind: 'in_kind', description } : null;
  }
  issues.push(`${path}.kind: expected cash | in_kind`);
  return null;
}

function parsePackages(input: unknown, opportunityFormats: SponsorshipFormat[], path: string, issues: string[]): SponsorshipPackage[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) {
    issues.push(`${path}: expected 1 to 10 packages`);
    return [];
  }
  const packages: SponsorshipPackage[] = [];
  input.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!record(item)) {
      issues.push(`${itemPath}: expected an object`);
      return;
    }
    exactKeys(item, ['id', 'label', 'formats', 'contribution', 'includes', 'trackAvailable'], ['id', 'label', 'formats', 'contribution', 'includes', 'trackAvailable'], itemPath, issues);
    const id = text(item.id, `${itemPath}.id`, issues, { max: 64 });
    if (id && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) issues.push(`${itemPath}.id: use letters, numbers, _ or -`);
    const label = text(item.label, `${itemPath}.label`, issues, { max: 120 });
    const formats = enumList(item.formats, FORMATS, `${itemPath}.formats`, issues);
    const contribution = parseContribution(item.contribution, `${itemPath}.contribution`, issues);
    const includes = stringList(item.includes, `${itemPath}.includes`, issues, { min: 1, max: 20, itemMax: 240 });
    if (typeof item.trackAvailable !== 'boolean') issues.push(`${itemPath}.trackAvailable: expected boolean`);
    for (const format of formats) {
      if (!opportunityFormats.includes(format)) issues.push(`${itemPath}.formats: ${format} is not offered by the opportunity`);
    }
    if (item.trackAvailable === true && !formats.includes('hackathon_track'))
      issues.push(`${itemPath}.trackAvailable: a track requires the hackathon_track format`);
    if (id && label && contribution && typeof item.trackAvailable === 'boolean')
      packages.push({ id, label, formats, contribution, includes, trackAvailable: item.trackAvailable });
  });
  if (new Set(packages.map((item) => item.id)).size !== packages.length) issues.push(`${path}: package ids must be unique`);
  return packages;
}

function opportunityFields(input: Record<string, unknown>, path: string, issues: string[]) {
  const organizerName = text(input.organizerName, `${path}.organizerName`, issues, { max: 160 });
  const communityName = text(input.communityName, `${path}.communityName`, issues, { max: 160 });
  const eventName = text(input.eventName, `${path}.eventName`, issues, { max: 200 });
  const eventUrl = urlOrNull(input.eventUrl, `${path}.eventUrl`, issues);
  if (input.city !== 'San Francisco') issues.push(`${path}.city: v1 is limited to San Francisco`);
  const startsAt = isoInstantOrNull(input.startsAt, `${path}.startsAt`, issues);
  const audience = parseAudience(input.audience, `${path}.audience`, issues);
  const themes = stringList(input.themes, `${path}.themes`, issues, { min: 1, max: 12, itemMax: 100 });
  const formats = enumList(input.formats, FORMATS, `${path}.formats`, issues);
  const packages = parsePackages(input.packages, formats, `${path}.packages`, issues);
  const sponsorGoals = enumList(input.sponsorGoals, GOALS, `${path}.sponsorGoals`, issues);
  const notes = nullableText(input.notes, `${path}.notes`, issues, 2_000);
  return { organizerName, communityName, eventName, eventUrl, startsAt, audience, themes, formats, packages, sponsorGoals, notes };
}

export function parseSponsorshipOpportunityCreateBody(input: unknown): SponsorshipParseResult<SponsorshipOpportunityCreateBody> {
  const issues: string[] = [];
  if (!record(input)) return { ok: false, issues: ['$: expected an object'] };
  exactKeys(
    input,
    ['idempotencyKey', 'organizerName', 'communityName', 'eventName', 'eventUrl', 'city', 'startsAt', 'audience', 'themes', 'formats', 'packages', 'sponsorGoals', 'notes'],
    ['idempotencyKey', 'organizerName', 'communityName', 'eventName', 'eventUrl', 'city', 'startsAt', 'audience', 'themes', 'formats', 'packages', 'sponsorGoals', 'notes'],
    '$',
    issues,
  );
  const idempotencyKey = text(input.idempotencyKey, '$.idempotencyKey', issues, { max: 128 });
  if (typeof input.idempotencyKey === 'string' && input.idempotencyKey.length < 8)
    issues.push('$.idempotencyKey: expected 8 to 128 characters');
  const fields = opportunityFields(input, '$', issues);
  if (issues.length || !idempotencyKey || !fields.organizerName || !fields.communityName || !fields.eventName || !fields.audience)
    return { ok: false, issues };
  return {
    ok: true,
    value: {
      idempotencyKey,
      organizerName: fields.organizerName,
      communityName: fields.communityName,
      eventName: fields.eventName,
      eventUrl: fields.eventUrl,
      city: 'San Francisco',
      startsAt: fields.startsAt,
      audience: fields.audience,
      themes: fields.themes,
      formats: fields.formats,
      packages: fields.packages,
      sponsorGoals: fields.sponsorGoals,
      notes: fields.notes,
    },
  };
}

export function parseSponsorshipOpportunity(input: unknown): SponsorshipParseResult<SponsorshipOpportunity> {
  const issues: string[] = [];
  if (!record(input)) return { ok: false, issues: ['$: expected an object'] };
  exactKeys(
    input,
    ['contractVersion', 'id', 'status', 'organizerName', 'communityName', 'eventName', 'eventUrl', 'city', 'timezone', 'startsAt', 'audience', 'themes', 'formats', 'packages', 'sponsorGoals', 'notes', 'createdAt'],
    ['contractVersion', 'id', 'status', 'organizerName', 'communityName', 'eventName', 'eventUrl', 'city', 'timezone', 'startsAt', 'audience', 'themes', 'formats', 'packages', 'sponsorGoals', 'notes', 'createdAt'],
    '$',
    issues,
  );
  if (input.contractVersion !== '1') issues.push('$.contractVersion: unsupported sponsorship contract version');
  if (typeof input.id !== 'string' || !UUID_RE.test(input.id)) issues.push('$.id: expected UUID');
  if (input.status !== 'open') issues.push('$.status: expected open');
  if (input.timezone !== 'America/Los_Angeles') issues.push('$.timezone: expected America/Los_Angeles');
  const createdAt = isoInstantOrNull(input.createdAt, '$.createdAt', issues);
  if (createdAt === null) issues.push('$.createdAt: persisted opportunity requires an instant');
  const fields = opportunityFields(input, '$', issues);
  if (issues.length || typeof input.id !== 'string' || !fields.organizerName || !fields.communityName || !fields.eventName || !fields.audience || !createdAt)
    return { ok: false, issues };
  return {
    ok: true,
    value: {
      contractVersion: '1', id: input.id, status: 'open', organizerName: fields.organizerName,
      communityName: fields.communityName, eventName: fields.eventName, eventUrl: fields.eventUrl,
      city: 'San Francisco', timezone: 'America/Los_Angeles', startsAt: fields.startsAt,
      audience: fields.audience, themes: fields.themes, formats: fields.formats,
      packages: fields.packages, sponsorGoals: fields.sponsorGoals, notes: fields.notes, createdAt,
    },
  };
}

function parseActivationInput(input: unknown, path: string, issues: string[]): SponsorshipInterestCreateBody['activation'] {
  if (input === null) return null;
  if (!record(input)) {
    issues.push(`${path}: expected an object or null`);
    return null;
  }
  exactKeys(input, ['format', 'packageId', 'trackTheme'], ['format', 'packageId', 'trackTheme'], path, issues);
  const format = enumValue(input.format, FORMATS, `${path}.format`, issues);
  const packageId = nullableText(input.packageId, `${path}.packageId`, issues, 64);
  const trackTheme = nullableText(input.trackTheme, `${path}.trackTheme`, issues, 100);
  return format ? { format, packageId, trackTheme } : null;
}

export function parseSponsorshipInterestCreateBody(input: unknown): SponsorshipParseResult<SponsorshipInterestCreateBody> {
  const issues: string[] = [];
  if (!record(input)) return { ok: false, issues: ['$: expected an object'] };
  exactKeys(input, ['idempotencyKey', 'sponsorRunId', 'message', 'activation'], ['idempotencyKey', 'sponsorRunId', 'message', 'activation'], '$', issues);
  const idempotencyKey = text(input.idempotencyKey, '$.idempotencyKey', issues, { max: 128 });
  if (typeof input.idempotencyKey === 'string' && input.idempotencyKey.length < 8)
    issues.push('$.idempotencyKey: expected 8 to 128 characters');
  if (typeof input.sponsorRunId !== 'string' || !UUID_RE.test(input.sponsorRunId))
    issues.push('$.sponsorRunId: expected UUID');
  const message = nullableText(input.message, '$.message', issues, 2_000);
  const activation = parseActivationInput(input.activation, '$.activation', issues);
  if (issues.length || !idempotencyKey || typeof input.sponsorRunId !== 'string') return { ok: false, issues };
  return { ok: true, value: { idempotencyKey, sponsorRunId: input.sponsorRunId, message, activation } };
}

function parseReason(input: unknown, path: string, issues: string[]): SponsorshipMatchReason | null {
  if (!record(input)) { issues.push(`${path}: expected an object`); return null; }
  exactKeys(input, ['kind', 'label', 'detail'], ['kind', 'label', 'detail'], path, issues);
  const kind = enumValue(input.kind, ['theme', 'objective', 'format', 'budget', 'evidence'] as const, `${path}.kind`, issues);
  const label = text(input.label, `${path}.label`, issues, { max: 120 });
  const detail = text(input.detail, `${path}.detail`, issues, { max: 500 });
  return kind && label && detail ? { kind, label, detail } : null;
}

function parseActivation(input: unknown, path: string, issues: string[]): SponsorshipActivation | null {
  if (!record(input)) { issues.push(`${path}: expected an object`); return null; }
  exactKeys(input, ['format', 'packageId', 'trackTheme', 'rationale'], ['format', 'packageId', 'trackTheme', 'rationale'], path, issues);
  const format = enumValue(input.format, FORMATS, `${path}.format`, issues);
  const packageId = nullableText(input.packageId, `${path}.packageId`, issues, 64);
  const trackTheme = nullableText(input.trackTheme, `${path}.trackTheme`, issues, 100);
  const rationale = text(input.rationale, `${path}.rationale`, issues, { max: 500 });
  return format && rationale ? { format, packageId, trackTheme, rationale } : null;
}

function parseMetric(input: unknown, path: string, issues: string[]): SponsorshipMeasurementMetric | null {
  if (!record(input)) { issues.push(`${path}: expected an object`); return null; }
  exactKeys(input, ['id', 'label', 'definition', 'collectionMethod', 'timing'], ['id', 'label', 'definition', 'collectionMethod', 'timing'], path, issues);
  const id = text(input.id, `${path}.id`, issues, { max: 64 });
  const label = text(input.label, `${path}.label`, issues, { max: 120 });
  const definition = text(input.definition, `${path}.definition`, issues, { max: 500 });
  const collectionMethod = text(input.collectionMethod, `${path}.collectionMethod`, issues, { max: 500 });
  const timing = text(input.timing, `${path}.timing`, issues, { max: 200 });
  return id && label && definition && collectionMethod && timing ? { id, label, definition, collectionMethod, timing } : null;
}

function parseMeasurementPlan(input: unknown, path: string, issues: string[]): SponsorshipMeasurementPlan | null {
  if (!record(input)) { issues.push(`${path}: expected an object`); return null; }
  exactKeys(input, ['objective', 'primaryOutcome', 'metrics', 'attributionWindow', 'privacyNote', 'caveat'], ['objective', 'primaryOutcome', 'metrics', 'attributionWindow', 'privacyNote', 'caveat'], path, issues);
  const objective = enumValue(input.objective, GOALS, `${path}.objective`, issues);
  const primaryOutcome = text(input.primaryOutcome, `${path}.primaryOutcome`, issues, { max: 500 });
  const metrics: SponsorshipMeasurementMetric[] = [];
  if (!Array.isArray(input.metrics) || input.metrics.length < 2 || input.metrics.length > 5) issues.push(`${path}.metrics: expected 2 to 5 metrics`);
  else input.metrics.forEach((metric, index) => { const parsed = parseMetric(metric, `${path}.metrics[${index}]`, issues); if (parsed) metrics.push(parsed); });
  const attributionWindow = text(input.attributionWindow, `${path}.attributionWindow`, issues, { max: 200 });
  const privacyNote = text(input.privacyNote, `${path}.privacyNote`, issues, { max: 500 });
  const caveat = text(input.caveat, `${path}.caveat`, issues, { max: 500 });
  return objective && primaryOutcome && attributionWindow && privacyNote && caveat
    ? { objective, primaryOutcome, metrics, attributionWindow, privacyNote, caveat }
    : null;
}

export function parseSponsorshipInterestRequest(input: unknown): SponsorshipParseResult<SponsorshipInterestRequest> {
  const issues: string[] = [];
  if (!record(input)) return { ok: false, issues: ['$: expected an object'] };
  exactKeys(input, ['contractVersion', 'id', 'opportunityId', 'sponsorRunId', 'status', 'message', 'activation', 'fitAtRequest', 'evidenceConfidence', 'reasonsAtRequest', 'gapsAtRequest', 'measurementPlan', 'requestedAt'], ['contractVersion', 'id', 'opportunityId', 'sponsorRunId', 'status', 'message', 'activation', 'fitAtRequest', 'evidenceConfidence', 'reasonsAtRequest', 'gapsAtRequest', 'measurementPlan', 'requestedAt'], '$', issues);
  if (input.contractVersion !== '1') issues.push('$.contractVersion: unsupported sponsorship contract version');
  for (const field of ['id', 'opportunityId', 'sponsorRunId'] as const) if (typeof input[field] !== 'string' || !UUID_RE.test(input[field])) issues.push(`$.${field}: expected UUID`);
  if (input.status !== 'requested') issues.push('$.status: expected requested');
  const message = nullableText(input.message, '$.message', issues, 2_000);
  const activation = parseActivation(input.activation, '$.activation', issues);
  const fitAtRequest = enumValue(input.fitAtRequest, ['strong', 'potential', 'limited'] as const, '$.fitAtRequest', issues);
  const evidenceConfidence = enumValue(input.evidenceConfidence, ['verified', 'declared', 'limited'] as const, '$.evidenceConfidence', issues);
  const reasonsAtRequest: SponsorshipMatchReason[] = [];
  if (!Array.isArray(input.reasonsAtRequest)) issues.push('$.reasonsAtRequest: expected an array');
  else input.reasonsAtRequest.forEach((reason, index) => { const parsed = parseReason(reason, `$.reasonsAtRequest[${index}]`, issues); if (parsed) reasonsAtRequest.push(parsed); });
  const gapsAtRequest = stringList(input.gapsAtRequest, '$.gapsAtRequest', issues, { max: 20, itemMax: 500 });
  const measurementPlan = parseMeasurementPlan(input.measurementPlan, '$.measurementPlan', issues);
  const requestedAt = isoInstantOrNull(input.requestedAt, '$.requestedAt', issues);
  if (!requestedAt) issues.push('$.requestedAt: persisted request requires an instant');
  if (issues.length || typeof input.id !== 'string' || typeof input.opportunityId !== 'string' || typeof input.sponsorRunId !== 'string' || !activation || !fitAtRequest || !evidenceConfidence || !measurementPlan || !requestedAt)
    return { ok: false, issues };
  return { ok: true, value: { contractVersion: '1', id: input.id, opportunityId: input.opportunityId, sponsorRunId: input.sponsorRunId, status: 'requested', message, activation, fitAtRequest, evidenceConfidence, reasonsAtRequest, gapsAtRequest, measurementPlan, requestedAt } };
}
