'use client'
import {useState} from 'react'
import type {EvaluationProfile,ResearchBriefInput} from '../../lib/contracts/evaluation'
const lines=(value:string)=>value.split('\n').map(v=>v.trim()).filter(Boolean)
export function ComparisonBriefEditor({profile,busy,onSubmit}:{profile:EvaluationProfile;busy:boolean;onSubmit:(profile:ResearchBriefInput)=>void}) {
 const [draft,setDraft]=useState<ResearchBriefInput>({product:profile.product,audienceDescription:profile.audience.description,audienceProfiles:profile.audience.profiles,stack:profile.stack,budget:profile.budget,window:profile.window,objective:profile.objective,restrictions:profile.restrictions,formats:profile.formats??[],geography:profile.geography,comparableCompanies:profile.comparableCompanies})
 const [listDraft,setListDraft]=useState({profiles:profile.audience.profiles.join('\n'),stack:profile.stack.join('\n'),restrictions:profile.restrictions.join('\n'),formats:(profile.formats??[]).join('\n')})
 const [budget,setBudget]=useState(profile.budget.status==='declared'?String(profile.budget.amount):'')
 const [currency,setCurrency]=useState(profile.budget.status==='declared'?profile.budget.currency:'USD')
 return <details data-testid="comparison-brief-editor"><summary>Edit brief and compare again</summary>
 <form onSubmit={event=>{event.preventDefault();onSubmit({...draft,audienceProfiles:lines(listDraft.profiles),stack:lines(listDraft.stack),restrictions:lines(listDraft.restrictions),formats:lines(listDraft.formats),budget:budget.trim()?{status:'declared',amount:Number(budget),currency}:{status:'unknown'}})}} className="research-decision-condition">
 <p>Saved brief v{profile.profileVersion}. Editing creates a linked evaluation with its differences. SF remains the city for this research.</p>
 <label>Product<textarea aria-label="Comparison product" required value={draft.product} onChange={e=>setDraft(current=>({...current,product:e.target.value}))}/></label>
 <label>Audience<textarea aria-label="Comparison audience" required value={draft.audienceDescription} onChange={e=>setDraft(current=>({...current,audienceDescription:e.target.value}))}/></label>
 <label>Segments (one per line)<textarea value={listDraft.profiles} onChange={e=>setListDraft(current=>({...current,profiles:e.target.value}))}/></label>
 <label>Stack (one per line)<textarea aria-label="Comparison stack" value={listDraft.stack} onChange={e=>setListDraft(current=>({...current,stack:e.target.value}))}/></label>
 <label>Goal<select aria-label="Comparison goal" value={draft.objective.kind} onChange={e=>setDraft(current=>({...current,objective:{...current.objective,kind:e.target.value as EvaluationProfile['objective']['kind']}}))}><option value="adoption">Adoption</option><option value="feedback">Feedback</option><option value="hiring">Hiring</option><option value="awareness">Awareness</option></select></label>
 <label><input type="checkbox" checked={draft.objective.confirmation==='confirmed'} onChange={e=>setDraft(current=>({...current,objective:{...current.objective,confirmation:e.target.checked?'confirmed':'provisional'}}))}/>Goal declared by the buyer</label>
 <label>Expected success<textarea value={draft.objective.successDefinition?.status==='defined'?draft.objective.successDefinition.text:''} onChange={e=>setDraft(current=>({...current,objective:{...current.objective,successDefinition:e.target.value.trim()?{status:'defined',text:e.target.value}:{status:'pending'}}}))}/></label>
 <label>Budget (blank = pending)<input aria-label="Comparison budget" type="number" min="0" step="any" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
 <label>Currency<input aria-label="Comparison currency" required pattern="[A-Z]{3}" value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
 <label>From<input aria-label="Comparison start date" type="date" value={draft.window.from??''} onChange={e=>setDraft(current=>({...current,window:{...current.window,from:e.target.value||null}}))}/></label>
 <label>To<input aria-label="Comparison end date" type="date" value={draft.window.to??''} onChange={e=>setDraft(current=>({...current,window:{...current.window,to:e.target.value||null}}))}/></label>
 <label>Constraints (one per line)<textarea aria-label="Comparison constraints" value={listDraft.restrictions} onChange={e=>setListDraft(current=>({...current,restrictions:e.target.value}))}/></label>
 <label>Formats (one per line)<textarea aria-label="Comparison formats" value={listDraft.formats} onChange={e=>setListDraft(current=>({...current,formats:e.target.value}))}/></label>
 <button type="submit" className="research-button" disabled={busy}>{busy?'Starting…':'Create evaluation with this brief'}</button>
 </form></details>
}
