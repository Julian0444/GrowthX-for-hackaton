// Contrato v1 del matching entre un brief de sponsor y oportunidades
// publicadas por organizadores. Este archivo es la frontera compartida entre
// navegador y servidor: solo tipos, sin imports ni logica de runtime.
//
// Una coincidencia no predice ROI ni autoriza una compra. La banda de fit y el
// plan de medicion son una lectura deterministica, explicable y revisable por
// una persona antes de pedir una introduccion.

export type SponsorshipContractVersion = '1';

export type SponsorshipFormat =
  | 'hackathon_track'
  | 'workshop'
  | 'demo'
  | 'dinner'
  | 'booth';

export type SponsorshipGoal = 'adoption' | 'feedback' | 'hiring' | 'awareness';
export type SponsorshipFitBand = 'strong' | 'potential' | 'limited';
export type SponsorshipEvidenceConfidence = 'verified' | 'declared' | 'limited';

export type SponsorshipContribution =
  | { kind: 'cash'; amount: number; currency: string }
  | { kind: 'in_kind'; description: string };

export interface SponsorshipPackage {
  id: string;
  label: string;
  formats: SponsorshipFormat[];
  contribution: SponsorshipContribution;
  includes: string[];
  trackAvailable: boolean;
}

export interface SponsorshipAudience {
  description: string;
  estimatedSize: number | null;
  evidenceStatus: 'source_verified' | 'organizer_declared' | 'estimated';
  sourceUrl: string | null;
}

export interface SponsorshipOpportunity {
  contractVersion: SponsorshipContractVersion;
  id: string;
  status: 'open';
  organizerName: string;
  communityName: string;
  eventName: string;
  eventUrl: string | null;
  city: 'San Francisco';
  timezone: 'America/Los_Angeles';
  startsAt: string | null;
  audience: SponsorshipAudience;
  themes: string[];
  formats: SponsorshipFormat[];
  packages: SponsorshipPackage[];
  sponsorGoals: SponsorshipGoal[];
  notes: string | null;
  createdAt: string;
}

export interface SponsorshipOpportunityCreateBody {
  idempotencyKey: string;
  organizerName: string;
  communityName: string;
  eventName: string;
  eventUrl: string | null;
  city: 'San Francisco';
  startsAt: string | null;
  audience: SponsorshipAudience;
  themes: string[];
  formats: SponsorshipFormat[];
  packages: SponsorshipPackage[];
  sponsorGoals: SponsorshipGoal[];
  notes: string | null;
}

export interface SponsorshipMatchReason {
  kind: 'theme' | 'objective' | 'format' | 'budget' | 'evidence';
  label: string;
  detail: string;
}

export interface SponsorshipActivation {
  format: SponsorshipFormat;
  packageId: string | null;
  trackTheme: string | null;
  rationale: string;
}

export interface SponsorshipMeasurementMetric {
  id: string;
  label: string;
  definition: string;
  collectionMethod: string;
  timing: string;
}

export interface SponsorshipMeasurementPlan {
  objective: SponsorshipGoal;
  primaryOutcome: string;
  metrics: SponsorshipMeasurementMetric[];
  attributionWindow: string;
  privacyNote: string;
  caveat: string;
}

export interface SponsorshipMatch {
  contractVersion: SponsorshipContractVersion;
  opportunityId: string;
  sponsorRunId: string;
  fit: SponsorshipFitBand;
  evidenceConfidence: SponsorshipEvidenceConfidence;
  reasons: SponsorshipMatchReason[];
  gaps: string[];
  recommendedActivation: SponsorshipActivation;
  measurementPlan: SponsorshipMeasurementPlan;
}

export interface SponsorshipInterestCreateBody {
  idempotencyKey: string;
  sponsorRunId: string;
  message: string | null;
  // null conserva la recomendacion deterministica del servidor. Si la persona
  // elige otra activacion, debe pertenecer a la oportunidad publicada.
  activation: {
    format: SponsorshipFormat;
    packageId: string | null;
    trackTheme: string | null;
  } | null;
}

export interface SponsorshipInterestRequest {
  contractVersion: SponsorshipContractVersion;
  id: string;
  opportunityId: string;
  sponsorRunId: string;
  status: 'requested';
  message: string | null;
  activation: SponsorshipActivation;
  fitAtRequest: SponsorshipFitBand;
  evidenceConfidence: SponsorshipEvidenceConfidence;
  reasonsAtRequest: SponsorshipMatchReason[];
  gapsAtRequest: string[];
  measurementPlan: SponsorshipMeasurementPlan;
  requestedAt: string;
}

export interface SponsorshipMarketplaceItem {
  opportunity: SponsorshipOpportunity;
  match: SponsorshipMatch | null;
  interest: SponsorshipInterestRequest | null;
}

export interface SponsorshipMarketplaceResponse {
  contractVersion: SponsorshipContractVersion;
  sponsorRunId: string | null;
  opportunities: SponsorshipMarketplaceItem[];
}
