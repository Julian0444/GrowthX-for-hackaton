"use client"

import {useState, type RefObject} from "react"
import type {DecisionRead} from "../../lib/api/atlas-client"
import type {EvaluationReadBundle} from "../../lib/contracts/evaluation"
import {composeDecisionBrief, copyText, decisionLabel} from "../../lib/research/decision-brief"
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
  const copyOutreach = async () => onToast(await copyText(campaign.organizerMessage))

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

// ---- Saved campaign draft (ticket 13) ----
// Renderiza la CampaignView proyectada del borrador guardado con la decisión:
// objetivo, modalidad, partidas conocidas/desconocidas (jamás 0), preguntas y
// compromisos donde estimación ≠ meta ≠ acordado (solo lo acordado con
// quién/cuándo/evidencia se marca soportado). Permite copiar un borrador
// manual; no ofrece ejecutar, medir ni exportar nada.

const COMMITMENT_KIND_LABEL = { estimate: "Estimate", goal: "Goal", agreed: "Agreed" } as const

function fieldText(field: ProjectedField): string {
  if (field.state === "known") return field.pendingNote ? `${field.display} · ${field.pendingNote}` : field.display
  if (field.state === "ambiguous") return `${field.display} · ${field.note}`
  return `Pending${field.note ? ` · ${field.note}` : ""}`
}

export function composeManualCampaignDraft(view: CampaignView): string {
  return [
    `Manual campaign draft — objective: ${view.objective}`,
    `Success definition: ${fieldText(view.successDefinition)}`,
    `Format: ${fieldText(view.modality)}`,
    "Cost items:",
    ...view.costItems.map((item) => `- ${item.label}: ${fieldText(item.value)}`),
    view.costCompleteness === "has_unknown_items"
      ? "Some cost items are still pending confirmation; no total is available."
      : "All listed cost items have values.",
    "Open questions:",
    ...view.openQuestions.map((question) => `- ${question}`),
    "Commitments:",
    ...view.commitments.map(
      (commitment) =>
        `- [${COMMITMENT_KIND_LABEL[commitment.kind]}${commitment.kind === "agreed" && !commitment.supported ? " UNSUPPORTED" : ""}] ${commitment.description}`,
    ),
  ].join("\n")
}

// Ticket 14: identidad de origen del borrador tal como se releyó (run,
// snapshot, revisión y fecha de la decisión) y su enlace interno, para que
// cerrar y volver recupere exactamente esta campaña.
export interface CampaignDraftMeta {
  runId: string
  snapshotId: string
  decisionRevision: number
  decidedAt: string
  href: string | null
}

export function CampaignDraftPanel({
  view,
  brief,
  meta,
  onBack,
  onToast,
}: {
  view: CampaignView
  brief?: {read: DecisionRead; bundle: EvaluationReadBundle; runId: string}
  meta?: CampaignDraftMeta
  onBack: () => void
  onToast: (message: string) => void
}) {
  const [preview,setPreview] = useState<string|null>(null)
  const copyDraft = async (message=false) => {
    const text=brief && meta?.href ? composeDecisionBrief(brief.read,brief.bundle,`${window.location.origin}${meta.href}`,message) : composeManualCampaignDraft(view)
    setPreview(text)
    onToast(await copyText(text))
  }
  const copyLink = async () => {
    if (meta?.href) onToast(await copyText(`${window.location.origin}${meta.href}`))
  }
  return (
    <section className="research-campaign-draft" aria-label="Saved campaign draft" data-testid="campaign-draft-panel">
      <button className="research-button" type="button" onClick={onBack}>
        Back to comparison
      </button>
      <h3>Saved campaign draft</h3>
      {brief && <div data-testid="saved-brief-context"><h2>{brief.bundle.editions.find(e=>e.editionId===brief.read.editionId)?.name}</h2><p>{brief.bundle.profile.product} · {brief.bundle.profile.audience.description}</p><p><b>{decisionLabel(brief.read.decision)}</b></p><p>Owner: {brief.read.campaign?.owner ?? 'Pending'}</p><p>Reasons: {brief.read.decision.reasons.join(' / ')}</p><p>Original conditions remain attached to this decision; use Back to review or resolve them.</p></div>}
      <p className="research-meta">
        Campaign <span data-testid="campaign-draft-id">{view.campaignId}</span> · decision{" "}
        <span data-testid="campaign-draft-decision-id">{view.decisionId}</span>. Saving does not send messages or book anything; copy this draft manually.
      </p>
      {meta && (
        <p className="research-meta" data-testid="campaign-draft-meta">
          Run {meta.runId} · snapshot <span data-testid="campaign-draft-snapshot-id">{meta.snapshotId}</span> · decision
          revision <span data-testid="campaign-draft-revision">{meta.decisionRevision}</span> · recorded on{" "}
          {meta.decidedAt}. Loaded with its original saved revision.
          {meta.href && (
            <>
              {" "}
              <a className="research-link" href={meta.href} data-testid="campaign-link">
                Internal link
              </a>{" "}
              <button className="research-link" type="button" onClick={copyLink}>
                Copy link
              </button>
            </>
          )}
        </p>
      )}
      <div className="campaign-overview">
        <p>
          <b>Objective:</b> {view.objective}
        </p>
        <p>
          <b>Success definition:</b> {fieldText(view.successDefinition)}
        </p>
        <p>
          <b>Format:</b> {fieldText(view.modality)}
        </p>
      </div>
      <div className="campaign-grid">
        <div className="campaign-block" data-testid="campaign-draft-costs">
          <p>
            <b>Cost items</b> (unknown items remain pending; they are not counted as zero):
          </p>
          <ul>
            {view.costItems.map((item,index) => (
              <li key={`${item.label}-${index}`}>
                {item.label}: {fieldText(item.value)}
              </li>
            ))}
          </ul>
          {view.costCompleteness === "has_unknown_items" && (
            <p className="research-meta">Some cost items are still pending confirmation; no campaign total is available.</p>
          )}
        </div>
        {view.openQuestions.length > 0 && (
          <div className="campaign-block campaign-questions">
            <p>
              <b>Open questions</b> (recorded; none are sent):
            </p>
            <ul>
              {view.openQuestions.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="campaign-block campaign-commitments" data-testid="campaign-draft-commitments">
          <p>
            <b>Commitments</b> — estimates and goals remain separate from agreements; agreed commitments require who confirmed, when and supporting evidence:
          </p>
          {view.commitments.length === 0 ? (
            <p className="research-meta">No commitments recorded.</p>
          ) : (
            <ul>
              {view.commitments.map((commitment, index) => (
                <li key={index}>
                  <b>{COMMITMENT_KIND_LABEL[commitment.kind]}</b>
                  {commitment.kind === "agreed" && (commitment.supported ? " · supported" : " · UNSUPPORTED")} —{" "}
                  {commitment.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="research-actions">
      <button className="research-button research-primary" type="button" onClick={()=>void copyDraft()}>
        Copy manual draft
      </button>
      {brief && <button className="research-link" onClick={()=>void copyDraft(true)}>Copy inquiry message</button>}
      </div>
      {preview && <details open><summary>Copied text preview</summary><textarea readOnly aria-label="Decision brief preview" value={preview} rows={15}/></details>}
    </section>
  )
}
