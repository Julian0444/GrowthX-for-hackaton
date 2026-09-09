"use client"

import type { RefObject } from "react"
import { ArrowLeft } from "lucide-react"
import type { CampaignRecommendation } from "@/lib/api/types"
import type { CampaignView, ProjectedField } from "@/lib/contracts/evaluation"

// Vista de campaña (§9) — vive dentro del mismo .drawer-view que la oportunidad;
// el crossfade y el foco los maneja OpportunityDrawer. Consume el contrato
// CampaignRecommendation — la campaña llega con la Opportunity del backend.
//
// Ticket 13: los ejemplos de funnel proyectado y atribución se eliminaron —
// implicaban soporte de medición/atribución de adopción que no existe. La
// vista permite copiar un borrador manual; no ofrece ejecutar, medir ni
// exportar nada.
export function CampaignPanel({
  cityName,
  campaign,
  headingRef,
  onBack,
  onToast,
}: {
  cityName: string
  campaign: CampaignRecommendation
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  onToast: (message: string) => void
}) {
  const copyOutreach = () => {
    navigator.clipboard?.writeText(campaign.organizerMessage)
    onToast("Message copied")
  }

  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft size={12} strokeWidth={2} />
        Back to opportunity
      </button>{" "}
      <span className="eyebrow">{`Campaign · ${cityName}`}</span>
      <h2 className="camp-title" tabIndex={-1} ref={headingRef}>
        {campaign.title}
      </h2>
      <p className="camp-sub">{campaign.subtitle}</p>

      <div className="d-section">
        <span className="eyebrow">Recommended play</span>
        <div className="kv">
          <span className="k">Track</span>
          <span className="v">{campaign.track}</span>
        </div>
        <div className="kv">
          <span className="k">Prize</span>
          <span className="v">{campaign.prize}</span>
        </div>
        <div className="kv">
          <span className="k">Workshop</span>
          <span className="v">{campaign.workshop}</span>
        </div>
      </div>

      <div className="d-section">
        <span className="eyebrow">Organizer outreach · manual draft</span>
        <div className="outreach">
          {`“${campaign.organizerMessage}”`}
          <button className="copy-btn" type="button" onClick={copyOutreach}>
            Copy
          </button>
        </div>
        <p className="cmp-note">
          Draft only — nothing is sent, executed or measured from here.
        </p>
      </div>
    </>
  )
}

// ---- Borrador de campaña persistido (ticket 13) ----
// Renderiza la CampaignView proyectada del borrador guardado con la decisión:
// objetivo, modalidad, partidas conocidas/desconocidas (jamás 0), preguntas y
// compromisos donde estimación ≠ meta ≠ acordado (solo lo acordado con
// quién/cuándo/evidencia se marca soportado). Permite copiar un borrador
// manual; no ofrece ejecutar, medir ni exportar nada.

const COMMITMENT_KIND_LABEL = { estimate: "Estimación", goal: "Meta", agreed: "Acordado" } as const

function fieldText(field: ProjectedField): string {
  if (field.state === "known") return field.pendingNote ? `${field.display} · ${field.pendingNote}` : field.display
  if (field.state === "ambiguous") return `${field.display} · ${field.note}`
  return `Pendiente${field.note ? ` · ${field.note}` : ""}`
}

export function composeManualCampaignDraft(view: CampaignView): string {
  return [
    `Borrador de campaña (manual) — objetivo: ${view.objective}`,
    `Definición de éxito: ${fieldText(view.successDefinition)}`,
    `Modalidad: ${fieldText(view.modality)}`,
    "Partidas de costo:",
    ...view.costItems.map((item) => `- ${item.label}: ${fieldText(item.value)}`),
    view.costCompleteness === "has_unknown_items"
      ? "Hay partidas sin costo conocido: no existe un total."
      : "Todas las partidas listadas tienen valor.",
    "Preguntas abiertas:",
    ...view.openQuestions.map((question) => `- ${question}`),
    "Compromisos:",
    ...view.commitments.map(
      (commitment) =>
        `- [${COMMITMENT_KIND_LABEL[commitment.kind]}${commitment.kind === "agreed" && !commitment.supported ? " SIN SOPORTE" : ""}] ${commitment.description}`,
    ),
  ].join("\n")
}

export function CampaignDraftPanel({
  view,
  onBack,
  onToast,
}: {
  view: CampaignView
  onBack: () => void
  onToast: (message: string) => void
}) {
  const copyDraft = () => {
    navigator.clipboard?.writeText(composeManualCampaignDraft(view))
    onToast("Borrador copiado")
  }
  return (
    <section className="research-campaign-draft" aria-label="Borrador de campaña persistido" data-testid="campaign-draft-panel">
      <button className="research-button" type="button" onClick={onBack}>
        Volver a la comparación
      </button>
      <h3>Borrador de campaña persistido</h3>
      <p className="research-meta">
        Campaña <span data-testid="campaign-draft-id">{view.campaignId}</span> · decisión {view.decisionId}. Guardar no
        envía mensajes ni contrata nada; este borrador se copia a mano.
      </p>
      <p>
        <b>Objetivo:</b> {view.objective}
      </p>
      <p>
        <b>Definición de éxito:</b> {fieldText(view.successDefinition)}
      </p>
      <p>
        <b>Modalidad:</b> {fieldText(view.modality)}
      </p>
      <div data-testid="campaign-draft-costs">
        <p>
          <b>Partidas de costo</b> (una partida desconocida queda pendiente; no se suma como 0):
        </p>
        <ul>
          {view.costItems.map((item) => (
            <li key={item.label}>
              {item.label}: {fieldText(item.value)}
            </li>
          ))}
        </ul>
        {view.costCompleteness === "has_unknown_items" && (
          <p className="research-meta">Hay partidas sin costo conocido: no existe un total de campaña.</p>
        )}
      </div>
      {view.openQuestions.length > 0 && (
        <div>
          <p>
            <b>Preguntas abiertas</b> (registradas; no se envía ninguna):
          </p>
          <ul>
            {view.openQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </div>
      )}
      <div data-testid="campaign-draft-commitments">
        <p>
          <b>Compromisos</b> — estimación y meta no se presentan como acuerdo; «acordado» exige quién confirmó, cuándo y
          evidencia:
        </p>
        {view.commitments.length === 0 ? (
          <p className="research-meta">Sin compromisos registrados.</p>
        ) : (
          <ul>
            {view.commitments.map((commitment, index) => (
              <li key={index}>
                <b>{COMMITMENT_KIND_LABEL[commitment.kind]}</b>
                {commitment.kind === "agreed" && (commitment.supported ? " · con soporte" : " · SIN soporte")} —{" "}
                {commitment.description}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="research-button" type="button" onClick={copyDraft}>
        Copiar borrador manual
      </button>
    </section>
  )
}
