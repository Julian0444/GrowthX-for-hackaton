"use client"

import { useEffect, useState, type RefObject } from "react"
import { ArrowLeft, Copy, ExternalLink, MessageCircle, RefreshCw, Users } from "lucide-react"
import type { CampaignRecommendation } from "@/lib/api/types"
import {
  ensureResearchCampaign,
  fetchCampaignResults,
  launchCampaignWithLinq,
  runTeracAction,
  type CampaignResults,
} from "@/lib/api/atlas-client"

// Vista de campaña (§9) — vive dentro del mismo .drawer-view que la oportunidad;
// el crossfade y el foco los maneja OpportunityDrawer. Consume el contrato
// CampaignRecommendation — la campaña llega con la Opportunity del backend.
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
  // El funnel se normaliza al primer paso (registrations = 100%).
  const funnelMax = Math.max(1, ...campaign.funnel.map((step) => step.value))
  const [results, setResults] = useState<CampaignResults | null>(null)
  const [recipient, setRecipient] = useState("")
  const [selectedVariant, setSelectedVariant] = useState<"A" | "B">("A")
  const [busy, setBusy] = useState<"terac" | "linq" | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    ensureResearchCampaign(campaign)
      .then((next) => {
        if (!stopped) {
          setResults(next)
          if (next.winner) setSelectedVariant(next.winner)
        }
      })
      .catch((cause: unknown) => {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Validation is unavailable.")
      })
    const handle = window.setInterval(() => {
      fetchCampaignResults(campaign.campaignId)
        .then((next) => {
          if (!stopped) setResults(next)
        })
        .catch(() => {
          // The panel remains useful if one polling request fails.
        })
    }, 2500)
    return () => {
      stopped = true
      window.clearInterval(handle)
    }
  }, [campaign])

  const copyOutreach = () => {
    navigator.clipboard?.writeText(campaign.organizerMessage)
    onToast("Message copied")
  }

  const teracAction = async (action: "draft" | "refresh" | "launch") => {
    if (
      action === "launch" &&
      !window.confirm(
        "Launch this Terac opportunity and recruit 12 participants? This may use Terac credits.",
      )
    ) {
      return
    }
    setBusy("terac")
    setError(null)
    try {
      const next = await runTeracAction(campaign, action)
      setResults(next)
      onToast(
        action === "draft"
          ? "Terac draft created — not launched"
          : action === "launch"
            ? "Terac recruitment launched"
            : "Terac results refreshed",
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Terac is unavailable.")
    } finally {
      setBusy(null)
    }
  }

  const sendWithLinq = async () => {
    setBusy("linq")
    setError(null)
    try {
      const next = await launchCampaignWithLinq({
        campaign,
        to: recipient.trim() || undefined,
        variant: selectedVariant,
      })
      setResults(next)
      onToast("Campaign sent through Linq")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Linq is unavailable.")
    } finally {
      setBusy(null)
    }
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
        <span className="eyebrow">Organizer outreach</span>
        <div className="outreach">
          {`“${campaign.organizerMessage}”`}
          <button className="copy-btn" type="button" onClick={copyOutreach}>
            Copy
          </button>
        </div>
      </div>

      <div className="d-section track-card">
        <div className="track-heading">
          <span className="track-icon"><Users size={13} /></span>
          <div>
            <span className="eyebrow">Terac · optional copy check</span>
            <p>People compare two messages blindly. Their votes never alter the market score.</p>
          </div>
        </div>
        <div className="variant-grid">
          {(["A", "B"] as const).map((variant) => (
            <button
              className={`variant-card${selectedVariant === variant ? " selected" : ""}`}
              type="button"
              key={variant}
              onClick={() => setSelectedVariant(variant)}
            >
              <span className="mono">{`Variant ${variant}`}</span>
              <p>{variant === "A" ? campaign.variantA : campaign.variantB}</p>
              {results?.winner === variant && <b>Current leader</b>}
            </button>
          ))}
        </div>
        <div className="track-stats">
          <span>{`${results?.nValid ?? 0} valid votes`}</span>
          <span>
            {results?.winner
              ? `${Math.round((results.winRate ?? 0) * 100)}% prefer ${results.winner}`
              : "No winner yet"}
          </span>
        </div>
        {!results?.terac ? (
          <button
            className="track-action"
            type="button"
            disabled={busy !== null}
            onClick={() => void teracAction("draft")}
          >
            Create Terac draft
          </button>
        ) : (
          <div className="track-actions">
            <button
              className="track-action"
              type="button"
              disabled={busy !== null}
              onClick={() => void teracAction("refresh")}
            >
              <RefreshCw size={11} />
              Refresh
            </button>
            {results.terac.status === "draft" && (
              <button
                className="track-action dark"
                type="button"
                disabled={busy !== null}
                onClick={() => void teracAction("launch")}
              >
                Recruit 12 people
                <ExternalLink size={11} />
              </button>
            )}
          </div>
        )}
        {results?.terac && (
          <p className="track-note mono">
            {`Terac ${results.terac.status} · ${results.terac.opportunityId.slice(0, 12)}`}
          </p>
        )}
      </div>

      <div className="d-section track-card">
        <div className="track-heading">
          <span className="track-icon"><MessageCircle size={13} /></span>
          <div>
            <span className="eyebrow">Linq · launch and approve</span>
            <p>Send the selected copy, then approve with a real reply or tapback.</p>
          </div>
        </div>
        <label className="track-label" htmlFor={`linq-recipient-${campaign.campaignId}`}>
          Recipient (optional if they already texted GrowXth)
        </label>
        <input
          id={`linq-recipient-${campaign.campaignId}`}
          className="track-input"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="+1 415 555 0123"
          inputMode="tel"
        />
        <button
          className="track-action dark wide"
          type="button"
          disabled={busy !== null}
          onClick={() => void sendWithLinq()}
        >
          {busy === "linq" ? "Sending…" : `Send variant ${selectedVariant} with Linq`}
        </button>
        <p className="track-note">
          {results?.launch.state === "approved"
            ? "Approved by a real Linq response. Market score unchanged."
            : results?.launch.state === "sent"
              ? "Sent. Waiting for a reply or tapback."
              : "Draft only — nothing has been sent."}
        </p>
      </div>

      {error && <p className="track-error" role="alert">{error}</p>}

      {campaign.funnel.length > 0 && (
        <div className="d-section">
          <span className="eyebrow">Measurement plan · projected example</span>
          {campaign.funnel.map((step) => (
            <div className="funnel-step" key={step.label}>
              <span className="lbl">{step.label}</span>
              <span className="bar">
                <i style={{ width: `${(step.value / funnelMax) * 100}%` }} />
              </span>
              <span className="val mono">{step.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="d-section">
        <span className="eyebrow">Attribution</span>
        <div className="attr-chip">
          {campaign.attributionCode}
          <Copy size={11} strokeWidth={1.8} />
        </div>
        <p className="cmp-note">
          Dedicated API-key cohort + event code so post-event activation and retention attribute
          back to this decision.
        </p>
      </div>
    </>
  )
}
