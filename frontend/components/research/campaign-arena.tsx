"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Check, ShieldCheck } from "lucide-react"
import type { CampaignDraft } from "@/lib/contracts/growxth"
import type { CampaignResults } from "@/lib/api/atlas-client"

function deterministicFlip(value: string): boolean {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % 2 === 1
}

export function CampaignArena({
  campaignId,
  teracSubmissionId,
}: {
  campaignId: string
  teracSubmissionId: string | null
}) {
  const [campaign, setCampaign] = useState<CampaignDraft | null>(null)
  const [results, setResults] = useState<CampaignResults | null>(null)
  const [calibrationPassed, setCalibrationPassed] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<"A" | "B" | null>(null)
  const [reason, setReason] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submissionId = useMemo(
    () => teracSubmissionId ?? `preview-${crypto.randomUUID()}`,
    [teracSubmissionId],
  )
  const flipped = deterministicFlip(`${campaignId}:${submissionId}`)

  useEffect(() => {
    fetch(`/api/research/campaign?campaignId=${encodeURIComponent(campaignId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null)
        if (!response.ok || typeof payload !== "object" || payload === null) {
          throw new Error("This validation campaign is not available.")
        }
        const data = payload as { campaign: CampaignDraft; results: CampaignResults }
        setCampaign(data.campaign)
        setResults(data.results)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Campaign unavailable.")
      })
  }, [campaignId])

  const cards: Array<{ label: "A" | "B"; copy: string }> = campaign
    ? flipped
      ? [
          { label: "B", copy: campaign.variantB },
          { label: "A", copy: campaign.variantA },
        ]
      : [
          { label: "A", copy: campaign.variantA },
          { label: "B", copy: campaign.variantB },
        ]
    : []

  const submit = async () => {
    if (!selected || reason.trim().length < 3 || calibrationPassed == null) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/research/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId,
          submissionId,
          variant: selected,
          reason,
          calibrationPassed,
          preview: teracSubmissionId == null,
        }),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok || typeof payload !== "object" || payload === null) {
        throw new Error("The response could not be saved.")
      }
      const data = payload as { results: CampaignResults; callbackUrl: string }
      setResults(data.results)
      setSubmitted(true)
      if (teracSubmissionId) {
        window.setTimeout(() => window.location.assign(data.callbackUrl), 900)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The response could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  if (error && !campaign) {
    return <main className="arena-shell"><div className="arena-error">{error}</div></main>
  }

  return (
    <main className="arena-shell">
      <section className="arena-card">
        <header className="arena-head">
          <div className="arena-brand">GrowXth</div>
          <span>{teracSubmissionId ? "Terac participant" : "Preview mode"}</span>
        </header>
        {!submitted ? (
          <>
            <div className="arena-intro">
              <span className="arena-kicker">Blind message test · ~2 min</span>
              <h1>Which message makes the value clearer?</h1>
              <p>
                Read both options as if you had never heard of the product. Choose the one that
                makes you most likely to understand what happens next.
              </p>
            </div>

            <div className="arena-calibration">
              <div><ShieldCheck size={16} /><b>Quick attention check</b></div>
              <p>Which instruction asks for a concrete action?</p>
              <div className="arena-choice-row">
                <button type="button" onClick={() => setCalibrationPassed(false)}>
                  Innovation for everyone
                </button>
                <button type="button" onClick={() => setCalibrationPassed(true)}>
                  Book a 15-minute demo
                </button>
              </div>
              {calibrationPassed != null && (
                <small>{calibrationPassed ? "Correct — continue below." : "Please read carefully and try again."}</small>
              )}
            </div>

            <div className="arena-options" aria-label="Message options">
              {cards.map((card, index) => (
                <button
                  type="button"
                  className={selected === card.label ? "selected" : ""}
                  key={card.label}
                  onClick={() => setSelected(card.label)}
                  disabled={!calibrationPassed}
                >
                  <span>{`Message ${index + 1}`}</span>
                  <p>{card.copy}</p>
                  <i>{selected === card.label && <Check size={14} />}</i>
                </button>
              ))}
            </div>

            <label className="arena-reason">
              <span>Why is your choice clearer?</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="One sentence is enough."
                maxLength={500}
                disabled={!selected}
              />
            </label>
            <button
              className="arena-submit"
              type="button"
              disabled={!selected || !calibrationPassed || reason.trim().length < 3 || busy}
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : "Submit response"}
              <ArrowRight size={15} />
            </button>
            {error && <div className="arena-error">{error}</div>}
          </>
        ) : (
          <div className="arena-complete">
            <span><Check size={18} /></span>
            <h1>Response recorded</h1>
            <p>
              {teracSubmissionId
                ? "Returning you to Terac…"
                : `Preview complete. It was not counted; the study still has ${results?.nValid ?? 0} valid responses.`}
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
