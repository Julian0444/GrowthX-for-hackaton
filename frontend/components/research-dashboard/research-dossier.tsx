"use client"

import { englishSystemText } from "../../lib/research/english"
import { opportunitySummary, readableDate } from '../../lib/research/presentation'
import { LocationEvidence } from "./location-evidence"
import { SourceRecordLinks } from "../atlas/evidence-links"
import { projectEditionDossierView, projectOrganizerDossierView, type DossierValueView, type DossierParticipationView } from "../../lib/api/opportunity-adapter"
import type { EditionDossierRead, OrganizerDossierRead } from "../../lib/api/atlas-client"
import type { SourceRecord, EditionRelationship } from "../../lib/contracts/evaluation"
import { dateLabel, isSanFrancisco, latestEdition } from "./research-model"

export function DossierValue({ value }: { value: DossierValueView }) {
  return <div className={`research-fact fact-${value.field.state}${value.conflict ? ' research-conflict' : ''}`}>
    <strong>{value.label}</strong>
    <p>{value.field.state === 'pending' ? value.field.note ?? 'Pending' : value.field.display}</p>
    {value.field.state === 'known' && <small>{value.field.claimStatus ?? 'Curated'} · {value.field.scope ?? 'Scope pending'} {value.field.pendingNote}</small>}
    {value.field.state === 'ambiguous' && <small>{value.field.note}</small>}
    <details data-testid="claim-evidence">
      <summary>{value.evidence?.length ? `Evidence · ${value.evidence.length} fragment(s)` : 'Source details'}</summary>
      {value.evidence?.map((ref,i) => { const fragment = value.sources.find(s => s.id === ref.sourceId)?.fragments?.find(f => f.id === ref.fragmentId); return <div key={i}><blockquote>{fragment?.text ?? ref.locator}</blockquote><small>{fragment?.locator}</small></div> })}
      {value.method && <small>Method: {value.method} · reviewed: {readableDate(value.reviewedAt)} · {value.reviewer}</small>}
      <SourceRecordLinks compact sources={value.sources} unresolvedIds={value.unresolvedSourceIds} />
    </details>
    {value.history.length > 1 && <details open={value.conflict}>
      <summary>{value.conflict ? 'Conflicting revisions' : 'Revision history'}</summary>
      {value.history.map(r => <div key={r.revisionId}><p>{r.display} · {r.status} · {readableDate(r.reviewedAt)}</p><details><summary>Technical reference</summary><small>{r.revisionId}</small></details>{r.note && <p>{r.note}</p>}
        <SourceRecordLinks sources={value.sources.filter(s => r.sourceIds.includes(s.id))} unresolvedIds={r.sourceIds.filter(id => !value.sources.some(s => s.id === id))} />
      </div>)}
    </details>}
    {value.pendingQuestion && <p className="research-pending">{value.pendingQuestion}</p>}
  </div>
}
function Participation({ item, onEdition }: { item: DossierParticipationView; onEdition: (id: string) => void }) {
  return <article className="research-fact" data-participation-id={item.participationId}>
    <strong>{item.company.name ?? item.company.companyId}</strong><small>Company: {item.company.companyId}</small>
    <p>→ <button className="research-link" onClick={() => onEdition(item.editionId)}>{item.editionName ?? item.editionId}</button> → <b>{item.role}</b> · {item.roleStatus}</p>
    <p>Announced: {item.announced ?? 'Unknown'}</p><p>Reported execution: {item.reportedExecution ?? 'Unknown'}</p>
    <p>{item.outcome.state === 'unknown' ? 'Commercial outcome unknown. Missing data does not establish success or failure.' : `Reported commercial outcome: ${item.outcome.summary}`}</p>
    {item.role === 'logo_present' && <p>Logo present: does not establish paid sponsorship or commercial success.</p>}
    <SourceRecordLinks sources={item.sources} />
    {item.outcome.state === 'reported' && <SourceRecordLinks sources={item.outcome.sources} />}
  </article>
}
export function OrganizerDossier({ read, editions, onEdition }: { read: OrganizerDossierRead; editions: EditionDossierRead[]; onEdition: (id: string) => void }) {
  const view = projectOrganizerDossierView(read)
  const own: EditionDossierRead[] = read.editions.map(({ edition, validity }) => editions.find(e => latestEdition(e).id === edition.id) ?? ({ contractVersion: '1', evaluatedAt: read.evaluatedAt, editionId: edition.editionId, editionRevisions: [edition], validity, organizers: [{organizerId:read.organizerId,revisions:read.organizerRevisions}], claims:read.claims.filter(c=>{ const subject=c.revisions.at(-1)?.subject; return subject?.type==='edition' && subject.editionId===edition.editionId }), participations:read.participations, companies:read.companies, sources:read.sources, curation:null }))
  const companyId = read.organizerRevisions.at(-1)?.companyId
  const companyRelationships = own.flatMap(edition => (latestEdition(edition).relationships ?? []).filter(relation => relation.entity.type === 'company').map(relation => ({ edition, relation })))
  return <section className="dossier-surface" data-testid="organizer-dossier">
    <span className="eyebrow">Organizer evidence</span><h2>{view.displayName}</h2><details><summary>Technical identity</summary><p className="research-meta">ID: {view.organizerId} · {view.revisionCount} revisions</p></details>
    {view.confirmedAliases.map(a => <div key={a.alias}>Confirmed alias: {a.alias}<SourceRecordLinks sources={a.sources} /></div>)}
    {view.proposedAliases.length > 0 && <p>Unconfirmed aliases: {view.proposedAliases.join(', ')}</p>}
    <h3>Identity, experience and open questions</h3>{view.claims.length ? view.claims.map(c => <DossierValue key={c.attribute} value={c} />) : <p>No documented claims about this organizer yet.</p>}
    <p>Published community descriptions are not attendance records. The operational contact, actual audience and commercial outcomes remain unverified unless explicitly documented below.</p>
    <h3>Editions and background</h3>
    {own.length === 0 && <p>No documented editions.</p>}
    {own.map(e => <article className="research-fact" key={e.editionId}>
      <button className="research-link" onClick={() => onEdition(e.editionId)}>{latestEdition(e).name}</button>
      <p>{latestEdition(e).location.name ?? 'City pending'} · {dateLabel(latestEdition(e).startDate)}</p>
      <p>Documented role: {(latestEdition(e).relationships ?? []).filter(r=>r.entity.type==='organizer'?r.entity.organizerId===read.organizerId:r.entity.type==='company'&&r.entity.companyId===companyId).map(r=>`${r.role} (${r.status})`).join(', ') || 'Organization listed in this revision'}</p>
      <p>{e.validity.validity === 'past' ? 'Past edition · background' : isSanFrancisco(latestEdition(e).location) ? 'SF edition; review conditions' : 'Outside SF or city pending; not a local opportunity'}</p>
      <DossierValue value={projectEditionDossierView(e).audience} />
      {projectEditionDossierView(e).otherClaims.filter(c => c.attribute === 'format').map(c => <DossierValue key={c.attribute} value={c} />)}
      {!projectEditionDossierView(e).otherClaims.some(c => c.attribute === 'format') && <p>Format: awaiting evidence.</p>}
      {projectEditionDossierView(e).otherClaims.filter(c => c.attribute === 'coverage:projects').map(c => <DossierValue key={c.attribute} value={c} />)}
      <p>{(latestEdition(e).relationships ?? []).filter(r=>r.entity.type==='project').map(r=>r.entity.type==='project'?r.entity.name:'').join(' · ')}</p>
    </article>)}
    {view.coverage.note && <p>{view.coverage.note}</p>}
    <h3>Companies → edition → role → source</h3>
    {companyRelationships.map(({edition, relation}) => <div key={`${edition.editionId}:${relation.id}`}>
      <button className="research-link" onClick={() => onEdition(edition.editionId)}>View edition: {latestEdition(edition).name}</button>
      <Relationship relation={relation} read={edition} />
    </div>)}
    {view.participations.filter(p => own.some(e => e.editionId === p.editionId)).map(p => <Participation key={p.participationId} item={p} onEdition={onEdition} />)}
    {view.participations.length === 0 && companyRelationships.length === 0 && <p>No documented company participation.</p>}
  </section>
}
export function EditionDossier({ read, onEdition, onOrganizer, briefContext }: { read: EditionDossierRead; briefContext?: { reason: string | null }; onEdition: (id: string) => void; onOrganizer: (id: string) => void }) {
  const view = projectEditionDossierView(read)
  const summary = opportunitySummary(read)
  return <section className="dossier-surface" data-testid="edition-dossier" data-edition-id={view.editionId} data-edition-revision-id={view.editionRevisionId}>
    <span className="eyebrow">Event evidence</span><h2>{view.name}</h2><p>{dateLabel(latestEdition(read).startDate)} · {view.validity.validity === "past" ? "Past edition" : "Review conditions"}</p>
    {view.listingLink.href && <a className="research-link" href={view.listingLink.href} target="_blank" rel="noreferrer">Open event listing</a>}
    {view.listingLink.kind === 'synthetic' && <p className="research-meta">Test listing · not a real page.</p>}
    {view.listingLink.kind === 'invalid' && <p className="research-meta">Event listing unavailable.</p>}
    <p className="dossier-material">{view.materialNote}</p><p className="event-pending"><b>{summary.conflict ? "Contradiction" : "To confirm"}:</b> {summary.pending}</p>
    <p className="research-meta dossier-verification">{view.curation ? view.curation.material === 'imported' ? `Source obtained ${readableDate(view.curation.verifiedAt)} · automatically extracted; not human verified` : `Curated ${readableDate(view.curation.verifiedAt)} by ${view.curation.authorizedBy}` : 'Coverage date pending'}</p>
    {briefContext?.reason && <p className="dossier-material"><b>For this saved comparison:</b> {briefContext.reason}</p>}
    {briefContext ? <details><summary>Buyer hypotheses from the original source reading</summary><p>These claims retain the brief used when the sources were read. The current comparison explanation is shown above.</p>{view.otherClaims.filter(c=>c.attribute.startsWith('buyer:')).map(c=><DossierValue key={c.attribute} value={c}/>)}</details> : view.otherClaims.filter(c=>c.attribute.startsWith('buyer:')).map(c=><DossierValue key={c.attribute} value={c}/>)}
    <p>Organizers / listed hosts: {view.organizers.filter(o=>latestEdition(read).organizerIds.includes(o.organizerId)).map(o => <button className="research-link" key={o.organizerId} onClick={() => onOrganizer(o.organizerId)}>{o.displayName}</button>)}</p>
    <div className="dossier-facts">{[view.date, view.location, view.audience, view.access, ...view.costs, ...view.otherClaims.filter(c=>!c.attribute.startsWith('buyer:')&&!c.attribute.startsWith('relationship:')&&!c.attribute.startsWith('project:'))].map(c => <DossierValue key={c.attribute} value={c} />)}</div>
    <LocationEvidence location={view.publicLocation} withoutPointReason={view.withoutPointReason} sources={read.sources} />
    {view.relationships.length > 0 && <section aria-label="Relationships for this edition"><h3>Relationships supported by evidence</h3>{view.relationships.map(relation => <Relationship key={relation.id} relation={relation} read={read} />)}</section>}
    <section className="dossier-source-summary" aria-label="Source summary"><h3>Sources · {new Set(read.sources.map(s => s.id)).size}</h3><p>Source metadata is listed once. Each fact above links to the excerpt that supports it.</p><SourceRecordLinks sources={read.sources}/></section>
    <details><summary>Technical identity and saved revision</summary><p>{view.editionId} · {view.editionRevisionId} · {view.editionRevisionCount} revisions</p></details>
    <h3>Documented participation</h3>{view.participations.filter(p => p.editionId === read.editionId).map(p => <Participation key={p.participationId} item={p} onEdition={onEdition} />)}
  </section>
}
export function ReasonSources({ sourceIds, sources }: { sourceIds: string[]; sources: SourceRecord[] }) {
  return <SourceRecordLinks sources={sources.filter(s => sourceIds.includes(s.id))} unresolvedIds={sourceIds.filter(id => !sources.some(s => s.id === id))} />
}

function Relationship({ relation, read }: { relation: EditionRelationship; read: EditionDossierRead }) {
  const entity = relation.entity
  const name = entity.type === 'project' ? entity.name : entity.type === 'company'
    ? read.companies.find(c => c.id === entity.companyId)?.name ?? entity.companyId
    : read.organizers.find(o => o.organizerId === entity.organizerId)?.revisions.at(-1)?.displayName ?? entity.organizerId
  return <article className="research-fact" data-relationship-id={relation.id}>
    <strong>{name}</strong><p>{relation.role} · {relation.status} · {relation.scope}</p>
    {entity.type === 'project' && /^https:\/\//.test(entity.url) && <a className="research-link" href={entity.url} target="_blank" rel="noreferrer">Open published project ↗</a>}
    {entity.type === 'project' && projectEditionDossierView(read).otherClaims.filter(c=>c.attribute.startsWith(`project:${entity.projectId}:`)).map(c=><DossierValue key={c.attribute} value={c}/>)}
    <details><summary>Evidence for this edition and role</summary>{relation.evidence.map((ref, i) => {
      const source = read.sources.find(s => s.id === ref.sourceId)
      const fragment = source?.fragments?.find(f => f.id === ref.fragmentId)
      return <p key={i}>{fragment?.text ?? ref.locator} · {fragment?.locator}</p>
    })}
    <ReasonSources sourceIds={relation.sourceIds} sources={read.sources} /></details>
    {relation.limitation && <p>{englishSystemText(relation.limitation)}</p>}
  </article>
}
