"use client"

import { memo } from "react"
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps"
import type { AtlasCamera } from "@/hooks/use-atlas-camera"
import type { Opportunity } from "@/lib/api/types"
import { MAP_HEIGHT, MAP_WIDTH, PROJECTION_CENTER, PROJECTION_SCALE } from "@/lib/atlas/signal-layout"
import type { AtlasViewState } from "./atlas-shell"
import { OpportunityMarker } from "./opportunity-marker"
import { SignalCloudLayer } from "./signal-cloud-layer"

const GEO_URL = "/geo/countries-110m.json"
const TOPO_COUNTRY_NAME: Record<string, string> = {
  "United States": "United States of America",
}

// Solo re-renderiza al cambiar el país activo — los vuelos de cámara no tocan React.
// El resaltado matchea por nombre de país (properties.name del TopoJSON), así
// funciona para cualquier mercado que devuelva el backend.
const LandLayer = memo(function LandLayer({ activeCountry }: { activeCountry: string | null }) {
  return (
    <g className="atlas-land">
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies
            .filter((geography) => geography.id !== "010")
            .map((geography) => {
              const active =
                activeCountry !== null &&
                (geography.properties as { name?: string } | undefined)?.name ===
                  (TOPO_COUNTRY_NAME[activeCountry] ?? activeCountry)
              return (
                <Geography
                  key={geography.rsmKey}
                  geography={geography}
                  fill="var(--land)"
                  stroke={active ? "var(--border-geo-active)" : "var(--border-geo)"}
                  strokeWidth={active ? 1 : 0.6}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "var(--land)" },
                    pressed: { outline: "none", fill: "var(--land)" },
                  }}
                  tabIndex={-1}
                />
              )
            })
        }
      </Geographies>
    </g>
  )
})

export const WorldMap = memo(function WorldMap({
  camera,
  view,
  results,
  selectedId,
  hoveredId,
  timeRange,
  userLocation,
  onSelect,
  onHover,
}: {
  camera: AtlasCamera
  view: AtlasViewState
  // Marcadores desde la respuesta (§10) — montan recién cuando hay resultados.
  results: readonly Opportunity[]
  selectedId: string | null
  hoveredId: string | null
  timeRange: string
  userLocation: [number, number] | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const activeCountry = results.find((item) => item.id === selectedId)?.country ?? null

  return (
    <div className="map-stage" ref={camera.stageRef}>
      {/* slice = cover fit, como el prototipo: S = max(vw/980, vh/560) */}
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: PROJECTION_SCALE, center: PROJECTION_CENTER }}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        aria-label="World map of growth opportunity signals"
      >
        <defs>
          <radialGradient id="haloG">
            <stop offset="0%" stopColor="rgba(17,17,17,0.05)" />
            <stop offset="62%" stopColor="rgba(17,17,17,0.022)" />
            <stop offset="100%" stopColor="rgba(17,17,17,0)" />
          </radialGradient>
        </defs>
        {/* La cámara (hooks/use-atlas-camera) setea el transform de este grupo por rAF. */}
        <g ref={camera.groupRef}>
          <LandLayer activeCountry={activeCountry} />
          <SignalCloudLayer
            view={view}
            results={results}
            selectedId={selectedId}
            hintId={hoveredId}
            timeRange={timeRange}
          />
          {userLocation && (
            <Marker coordinates={userLocation}>
              <g className="user-location" aria-label="Location shared through Linq">
                <circle className="pulse" r={12} />
                <circle className="ring" r={6} />
                <circle className="core" r={2.5} />
              </g>
            </Marker>
          )}
          {results.map((opportunity) => (
            <OpportunityMarker
              key={opportunity.id}
              id={opportunity.id}
              name={opportunity.city}
              rank={opportunity.rank}
              score={opportunity.score}
              confidence={opportunity.confidence}
              coordinates={opportunity.coordinates}
              selected={selectedId === opportunity.id}
              hovered={hoveredId === opportunity.id}
              onSelect={onSelect}
              onHover={onHover}
              registerNode={camera.registerMarker}
            />
          ))}
        </g>
      </ComposableMap>
    </div>
  )
})
