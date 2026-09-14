import type { ProviderConsumption, ResearchProgress, SourceRecord } from './evaluation.ts';

export const DISCOVERY_WORKFLOW = 'sf-discovery/1';
export const DISCOVERY_STEPS = ['validate_profile', 'discover_sources', 'publish_result'] as const;
export const DISCOVERY_RESERVATION_USD = 0.02;
export const DISCOVERY_LIMITS = { maxQueries: 3, resultsPerQuery: 5, requestTimeoutMs: 12000, durationMs: 45000 } as const;

export interface DiscoveryQuery {
  id: string;
  purpose: 'opportunities' | 'background' | 'conditions';
  text: string;
  questionIds: string[];
}
export interface DiscoveryPlan {
  version: 1;
  profileId: string;
  profileVersion: number;
  criteria: { product: string; audience: string; objective: string; window: { from: string | null; to: string | null }; city: string; timezone: string; formats: string[]; restrictions: string[] };
  queries: DiscoveryQuery[];
  limits: { maxQueries: number; resultsPerQuery: number; requestTimeoutMs: number; durationMs: number };
}
// A result is a proposed PAGE, not an event identity or a verified claim.
// DP-05 resolves its content; DP-06 can associate it with an actual edition.
export interface DiscoveryCandidate {
  id: string;
  canonicalUrl: string;
  requestedUrls: string[];
  title: string;
  sourceIds: string[];
  queryIds: string[];
  status: 'awaiting_reading';
}
export interface DiscoveryPage {
  url: string;
  canonicalUrl: string;
  title: string;
  publishedAt: string | null;
  author: string | null;
  excerpt: string | null;
  sourceId: string;
}
export interface DiscoveryResponse {
  requestId: string | null;
  pages: DiscoveryPage[];
  costUsd: number | null;
  discardedResults: number;
}
export interface DiscoveryOperation {
  id: string;
  query: DiscoveryQuery;
  state: 'dispatched' | 'succeeded' | 'failed' | 'uncertain';
  startedAt: string;
  finishedAt: string | null;
  limitation: string | null;
  response: DiscoveryResponse | null;
  consumption: ProviderConsumption;
}
export interface DiscoveryView {
  kind: 'source_discovery';
  plan: DiscoveryPlan;
  progress: ResearchProgress;
  candidates: DiscoveryCandidate[];
  sources: SourceRecord[];
  operations: DiscoveryOperation[];
  budget: {
    currency: 'USD';
    initiativeLimit: number;
    reservedByRun: number;
    remainingAfterLastReservation: number | null;
    reportedCost: number;
    unknownCostOperations: number;
    basis: 'conservative_reservations';
  };
}
