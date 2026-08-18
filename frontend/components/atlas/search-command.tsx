"use client"

import type { FormEvent, ReactNode, RefObject } from "react"
import { Search } from "lucide-react"

// Chips de interpretación — vienen de SearchResponse.interpretation.
export type InterpretationChips = { product: string; objective: string }

// Barra de refinamiento: aparece compacta arriba DESPUÉS del intake inicial —
// el onboarding (onboarding-intake.tsx) es quien captura la primera búsqueda.
export function SearchCommand({
  value,
  onValueChange,
  onSearch,
  chips,
  inputRef,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  onSearch: (query: string) => void
  chips: InterpretationChips | null
  inputRef: RefObject<HTMLInputElement | null>
  // Slot para el banner de request (§10): vive bajo la search para heredar su
  // posición compacta.
  children?: ReactNode
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const query = value.trim()
    if (!query) return
    onValueChange(query)
    onSearch(query)
  }

  return (
    <div className="atlas-search">
      <form className="search-card" onSubmit={submit}>
        <div className="search-row">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" />
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="Refine what you're looking for…"
            autoComplete="off"
            aria-label="Refine what you're looking for"
          />
          <button className="search-go" type="submit">
            Map opportunity
          </button>
        </div>
      </form>
      {chips && (
        <div className="chips" aria-label="Interpreted intent">
          <span className="chip">
            <span className="k">Product</span>
            <b>{chips.product}</b>
          </span>
          <span className="chip">
            <span className="k">Objective</span>
            <b>{chips.objective}</b>
          </span>
        </div>
      )}
      {children}
    </div>
  )
}
