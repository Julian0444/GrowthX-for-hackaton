export type AtlasLayer = "demand" | "events" | "communities" | "companies"

export type TimeRange = "7d" | "30d" | "90d"

export const LAYER_LABELS: Record<AtlasLayer, string> = {
  demand: "Demand",
  events: "Events",
  communities: "Communities",
  companies: "Companies",
}
