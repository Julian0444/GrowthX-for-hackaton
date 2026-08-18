"use client"

import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import type { SearchRequest } from "@/lib/api/types"

// Intake inicial: el usuario cuenta qué construye y qué busca ANTES de ver una
// query — la búsqueda del mapa queda como refinamiento.
export type IntakePayload = {
  description: string
  objective: SearchRequest["objective"]
}

const OBJECTIVES: { id: SearchRequest["objective"]; label: string }[] = [
  { id: "adoption", label: "Developer adoption" },
  { id: "feedback", label: "Technical feedback" },
  { id: "talent", label: "Hiring & talent" },
  { id: "awareness", label: "Brand awareness" },
]

export function OnboardingIntake({
  onLaunch,
  // Slot del RequestBanner: un error de búsqueda devuelve al intake, y el aviso
  // (con Retry) vive dentro de la card.
  banner,
}: {
  onLaunch: (payload: IntakePayload) => void
  banner?: ReactNode
}) {
  const [description, setDescription] = useState("")
  const [objective, setObjective] = useState<SearchRequest["objective"] | null>(null)

  const ready = description.trim().length > 0 && objective !== null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = description.trim()
    if (!text || objective === null) return
    onLaunch({
      description: text,
      objective,
    })
  }

  const onFieldKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="intake">
      <div className="intake-card">
        <span className="eyebrow">Growth Atlas</span>
        <h2 className="intake-title">Where should you grow next?</h2>
        <p className="intake-sub">
          Describe your product once. We rank worldwide developer markets using live demand signals.
        </p>
        <form onSubmit={submit}>
          <label className="intake-label" htmlFor="intake-description">
            What does your company build?
          </label>
          <textarea
            id="intake-description"
            className="intake-field"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={onFieldKeyDown}
            placeholder="Describe your product and who it's for…"
            autoComplete="off"
          />
          <span className="intake-label" id="intake-objective-label">
            What are you optimizing for?
          </span>
          <div className="intake-chips" role="group" aria-labelledby="intake-objective-label">
            {OBJECTIVES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={objective === option.id ? "on" : undefined}
                aria-pressed={objective === option.id}
                onClick={() => setObjective(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button className="intake-go" type="submit" disabled={!ready}>
            Map my opportunities
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </form>
        {banner}
      </div>
    </div>
  )
}
