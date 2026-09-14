// DP-07: lectura factual compartida, guardada con el snapshot. Ausente en
// snapshots anteriores; nunca se reconstruye historia con la política actual.
export interface ComparisonEvidenceRef {
  editionId: string;
  editionRevisionId: string;
  claimRevisionIds: string[];
  relationshipIds: string[];
  sourceIds: string[];
}
export interface ComparisonReason {
  text: string;
  basis: ComparisonEvidenceRef[];
}
export interface AlternativeReading {
  editionId: string;
  relevance: ComparisonReason;
  antecedents: ComparisonReason[];
  modality: ComparisonReason & { status: 'published' | 'proposed' | 'pending' };
  evidenceQuality: { status: 'supported' | 'limited' | 'insufficient'; note: string };
  cost: string;
  nextQuestion: string;
  matchedCriteria: string[];
}
export interface ComparisonReading {
  version: 'research-comparison/1';
  alternatives: AlternativeReading[];
  priority: {
    kind: 'investigate_first' | 'unordered' | 'insufficient';
    editionIds: string[];
    explanation: string;
    criteria: string[];
  };
  differences: {
    previousSnapshotId: string;
    briefChanges: { field: string; before: string; after: string }[];
    alternatives: { editionId: string; changes: string[] }[];
    note: string;
  } | null;
}
