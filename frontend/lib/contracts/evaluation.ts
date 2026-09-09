// Contratos versionados del recorrido de evaluación persistida (ticket 07).
//
// Solo tipos e interfaces: cero lógica, cero imports de runtime (misma regla
// que growxth.ts). La validación de runtime vive en ./evaluation-validation.ts;
// la proyección de lectura para la UI, en lib/api/opportunity-adapter.ts.
//
// Principios que estos contratos hacen estructurales:
// - La incertidumbre se conserva: «desconocido» y «pendiente» son estados
//   explícitos, nunca 0, hoy, una ciudad o un default del contrato legado.
// - Cada payload persistible lleva `contractVersion`. Un lector que no conoce
//   la versión rechaza el payload; jamás la interpreta como la actual.
// - Las reglas de estos contratos son de OBJETO (forma y coherencia interna).
//   La integridad relacional —pertenencia al tenant, existencia de los ids
//   referenciados— se comprueba en los tickets 08 y 09, no acá: un `sourceIds`
//   con un id irresoluble es un objeto válido con una referencia por resolver.
// - DECISIÓN ABIERTA D1 (objetivo/éxito del comprador) y D2 (política numérica)
//   se representan explícitamente (`confirmation: 'provisional'`,
//   `successDefinition: pending`, `policy: none`); no bloquean estos contratos
//   ni se resuelven inventando pesos.

import type { NarrativeState } from './growxth';

// ============ Versión ============

// Versiones conocidas del conjunto de contratos. Al introducir la «2» se agrega
// el literal acá y el lector decide explícitamente cómo migrar; mientras tanto
// cualquier otra versión se rechaza.
export type EvaluationContractVersion = '1';

// ============ Piezas compartidas ============

// Alcance geográfico de un dato. Una localización 'country' o 'region' NUNCA
// coloca un evento en una ciudad; 'unknown' = alcance por confirmar.
export type GeoScope = 'venue' | 'city' | 'region' | 'country' | 'global' | 'unknown';

// Estado de un claim: separa lo anunciado por el organizador de lo reportado
// por terceros, lo observado directamente, lo inferido por el sistema, lo
// confirmado por revisión, lo pendiente de soporte y lo contradicho por otra
// evidencia. Observar que una fuente reporta un resultado no verifica el
// resultado.
export type ClaimStatus =
  | 'announced'
  | 'reported'
  | 'observed'
  | 'inferred'
  | 'confirmed'
  | 'pending'
  | 'contradicted';

// Fecha declarada con zona o ambigüedad explícita. La ambigüedad no se
// resuelve inventando zona ni sustituyendo por la fecha actual.
export type DeclaredDate =
  | { precision: 'instant'; iso: string; timezone: string }
  | { precision: 'date_only'; date: string; timezone: string | null } // sin zona = día ambiguo entre offsets
  | { precision: 'ambiguous'; text: string; earliest: string | null; latest: string | null }
  | { precision: 'unknown' };

// Importe con su incertidumbre. 'unknown' jamás se interpreta como 0.
export type MoneyClaim =
  | { status: 'quoted'; amount: number; currency: string; sourceIds: string[] } // cotizado/publicado, con soporte
  | { status: 'estimated'; amount: number; currency: string; basis: string }
  | { status: 'unknown'; note: string | null };

// Condición pendiente de un candidato: información faltante que condiciona la
// elegibilidad o la decisión. Un puntaje alto no la resuelve.
export interface PendingCondition {
  id: string;
  description: string;
  blocksEligibility: boolean;
  resolution: string | null; // qué respuesta o confirmación la resolvería
}

// ============ Perfil versionado ============

// Presupuesto: 'declared' con moneda explícita (0 es un cero declarado real);
// 'unknown' es desconocido y NUNCA se lee como cero.
export type BudgetDeclaration =
  | { status: 'declared'; amount: number; currency: string }
  | { status: 'unknown'; note: string | null };

export type ObjectiveKind = 'adoption' | 'feedback' | 'hiring' | 'awareness';

// Objetivo del comprador (D1): provisional hasta que el comprador lo confirme.
// La definición de éxito puede estar pendiente sin convertirse en adopción ni
// en ninguna otra por defecto. Es texto: definirla no implementa su medición.
export interface ObjectiveDeclaration {
  kind: ObjectiveKind;
  confirmation: 'provisional' | 'confirmed';
  successDefinition: { status: 'defined'; text: string } | { status: 'pending' };
}

export interface AudienceDeclaration {
  description: string; // como la declaró el cliente
  profiles: string[]; // segmentos ("Backend / Python", "2+ años")
}

// Ventana de evaluación. null = límite pendiente/no declarado; ausente no
// significa «desde hoy».
export interface EvaluationWindow {
  from: string | null; // ISO 8601
  to: string | null;
}

// Empresa comparable/competidora del perfil: indicada por el cliente y, por
// separado, confirmada su identidad por el cliente. La similitud nominal no
// confirma nada.
export interface ComparableCompanyRef {
  companyId: string | null; // vínculo al catálogo cuando existe; null = sin vincular
  name: string;
  relation: 'comparable' | 'competitor';
  confirmation: 'indicated' | 'confirmed';
}

export interface EvaluationProfile {
  contractVersion: EvaluationContractVersion;
  id: string;
  profileVersion: number; // ≥ 1; una reevaluación crea otra versión, no reescribe
  createdAt: string;
  product: string;
  audience: AudienceDeclaration;
  stack: string[];
  budget: BudgetDeclaration;
  window: EvaluationWindow;
  restrictions: string[];
  objective: ObjectiveDeclaration;
  comparableCompanies: ComparableCompanyRef[];
}

// ============ Fuente, claim y revisión ============

// Fuente de soporte. Proveedor (quién publica) y colector (quién obtuvo) son
// campos separados; la fecha de obtención es distinta de la de publicación y
// de la fecha del evento (que viaja en el claim). Público no equivale a
// licencia de republicación: las restricciones de uso conocidas se declaran.
export interface SourceRecord {
  contractVersion: EvaluationContractVersion;
  id: string;
  url: string | null;
  locator: string | null; // localizador de soporte dentro de la fuente (ancla, selector, página)
  provider: string;
  collector: string;
  fetchedAt: string; // obtención
  publishedAt: string | null; // publicación (si se conoce)
  method: string; // cómo se obtuvo (http_get, manual_curation, interview…)
  geoScope: GeoScope; // alcance geográfico de lo que la fuente respalda
  content:
    | { kind: 'excerpt'; excerpt: string } // extracto permitido
    | { kind: 'hash'; sha256: string } // cuando no se puede conservar extracto
    | { kind: 'none' };
  usageRestrictions: string[];
}

// Sujeto de un claim: identidades separadas, nunca intercambiables.
export type ClaimSubject =
  | { type: 'organizer'; organizerId: string }
  | { type: 'edition'; editionId: string }
  | { type: 'company'; companyId: string }
  | { type: 'participation'; participationId: string }
  | { type: 'profile'; profileId: string };

// Valor tipado del claim, con unidad/moneda/alcance explícitos. 'pending'
// conserva el hueco sin rellenarlo.
export type ClaimValue =
  | { kind: 'text'; text: string }
  | { kind: 'number'; amount: number; unit: string }
  | { kind: 'money'; amount: number; currency: string }
  | { kind: 'date'; date: DeclaredDate }
  | { kind: 'location'; scope: GeoScope; name: string | null }
  | { kind: 'pending'; note: string | null };

// Cada ClaimRevision es una revisión inmutable de un claim: `claimId` es la
// identidad estable a través de revisiones y `previousRevisionId` la relación
// de revisión (null = primera). Una inferencia nunca se promociona por votos:
// promoverla es una nueva revisión con otro estado y su método/revisor.
export interface ClaimRevision {
  contractVersion: EvaluationContractVersion;
  id: string; // id de ESTA revisión
  claimId: string;
  subject: ClaimSubject;
  attribute: string; // 'access', 'audience', 'cost:<partida>', …
  value: ClaimValue;
  status: ClaimStatus;
  sourceIds: string[]; // evidencia vinculada; su existencia es integridad relacional (08/09)
  method: string | null; // método de extracción/verificación
  note: string | null; // p.ej. qué contradice a qué cuando status = 'contradicted'
  reviewer: string | null; // null = ingesta inicial sin revisión humana
  reviewedAt: string;
  previousRevisionId: string | null;
}

// ============ Identidades del foco SF ============
// Organizador, edición, empresa y relación con rol documentado son identidades
// SEPARADAS: cada una tiene su registro y sus claims; no se fusionan por
// similitud de nombre ni se derivan unas de otras.

// Alias propuesto (similitud, por confirmar) ≠ alias confirmado (con soporte).
export interface OrganizerAlias {
  alias: string;
  confirmation: 'proposed' | 'confirmed';
  sourceIds: string[];
}

export interface OrganizerRevision {
  contractVersion: EvaluationContractVersion;
  id: string; // id de esta revisión
  organizerId: string; // identidad estable; homónimos NO se fusionan
  displayName: string;
  aliases: OrganizerAlias[];
  claimRevisionIds: string[];
  revisedAt: string;
  previousRevisionId: string | null;
  // Deliberadamente SIN puntaje de reputación: afinidad, reputación y resultado
  // comercial no son campos intercambiables ni se agregan en un índice único.
}

export interface EditionLocation {
  scope: GeoScope;
  name: string | null; // nombre en el alcance respaldado; 'country' no coloca en ciudad
}

export interface EventEditionRevision {
  contractVersion: EvaluationContractVersion;
  id: string; // id de esta revisión
  editionId: string; // identidad interna estable de la edición
  organizerIds: string[]; // organiza/coorganiza (el rol fino va por claims)
  name: string;
  canonicalUrl: string | null; // URL canónica admitida
  provider: string | null; // 'luma', …
  startDate: DeclaredDate;
  location: EditionLocation;
  coordinates: { lat: number; lng: number } | null; // solo con respaldo urbano; null = sin punto en el mapa
  claimRevisionIds: string[];
  revisedAt: string;
  previousRevisionId: string | null;
}

export interface CompanyRecord {
  contractVersion: EvaluationContractVersion;
  id: string; // identidad estable de la empresa
  name: string;
  websiteUrl: string | null;
}

// Rol documentado de una empresa en una edición. 'logo_present' registra
// exactamente eso: un logo. Un logo ambiguo no crea patrocinio pagado ni
// resultados.
export type ParticipationRole =
  | 'paid_sponsor'
  | 'in_kind_sponsor'
  | 'speaker'
  | 'host'
  | 'co_organizer'
  | 'logo_present';

// Tres niveles NO intercambiables: qué se anunció, qué se reportó sobre la
// ejecución y qué resultado comercial reportó alguien (con fuente). Un
// resultado desconocido queda desconocido: no se estima desde asistencia,
// proyectos ni marcas, y la ausencia de datos no significa fracaso.
export interface ParticipationRevision {
  contractVersion: EvaluationContractVersion;
  id: string; // id de esta revisión
  participationId: string; // identidad estable de la relación empresa↔edición
  companyId: string;
  editionId: string;
  role: ParticipationRole;
  roleStatus: ClaimStatus;
  sourceIds: string[];
  announcedDetail: string | null;
  reportedExecution: string | null;
  commercialOutcome:
    | { status: 'reported'; summary: string; sourceIds: string[] }
    | { status: 'unknown' };
  revisedAt: string;
  previousRevisionId: string | null;
}

// ============ Snapshot inmutable ============

// Investigación de organizadores ≠ comparación de inversiones: son lecturas
// distintas del mismo material y no se confunden en un solo tipo.
export type SnapshotKind = 'organizer_research' | 'investment_comparison';

// «Sin política» es un estado explícito (D2 pendiente), no un score cero.
export type PolicyRef =
  | { status: 'applied'; policyId: string; policyVersion: string }
  | { status: 'none'; note: string };

export type EligibilityResult =
  | { status: 'eligible' }
  | { status: 'conditional'; note: string | null } // condicionado por información faltante
  | { status: 'excluded'; reasons: string[] }; // fecha vencida, incompatibilidad confirmada…

// Score solo cuando procede: con política aplicada. `sKnown` (0–100) y
// `coverage` (0–1) no se denominan probabilidad de éxito. 'not_scored'
// distingue el motivo; jamás se representa como 0.
export type AlternativeScoring =
  | { status: 'scored'; sKnown: number; coverage: number; sensitivityNote: string | null }
  | {
      status: 'not_scored';
      reason: 'no_policy' | 'excluded_before_scoring' | 'insufficient_data';
      note: string | null;
    };

export interface SnapshotAlternative {
  editionId: string;
  organizerId: string | null; // null = organizador pendiente de identificar
  eligibility: EligibilityResult;
  conditions: PendingCondition[];
  scoring: AlternativeScoring;
}

// Orden oficial: 'ranked' solo con política aplicada; sin política el orden es
// de presentación y la pantalla debe diferenciarlo de un ranking.
export type SnapshotOrdering =
  | { kind: 'ranked'; policyId: string; policyVersion: string; editionIds: string[] }
  | { kind: 'presentation_only'; editionIds: string[]; note: string };

// «Sin candidato elegible» es un resultado legítimo de evaluación; un fallo
// técnico es otra cosa y no afirma nada sobre los eventos.
export type SnapshotOutcome =
  | { kind: 'completed' }
  | { kind: 'no_eligible_candidates'; reasons: string[] }
  | { kind: 'technical_failure'; error: string };

// El snapshot fija el perfil (id + versión) y las revisiones exactas de
// evidencia, organizadores, ediciones y relaciones sobre las que se evaluó.
// La redacción (NarrativeState, ticket 05) va aparte y nunca modifica el
// snapshot numérico ni sus fuentes.
export interface EvaluationSnapshot {
  contractVersion: EvaluationContractVersion;
  id: string;
  kind: SnapshotKind;
  profileId: string;
  profileVersion: number;
  evaluatedAt: string; // instante de evaluación
  claimRevisionIds: string[];
  organizerRevisionIds: string[];
  editionRevisionIds: string[];
  participationRevisionIds: string[];
  policy: PolicyRef;
  alternatives: SnapshotAlternative[];
  ordering: SnapshotOrdering;
  outcome: SnapshotOutcome;
  narrative: NarrativeState | null; // null = sin etapa de redacción
}

// ============ Decisión y campaña en borrador ============

// Condición registrada con la decisión: qué respuesta del organizador podría
// cambiarla. Una elección con condiciones abiertas sigue siendo condicional.
// Responsable y plazo se guardan SI SE CONOCEN (ticket 13): null es ausencia
// real, nunca un string vacío ni un default. Registrar la condición no envía
// ningún mensaje al organizador.
export interface DecisionCondition {
  id: string;
  description: string; // el dato/claim pendiente y la pregunta al organizador con su respuesta esperada
  answerWouldChangeTo: 'chosen' | 'discarded' | null;
  status: 'open' | 'resolved';
  resolvedNote: string | null;
  owner: string | null; // responsable de conseguir la respuesta; null = no se conoce
  dueBy: string | null; // plazo (día o instante ISO); null = no se conoce
}

// El autor lo resuelve el servidor desde la sesión; nunca se acepta del cuerpo
// de la petición. Descartar no es un outcome negativo; elegir no cambia la
// evidencia.
export interface EvaluationDecision {
  contractVersion: EvaluationContractVersion;
  id: string;
  snapshotId: string;
  editionId: string; // alternativa decidida
  verdict: 'chosen' | 'discarded' | 'pending';
  reasons: string[]; // nunca vacío
  conditions: DecisionCondition[];
  decidedBy: { userId: string; resolvedBy: 'server_session' };
  decidedAt: string;
  revision: number; // ≥ 1; una revisión nueva conserva las anteriores
  previousRevisionId: string | null;
}

export type CommitmentKind = 'estimate' | 'goal' | 'agreed';

// Compromiso del borrador: estimación ≠ objetivo ≠ compromiso acordado. Solo
// lo ACORDADO lleva confirmación — quién confirmó, cuándo, con qué método y
// con qué evidencia verificable (ticket 13) —; exigirla a una estimación la
// disfrazaría de acuerdo. Estimación y objetivo no se presentan como acuerdo.
export interface CampaignCommitment {
  id: string;
  description: string;
  kind: CommitmentKind;
  owner: string | null; // responsable
  dueBy: string | null; // plazo
  confirmation: { method: string; sourceIds: string[]; confirmedBy: string; confirmedAt: string } | null; // requerido sii kind = 'agreed'
}

export interface CampaignCostItem {
  id: string;
  label: string;
  amount: MoneyClaim;
}

// Borrador de campaña. Deliberadamente SIN costo total ni ROI: sumar partidas
// con faltantes inventa un total, y el ROI observado exigiría ingestión de
// outcomes, que no existe en este slice. La definición de éxito es texto.
export interface CampaignDraftRecord {
  contractVersion: EvaluationContractVersion;
  id: string;
  decisionId: string; // decisión de origen
  objective: string;
  successDefinition: string | null; // texto libre; null = pendiente
  modality:
    | { status: 'defined'; kind: 'sponsorship' | 'workshop' | 'co_hosted' | 'booth' | 'other'; detail: string | null }
    | { status: 'pending' };
  costItems: CampaignCostItem[];
  openQuestions: string[];
  commitments: CampaignCommitment[];
}

// ============ Lectura: bundle y proyección ============

// Agregado que una lectura desde PostgreSQL entrega a la proyección: el
// snapshot más las revisiones que referencia. La proyección no comprueba
// integridad relacional; una referencia irresoluble se proyecta como pendiente
// honesto, nunca como valor inventado.
export interface EvaluationReadBundle {
  profile: EvaluationProfile;
  snapshot: EvaluationSnapshot;
  claims: ClaimRevision[];
  sources: SourceRecord[];
  organizers: OrganizerRevision[];
  editions: EventEditionRevision[];
  companies: CompanyRecord[];
  participations: ParticipationRevision[];
  decision: EvaluationDecision | null;
  campaign: CampaignDraftRecord | null;
}

// Celda honesta de pantalla: valor con su estado, origen y alcance, o
// pendiente/ambigua con motivo. Sustituye los defaults engañosos del contrato
// legado (city: string, startsAt: string, score: number obligatorios).
export type ProjectedField =
  | {
      state: 'known';
      display: string;
      claimStatus: ClaimStatus | null; // null cuando el valor no viene de un claim
      scope: GeoScope | null;
      obtainedAt: string | null; // cuándo se obtuvo el soporte, si resuelve
      sourceIds: string[];
      pendingNote: string | null; // qué falta confirmar aunque haya valor
    }
  | { state: 'ambiguous'; display: string; note: string; sourceIds: string[] }
  | { state: 'pending'; note: string | null };

// Score proyectado: «sin política» y «sin puntuar» NUNCA llegan como 0.
export type ProjectedScore =
  | {
      state: 'scored';
      sKnown: number;
      coverage: number;
      sensitivityNote: string | null;
      policyId: string;
      policyVersion: string;
    }
  | { state: 'no_policy'; note: string }
  | { state: 'not_scored'; reason: string };

export interface OrganizerListItem {
  organizerId: string;
  displayName: string;
  confirmedAliases: string[];
  proposedAliases: string[]; // separados: un alias propuesto no identifica
  editionIds: string[];
}

export interface DossierClaimView {
  attribute: string;
  value: ProjectedField;
}

// Dossier de una alternativa: afirmaciones separadas (fecha, lugar, acceso,
// audiencia, organizador, costos), cada una con origen, obtención, alcance y
// qué falta confirmar.
export interface DossierView {
  editionId: string;
  name: string;
  organizer: ProjectedField;
  date: ProjectedField; // pendiente/ambigua explícita; jamás «hoy»
  location: ProjectedField; // conserva el alcance; país no se vuelve ciudad
  access: ProjectedField;
  audience: ProjectedField;
  costs: { label: string; value: ProjectedField }[];
  otherClaims: DossierClaimView[];
  eligibility: EligibilityResult;
  conditions: PendingCondition[];
  score: ProjectedScore;
}

export interface CampaignView {
  campaignId: string;
  decisionId: string;
  objective: string;
  successDefinition: ProjectedField;
  modality: ProjectedField;
  costItems: { label: string; value: ProjectedField }[];
  costCompleteness: 'all_items_valued' | 'has_unknown_items'; // sin total inventado en ningún caso
  openQuestions: string[];
  commitments: { description: string; kind: CommitmentKind; supported: boolean }[];
}

// Mapa local secundario: solo puntos con ubicación urbana respaldada y
// coordenadas. Lo demás sigue accesible en la lista, sin punto inventado.
export interface LocalMapView {
  points: { editionId: string; name: string; lat: number; lng: number; locationName: string }[];
  listedWithoutPoint: { editionId: string; name: string; reason: string }[];
}

export interface EvaluationSummaryView {
  outcome: SnapshotOutcome; // «sin evento elegible» ≠ error técnico, tal cual
  policy: PolicyRef;
  decision: { verdict: 'chosen' | 'discarded' | 'pending'; conditional: boolean; openConditions: number } | null;
}

// Proyección de lectura para dashboard, lista de organizadores, dossier,
// campaña y mapa local secundario. Conserva pendientes y ambigüedades: la
// pantalla decide cómo mostrarlos, no si existen.
export interface EvaluationReadProjection {
  contractVersion: EvaluationContractVersion;
  snapshotId: string;
  kind: SnapshotKind;
  evaluatedAt: string;
  ordering: SnapshotOrdering; // la UI diferencia presentación de ranking
  summary: EvaluationSummaryView;
  profile: {
    product: string;
    audience: string;
    budget: ProjectedField; // desconocido llega como pendiente, jamás como 0
    window: ProjectedField;
    objective: { kind: ObjectiveKind; confirmation: 'provisional' | 'confirmed' };
    successDefinition: ProjectedField; // pendiente no se vuelve 'adoption'
    comparableCompanies: { name: string; relation: 'comparable' | 'competitor'; confirmation: 'indicated' | 'confirmed' }[];
  };
  organizerList: OrganizerListItem[];
  dossiers: DossierView[];
  campaign: CampaignView | null;
  map: LocalMapView;
}
