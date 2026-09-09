"use client"

import { ResearchDashboard } from "../research-dashboard/research-dashboard"

// Compatibilidad de tipos para los componentes de presentación v0 conservados.
export type AtlasViewState = "idle" | "analyzing" | "results" | "selected" | "campaign"

export function AtlasShell() {
  return <ResearchDashboard />
}
