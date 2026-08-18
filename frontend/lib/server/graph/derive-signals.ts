import type {
  Community,
  Evidence,
  SearchRequest,
  SFEvent,
  Theme,
} from '@/lib/contracts/growxth';
import type { SeedGraph } from '@/lib/server/graph/load-graph';

const CAPABILITY_RULES: Array<[string, RegExp]> = [
  ['AI', /\b(ai|llm|agent|agents|openai|mistral|codex|reasoning|multimodal|model|models|robotics)\b/i],
  ['Python', /\b(python|fastapi|django|pytorch)\b/i],
  ['Rust', /\b(rust|cargo|wasm|webassembly)\b/i],
  ['Data', /\b(data|analytics|clickhouse|database|postgres|sql|warehouse)\b/i],
  ['Security', /\b(security|auth0|identity|authentication|privacy|oauth)\b/i],
  ['Observability', /\b(observability|monitoring|tracing|sentry|telemetry|evaluation|evals)\b/i],
  ['Infrastructure', /\b(infra|infrastructure|cloud|vercel|kubernetes|tailscale|temporal|modal|baseten|nvidia)\b/i],
  ['Developer Tools', /\b(devtool|devtools|developer tools?|api|apis|sdk|code|coding|builder|builders|hackathon|mcp|workos|warp)\b/i],
  ['Frontend', /\b(frontend|react|typescript|javascript|browser|web)\b/i],
  ['Hardware', /\b(hardware|edge|robotics|qualcomm|semiconductor)\b/i],
  ['Crypto', /\b(crypto|web3|blockchain)\b/i],
  ['Climate', /\b(climate|regenerative|sustainability)\b/i],
  ['Founders', /\b(founder|founders|startup|startups|yc|investor|venture)\b/i],
];

const TECHNICAL_TOKENS = new Set([
  'openai',
  'codex',
  'fastapi',
  'python',
  'rust',
  'wasm',
  'postgres',
  'clickhouse',
  'auth0',
  'stripe',
  'vercel',
  'sentry',
  'tailscale',
  'temporal',
  'workos',
  'browserbase',
  'mistral',
  'nvidia',
  'modal',
  'baseten',
  'react',
  'typescript',
  'javascript',
  'kubernetes',
  'llm',
  'mcp',
]);

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => TECHNICAL_TOKENS.has(token));
}

export function inferCapabilities(...texts: Array<string | null | undefined>): string[] {
  const blob = texts.filter((text): text is string => Boolean(text)).join(' ');
  const inferred = CAPABILITY_RULES.filter(([, pattern]) => pattern.test(blob)).map(([label]) => label);
  return unique([...inferred, ...tokens(blob)]);
}

export function requestCapabilities(request: SearchRequest): string[] {
  const explicit = request.icpStack.flatMap((item) => [item.trim(), ...inferCapabilities(item)]);
  return unique([...explicit, ...inferCapabilities(request.product)]);
}

function overlapCount(source: string[], target: string[]): number {
  const normalized = new Set(source.map((item) => item.toLowerCase()));
  return target.reduce((count, item) => count + (normalized.has(item.toLowerCase()) ? 1 : 0), 0);
}

function eventEvidence(event: SFEvent, fetchedAt: string): Evidence {
  return {
    id: `ev-luma-${event.id}`,
    source: 'luma',
    kind: 'event_listing',
    url: event.url,
    title: event.name,
    observedAt: fetchedAt,
    location: event.venueArea ?? 'San Francisco, CA',
    confidence: 0.9,
    rightsBasis: 'public_api',
    status: 'observed',
    excerpt: event.startsAt ? `Upcoming event on ${event.startsAt.slice(0, 10)}.` : undefined,
  };
}

function communityListingEvidence(community: Community, fetchedAt: string): Evidence | null {
  if (!community.url) return null;
  return {
    id: `ev-luma-${community.id}`,
    source: 'luma',
    kind: 'event_listing',
    url: community.url,
    title: `${community.name} on Luma`,
    observedAt: fetchedAt,
    location: 'San Francisco, CA',
    confidence: 0.85,
    rightsBasis: 'public_api',
    status: 'observed',
  };
}

export interface RuntimeCommunity {
  community: Community;
  event: SFEvent;
  theme: Theme;
}

export interface RuntimeGraph {
  candidates: RuntimeCommunity[];
  evidence: Evidence[];
  requestCapabilities: string[];
}

export function deriveRuntimeGraph(graph: SeedGraph, request: SearchRequest): RuntimeGraph {
  const fetchedAt = graph.sourceMeta?.fetchedAt ?? '2026-07-24T21:34:53.227319+00:00';
  const requested = requestCapabilities(request);
  const evidence: Evidence[] = [];
  const eventEvidenceById = new Map<string, Evidence>();

  for (const event of graph.events) {
    const item = eventEvidence(event, fetchedAt);
    evidence.push(item);
    eventEvidenceById.set(event.id, item);
  }

  const capabilitiesByEvent = new Map(
    graph.events.map((event) => [
      event.id,
      unique([...event.stack, ...inferCapabilities(event.name, ...event.pastThemes)]),
    ]),
  );

  const candidates: RuntimeCommunity[] = [];
  for (const community of graph.communities) {
    const communityEvents = graph.events.filter((event) => event.communityIds.includes(community.id));
    if (communityEvents.length === 0) continue;

    const event = [...communityEvents].sort((a, b) => {
      const aFit = overlapCount(capabilitiesByEvent.get(a.id) ?? [], requested);
      const bFit = overlapCount(capabilitiesByEvent.get(b.id) ?? [], requested);
      if (aFit !== bFit) return bFit - aFit;
      return (a.startsAt ?? '').localeCompare(b.startsAt ?? '');
    })[0];

    const eventCapabilities = capabilitiesByEvent.get(event.id) ?? [];
    const allCommunityCapabilities = unique([
      ...community.stack,
      ...inferCapabilities(community.name),
      ...communityEvents.flatMap((item) => capabilitiesByEvent.get(item.id) ?? []),
    ]);

    const listing = communityListingEvidence(community, fetchedAt);
    if (listing) evidence.push(listing);
    const eventEv = eventEvidenceById.get(event.id);
    const evidenceIds = unique([
      ...community.evidenceIds,
      ...(listing ? [listing.id] : []),
      ...(eventEv ? [eventEv.id] : []),
    ]);

    const scoringCommunity: Community = {
      ...community,
      stack: allCommunityCapabilities,
      evidenceIds,
    };

    const similarEvents = graph.events.filter((candidate) => {
      const capabilities = capabilitiesByEvent.get(candidate.id) ?? [];
      return overlapCount(capabilities, eventCapabilities) > 0;
    }).length;

    const theme: Theme = {
      id: `theme-${event.id}`,
      label: event.name,
      githubMomentum: null,
      newsSalience: null,
      saturationSF: similarEvents,
      requiredCapabilities: eventCapabilities,
      evidenceIds: eventEv ? [eventEv.id] : [],
    };

    candidates.push({ community: scoringCommunity, event, theme });
  }

  return { candidates, evidence, requestCapabilities: requested };
}

export function distanceMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
