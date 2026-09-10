"use client"

// Panel del catálogo curado (ticket 09). Vive dentro del overlay del run
// recuperado: el «control mínimo» de selección del catálogo y los expedientes
// leídos desde PostgreSQL (el dashboard de descubrimiento es del ticket 10).
//
// Reglas de honestidad que este panel hace visibles:
// - «Evento futuro verificado» ≠ «todas sus promesas confirmadas»: la vigencia
//   y lo pendiente se muestran por separado; los faltantes llegan como
//   preguntas concretas.
// - Cada valor material abre su fuente (URL/localizador, obtención,
//   publicación, método, alcance) vía SourceRecordLinks.
// - Una contradicción muestra AMBAS revisiones con sus fuentes; nada se borra.
// - El mapa no es necesario para llegar acá; un evento sin respaldo urbano se
//   lista con el motivo de por qué no tiene punto.

import { useCallback, useEffect, useState } from "react"
import {
  fetchCatalogEditions,
  fetchEditionDossier,
  fetchOrganizerDossier,
  type CatalogEditionSummary,
  type CatalogListRead,
} from "@/lib/api/atlas-client"
import {
  projectEditionDossierView,
  projectOrganizerDossierView,
  type DossierParticipationView,
  type DossierValueView,
  type EditionDossierViewModel,
  type OrganizerDossierViewModel,
  type OrganizerEditionView,
} from "@/lib/api/opportunity-adapter"
import { SourceRecordLinks } from "./evidence-links"

const VALIDITY_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  past: "Expired",
  date_pending: "Date pending",
  date_ambiguous: "Date ambiguous",
}

const VALIDITY_COLOR: Record<string, string> = {
  upcoming: "#1f7a4d",
  past: "#8a2f1f",
  date_pending: "#8a6d1f",
  date_ambiguous: "#6b6b6b",
}

const STATUS_NOTE =
  "An upcoming verified event is not an event with every promise confirmed — pending items stay visible."

const OUTCOME_LABELS = { announced: "Announced", reported: "Reported execution", outcome: "Commercial result" }

function ValidityBadge({ validity, reason }: { validity: string; reason: string }) {
  return (
    <span
      title={reason}
      style={{
        fontSize: 10,
        padding: "1px 6px",
        borderRadius: 4,
        color: "#fff",
        background: VALIDITY_COLOR[validity] ?? "#6b6b6b",
        whiteSpace: "nowrap",
      }}
    >
      {VALIDITY_LABEL[validity] ?? validity}
    </span>
  )
}

function locationLine(summary: CatalogEditionSummary): string {
  const { scope, name } = summary.location
  if (scope === "unknown" || name === null) return "location pending"
  if (scope === "country" || scope === "region" || scope === "global")
    return `${name} (${scope}) — city pending`
  return name
}

function startDateLine(summary: CatalogEditionSummary): string {
  const date = summary.startDate
  if (date.precision === "instant") return `${date.iso} (${date.timezone})`
  if (date.precision === "date_only") return date.timezone ? `${date.date} (${date.timezone})` : `${date.date} (timezone unknown)`
  if (date.precision === "ambiguous") return `${date.text} (ambiguous)`
  return "date pending"
}

// Un valor material del dossier: valor + estado + soporte + revisiones +
// pregunta concreta cuando falta o cuando dos fuentes discrepan.
function ValueRow({ value }: { value: DossierValueView }) {
  const field = value.field
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "6px 8px",
        borderLeft: value.conflict ? "3px solid #8a2f1f" : "3px solid rgba(17,17,17,0.12)",
        marginBottom: 6,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 12 }}>{value.label}</b>
        {field.state === "known" && (
          <>
            <span style={{ fontSize: 13 }}>{field.display}</span>
            {field.claimStatus && (
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, border: "1px solid currentColor", opacity: 0.75 }}>
                {field.claimStatus}
              </span>
            )}
            {field.scope && <span style={{ fontSize: 11, opacity: 0.7 }}>{`scope: ${field.scope}`}</span>}
            {field.pendingNote && <span style={{ fontSize: 11, fontStyle: "italic", opacity: 0.75 }}>{field.pendingNote}</span>}
          </>
        )}
        {field.state === "ambiguous" && (
          <>
            <span style={{ fontSize: 13 }}>{field.display}</span>
            <span style={{ fontSize: 11, fontStyle: "italic", opacity: 0.75 }}>{field.note}</span>
          </>
        )}
        {field.state === "pending" && (
          <span style={{ fontSize: 12, fontStyle: "italic", opacity: 0.8 }}>
            {field.note ?? "pending"}
          </span>
        )}
      </div>
      {(value.method || value.reviewedAt) && (
        <span style={{ fontSize: 11, opacity: 0.65 }}>
          {[
            value.method ? `method: ${value.method}` : null,
            value.reviewedAt ? `reviewed ${value.reviewedAt.slice(0, 10)}` : null,
            value.reviewer ? `by ${value.reviewer}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
      <SourceRecordLinks sources={value.sources} unresolvedIds={value.unresolvedSourceIds} />
      {value.history.length > 1 && (
        <div style={{ marginTop: 2 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.6 }}>
            {value.conflict ? "Conflicting revisions (both kept)" : "Revisions (earlier ones kept)"}
          </span>
          {value.history.map((revision) => (
            <div key={revision.revisionId} style={{ fontSize: 11, opacity: 0.8, paddingLeft: 8 }}>
              {`${revision.reviewedAt.slice(0, 10)} · ${revision.status} · ${revision.display}`}
              {revision.note ? ` — ${revision.note}` : ""}
              {` (sources: ${revision.sourceIds.length > 0 ? revision.sourceIds.join(", ") : "none"})`}
            </div>
          ))}
        </div>
      )}
      {value.pendingQuestion && (
        <span style={{ fontSize: 11, color: "#5a4a12" }}>{`→ ${value.pendingQuestion}`}</span>
      )}
    </div>
  )
}

// Empresa → edición → rol → fuente, con los tres niveles separados y el
// resultado desconocido declarado como desconocido (no como fracaso).
function ParticipationRow({ participation }: { participation: DossierParticipationView }) {
  return (
    <div style={{ padding: "6px 8px", borderLeft: "3px solid rgba(17,17,17,0.12)", marginBottom: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 12 }}>
          {participation.company.name ?? `company “${participation.company.companyId}” (record not in read)`}
        </b>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          {`→ ${participation.editionName ?? participation.editionId}`}
        </span>
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, border: "1px solid currentColor", opacity: 0.8 }}>
          {`${participation.role} · ${participation.roleStatus}`}
        </span>
      </div>
      {participation.role === "logo_present" && (
        <span style={{ fontSize: 11, fontStyle: "italic", opacity: 0.75 }}>
          A logo on a page documents exactly that — it is not evidence of paid sponsorship.
        </span>
      )}
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
        {`${OUTCOME_LABELS.announced}: ${participation.announced ?? "—"}`}
      </div>
      <div style={{ fontSize: 11, opacity: 0.8 }}>
        {`${OUTCOME_LABELS.reported}: ${participation.reportedExecution ?? "—"}`}
      </div>
      <div style={{ fontSize: 11, opacity: 0.8 }}>
        {`${OUTCOME_LABELS.outcome}: `}
        {participation.outcome.state === "reported" ? participation.outcome.summary : participation.outcome.note}
      </div>
      <SourceRecordLinks sources={participation.sources} />
      {participation.outcome.state === "reported" && (
        <SourceRecordLinks sources={participation.outcome.sources} />
      )}
    </div>
  )
}

function OrganizerEditionRow({ edition }: { edition: OrganizerEditionView }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12, marginBottom: 4 }}>
      <span>{edition.name}</span>
      <ValidityBadge validity={edition.validity.validity} reason={edition.validity.reason} />
      <span style={{ opacity: 0.75 }}>
        {edition.date.state === "known" ? edition.date.display : edition.date.state === "ambiguous" ? edition.date.display : "date pending"}
      </span>
      <span style={{ opacity: 0.75 }}>
        {edition.location.state === "known"
          ? `${edition.location.display}${edition.location.pendingNote ? ` — ${edition.location.pendingNote}` : ""}`
          : "location pending"}
      </span>
    </div>
  )
}

type PanelState =
  | { kind: "list" }
  | { kind: "edition"; editionId: string }
  | { kind: "organizer"; organizerId: string; fromEditionId: string | null }

const OUTCOME_NOTES: Record<string, string> = {
  unauthorized: "Session required — seed one with pnpm db:seed-dev and set the growthx_session cookie.",
  missing: "Not found for the current session.",
  unavailable: "Server unreachable; the persisted catalog cannot be read right now.",
}

export function CatalogDossierPanel() {
  const [view, setView] = useState<PanelState>({ kind: "list" })
  const [list, setList] = useState<CatalogListRead | null>(null)
  const [edition, setEdition] = useState<EditionDossierViewModel | null>(null)
  const [organizer, setOrganizer] = useState<OrganizerDossierViewModel | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // true desde el montaje: la lectura inicial del catálogo arranca en el efecto.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchCatalogEditions().then((outcome) => {
      if (cancelled) return
      setLoading(false)
      if (outcome.status === "ok") {
        setList(outcome.data)
        setNote(null)
      } else {
        setNote(OUTCOME_NOTES[outcome.status])
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const openEdition = useCallback((editionId: string) => {
    setLoading(true)
    setNote(null)
    void fetchEditionDossier(editionId).then((outcome) => {
      setLoading(false)
      if (outcome.status === "ok") {
        setEdition(projectEditionDossierView(outcome.data))
        setView({ kind: "edition", editionId })
      } else {
        setNote(OUTCOME_NOTES[outcome.status])
      }
    })
  }, [])

  const openOrganizer = useCallback((organizerId: string, fromEditionId: string | null) => {
    setLoading(true)
    setNote(null)
    void fetchOrganizerDossier(organizerId).then((outcome) => {
      setLoading(false)
      if (outcome.status === "ok") {
        setOrganizer(projectOrganizerDossierView(outcome.data))
        setView({ kind: "organizer", organizerId, fromEditionId })
      } else {
        setNote(OUTCOME_NOTES[outcome.status])
      }
    })
  }, [])

  const backToList = useCallback(() => {
    setView({ kind: "list" })
    setNote(null)
  }, [])

  return (
    <div
      data-testid="catalog-panel"
      style={{ marginTop: 18, maxHeight: "46vh", overflowY: "auto", textAlign: "left" }}
    >
      <span className="eyebrow">Curated catalog (SF)</span>
      {note && <div style={{ fontSize: 12, fontStyle: "italic", opacity: 0.8, marginTop: 4 }}>{note}</div>}
      {loading && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Reading from PostgreSQL…</div>}

      {view.kind === "list" && list && (
        <div style={{ marginTop: 6 }}>
          {list.note && (
            <div style={{ fontSize: 11, fontStyle: "italic", opacity: 0.8, marginBottom: 6 }}>{list.note}</div>
          )}
          {list.editions.length > 0 && (
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>{STATUS_NOTE}</div>
          )}
          {list.editions.map((summary) => (
            <div
              key={summary.editionId}
              style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0", borderTop: "1px solid rgba(17,17,17,0.08)" }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <b style={{ fontSize: 13 }}>{summary.name}</b>
                <ValidityBadge validity={summary.validity.validity} reason={summary.validity.reason} />
                <span style={{ fontSize: 12, opacity: 0.75 }}>{startDateLine(summary)}</span>
                <span style={{ fontSize: 12, opacity: 0.75 }}>{locationLine(summary)}</span>
              </div>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {summary.organizers.map((entry) => entry.displayName).join(" · ") || "organizer pending"}
                {summary.curation
                  ? ` — verified ${summary.curation.verifiedAt.slice(0, 10)} by ${summary.curation.authorizedBy}`
                  : " — no load record"}
              </span>
              {summary.pendingAttributes.length > 0 && (
                <span style={{ fontSize: 11, color: "#5a4a12" }}>
                  {`Pending: ${summary.pendingAttributes.join(", ")}`}
                </span>
              )}
              <button
                type="button"
                className="intake-go"
                style={{ alignSelf: "flex-start", marginTop: 2 }}
                aria-label={`Open dossier: ${summary.name}`}
                onClick={() => openEdition(summary.editionId)}
              >
                Open dossier
              </button>
            </div>
          ))}
        </div>
      )}

      {view.kind === "edition" && edition && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>{edition.name}</b>
            <ValidityBadge validity={edition.validity.validity} reason={edition.validity.reason} />
            {edition.listingLink.href && (
              <a href={edition.listingLink.href} target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: "underline" }}>
                listing
              </a>
            )}
            {edition.listingLink.kind === 'synthetic' && <span>Listado de prueba · no corresponde a una página real.</span>}
            {edition.listingLink.kind === 'invalid' && <span>Enlace del listado no disponible.</span>}
          </div>
          {edition.curation && (
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {`Curated load “${edition.curation.manifestName}” — verified ${edition.curation.verifiedAt.slice(0, 10)} by ${edition.curation.authorizedBy}`}
            </div>
          )}
          {edition.materialNote && (
            <div style={{ fontSize: 11, fontStyle: "italic", opacity: 0.8 }}>{edition.materialNote}</div>
          )}
          {edition.validity.validity === "past" && (
            <div style={{ fontSize: 11, fontStyle: "italic", color: "#8a2f1f" }}>
              This edition expired after curation — it reads as a historical antecedent, not a live opportunity.
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <span className="eyebrow">Organizer</span>
            {edition.organizers.map((entry) => (
              <div key={entry.organizerId} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12 }}>
                <button
                  type="button"
                  style={{ textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
                  onClick={() => openOrganizer(entry.organizerId, edition.editionId)}
                >
                  {entry.displayName}
                </button>
                <span style={{ opacity: 0.6, fontSize: 11 }}>{`id: ${entry.organizerId}`}</span>
              </div>
            ))}
            {edition.organizerPending && (
              <span style={{ fontSize: 11, color: "#5a4a12" }}>{`→ ${edition.organizerPending}`}</span>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="eyebrow">Claims (separate, each with its support)</span>
            <ValueRow value={edition.date} />
            <ValueRow value={edition.location} />
            <ValueRow value={edition.access} />
            <ValueRow value={edition.audience} />
            {edition.costs.map((cost) => (
              <ValueRow key={cost.attribute} value={cost} />
            ))}
            {edition.otherClaims.map((claim) => (
              <ValueRow key={claim.attribute} value={claim} />
            ))}
          </div>
          {edition.participations.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="eyebrow">Company participations</span>
              {edition.participations.map((participation) => (
                <ParticipationRow key={participation.participationId} participation={participation} />
              ))}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.75 }}>
            {edition.mapPoint
              ? `Map point available (${edition.mapPoint.locationName}) — the map is optional; the dossier never depends on it.`
              : `No map point: ${edition.withoutPointReason}. The dossier stays fully accessible from this list.`}
          </div>
          {edition.openQuestions.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="eyebrow">Open questions</span>
              {edition.openQuestions.map((question) => (
                <div key={question} style={{ fontSize: 12, color: "#5a4a12" }}>{`→ ${question}`}</div>
              ))}
            </div>
          )}
          <button type="button" className="intake-go" style={{ marginTop: 10 }} onClick={backToList}>
            Back to catalog
          </button>
        </div>
      )}

      {view.kind === "organizer" && organizer && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>{organizer.displayName}</b>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{`stable id: ${organizer.organizerId} — homonyms are never merged`}</span>
          </div>
          {(organizer.confirmedAliases.length > 0 || organizer.proposedAliases.length > 0) && (
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
              {organizer.confirmedAliases.length > 0 &&
                `Confirmed aliases: ${organizer.confirmedAliases.map((entry) => entry.alias).join(", ")}. `}
              {organizer.proposedAliases.length > 0 &&
                `Proposed (unconfirmed): ${organizer.proposedAliases.join(", ")}.`}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <span className="eyebrow">Documented claims (no single reputation score)</span>
            {organizer.claims.length > 0 ? (
              organizer.claims.map((claim) => <ValueRow key={claim.attribute} value={claim} />)
            ) : (
              <div style={{ fontSize: 12, fontStyle: "italic", opacity: 0.75 }}>
                No documented claims about this organizer yet.
              </div>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="eyebrow">Upcoming editions</span>
            {organizer.upcomingEditions.length > 0 ? (
              organizer.upcomingEditions.map((entry) => <OrganizerEditionRow key={entry.editionId} edition={entry} />)
            ) : (
              <div style={{ fontSize: 12, fontStyle: "italic", opacity: 0.75 }}>None in the current catalog.</div>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="eyebrow">Historical antecedents (geography preserved)</span>
            {organizer.antecedents.length > 0 ? (
              organizer.antecedents.map((entry) => <OrganizerEditionRow key={entry.editionId} edition={entry} />)
            ) : (
              <div style={{ fontSize: 12, fontStyle: "italic", opacity: 0.75 }}>
                {organizer.coverage.note ?? "No documented antecedent."}
              </div>
            )}
            {organizer.undatedEditions.map((entry) => (
              <OrganizerEditionRow key={entry.editionId} edition={entry} />
            ))}
          </div>
          {organizer.participations.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="eyebrow">Company participations (company → edition → source)</span>
              {organizer.participations.map((participation) => (
                <ParticipationRow key={participation.participationId} participation={participation} />
              ))}
            </div>
          )}
          {organizer.coverage.note && organizer.antecedents.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 11, fontStyle: "italic", color: "#8a2f1f" }}>
              {organizer.coverage.note}
            </div>
          )}
          <button
            type="button"
            className="intake-go"
            style={{ marginTop: 10 }}
            onClick={() => {
              if (view.fromEditionId) openEdition(view.fromEditionId)
              else backToList()
            }}
          >
            {view.fromEditionId ? "Back to event dossier" : "Back to catalog"}
          </button>
        </div>
      )}
    </div>
  )
}
