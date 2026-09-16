// Matching determinista y explicable. No produce un puntaje ni una prediccion
// de ROI: clasifica por reglas booleanas visibles y conserva los huecos que una
// persona debe resolver antes de comprometer presupuesto.

import type { EvaluationProfile } from '../../contracts/evaluation.ts';
import type {
  SponsorshipActivation,
  SponsorshipEvidenceConfidence,
  SponsorshipFormat,
  SponsorshipMatch,
  SponsorshipMatchReason,
  SponsorshipMeasurementMetric,
  SponsorshipMeasurementPlan,
  SponsorshipOpportunity,
  SponsorshipPackage,
} from '../../contracts/sponsorship.ts';

const STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'our',
  'para', 'con', 'del', 'las', 'los', 'una', 'uno', 'por', 'que', 'como',
  'teams', 'team', 'product', 'users', 'user', 'engineers', 'engineering',
]);

function normalizeToken(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US');
  if (normalized === 'agents') return 'agent';
  if (normalized === 'developers') return 'developer';
  if (normalized.endsWith('ies') && normalized.length > 5) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith('s') && normalized.length > 4) return normalized.slice(0, -1);
  return normalized;
}

function tokens(values: string[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    for (const raw of value.split(/[^\p{L}\p{N}+#.]+/u)) {
      const token = normalizeToken(raw);
      if ((token.length >= 3 || token === 'ai') && !STOP_WORDS.has(token)) result.add(token);
    }
  }
  return result;
}

function formatFromBrief(value: string): SponsorshipFormat | null {
  const normalized = value.toLocaleLowerCase('en-US').replace(/[\s-]+/g, '_');
  if (normalized === 'hackathon' || normalized === 'track' || normalized === 'hackathon_track') return 'hackathon_track';
  if (normalized === 'workshop' || normalized === 'hands_on_workshop') return 'workshop';
  if (normalized === 'demo' || normalized === 'demo_day') return 'demo';
  if (normalized === 'dinner' || normalized === 'roundtable') return 'dinner';
  if (normalized === 'booth' || normalized === 'expo') return 'booth';
  return null;
}

function profileFormats(profile: EvaluationProfile): SponsorshipFormat[] {
  return [...new Set((profile.formats ?? []).map(formatFromBrief).filter((format): format is SponsorshipFormat => format !== null))];
}

function preferredFormats(profile: EvaluationProfile): SponsorshipFormat[] {
  const declared = profileFormats(profile);
  const byObjective: Record<EvaluationProfile['objective']['kind'], SponsorshipFormat[]> = {
    adoption: ['hackathon_track', 'workshop', 'demo', 'booth', 'dinner'],
    feedback: ['workshop', 'hackathon_track', 'demo', 'dinner', 'booth'],
    hiring: ['hackathon_track', 'workshop', 'dinner', 'booth', 'demo'],
    awareness: ['demo', 'booth', 'dinner', 'workshop', 'hackathon_track'],
  };
  return [...declared, ...byObjective[profile.objective.kind].filter((format) => !declared.includes(format))];
}

function chooseFormat(profile: EvaluationProfile, opportunity: SponsorshipOpportunity): SponsorshipFormat {
  const declared = profileFormats(profile).filter((format) => opportunity.formats.includes(format));
  const candidates = declared.length > 0
    ? declared
    : preferredFormats(profile).filter((format) => opportunity.formats.includes(format));
  return candidates.find((format) => affordablePackage(profile, opportunity, format) !== null)
    ?? candidates.find((format) => opportunity.packages.some((item) => item.formats.includes(format)))
    ?? candidates[0]
    ?? opportunity.formats[0];
}

function affordablePackage(profile: EvaluationProfile, opportunity: SponsorshipOpportunity, format?: SponsorshipFormat): SponsorshipPackage | null {
  const budget = profile.budget;
  if (budget.status !== 'declared') return null;
  return opportunity.packages.find((item) =>
    (!format || item.formats.includes(format)) &&
    item.contribution.kind === 'cash' &&
    item.contribution.currency === budget.currency &&
    item.contribution.amount <= budget.amount,
  ) ?? null;
}

function choosePackage(profile: EvaluationProfile, opportunity: SponsorshipOpportunity, format: SponsorshipFormat): SponsorshipPackage | null {
  const affordable = affordablePackage(profile, opportunity, format);
  if (affordable) return affordable;
  const supporting = opportunity.packages.find((item) => item.formats.includes(format));
  return supporting ?? null;
}

type DateFit = 'future_in_window' | 'past' | 'outside_window' | 'unknown';

function eventDayInSanFrancisco(instant: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dateFit(profile: EvaluationProfile, opportunity: SponsorshipOpportunity, now: string): DateFit {
  if (!opportunity.startsAt) return 'unknown';
  const eventMs = Date.parse(opportunity.startsAt);
  if (eventMs < Date.parse(now)) return 'past';
  const eventDay = eventDayInSanFrancisco(opportunity.startsAt);
  const from = profile.window.from;
  const to = profile.window.to;
  const beforeFrom = from
    ? /^\d{4}-\d{2}-\d{2}$/.test(from) ? eventDay < from : eventMs < Date.parse(from)
    : false;
  const afterTo = to
    ? /^\d{4}-\d{2}-\d{2}$/.test(to) ? eventDay > to : eventMs > Date.parse(to)
    : false;
  return beforeFrom || afterTo ? 'outside_window' : 'future_in_window';
}

function evidenceConfidence(opportunity: SponsorshipOpportunity): SponsorshipEvidenceConfidence {
  if (opportunity.audience.evidenceStatus === 'source_verified' && opportunity.audience.sourceUrl) return 'verified';
  if (opportunity.audience.evidenceStatus === 'organizer_declared') return 'declared';
  return 'limited';
}

function measurementMetrics(objective: EvaluationProfile['objective']['kind']): SponsorshipMeasurementMetric[] {
  switch (objective) {
    case 'adoption':
      return [
        { id: 'qualified-activations', label: 'Qualified activations', definition: 'Opt-in attendees who complete the agreed product activation during the event.', collectionMethod: 'Event-specific product marker joined to consented registration identifiers.', timing: 'During the event and within 48 hours.' },
        { id: 'retained-builders', label: 'Retained builders', definition: 'Qualified activations that use the product again after the event.', collectionMethod: 'First-party product telemetry for the consented event cohort.', timing: '7 and 14 days after the event.' },
      ];
    case 'feedback':
      return [
        { id: 'structured-sessions', label: 'Structured feedback sessions', definition: 'Participants who complete the agreed interview or feedback rubric.', collectionMethod: 'Facilitator log linked only to opt-in participants.', timing: 'During the event and within 48 hours.' },
        { id: 'actionable-findings', label: 'Actionable findings', definition: 'Distinct product issues or validated needs accepted for follow-up by the product team.', collectionMethod: 'Tagged research notes with an owner and disposition.', timing: 'Within 7 days after the event.' },
      ];
    case 'hiring':
      return [
        { id: 'opt-in-candidates', label: 'Opt-in qualified candidates', definition: 'Participants who explicitly request recruiting follow-up and meet the agreed role criteria.', collectionMethod: 'Consent checkbox plus recruiter qualification rubric; no organizer list resale.', timing: 'During the event and within 72 hours.' },
        { id: 'hiring-funnel', label: 'Attributed hiring progression', definition: 'Opt-in candidates who reach screen, interview, offer, or hire.', collectionMethod: 'ATS source tag created specifically for this event.', timing: '30, 60, and 90 days after the event.' },
      ];
    case 'awareness':
      return [
        { id: 'qualified-opt-ins', label: 'Qualified opt-ins', definition: 'Target-audience participants who request a product follow-up.', collectionMethod: 'Event-specific consented form or QR flow.', timing: 'During the event and within 48 hours.' },
        { id: 'engaged-follow-up', label: 'Engaged follow-up', definition: 'Qualified opt-ins who complete a meaningful follow-up action.', collectionMethod: 'Event-tagged first-party campaign and product analytics.', timing: 'Within 14 days after the event.' },
      ];
  }
}

function measurementPlan(profile: EvaluationProfile): SponsorshipMeasurementPlan {
  const primaryOutcome: Record<EvaluationProfile['objective']['kind'], string> = {
    adoption: 'Test whether the activation creates qualified product use that continues after the event.',
    feedback: 'Collect structured developer feedback that can be traced to a product decision.',
    hiring: 'Create a consented, role-qualified candidate pipeline and trace downstream progression.',
    awareness: 'Create consented engagement from the declared target audience, not raw foot traffic.',
  };
  return {
    objective: profile.objective.kind,
    primaryOutcome: primaryOutcome[profile.objective.kind],
    metrics: measurementMetrics(profile.objective.kind),
    attributionWindow: profile.objective.kind === 'hiring' ? 'Event day through 90 days after the event.' : 'Event day through 14 days after the event.',
    privacyNote: 'Measure only consented participants with an event-specific source marker; do not treat the attendee list as sponsor-owned leads.',
    caveat: 'This plan measures observable outcomes and attribution signals. It does not guarantee revenue, hiring, adoption, or ROI.',
  };
}

export function buildSponsorshipMatch(input: {
  sponsorRunId: string;
  profile: EvaluationProfile;
  opportunity: SponsorshipOpportunity;
  now?: string;
}): SponsorshipMatch {
  const { sponsorRunId, profile, opportunity } = input;
  const sponsorTerms = tokens([
    profile.product,
    profile.audience.description,
    ...profile.audience.profiles,
    ...profile.stack,
  ]);
  const matchedThemes = opportunity.themes.filter((theme) => [...tokens([theme])].some((token) => sponsorTerms.has(token)));
  const declaredFormats = profileFormats(profile);
  const sharedFormats = declaredFormats.filter((format) => opportunity.formats.includes(format));
  const objectiveMatch = opportunity.sponsorGoals.includes(profile.objective.kind);
  const activationFormat = chooseFormat(profile, opportunity);
  const commercialFit = affordablePackage(profile, opportunity, activationFormat);
  const confidence = evidenceConfidence(opportunity);
  const eventDateFit = dateFit(profile, opportunity, input.now ?? new Date().toISOString());
  const reasons: SponsorshipMatchReason[] = [];
  const gaps: string[] = [];

  if (matchedThemes.length > 0) reasons.push({ kind: 'theme', label: 'Relevant theme overlap', detail: `The published themes overlap the brief: ${matchedThemes.join(', ')}.` });
  else gaps.push('No explicit overlap was found between the published themes and the product, audience, or stack in the sponsor brief.');

  if (objectiveMatch) reasons.push({ kind: 'objective', label: 'Objective supported', detail: `The organizer explicitly accepts ${profile.objective.kind} as a sponsor goal.` });
  else gaps.push(`The organizer did not explicitly list ${profile.objective.kind} as a supported sponsor goal.`);

  if (sharedFormats.length > 0) reasons.push({ kind: 'format', label: 'Declared format available', detail: `The opportunity offers a format from the brief: ${sharedFormats.join(', ')}.` });
  else if (declaredFormats.length === 0) gaps.push('The sponsor brief does not declare a preferred event format.');
  else gaps.push(`None of the sponsor's declared formats are offered (${declaredFormats.join(', ')}).`);

  if (commercialFit) reasons.push({ kind: 'budget', label: 'Published package fits format and declared budget', detail: `${commercialFit.label} supports ${activationFormat} and is within the declared ${commercialFit.contribution.kind === 'cash' ? commercialFit.contribution.currency : ''} budget; taxes and add-ons still require confirmation.` });
  else if (profile.budget.status === 'unknown') gaps.push('Sponsor budget is unknown, so package feasibility cannot be confirmed.');
  else if (opportunity.packages.some((item) => item.contribution.kind === 'in_kind')) gaps.push('An in-kind option exists, but the organizer must confirm that the offered credits or services are acceptable.');
  else gaps.push(`No published cash package fits the declared ${profile.budget.currency} budget.`);

  if (confidence === 'verified') reasons.push({ kind: 'evidence', label: 'Audience claim has a supporting source', detail: 'The organizer linked a source for the published audience claim; review the source before committing.' });
  else if (confidence === 'declared') gaps.push('Audience information is organizer-declared and has not been independently verified.');
  else gaps.push('Audience information is estimated and needs supporting evidence.');

  if (opportunity.audience.estimatedSize === null) gaps.push('Audience size is not published.');
  if (eventDateFit === 'unknown') gaps.push('Event date is pending.');
  else if (eventDateFit === 'past') gaps.push('The published event date has already passed; do not treat this opportunity as investable.');
  else if (eventDateFit === 'outside_window') gaps.push('The published event date falls outside the sponsor brief window.');
  for (const restriction of profile.restrictions) gaps.push(`Manually verify buyer restriction: ${restriction}`);

  const selectedPackage = choosePackage(profile, opportunity, activationFormat);
  const theme = activationFormat === 'hackathon_track' && selectedPackage?.trackAvailable
    ? matchedThemes[0] ?? null
    : null;
  const recommendedActivation: SponsorshipActivation = {
    format: activationFormat,
    packageId: selectedPackage?.id ?? null,
    trackTheme: theme,
    rationale: theme
      ? `Use a dedicated ${theme} track to create hands-on product use; confirm judging, support coverage, and instrumentation with the organizer.`
      : `Use the published ${activationFormat} format as a testable activation; confirm deliverables and instrumentation with the organizer.`,
  };

  // Reglas de bandas, no una suma oculta: strong exige que todos los ejes
  // comerciales y de evidencia esten presentes; potential exige una pareja
  // coherente de señales; todo lo demas queda limited.
  const explicitFormatFit = sharedFormats.length > 0;
  const fit = eventDateFit === 'past'
    ? 'limited'
    : matchedThemes.length > 0 && objectiveMatch && explicitFormatFit && commercialFit !== null && confidence !== 'limited' && eventDateFit === 'future_in_window'
    ? 'strong'
    : (matchedThemes.length > 0 && (objectiveMatch || explicitFormatFit)) || (objectiveMatch && explicitFormatFit)
      ? 'potential'
      : 'limited';

  return {
    contractVersion: '1',
    opportunityId: opportunity.id,
    sponsorRunId,
    fit,
    evidenceConfidence: confidence,
    reasons,
    gaps,
    recommendedActivation,
    measurementPlan: measurementPlan(profile),
  };
}
