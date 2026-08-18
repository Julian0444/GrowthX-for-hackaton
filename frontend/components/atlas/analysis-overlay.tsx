"use client"

// Etapas mostradas durante la búsqueda — copy de UI (§5). El avance es un
// ticker cosmético del shell mientras la request real está en vuelo: la última
// etapa queda "en curso" hasta que el backend responde (nunca porcentajes
// inventados ni completado ficticio).
export const SEARCH_STAGES = [
  { id: "understanding", label: "Understanding your product" },
  { id: "matching", label: "Reading Google Trends and GitHub" },
  { id: "events", label: "Collecting X signals through Apify" },
  { id: "ranking", label: "Ranking worldwide growth markets" },
] as const

export type SearchStageId = (typeof SEARCH_STAGES)[number]["id"]

// stageIndex: índice del paso en curso; SEARCH_STAGES.length = todos completos
// (fade-out tras éxito); -1 = ninguno resaltado (fade-out tras error).
export function AnalysisOverlay({ active, stageIndex }: { active: boolean; stageIndex: number }) {
  return (
    <div className="analysis" aria-live="polite">
      <div className="analysis-box">
        <span className="eyebrow">Analyzing</span>
        {SEARCH_STAGES.map((stage, index) => (
          <div
            key={stage.id}
            className={`a-step${active && index === stageIndex ? " now" : ""}${index < stageIndex ? " done" : ""}`}
          >
            <span className="tick" />
            {stage.label}
          </div>
        ))}
      </div>
    </div>
  )
}
