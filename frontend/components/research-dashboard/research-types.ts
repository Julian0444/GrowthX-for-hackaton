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
// Ticket 14: lista mínima de evaluaciones guardadas del tenant (runs de
// comparación con su snapshot oficial y las decisiones registradas). Es una
// lectura por identidad/perfil explícito; no hay búsqueda por texto.
export interface SavedEvaluationDecision {
  decisionId: string;
  editionId: string;
  verdict: 'chosen' | 'discarded' | 'pending';
  revision: number; // última revisión registrada
  decidedAt: string; // fecha original de esa revisión
  openConditions: number; // > 0 en una elección = elección condicional
  campaignId: string | null; // borrador confirmado con la última revisión
}
export interface SavedEvaluationProfile {
  profileId: string;
  lineageId: string;
  version: number;
  product: string;
  budget: EvaluationProfile['budget'];
  objective: EvaluationProfile['objective']['kind'];
  window: EvaluationProfile['window'];
}
export interface SavedEvaluation {
  runId: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  // Reevaluación: vínculo al run de comparación anterior (null en la primera).
  previousRunId: string | null;
  profile: SavedEvaluationProfile;
  editions: { editionId: string; name: string | null }[];
  snapshotId: string | null; // null mientras el worker no confirmó el snapshot
  evaluatedAt: string | null;
  decisions: SavedEvaluationDecision[];
}
export interface ResearchHome {
  runs: { runId: string; product: string; profileVersion: number; state: string; createdAt: string }[];
  companies: CompanyRecord[];
  saved: SavedOrganizerResearch[];
  coverage: { organizers: number; editions: number; verifiedAt: string[]; material: string[] };
  evaluations: SavedEvaluation[];
  // Perfiles con al menos una evaluación: opciones del filtro explícito.
  evaluationProfiles: SavedEvaluationProfile[];
  evaluationFilter: { profileId: string } | null;
}
