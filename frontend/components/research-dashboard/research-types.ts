// Frontera de investigación SF: solo tipos; snapshot factual, sin política numérica.
import type { EvaluationProfile, CompanyRecord } from '../../lib/contracts/evaluation';
import type { EditionDossierRead, OrganizerDossierRead } from '../../lib/api/atlas-client';

export interface ResearchReason {
  attribute: string;
  text: string;
  sourceIds: string[];
  revisionIds: string[];
}
export interface ResearchCandidate {
  organizerId: string;
  displayName: string;
  reasons: ResearchReason[];
  dossier: OrganizerDossierRead;
  futureSfEditionIds: string[];
  pending: string[];
}
export interface SfResearchResult {
  kind: 'sf_organizer_research';
  version: 1;
  evaluatedAt: string;
  criteria: { stack: string[]; audience: string; comparableCompanyIds: string[]; window: EvaluationProfile['window']; budget: EvaluationProfile['budget']; objective: EvaluationProfile['objective']; ordering: 'presentation_only' };
  coverage: { organizers: number; editions: number; sfEditions: number; matched: number; verifiedAt: string[]; material: string[] };
  catalogNote: string;
  candidates: ResearchCandidate[];
  editions: EditionDossierRead[];
}
export interface SavedOrganizerResearch {
  organizerId: string;
  runId: string;
  state: 'pending_research';
  savedAt: string;
}
export interface ResearchHome {
  runs: { runId: string; product: string; profileVersion: number; state: string; createdAt: string }[];
  companies: CompanyRecord[];
  saved: SavedOrganizerResearch[];
  coverage: { organizers: number; editions: number; verifiedAt: string[]; material: string[] };
}
