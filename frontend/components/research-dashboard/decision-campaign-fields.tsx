'use client'

import type { CampaignDraftInput } from '../../lib/api/atlas-client'
import type { CampaignDraftRecord, EvaluationProfile, MoneyClaim, SourceRecord } from '../../lib/contracts/evaluation'
import { moneyText } from '../../lib/research/decision-brief'

export function campaignInput(campaign: CampaignDraftRecord | null, profile: EvaluationProfile): CampaignDraftInput {
  return {
    objective: campaign?.objective ?? `${profile.objective.kind}${profile.objective.confirmation === 'provisional' ? ' (provisional buyer objective)' : ''}`,
    owner: campaign?.owner ?? null, successDefinition: campaign ? campaign.successDefinition : profile.objective.successDefinition.status === 'defined' ? profile.objective.successDefinition.text : null,
    modality: campaign?.modality.status === 'defined' ? {kind: campaign.modality.kind, detail: campaign.modality.detail, basis: campaign.modality.basis ?? 'proposed',
      ...(campaign.modality.declaration ? {attribution: {attributedTo: campaign.modality.declaration.attributedTo, support: campaign.modality.declaration.support, sourceIds: campaign.modality.declaration.sourceIds}} : {})} : null,
    costItems: campaign ? campaign.costItems.filter(c => !c.evidence).map(c => ({label:c.label, amount:c.amount, ...(c.declaration ? {attribution: {attributedTo:c.declaration.attributedTo,support:c.declaration.support,sourceIds:c.declaration.sourceIds}} : {})})) : [],
    openQuestions: campaign?.openQuestions ?? [], commitments: campaign?.commitments.map(({description,kind,owner,dueBy,confirmation}) => ({description,kind,owner,dueBy,confirmation})) ?? [],
  }
}

export function DecisionCampaignFields({value, onChange, sources, originalCosts}: {
  value: CampaignDraftInput; onChange: (value: CampaignDraftInput) => void; sources: SourceRecord[]; originalCosts: string[]
}) {
  const set = (patch: Partial<CampaignDraftInput>) => onChange({...value,...patch})
  const costs = value.costItems ?? []
  return <fieldset className="decision-campaign-fields"><legend>Actionable brief</legend>
    <p>Buyer inputs. Proposed activities need organizer agreement; an offer entered here is reported by the buyer.</p>
    <label>Activity objective<input aria-label="Activity objective" value={value.objective ?? ''} onChange={e=>set({objective:e.target.value})}/></label>
    <label>Brief owner<input aria-label="Brief owner" value={value.owner ?? ''} onChange={e=>set({owner:e.target.value || null})}/></label>
    <label>Success definition<input aria-label="Decision success definition" value={value.successDefinition ?? ''} onChange={e=>set({successDefinition:e.target.value || null})}/></label>
    <label>Modality<select aria-label="Activity modality" value={value.modality?.kind ?? ''} onChange={e=>set({modality:e.target.value ? {kind:e.target.value as NonNullable<CampaignDraftInput['modality']>['kind'],detail:null,basis:'proposed'} : null})}>
      <option value="">Pending</option><option value="workshop">Workshop</option><option value="sponsorship">Sponsorship</option><option value="co_hosted">Co-hosted activity</option><option value="booth">Booth</option><option value="other">Other</option>
    </select></label>
    {value.modality && <>
      <label>Activity detail<input aria-label="Activity detail" value={value.modality.detail ?? ''} onChange={e=>set({modality:{...value.modality!,detail:e.target.value || null}})}/></label>
      <label>Proposal or offer<select aria-label="Modality basis" value={value.modality.basis ?? 'proposed'} onChange={e=>set({modality:{...value.modality!,basis:e.target.value as 'proposed'|'offered'}})}><option value="proposed">Team proposal · not offered</option><option value="offered">Offer reported by buyer</option></select></label>
      {value.modality.basis === 'offered' && <>
        <label>Who offered it?<input aria-label="Offer attributed to" value={value.modality.attribution?.attributedTo ?? ''} onChange={e=>set({modality:{...value.modality!,attribution:{support:'',sourceIds:[],...value.modality!.attribution,attributedTo:e.target.value}}})}/></label>
        <label>Offer support or reference<textarea aria-label="Offer support" value={value.modality.attribution?.support ?? ''} onChange={e=>set({modality:{...value.modality!,attribution:{attributedTo:'',sourceIds:[],...value.modality!.attribution,support:e.target.value}}})}/></label>
      </>}
    </>}
    <label>Next questions (one per line)<textarea aria-label="Next questions" value={(value.openQuestions ?? []).join('\n')} onChange={e=>set({openQuestions:e.target.value.split('\n')})}/></label>
    <details><summary>Original cost evidence · retained in this revision</summary><ul>{originalCosts.map((c,i)=><li key={i}>{c}</li>)}</ul></details>
    <p>Buyer cost inputs are additional items. Pending, inferred and contradicted amounts remain uncertain. These items do not establish a complete budget.</p>
    {costs.map((cost,index)=>{
      const amount=cost.amount as MoneyClaim
      const change=(patch: Partial<(typeof costs)[number]>)=>set({costItems:costs.map((item,i)=>i===index?{...item,...patch}:item)})
      return <fieldset key={index}><legend>Buyer cost {index+1}</legend>
        <label>Cost label<input aria-label={`Cost ${index+1} label`} value={cost.label} onChange={e=>change({label:e.target.value})}/></label>
        <label>Cost state<select aria-label={`Cost ${index+1} state`} value={amount.status} onChange={e=>{
          const status=e.target.value as MoneyClaim['status']
          change({amount:status==='unknown'?{status,note:null}:status==='quoted'?{status,amount:0,currency:'USD',sourceIds:[]}:
            status==='estimated'?{status,amount:0,currency:'USD',basis:'Buyer estimate'}:{status,amount:0,currency:'USD',basis:'Buyer input',sourceIds:[],note:null}})
        }}><option value="unknown">Pending amount</option><option value="estimated">Team estimate</option><option value="quoted">Quote with saved source</option><option value="inferred">Inferred</option><option value="contradicted">Contradicted</option></select></label>
        {amount.status!=='unknown' && <>
          <label>Amount<input aria-label={`Cost ${index+1} amount`} type="number" min="0" value={amount.amount} onChange={e=>change({amount:{...amount,amount:e.target.value===''?Number.NaN:Number(e.target.value)}})}/></label>
          <label>Currency<input aria-label={`Cost ${index+1} currency`} value={amount.currency} onChange={e=>change({amount:{...amount,currency:e.target.value}})}/></label>
          {'basis' in amount && <label>Basis<input aria-label={`Cost ${index+1} basis`} value={amount.basis} onChange={e=>change({amount:{...amount,basis:e.target.value}})}/></label>}
          {'sourceIds' in amount && <label>Saved source<select aria-label={`Cost ${index+1} source`} value={amount.sourceIds[0]??''} onChange={e=>change({amount:{...amount,sourceIds:e.target.value?[e.target.value]:[]}})}><option value="">No source</option>{sources.map(s=><option key={s.id} value={s.id}>{s.title??s.url??s.id}</option>)}</select></label>}
        </>}
        {amount.status==='unknown' && <label>What is missing?<input aria-label={`Cost ${index+1} pending note`} value={amount.note??''} onChange={e=>change({amount:{...amount,note:e.target.value||null}})}/></label>}
        <label>Attribution<input aria-label={`Cost ${index+1} attribution`} value={cost.attribution?.attributedTo??'Buyer'} onChange={e=>change({attribution:{support:'Buyer input',sourceIds:[],...cost.attribution,attributedTo:e.target.value}})}/></label>
        <label>Support or reference<input aria-label={`Cost ${index+1} support`} value={cost.attribution?.support??'Buyer input'} onChange={e=>change({attribution:{attributedTo:'Buyer',sourceIds:[],...cost.attribution,support:e.target.value}})}/></label>
        <button className="research-link" onClick={()=>set({costItems:costs.filter((_,i)=>i!==index)})} type="button">Remove buyer cost {index+1}</button>
      </fieldset>
    })}
    <button type="button" className="research-button" onClick={()=>set({costItems:[...costs,{label:'',amount:{status:'unknown',note:null},attribution:{attributedTo:'Buyer',support:'Buyer input; amount pending',sourceIds:[]}}]})}>Add buyer cost</button>
  </fieldset>
}

export function originalCostText(campaign: CampaignDraftRecord | null): string[] {
  return campaign?.costItems.filter(c=>c.evidence).map(c=>`${c.label}: ${moneyText(c.amount)}`) ?? []
}
