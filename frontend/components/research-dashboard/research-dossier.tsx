"use client"

import { SourceRecordLinks } from "../atlas/evidence-links"
import { projectEditionDossierView, projectOrganizerDossierView, type DossierValueView, type DossierParticipationView } from "../../lib/api/opportunity-adapter"
import type { EditionDossierRead, OrganizerDossierRead } from "../../lib/api/atlas-client"
import type { SourceRecord } from "../../lib/contracts/evaluation"
import { dateLabel, isSanFrancisco, latestEdition } from "./research-model"

export function DossierValue({ value }: { value: DossierValueView }) {
  return <div className={`research-fact fact-${value.field.state}${value.conflict ? ' research-conflict' : ''}`}>
    <strong>{value.label}</strong>
    <p>{value.field.state === 'pending' ? value.field.note ?? 'Pendiente' : value.field.display}</p>
    {value.field.state === 'known' && <small>{value.field.claimStatus ?? 'Curación declarada'} · {value.field.scope ?? 'alcance pendiente'} {value.field.pendingNote}</small>}
    {value.field.state === 'ambiguous' && <small>{value.field.note}</small>}
    {value.method && <small>Método: {value.method} · revisión: {value.reviewedAt} · {value.reviewer}</small>}
    <SourceRecordLinks sources={value.sources} unresolvedIds={value.unresolvedSourceIds} />
    {value.history.length > 1 && <details open={value.conflict}>
      <summary>{value.conflict ? 'Revisiones en contradicción' : 'Historial de revisiones'}</summary>
      {value.history.map(r => <div key={r.revisionId}><p>{r.display} · {r.status} · {r.reviewedAt}</p><small>{r.revisionId}</small>{r.note && <p>{r.note}</p>}
        <SourceRecordLinks sources={value.sources.filter(s => r.sourceIds.includes(s.id))} unresolvedIds={r.sourceIds.filter(id => !value.sources.some(s => s.id === id))} />
      </div>)}
    </details>}
    {value.pendingQuestion && <p className="research-pending">{value.pendingQuestion}</p>}
  </div>
}
function Participation({ item, onEdition }: { item: DossierParticipationView; onEdition: (id: string) => void }) {
  return <article className="research-fact" data-participation-id={item.participationId}>
    <strong>{item.company.name ?? item.company.companyId}</strong><small>Empresa: {item.company.companyId}</small>
    <p>→ <button className="research-link" onClick={() => onEdition(item.editionId)}>{item.editionName ?? item.editionId}</button> → <b>{item.role}</b> · {item.roleStatus}</p>
    <p>Anuncio: {item.announced ?? 'Desconocido'}</p><p>Ejecución reportada: {item.reportedExecution ?? 'Desconocida'}</p>
    <p>{item.outcome.state === 'unknown' ? 'Resultado comercial desconocido. La ausencia de datos no demuestra fracaso ni éxito.' : `Resultado comercial reportado: ${item.outcome.summary}`}</p>
    {item.role === 'logo_present' && <p>Logo presente: no prueba patrocinio pagado ni éxito comercial.</p>}
    <SourceRecordLinks sources={item.sources} />
    {item.outcome.state === 'reported' && <SourceRecordLinks sources={item.outcome.sources} />}
  </article>
}
export function OrganizerDossier({ read, editions, onEdition }: { read: OrganizerDossierRead; editions: EditionDossierRead[]; onEdition: (id: string) => void }) {
  const view = projectOrganizerDossierView(read)
  const own = editions.filter(e => latestEdition(e).organizerIds.includes(read.organizerId))
  return <section className="dossier-surface" data-testid="organizer-dossier">
    <span className="eyebrow">Expediente del organizador</span><h2>{view.displayName}</h2><p className="research-meta">ID: {view.organizerId} · {view.revisionCount} revisión(es)</p>
    {view.confirmedAliases.map(a => <div key={a.alias}>Alias confirmado: {a.alias}<SourceRecordLinks sources={a.sources} /></div>)}
    {view.proposedAliases.length > 0 && <p>Aliases sin confirmar: {view.proposedAliases.join(', ')}</p>}
    <h3>Tema / stack documentado</h3>{view.claims.length ? view.claims.map(c => <DossierValue key={c.attribute} value={c} />) : <p>No hay afirmaciones documentadas sobre su foco.</p>}
    <h3>Ediciones y antecedentes</h3>
    {own.length === 0 && <p>Sin ediciones documentadas.</p>}
    {own.map(e => <article className="research-fact" key={e.editionId}>
      <button className="research-link" onClick={() => onEdition(e.editionId)}>{latestEdition(e).name}</button>
      <p>{latestEdition(e).location.name ?? 'Ciudad pendiente'} · {dateLabel(latestEdition(e).startDate)}</p>
      <p>{e.validity.validity === 'past' ? 'Antecedente histórico' : isSanFrancisco(latestEdition(e).location) ? 'Edición de SF; revisar condiciones' : 'Fuera de SF o ciudad pendiente; no recomendada como evento local'}</p>
      <DossierValue value={projectEditionDossierView(e).audience} />
      {projectEditionDossierView(e).otherClaims.filter(c => c.attribute === 'format').map(c => <DossierValue key={c.attribute} value={c} />)}
      {!projectEditionDossierView(e).otherClaims.some(c => c.attribute === 'format') && <p>Formato: pendiente de documentación.</p>}
    </article>)}
    {view.coverage.note && <p>{view.coverage.note}</p>}
    <h3>Empresas → edición → rol → fuente</h3>
    {view.participations.filter(p => own.some(e => e.editionId === p.editionId)).map(p => <Participation key={p.participationId} item={p} onEdition={onEdition} />)}
    {view.participations.length === 0 && <p>Sin participaciones de empresas documentadas.</p>}
  </section>
}
export function EditionDossier({ read, onEdition, onOrganizer }: { read: EditionDossierRead; onEdition: (id: string) => void; onOrganizer: (id: string) => void }) {
  const view = projectEditionDossierView(read)
  return <section className="dossier-surface" data-testid="edition-dossier">
    <span className="eyebrow">Dossier de edición</span><h2>{view.name}</h2><p className="research-meta">ID: {view.editionId} · {view.validity.validity} · {view.editionRevisionCount} revisión(es)</p>
    {view.listingLink.href && <a className="research-link" href={view.listingLink.href} target="_blank" rel="noreferrer">Abrir listado de la edición</a>}
    {view.listingLink.kind === 'synthetic' && <p className="research-meta">Listado de prueba · no corresponde a una página real.</p>}
    {view.listingLink.kind === 'invalid' && <p className="research-meta">Enlace del listado no disponible.</p>}
    {view.materialNote && <p className="dossier-material">{view.materialNote}</p>}
    <p className="research-meta dossier-verification">{view.curation ? `Verificado ${view.curation.verifiedAt} por ${view.curation.authorizedBy}` : 'Fecha de cobertura pendiente'}</p>
    <p>Organizadores: {view.organizers.map(o => <button className="research-link" key={o.organizerId} onClick={() => onOrganizer(o.organizerId)}>{o.displayName} ({o.organizerId})</button>)}</p>
    <div className="dossier-facts">{[view.date, view.location, view.audience, view.access, ...view.costs, ...view.otherClaims].map(c => <DossierValue key={c.attribute} value={c} />)}</div>
    <h3>Participaciones documentadas</h3>{view.participations.filter(p => p.editionId === read.editionId).map(p => <Participation key={p.participationId} item={p} onEdition={onEdition} />)}
  </section>
}
export function ReasonSources({ sourceIds, sources }: { sourceIds: string[]; sources: SourceRecord[] }) {
  return <SourceRecordLinks sources={sources.filter(s => sourceIds.includes(s.id))} unresolvedIds={sourceIds.filter(id => !sources.some(s => s.id === id))} />
}
