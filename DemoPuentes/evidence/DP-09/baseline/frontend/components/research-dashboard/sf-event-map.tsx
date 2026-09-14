"use client"
import type { EditionDossierRead } from "../../lib/api/atlas-client"
import { projectEditionDossierView } from "../../lib/api/opportunity-adapter"
import { isSanFrancisco, latestEdition } from "./research-model"

// Cuadrícula geográfica local: proyecta coordenadas de la EDICIÓN, sin geocodificar sedes.
export function SfEventMap({ editions, onEdition, selectedEditionId }: { editions: EditionDossierRead[]; selectedEditionId?: string | null; onEdition: (id: string) => void }) {
  const points = editions.filter(read => {
    const e = latestEdition(read)
    return isSanFrancisco(e.location) && projectEditionDossierView(read).mapPoint && e.coordinates && e.coordinates.lng >= -122.53 && e.coordinates.lng <= -122.35 && e.coordinates.lat >= 37.70 && e.coordinates.lat <= 37.84
  })
  return <div className="research-map" data-testid="sf-map">
    <h3>Mapa de SF</h3><p>Cuadrícula geográfica · solo coordenadas documentadas; el estado anunciado no equivale a confirmación humana. Los eventos sin punto siguen en la lista.</p>
    <svg viewBox="0 0 760 470" role="group" aria-label="Ubicación de las ediciones en San Francisco">
      <rect x="70" y="35" width="630" height="350" fill="var(--ocean, #f1f1ec)" />
      {[37.70,37.735,37.77,37.805,37.84].map(lat => { const y = 385 - (lat - 37.70) / .14 * 350; return <g key={lat}><line x1="70" x2="700" y1={y} y2={y} stroke="#c8c8bf"/><text x="10" y={y+5}>{lat.toFixed(3)}°</text></g> })}
      {[-122.53,-122.485,-122.44,-122.395,-122.35].map(lng => { const x = 70 + (lng + 122.53) / .18 * 630; return <g key={lng}><line y1="35" y2="385" x1={x} x2={x} stroke="#c8c8bf"/><text x={x-30} y="412">{lng.toFixed(3)}°</text></g> })}
      {points.map(read => { const e = latestEdition(read); const position = projectEditionDossierView(read); const approximate = position.mapPoint?.approximate ?? false; const x = 70 + (e.coordinates!.lng + 122.53) / .18 * 630; const y = 385 - (e.coordinates!.lat - 37.70) / .14 * 350;
        return <g key={e.editionId} role="button" tabIndex={0} aria-label={`Abrir en mapa: ${e.name}`} data-point-edition-id={e.editionId} data-edition-revision-id={e.id} aria-pressed={selectedEditionId === e.editionId} onClick={() => onEdition(e.editionId)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEdition(e.editionId) } }}>
          <title>{`${e.name} · ubicación ${projectEditionDossierView(read).publicLocation.status} · precisión ${position.publicLocation.precision}${approximate ? " · aproximada" : ""}`}</title><circle stroke={approximate ? "#111" : undefined} strokeWidth={approximate ? 3 : undefined} strokeDasharray={approximate ? "3 3" : undefined} cx={x} cy={y} r={selectedEditionId === e.editionId ? "17" : "13"} fill={approximate ? "#767676" : "#111"}/><circle cx={x} cy={y} r="4" fill="#fff"/><text x={x > 430 ? x-18 : x+18} y={y+5} textAnchor={x > 430 ? "end" : "start"}>{e.name}</text>
        </g> })}
    </svg>
    <p>{points.length} de {editions.length} ediciones con punto verificable en esta vista.</p>
  </div>
}
