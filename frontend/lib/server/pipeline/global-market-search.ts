import { createHash } from 'node:crypto';

import type {
  CampaignDraft,
  CommunityBreakdown,
  Evidence,
  EvidenceSource,
  MarketMomentumSignal,
  Opportunity,
  Reason,
  SearchRequest,
  SearchResponse,
  Status,
  ThemeBreakdown,
} from '../../contracts/growxth.ts';
import { runApifyActor, type ApifyActorResult } from '../connectors/apify.ts';
import { SIX_HOURS_MS, TtlCache } from '../cache.ts';
import { enrichWithExaEvents } from '../discovery/exa-events.ts';
import { reasonWithGemini } from '../reasoning/gemini.ts';
import { distanceMiles, requestCapabilities } from '../graph/derive-signals.ts';
import {
  MARKET_CITIES,
  cityForCountry,
  resolveMarketCityScoped,
  type MarketCity,
  type MarketCityScope,
} from '../markets/city-catalog.ts';
import { clamp01 } from '../scoring/score-utils.ts';

// The official Trends Actor is browser-heavy and repeatedly exceeded the live
// request budget. This Actor uses Google's HTTP endpoints and returns the same
// worldwide geo data without keeping the UI request open.
const GOOGLE_TRENDS_ACTOR = 'agenscrape/google-trends-scraper';
// apidojo/tweet-scraper disables API calls on Apify's free plan. The profile
// mode of this Actor works through the API without X cookies, so we use it to
// locate public X profiles that share handles with relevant GitHub owners.
const X_ACTOR = 'automation-lab/twitter-scraper';
const LIVE_SIGNAL_WAIT_MS = 4_500;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'build', 'building', 'by', 'company',
  'developers', 'developer', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'our',
  'platform', 'product', 'software', 'that', 'the', 'their', 'to', 'tool', 'tools',
  'we', 'with', 'want', 'wants', 'wanted', 'wanting', 'startup', 'startups',
  'focus', 'focuses', 'focused', 'focusing', 'replace', 'replaces', 'replacing',
  'user', 'users', 'team', 'teams', 'need', 'needs', 'help', 'helps', 'using',
  'use', 'current', 'goal', 'goals', 'adoption', 'feedback', 'hiring', 'awareness',
  'una', 'para', 'por', 'que', 'los', 'las', 'del', 'de', 'un', 'y',
]);

interface TrendGeoSignal {
  city: MarketCity;
  value: number;
  basis: 'city' | 'country';
  geoLabel: string;
  url: string;
}

interface XGeoSignal {
  city: MarketCity;
  url: string;
  text: string;
  engagement: number;
  observedAt: string;
  basis: 'city' | 'profile_location';
  // Alcance de lo que la fuente nombró: 'city' respalda la ciudad; 'region' o
  // 'country' solo asignan un punto de exploración.
  geoScope: MarketCityScope;
  // Texto de ubicación tal como lo publicó la fuente; la evidencia conserva
  // esta declaración, nunca la ciudad resuelta.
  declaredLocation: string;
  kind?: 'post' | 'profile';
}

interface GithubGeoSignal {
  city: MarketCity;
  repoName: string;
  repoUrl: string;
  profileUrl: string;
  location: string;
  geoScope: MarketCityScope;
  stars: number;
  observedAt: string;
}

interface SourceState {
  source: 'google_trends' | 'github' | 'x';
  available: boolean;
  warming?: boolean;
  warning: string | null;
  globalCount: number;
  globalEvidenceUrl: string | null;
}

export interface GlobalSignalBundle {
  term: string;
  collectedAt: string;
  trends: TrendGeoSignal[];
  tweets: XGeoSignal[];
  github: GithubGeoSignal[];
  sources: SourceState[];
}

interface CityAccumulator {
  city: MarketCity;
  trends: TrendGeoSignal[];
  tweets: XGeoSignal[];
  github: GithubGeoSignal[];
  prepared: boolean;
}

interface TrendsCollection {
  result: ApifyActorResult;
  signals: TrendGeoSignal[];
}

interface GithubCollection {
  locations: GithubGeoSignal[];
  repos: GithubRepo[];
  repoCount: number;
  evidenceUrl: string | null;
  warning: string | null;
}

interface XCollection {
  result: ApifyActorResult;
  signals: XGeoSignal[];
}

const trendsCache = new TtlCache<TrendsCollection>(SIX_HOURS_MS);
const githubCache = new TtlCache<GithubCollection>(SIX_HOURS_MS);
const xCache = new TtlCache<XCollection>(SIX_HOURS_MS);
const pendingTrends = new Map<string, Promise<TrendsCollection>>();
const pendingGithub = new Map<string, Promise<GithubCollection>>();
const pendingX = new Map<string, Promise<XCollection>>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'number' && Number.isFinite(item));
    return typeof first === 'number' ? first : null;
  }
  return null;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 12)}`;
}

function compact(value: string, max = 190): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function searchTermForRequest(request: SearchRequest): string {
  const tokens = request.product
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .match(/[a-z0-9+#.-]+/g)
    ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [];
  const tokenSet = new Set(tokens);
  if (
    tokenSet.has('ai') &&
    (tokenSet.has('observability') ||
      tokenSet.has('monitoring') ||
      tokenSet.has('telemetry'))
  ) {
    return `ai ${
      tokenSet.has('observability')
        ? 'observability'
        : tokenSet.has('monitoring')
          ? 'monitoring'
          : 'telemetry'
    }`;
  }
  const unique: string[] = [];
  const stems = new Set<string>();
  for (const token of tokens) {
    const stem = token.length > 4 ? token.replace(/(ing|ers|ies|s)$/i, '') : token;
    if (stems.has(stem)) continue;
    stems.add(stem);
    unique.push(token);
    if (unique.length === 3) break;
  }
  if (unique.length > 0) return unique.join(' ');
  const capabilities = requestCapabilities(request)
    .filter((item) => item !== 'Founders')
    .slice(0, 3);
  return capabilities.join(' ') || 'developer tools';
}

function googleTrendsUrl(term: string): string {
  const params = new URLSearchParams({ date: 'today 3-m', q: term });
  return `https://trends.google.com/trends/explore?${params.toString()}`;
}

function rowsFromTrendItem(
  item: Record<string, unknown>,
): Array<{ row: Record<string, unknown>; basis: 'city' | 'country' }> {
  const groups: Array<{ key: string; basis: 'city' | 'country' }> = [
    { key: 'interestByCity', basis: 'city' },
    { key: 'interestByMetro', basis: 'city' },
    { key: 'interestBySubregion', basis: 'city' },
    { key: 'interestBy', basis: 'country' },
    { key: 'geoData', basis: 'country' },
  ];
  for (const group of groups) {
    const value = item[group.key];
    if (Array.isArray(value) && value.length > 0) {
      return value
        .map(asRecord)
        .filter((row): row is Record<string, unknown> => row !== null)
        .map((row) => ({ row, basis: group.basis }));
    }
  }

  const dataType = asString(item.dataType)?.toLowerCase();
  if (dataType === 'geo' || dataType === 'interest_by_region') {
    return [{ row: item, basis: asString(item.city) ? 'city' : 'country' }];
  }
  return [];
}

export function normalizeGoogleTrends(
  result: ApifyActorResult,
  term: string,
): TrendGeoSignal[] {
  const normalized: TrendGeoSignal[] = [];
  for (const raw of result.items) {
    const item = asRecord(raw);
    if (!item) continue;
    for (const { row, basis } of rowsFromTrendItem(item)) {
      const geoName =
        asString(row.geoName) ??
        asString(row.regionName) ??
        asString(row.city) ??
        asString(row.country) ??
        asString(row.name);
      const geoCode =
        asString(row.geoCode) ?? asString(row.countryCode) ?? asString(row.regionCode);
      const value = asNumber(row.value) ?? asNumber(row.score) ?? asNumber(row.interest);
      if (!geoName || value == null || value <= 0) continue;
      // Una fila de país solo asigna un punto de exploración; una fila "de
      // ciudad" que en realidad nombra una región/país conserva alcance país.
      const scoped =
        basis === 'country' ? null : resolveMarketCityScoped(`${geoName} ${geoCode ?? ''}`);
      const city = basis === 'country' ? cityForCountry(geoCode ?? geoName) : scoped?.city ?? null;
      if (!city) continue;
      normalized.push({
        city,
        value: Math.round(Math.max(0, Math.min(100, value))),
        basis: scoped?.scope === 'city' ? 'city' : 'country',
        geoLabel: geoName,
        url: googleTrendsUrl(term),
      });
    }
  }
  return normalized;
}

function locationStrings(item: Record<string, unknown>): Array<{
  value: string;
  basis: 'city' | 'profile_location';
}> {
  const values: Array<{ value: string; basis: 'city' | 'profile_location' }> = [];
  const place = asRecord(item.place);
  for (const candidate of [
    place && asString(place.fullName),
    place && asString(place.name),
    place && asString(place.country),
  ]) {
    if (candidate) values.push({ value: candidate, basis: 'city' });
  }
  const author = asRecord(item.author);
  const authorLocation = author && asString(author.location);
  if (authorLocation) values.push({ value: authorLocation, basis: 'profile_location' });
  const profileLocation = asString(item.location);
  if (profileLocation) {
    values.push({ value: profileLocation, basis: 'profile_location' });
  }
  return values;
}

export function normalizeTweets(
  result: ApifyActorResult,
  collectedAt: string,
): XGeoSignal[] {
  const seen = new Set<string>();
  const normalized: XGeoSignal[] = [];
  for (const raw of result.items) {
    const item = asRecord(raw);
    if (!item || item.noResults === true) continue;
    const url = asString(item.url) ?? asString(item.twitterUrl);
    if (!url || seen.has(url)) continue;
    const match = locationStrings(item)
      .map((candidate) => ({ ...candidate, resolved: resolveMarketCityScoped(candidate.value) }))
      .find((candidate) => candidate.resolved !== null);
    if (!match?.resolved) continue;
    seen.add(url);
    normalized.push({
      city: match.resolved.city,
      geoScope: match.resolved.scope,
      declaredLocation: match.value,
      url,
      text: compact(
        asString(item.text) ??
          asString(item.bio) ??
          asString(item.name) ??
          'Public X profile associated with a relevant repository owner.',
      ),
      engagement:
        (asNumber(item.likeCount) ?? 0) +
        (asNumber(item.retweetCount) ?? 0) +
        (asNumber(item.replyCount) ?? 0) +
        (asNumber(item.quoteCount) ?? 0) +
        (asNumber(item.followers) ?? 0),
      observedAt:
        asString(item.createdAt) ?? asString(item.scrapedAt) ?? collectedAt,
      basis: match.basis,
      kind: url.includes('/status/') ? 'post' : 'profile',
    });
  }
  return normalized;
}

interface GithubRepo {
  owner: string;
  name: string;
  url: string;
  stars: number;
  updatedAt: string;
}

function normalizeGithubRepos(items: unknown[], collectedAt: string): GithubRepo[] {
  return items.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const ownerRecord = asRecord(item.owner);
    const fullName =
      asString(item.fullName) ?? asString(item.full_name) ?? asString(item.name);
    const owner =
      asString(item.owner) ??
      (ownerRecord && asString(ownerRecord.login)) ??
      (fullName?.includes('/') ? fullName.split('/')[0] ?? null : null);
    const url =
      asString(item.htmlUrl) ?? asString(item.html_url) ?? asString(item.url);
    if (!fullName || !owner || !url) return [];
    return [{
      owner,
      name: fullName,
      url,
      stars: Math.max(
        0,
        asNumber(item.stars) ?? asNumber(item.stargazers_count) ?? 0,
      ),
      updatedAt:
        asString(item.updatedAt) ?? asString(item.updated_at) ?? collectedAt,
    }];
  });
}

function normalizeGithubLocations(
  profileItems: unknown[],
  repos: GithubRepo[],
): GithubGeoSignal[] {
  const repoByOwner = new Map(repos.map((repo) => [repo.owner.toLowerCase(), repo]));
  return profileItems.flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    const username = asString(item.username) ?? asString(item.login);
    const location = asString(item.location);
    const profileUrl =
      asString(item.htmlUrl) ??
      asString(item.html_url) ??
      asString(item.url) ??
      (username ? `https://github.com/${encodeURIComponent(username)}` : null);
    const resolved = location ? resolveMarketCityScoped(location) : null;
    const repo = username ? repoByOwner.get(username.toLowerCase()) : null;
    if (!username || !profileUrl || !location || !resolved || !repo) return [];
    return [{
      city: resolved.city,
      geoScope: resolved.scope,
      repoName: repo.name,
      repoUrl: repo.url,
      profileUrl,
      location,
      stars: repo.stars,
      observedAt: repo.updatedAt,
    }];
  });
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'GrowXth-Hackathon',
    'x-github-api-version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function githubJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}.`);
  }
  return response.json();
}

async function collectGithub(
  term: string,
  collectedAt: string,
): Promise<GithubCollection> {
  try {
    const query = new URLSearchParams({
      q: term,
      sort: 'stars',
      order: 'desc',
      per_page: '8',
    });
    const rawSearch = asRecord(
      await githubJson(
        `https://api.github.com/search/repositories?${query.toString()}`,
        4_000,
      ),
    );
    const repos = normalizeGithubRepos(
      Array.isArray(rawSearch?.items) ? rawSearch.items : [],
      collectedAt,
    );
    if (repos.length === 0) {
      return {
        locations: [],
        repos: [],
        repoCount: 0,
        evidenceUrl: null,
        warning: 'GitHub returned no relevant public repositories for this phrase.',
      };
    }

    const owners = [...new Set(repos.map((repo) => repo.owner))].slice(0, 8);
    const profiles = await Promise.all(
      owners.map((owner) =>
        githubJson(
          `https://api.github.com/users/${encodeURIComponent(owner)}`,
          3_000,
        ).catch(() => null),
      ),
    );
    return {
      locations: normalizeGithubLocations(profiles, repos),
      repos,
      repoCount: repos.length,
      evidenceUrl: repos[0]?.url ?? null,
      warning: null,
    };
  } catch (error) {
    return {
      locations: [],
      repos: [],
      repoCount: 0,
      evidenceUrl: null,
      warning:
        error instanceof Error
          ? error.message
          : 'GitHub could not be reached for this search.',
    };
  }
}

function unavailableActor(actorId: string, warning: string): ApifyActorResult {
  return {
    actorId,
    runId: null,
    status: 'UNAVAILABLE',
    items: [],
    warning,
  };
}

async function collectTrends(
  term: string,
): Promise<TrendsCollection> {
  const result = await runApifyActor(
    GOOGLE_TRENDS_ACTOR,
    {
      keywords: [term],
      geo: '',
      timeRange: 'today 3-m',
      category: 0,
      includeRelatedSearches: false,
      includeRelatedTopics: false,
      includeGeoData: true,
      includeInterestOverTime: false,
      useBrowserForTopics: false,
    },
    {
      waitSeconds: 55,
      timeoutSeconds: 60,
      memoryMb: 256,
      maxItems: 1,
      maxTotalChargeUsd: 0.03,
    },
  );
  return { result, signals: normalizeGoogleTrends(result, term) };
}

async function collectXProfiles(
  owners: string[],
  collectedAt: string,
): Promise<XCollection> {
  // Four query-specific profiles keep the Actor comfortably inside its
  // background budget while still giving us a useful independent geo signal.
  const usernames = [...new Set(owners)].slice(0, 4);
  if (usernames.length === 0) {
    return {
      result: unavailableActor(
        X_ACTOR,
        'No relevant GitHub owner handles were available for X enrichment.',
      ),
      signals: [],
    };
  }
  const result = await runApifyActor(
    X_ACTOR,
    {
      mode: 'profiles',
      usernames,
      maxResults: usernames.length,
    },
    {
      waitSeconds: 40,
      timeoutSeconds: 45,
      memoryMb: 256,
      maxItems: usernames.length,
      maxTotalChargeUsd: 0.03,
    },
  );
  return { result, signals: normalizeTweets(result, collectedAt) };
}

function cachedOrStart<T>(
  cache: TtlCache<T>,
  pending: Map<string, Promise<T>>,
  key: string,
  work: () => Promise<T>,
  shouldCache: (value: T) => boolean,
): Promise<T> {
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const current = pending.get(key);
  if (current) return current;
  const started = work()
    .then((value) => {
      if (shouldCache(value)) cache.set(key, value);
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, started);
  return started;
}

async function settleWithin<T>(
  promise: Promise<T>,
  waitMs: number,
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), waitMs);
    }),
  ]);
}

export async function collectGlobalSignals(request: SearchRequest): Promise<GlobalSignalBundle> {
  const term = searchTermForRequest(request);
  const collectedAt = new Date().toISOString();

  const githubWork = cachedOrStart(
    githubCache,
    pendingGithub,
    term,
    () => collectGithub(term, collectedAt),
    (value) => value.repoCount > 0,
  );
  const trendsWork = cachedOrStart(
    trendsCache,
    pendingTrends,
    term,
    () => collectTrends(term),
    (value) => value.result.status === 'SUCCEEDED' || value.signals.length > 0,
  );
  const xWork = cachedOrStart(
    xCache,
    pendingX,
    term,
    async () => {
      const github = await githubWork;
      return collectXProfiles(
        github.repos.map((repo) => repo.owner),
        collectedAt,
      );
    },
    (value) => value.result.status === 'SUCCEEDED' || value.signals.length > 0,
  );

  const [trendsResult, githubResult, xResult] = await Promise.all([
    settleWithin(trendsWork, LIVE_SIGNAL_WAIT_MS),
    settleWithin(githubWork, LIVE_SIGNAL_WAIT_MS),
    settleWithin(xWork, LIVE_SIGNAL_WAIT_MS),
  ]);
  const trends = trendsResult?.signals ?? [];
  const github = githubResult?.locations ?? [];
  const tweets = xResult?.signals ?? [];

  return {
    term,
    collectedAt,
    trends,
    tweets,
    github,
    sources: [
      {
        source: 'google_trends',
        available: trends.length > 0,
        warming: trendsResult === null,
        warning:
          trendsResult === null || trends.length > 0
            ? null
            : 'No worldwide Google Trends geography was available for this phrase.',
        globalCount: trends.length,
        globalEvidenceUrl: trends.length > 0 ? googleTrendsUrl(term) : null,
      },
      {
        source: 'github',
        available: (githubResult?.repoCount ?? 0) > 0,
        warming: githubResult === null,
        warning:
          githubResult === null
            ? null
            : githubResult.repoCount === 0
              ? githubResult.warning ??
                'GitHub returned no relevant public repositories for this phrase.'
              : github.length === 0
                ? 'Relevant repositories were found, but their owners did not publish usable locations.'
                : null,
        globalCount: githubResult?.repoCount ?? 0,
        globalEvidenceUrl: githubResult?.evidenceUrl ?? null,
      },
      {
        source: 'x',
        available: tweets.length > 0,
        warming: xResult === null,
        warning:
          xResult === null || tweets.length > 0
            ? null
            : 'No relevant public X profiles published a usable location.',
        globalCount: tweets.length,
        globalEvidenceUrl: tweets[0]?.url ?? null,
      },
    ],
  };
}

function accumulatorFor(
  map: Map<string, CityAccumulator>,
  city: MarketCity,
): CityAccumulator {
  const current = map.get(city.id);
  if (current) return current;
  const next: CityAccumulator = {
    city,
    trends: [],
    tweets: [],
    github: [],
    prepared: false,
  };
  map.set(city.id, next);
  return next;
}

function evidenceStatus(items: Evidence[]): Status {
  if (items.some((item) => item.status === 'observed')) return 'observed';
  if (items.some((item) => item.status === 'estimated')) return 'estimated';
  return 'prepared';
}

function sourceSignal(
  source: MarketMomentumSignal['source'],
  label: string,
  value: number | null,
  displayValue: string,
  basis: MarketMomentumSignal['basis'],
  observedAt: string,
  evidenceIds: string[],
  available: boolean,
): MarketMomentumSignal {
  return {
    source,
    label,
    value,
    displayValue,
    basis,
    observedAt,
    evidenceIds,
    status: available ? (basis === 'city' ? 'observed' : 'estimated') : 'unavailable',
  };
}

// `place` es la geografía que la evidencia respalda (ciudad confirmada o, para
// una hipótesis de exploración, el país): el borrador no afirma más que eso.
function buildCampaign(
  request: SearchRequest,
  opportunityId: string,
  place: string,
  profile: string[],
): CampaignDraft {
  const product = compact(request.product || 'your developer product', 90);
  const audience = profile.slice(0, 2).join(' + ') || 'developers';
  return {
    id: `camp-${opportunityId}`,
    opportunityId,
    title: `${place} × ${product}`,
    variantA: compact(
      `Bring ${product} to ${place}: a hands-on session for ${audience} who want a workflow they can test the same day.`,
      320,
    ),
    variantB: compact(
      `Building with ${audience} in ${place}? Leave with one working ${product} playbook—not another product pitch.`,
      320,
    ),
  };
}

function scoreBreakdown(
  trend: number | null,
  x: number | null,
  github: number | null,
  confidence: number | null,
  combined: number,
): { community: CommunityBreakdown; theme: ThemeBreakdown } {
  return {
    community: {
      stackOverlap: github,
      cadenceReliability: null,
      access: x,
      exclusivityGap: null,
      durability: null,
      confidence,
    },
    theme: {
      momentum: combined,
      criticalPath: trend,
      communityCapability: github,
      saturationGap: null,
    },
  };
}

// Desempate determinístico del orden oficial (ticket 06): ante empate exacto
// (mismo score o, en la rama de ubicación, misma distancia) decide el id
// estable de la oportunidad. Así el orden nunca depende del orden de llegada
// de las señales de los proveedores, y ninguna etapa posterior (la redacción
// incluida) lo modifica. Comparación por puntos de código, ajena al locale.
function byStableId(a: Opportunity, b: Opportunity): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function selectGlobalTopThree(ranked: Opportunity[]): Opportunity[] {
  const selected: Opportunity[] = [];
  const countries = new Set<string>();
  for (const opportunity of ranked) {
    const code = opportunity.market?.countryCode ?? opportunity.market?.country ?? '';
    if (countries.has(code)) continue;
    selected.push(opportunity);
    countries.add(code);
    if (selected.length === 3) return selected;
  }
  for (const opportunity of ranked) {
    if (selected.some((item) => item.id === opportunity.id)) continue;
    selected.push(opportunity);
    if (selected.length === 3) break;
  }
  return selected;
}

export function rankGlobalMarkets(
  request: SearchRequest,
  bundle: GlobalSignalBundle,
): SearchResponse {
  const accumulators = new Map<string, CityAccumulator>();
  for (const trend of bundle.trends) accumulatorFor(accumulators, trend.city).trends.push(trend);
  for (const tweet of bundle.tweets) accumulatorFor(accumulators, tweet.city).tweets.push(tweet);
  for (const github of bundle.github) accumulatorFor(accumulators, github.city).github.push(github);

  const sortedPrepared = [...MARKET_CITIES].sort((a, b) => b.hubWeight - a.hubWeight);
  const representedCountries = new Set(
    [...accumulators.values()].map((item) => item.city.countryCode),
  );
  for (const city of sortedPrepared) {
    if (accumulators.size >= 8) break;
    if (representedCountries.has(city.countryCode)) continue;
    const accumulator = accumulatorFor(accumulators, city);
    accumulator.prepared = true;
    representedCountries.add(city.countryCode);
  }

  const maxTweetCount = Math.max(1, ...[...accumulators.values()].map((item) => item.tweets.length));
  const maxTweetEngagement = Math.max(
    1,
    ...[...accumulators.values()].map((item) =>
      item.tweets.reduce((sum, tweet) => sum + Math.log1p(tweet.engagement), 0),
    ),
  );
  const maxGithubCount = Math.max(1, ...[...accumulators.values()].map((item) => item.github.length));
  const maxGithubStars = Math.max(
    1,
    ...[...accumulators.values()].map((item) =>
      item.github.reduce((sum, repo) => sum + Math.log1p(repo.stars), 0),
    ),
  );
  const capabilities = requestCapabilities(request).slice(0, 3);
  const evidence: Record<string, Evidence> = {};

  const opportunities = [...accumulators.values()].map((accumulator): Opportunity => {
    const { city } = accumulator;
    // La ciudad solo se afirma cuando alguna fuente la nombra (alcance urbano)
    // o cuando es un candidato curado explícitamente etiquetado como prepared.
    // Con señales solo de país/región queda como hipótesis de exploración.
    const cityBacked =
      accumulator.prepared ||
      accumulator.trends.some((item) => item.basis === 'city') ||
      accumulator.tweets.some((item) => item.geoScope === 'city') ||
      accumulator.github.some((item) => item.geoScope === 'city');
    const marketLabel = cityBacked ? city.city : city.country;
    const trendValue =
      accumulator.trends.length > 0
        ? Math.max(...accumulator.trends.map((item) => item.value)) / 100
        : null;
    const tweetEngagement = accumulator.tweets.reduce(
      (sum, item) => sum + Math.log1p(item.engagement),
      0,
    );
    const xValue =
      accumulator.tweets.length > 0
        ? clamp01(
            (accumulator.tweets.length / maxTweetCount) * 0.7 +
              (tweetEngagement / maxTweetEngagement) * 0.3,
          )
        : null;
    const githubStars = accumulator.github.reduce(
      (sum, item) => sum + Math.log1p(item.stars),
      0,
    );
    const githubValue =
      accumulator.github.length > 0
        ? clamp01(
            (accumulator.github.length / maxGithubCount) * 0.55 +
              (githubStars / maxGithubStars) * 0.45,
          )
        : null;

    const weighted = [
      { value: trendValue, weight: 0.55 },
      { value: xValue, weight: 0.25 },
      { value: githubValue, weight: 0.15 },
      { value: city.hubWeight, weight: 0.05 },
    ].filter((item): item is { value: number; weight: number } => item.value != null);
    const combined =
      weighted.reduce((sum, item) => sum + item.value * item.weight, 0) /
      weighted.reduce((sum, item) => sum + item.weight, 0);
    const hasLiveGeo =
      accumulator.trends.length + accumulator.tweets.length + accumulator.github.length > 0;
    const liveSourceWeight =
      (trendValue == null ? 0 : 0.55) +
      (xValue == null ? 0 : 0.25) +
      (githubValue == null ? 0 : 0.15);
    // A single estimated source can nominate a market, but cannot manufacture
    // a 90+ score. Coverage approaches 1 only when independent sources agree.
    const sourceCoverage = liveSourceWeight / 0.95;
    const calibrated = combined * (0.4 + sourceCoverage * 0.6);
    const score = hasLiveGeo
      ? Math.round(40 + calibrated * 55)
      : Math.round(28 + city.hubWeight * 12);

    const reasons: Reason[] = [];
    const cityEvidence: Evidence[] = [];
    const trendIds = accumulator.trends.slice(0, 2).map((item) => {
      const id = stableId('ev-trends', `${bundle.term}:${city.id}:${item.geoLabel}`);
      evidence[id] = {
        id,
        source: 'google_trends',
        kind: 'search_trend',
        url: item.url,
        title: `Google Trends · ${item.geoLabel}`,
        observedAt: bundle.collectedAt,
        location: item.geoLabel,
        confidence: item.basis === 'city' ? 0.9 : 0.72,
        rightsBasis: 'public_web',
        status: item.basis === 'city' ? 'observed' : 'estimated',
        collector: 'apify',
        excerpt: `${bundle.term}: ${item.value}/100 relative search interest over the selected window.`,
      };
      cityEvidence.push(evidence[id]);
      return id;
    });
    if (trendIds.length > 0) {
      const best = Math.max(...accumulator.trends.map((item) => item.value));
      const basis = accumulator.trends.some((item) => item.basis === 'city')
        ? city.city
        : city.country;
      reasons.push({
        text: `Google Trends shows ${best}/100 relative interest for “${bundle.term}” in ${basis}.`,
        evidenceIds: trendIds,
      });
    }

    const tweetIds = accumulator.tweets.slice(0, 3).map((item) => {
      const id = stableId('ev-x', item.url);
      // Solo un lugar etiquetado a nivel ciudad cuenta como observación urbana;
      // la evidencia conserva la declaración de la fuente, no la ciudad resuelta.
      const urbanObservation = item.basis === 'city' && item.geoScope === 'city';
      evidence[id] = {
        id,
        source: 'x',
        kind: 'social_post',
        url: item.url,
        title:
          item.kind === 'profile'
            ? `Public X profile · ${item.declaredLocation}`
            : `Public X signal · ${item.declaredLocation}`,
        observedAt: item.observedAt,
        location: item.declaredLocation,
        confidence: urbanObservation ? 0.8 : 0.55,
        rightsBasis: 'public_web',
        status: urbanObservation ? 'observed' : 'estimated',
        collector: 'apify',
        excerpt: item.text,
      };
      cityEvidence.push(evidence[id]);
      return id;
    });
    if (tweetIds.length > 0) {
      const declaredLocations = [...new Set(accumulator.tweets.map((item) => item.declaredLocation))].slice(0, 3);
      const profileCount = accumulator.tweets.filter(
        (item) => item.kind === 'profile',
      ).length;
      reasons.push({
        text:
          profileCount === accumulator.tweets.length
            ? `${profileCount} public X profile${
                profileCount === 1 ? '' : 's'
              } associated with relevant repository handles publicly list ${declaredLocations.join('; ')}.`
            : `${accumulator.tweets.length} public X signal${
                accumulator.tweets.length === 1 ? '' : 's'
              } carry a declared location (${declaredLocations.join('; ')}).`,
        evidenceIds: tweetIds,
      });
    }

    const githubIds = accumulator.github.slice(0, 3).map((item) => {
      const id = stableId('ev-github', `${item.profileUrl}:${item.repoName}`);
      evidence[id] = {
        id,
        source: 'github',
        kind: 'repo_activity',
        url: item.profileUrl,
        title: `${item.repoName} · public owner location`,
        observedAt: item.observedAt,
        location: item.location,
        confidence: 0.55,
        rightsBasis: 'public_api',
        status: 'estimated',
        collector: 'apify',
        excerpt: `A relevant public repository owner lists “${item.location}”. This is a supply-side signal, not a user count.`,
      };
      cityEvidence.push(evidence[id]);
      return id;
    });
    if (githubIds.length > 0) {
      // La razón repite lo declarado por los owners (que puede ser un país o
      // una región), sin traducirlo a la ciudad resuelta.
      const declaredLocations = [...new Set(accumulator.github.map((item) => item.location))].slice(0, 3);
      reasons.push({
        text: `${accumulator.github.length} owner${
          accumulator.github.length === 1 ? '' : 's'
        } of relevant GitHub repositories publicly list ${declaredLocations.join('; ')}.`,
        evidenceIds: githubIds,
      });
    }

    if (reasons.length === 0) {
      const id = `ev-prepared-${city.id}`;
      evidence[id] = {
        id,
        source: 'seed',
        kind: 'prepared_fixture',
        url: null,
        title: `${city.city} developer-hub baseline`,
        observedAt: bundle.collectedAt,
        location: `${city.city}, ${city.country}`,
        confidence: 0.3,
        rightsBasis: 'manual_curation',
        status: 'prepared',
        collector: 'prepared',
        excerpt: 'Prepared fallback used only when live providers do not cover enough distinct markets.',
      };
      cityEvidence.push(evidence[id]);
      reasons.push({
        text: `${city.city} remains a prepared developer-hub candidate while live geographic evidence is incomplete.`,
        evidenceIds: [id],
      });
    }

    const avgConfidence =
      cityEvidence.reduce((sum, item) => sum + item.confidence, 0) /
      Math.max(1, cityEvidence.length);
    const sourceCount = [trendValue, xValue, githubValue].filter((value) => value != null).length;
    const confidence = hasLiveGeo
      ? Math.round(Math.min(92, avgConfidence * 70 + (sourceCount / 3) * 25))
      : 30;
    const trendBasis = accumulator.trends.some((item) => item.basis === 'city')
      ? 'city'
      : 'country';
    const sourceMap = new Map(bundle.sources.map((source) => [source.source, source]));
    const momentumSignals: MarketMomentumSignal[] = [
      sourceSignal(
        'google_trends',
        'Search interest',
        trendValue == null ? null : Math.round(trendValue * 100),
        trendValue == null ? 'No geographic result' : `${Math.round(trendValue * 100)}/100`,
        trendBasis,
        bundle.collectedAt,
        trendIds,
        trendValue != null,
      ),
      sourceSignal(
        'github',
        'Technical activity',
        githubValue == null ? null : Math.round(githubValue * 100),
        accumulator.github.length > 0
          ? `${accumulator.github.length} located repo owner${
              accumulator.github.length === 1 ? '' : 's'
            }`
          : `${sourceMap.get('github')?.globalCount ?? 0} relevant repos globally`,
        accumulator.github.length > 0
          ? accumulator.github.some((item) => item.geoScope === 'city')
            ? 'profile_location'
            : 'country'
          : 'global',
        bundle.collectedAt,
        githubIds,
        (sourceMap.get('github')?.globalCount ?? 0) > 0,
      ),
      sourceSignal(
        'x',
        'Developer conversation',
        xValue == null ? null : Math.round(xValue * 100),
        accumulator.tweets.length > 0
          ? `${accumulator.tweets.length} location-matched post${
              accumulator.tweets.length === 1 ? '' : 's'
            }`
          : 'No location-matched posts',
        accumulator.tweets.some((item) => item.basis === 'city' && item.geoScope === 'city')
          ? 'city'
          : accumulator.tweets.length === 0 ||
              accumulator.tweets.some((item) => item.geoScope === 'city')
            ? 'profile_location'
            : 'country',
        bundle.collectedAt,
        tweetIds,
        accumulator.tweets.length > 0,
      ),
    ];

    const distance =
      request.location != null
        ? distanceMiles(
            { lat: request.location.lat, lng: request.location.lng },
            { lat: city.lat, lng: city.lng },
          )
        : null;
    const id = `opp-global-${city.id}`;
    const leadingReason = reasons[0]?.text ?? `Developer demand signal in ${marketLabel}.`;

    return {
      id,
      title: `${marketLabel} developer market`,
      subtitle: cityBacked
        ? `${city.city} · ${city.country}`
        : `${city.country} · exploring ${city.city}`,
      lat: city.lat,
      lng: city.lng,
      play: {
        headline: cityBacked
          ? `Test a developer activation in ${city.city} · ${compact(leadingReason, 120)}`
          : `Explore the ${city.country} market (city hypothesis: ${city.city}) · ${compact(leadingReason, 120)}`,
        communityId: `market-${city.id}`,
        themeId: `theme-${stableId('global', bundle.term)}`,
        eventId: null,
        audienceSpec: {
          targetSize: null,
          profile: capabilities,
          qualifier: 'Query-matched developers; exact audience size requires campaign instrumentation',
        },
      },
      score,
      breakdown: scoreBreakdown(
        trendValue,
        xValue,
        githubValue,
        avgConfidence,
        combined,
      ),
      reasons,
      roi: {
        tierPriceUsd: null,
        expectedAttendance: null,
        icpFitRate: null,
        icpFitBasis: null,
        costPerQualifiedDev: null,
        band: null,
        note: 'Pricing not collected',
      },
      confidence,
      status: evidenceStatus(cityEvidence),
      humanValidated: false,
      distanceMiles: distance == null ? null : Math.round(distance * 10) / 10,
      market: {
        // null = ciudad pendiente: las señales solo respaldan país/región y la
        // ciudad del catálogo queda como hipótesis de exploración etiquetada.
        city: cityBacked ? city.city : null,
        explorationCity: cityBacked ? null : city.city,
        country: city.country,
        countryCode: city.countryCode,
      },
      momentumSignals,
      event: null,
      campaign: buildCampaign(request, id, marketLabel, capabilities),
    };
  });

  opportunities.sort((a, b) => {
    if (
      request.location &&
      a.distanceMiles != null &&
      b.distanceMiles != null &&
      Math.abs(a.score - b.score) <= 5
    ) {
      return a.distanceMiles - b.distanceMiles || byStableId(a, b);
    }
    return b.score - a.score || byStableId(a, b);
  });
  // Rank is attached by the legacy adapter; array order is canonical here.
  const top = selectGlobalTopThree(opportunities).map((opportunity) => ({
    ...opportunity,
    score: Math.max(0, Math.min(100, opportunity.score)),
  }));

  const resolvedEvidence: Record<string, Evidence> = {};
  for (const opportunity of top) {
    const ids = new Set([
      ...opportunity.reasons.flatMap((reason) => reason.evidenceIds),
      ...(opportunity.momentumSignals ?? []).flatMap((signal) => signal.evidenceIds),
    ]);
    for (const id of ids) {
      if (evidence[id]) resolvedEvidence[id] = evidence[id];
    }
  }

  const sourcesUsed = bundle.sources
    .filter((source) => source.available)
    .map((source) => source.source as EvidenceSource);
  const sourcesFailed = bundle.sources
    .filter((source) => !source.available)
    .map((source) => source.source as EvidenceSource);
  const warmingSources = bundle.sources.filter((source) => source.warming);
  const sourceLabel = (source: EvidenceSource): string =>
    source === 'google_trends'
      ? 'Google Trends'
      : source === 'github'
        ? 'GitHub'
        : source === 'x'
          ? 'X'
          : source;
  const provisional = top.some((item) => item.status === 'prepared');
  const warnings: string[] = [];
  if (warmingSources.length > 0) {
    const readyLabels = bundle.sources
      .filter((source) => source.available)
      .map((source) => sourceLabel(source.source));
    const warmingLabels = warmingSources.map((source) =>
      sourceLabel(source.source),
    );
    warnings.push(
      `Live ranking${
        readyLabels.length > 0 ? ` from ${readyLabels.join(' and ')}` : ''
      }; ${warmingLabels.join(
        ' and ',
      )} ${
        warmingLabels.length === 1 ? 'is' : 'are'
      } still loading and will refresh automatically.${
        provisional ? ' Some markets are provisional for now.' : ''
      }`,
    );
  } else if (sourcesFailed.length > 0) {
    const failedLabels = bundle.sources
      .filter((source) => !source.available)
      .map((source) => sourceLabel(source.source));
    warnings.push(
      `Ranking uses ${
        sourcesUsed.map((source) => sourceLabel(source)).join(' and ') ||
        'provisional market coverage'
      }; ${failedLabels.join(
        ' and ',
      )} did not return enough public location data for this query.${
        provisional ? ' Some markets remain provisional.' : ''
      }`,
    );
  } else if (provisional) {
    warnings.push(
      'Some markets remain provisional because live evidence does not yet cover three countries.',
    );
  }
  if (request.location) {
    warnings.push(
      'Shared location is used only as a tie-breaker; it never changes the market score.',
    );
  }

  return {
    requestId: `req-global-${crypto.randomUUID().slice(0, 8)}`,
    query: request,
    opportunities: top,
    evidence: resolvedEvidence,
    coverage: {
      eventsEvaluated: 0,
      communitiesEvaluated: 0,
      organizersEvaluated: 0,
      themesEvaluated: opportunities.length,
      sourcesUsed,
      sourcesFailed,
    },
    warnings,
    generatedAt: bundle.collectedAt,
    degraded:
      sourcesFailed.length > 0 ||
      warmingSources.length > 0 ||
      top.some((item) => item.status === 'prepared'),
    locationContext: request.location
      ? {
          source: request.location.source,
          lat: request.location.lat,
          lng: request.location.lng,
          locality: request.location.locality ?? null,
          updatedAt: request.location.updatedAt ?? null,
          scorePolicy: 'tie_break_only',
        }
      : null,
  };
}

export async function searchGlobalMarkets(request: SearchRequest): Promise<SearchResponse> {
  const bundle = await collectGlobalSignals(request);
  const ranked = rankGlobalMarkets(request, bundle);
  const withLiveEvents = await enrichWithExaEvents(request, ranked);
  return reasonWithGemini(request, withLiveEvents);
}
