import { englishSystemText } from "../../lib/research/english"
import "./comparison-reading.css"
import { alternativeReason } from "../../lib/research/presentation"
import type { AlternativeReading, ComparisonReason } from '../../lib/contracts/comparison'
import type { EvaluationReadBundle } from '../../lib/contracts/evaluation'
import { SourceRecordLinks } from '../atlas/evidence-links'

function Reason({label,reason,bundle,onOpenEdition}:{label:string;reason:ComparisonReason;bundle:EvaluationReadBundle;onOpenEdition:(id:string)=>void}) {
  return <div className="comparison-reason">
    <p><b>{label}:</b> {englishSystemText(reason.text)}</p>
    {reason.basis.length>0 && <details data-testid="comparison-reason-evidence"><summary>View {label.toLowerCase()} evidence</summary>
      {reason.basis.map((ref,index)=>{
        const edition=bundle.editions.find(e=>e.id===ref.editionRevisionId)
        const claims=bundle.claims.filter(c=>ref.claimRevisionIds.includes(c.id))
        const evidence=claims.flatMap(c=>c.evidence??[])
        return <div key={`${ref.editionRevisionId}:${index}`}>
          <button type="button" className="research-link" onClick={()=>onOpenEdition(ref.editionId)}>{edition?.name??ref.editionId} · saved revision</button>
          <details><summary>Revision reference</summary><p className="research-meta">{ref.editionRevisionId}</p></details>
          {claims.map(c=><p key={c.id}>{c.attribute} [{c.status}]: {c.value.kind==='text'?c.value.text:c.value.kind==='pending'?englishSystemText(c.value.note ?? 'Pending'):'See value in dossier'}</p>)}
          {evidence.map((r,i)=>{
            const source=bundle.sources.find(s=>s.id===r.sourceId),fragment=source?.fragments?.find(f=>f.id===r.fragmentId)
            return <blockquote key={i}>{fragment?.text??r.locator??'Excerpt unavailable in this saved evidence'}</blockquote>
          })}
          <SourceRecordLinks sources={bundle.sources.filter(s=>ref.sourceIds.includes(s.id))}/>
        </div>
      })}
    </details>}
  </div>
}
export function AlternativeDecisionSummary({reading,bundle}:{reading:AlternativeReading;bundle:EvaluationReadBundle}) {
 const conciseReason = alternativeReason(reading, bundle.editions)
 const needsQuote = /incomplet|unknown|pendiente|desconocid|contradict/i.test(reading.cost)
 return <div data-testid="alternative-reading">
   <p className="event-relevance"><b>Why explore:</b> {conciseReason}</p>
   <p className="event-pending" data-testid="comparison-next-question"><b>{needsQuote ? 'Budget incomplete' : 'To confirm'}:</b> {needsQuote ? 'Request the full participation cost, currency and package. Resolve open conditions before committing budget.' : 'Confirm audience, access and permission for the proposed activity.'}</p>
 </div>
}

export function AlternativeDecisionReading({reading,bundle,onOpenEdition}:{reading:AlternativeReading;bundle:EvaluationReadBundle;onOpenEdition:(id:string)=>void}) {
 return <details className="alternative-full-reading"><summary>Background, proposed activity and cost</summary>
   <p><b>Saved next question:</b> {englishSystemText(reading.nextQuestion)}</p>
   <Reason label="Relevance" reason={reading.relevance} bundle={bundle} onOpenEdition={onOpenEdition}/>
   {reading.antecedents.length ? reading.antecedents.map((reason,i)=><Reason key={i} label="Background" reason={reason} bundle={bundle} onOpenEdition={onOpenEdition}/>) : <p><b>Background:</b> No documented previous edition linked to this identity in the reviewed coverage.</p>}
   <Reason label={reading.modality.status==='published'?'Published format':reading.modality.status==='proposed'?'Proposed activity':'Format pending'} reason={reading.modality} bundle={bundle} onOpenEdition={onOpenEdition}/>
   <p><b>Evidence quality ({reading.evidenceQuality.status}):</b> {englishSystemText(reading.evidenceQuality.note)}</p>
   <p><b>Cost and open questions:</b> {englishSystemText(reading.cost)}</p>
   </details>
}
