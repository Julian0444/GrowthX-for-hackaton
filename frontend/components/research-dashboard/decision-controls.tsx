'use client'

import { englishSystemText } from "../../lib/research/english"
import {useRef, useState} from 'react'
import {fetchDecisionRead, reviseConditionalDecision, saveConditionalDecision, type DecisionRead, type DecisionConditionDraft} from '../../lib/api/atlas-client'
import type {ComparisonCandidateView} from '../../lib/api/opportunity-adapter'
import type {EvaluationReadBundle} from '../../lib/contracts/evaluation'
import {attributionText, composeDecisionBrief, copyText, decisionLabel} from '../../lib/research/decision-brief'
import {campaignInput, DecisionCampaignFields, originalCostText} from './decision-campaign-fields'
import {evaluationHref, type EvaluationFocus} from './evaluation-list'

const EMPTY: DecisionConditionDraft = {snapshotConditionId:null,pendingItem:'',question:null,expectedAnswer:null,effect:null,owner:null,dueBy:null}
const lines=(text:string)=>text.split('\n').map(s=>s.trim()).filter(Boolean)
const cleanCondition=(c:DecisionConditionDraft):DecisionConditionDraft=>({...c,pendingItem:c.pendingItem.trim(),question:c.question?.trim()||null,expectedAnswer:c.expectedAnswer?.trim()||null,owner:c.owner?.trim()||null,dueBy:c.dueBy?.trim()||null})

export function DecisionControls({runId,snapshotId,candidate,saved,loading,previous,previousRunId,onSaved,onOpenCampaign,onOpenRun,bundle,onToast}: {
  runId:string; snapshotId:string; candidate:ComparisonCandidateView; saved:DecisionRead|null; loading:boolean;
  previous:DecisionRead|null; previousRunId:string|null; bundle:EvaluationReadBundle;
  onSaved:(read:DecisionRead)=>void; onOpenCampaign:(read:DecisionRead)=>void;
  onOpenRun:(runId:string,focus:EvaluationFocus)=>void; onToast:(message:string)=>void
}) {
  const excluded=candidate.dossier.eligibility.status==='excluded'
  const [open,setOpen]=useState(false)
  const [choice,setChoice]=useState('chosen')
  const [reasons,setReasons]=useState('')
  const [campaign,setCampaign]=useState(()=>campaignInput(null,bundle.profile))
  const [conditions,setConditions]=useState<DecisionConditionDraft[]>([])
  const [condition,setCondition]=useState<DecisionConditionDraft>(EMPTY)
  const [busy,setBusy]=useState(false)
  const [note,setNote]=useState<string|null>(null)
  const [conflict,setConflict]=useState<{decisionId:string;message:string}|null>(null)
  const [base,setBase]=useState<DecisionRead|null>(null)
  const [resolving,setResolving]=useState<string|null>(null)
  const [answer,setAnswer]=useState('')
  const [attributedTo,setAttributedTo]=useState('Buyer')
  const [support,setSupport]=useState('')
  const [preview,setPreview]=useState<string|null>(null)
  const submission=useRef<{body:string;key:string}|null>(null)
  const revisionBase=base??saved
  const keyFor=(body:unknown)=>{
    const json=JSON.stringify(body)
    if(submission.current?.body!==json)submission.current={body:json,key:crypto.randomUUID()}
    return submission.current!.key
  }
  function edit() {
    setBase(saved);setChoice(saved?.decision.intent==='explore_first'?'explore_first':saved?.decision.verdict??(excluded?'discarded':'chosen'))
    setReasons(saved?.decision.reasons.join('\n')??'');setCampaign(campaignInput(saved?.campaign??null,bundle.profile));setConditions([]);setCondition(EMPTY);setNote(null);setOpen(true)
  }
  async function reload() {
    if(!conflict||busy)return
    setBusy(true)
    const result=await fetchDecisionRead(conflict.decisionId)
    setBusy(false)
    if(result.status!=='ok'){setNote('Could not read the current revision. Your text is preserved.');return}
    setBase(result.read);onSaved(result.read);setConflict(null)
    setNote(`Current revision ${result.read.decision.revision} loaded. Saved reasons: ${result.read.decision.reasons.join(' / ')}. Your draft is preserved. Review both versions before saving a new revision.`)
  }
  async function save() {
    if(busy||conflict)return
    const reasonLines=lines(reasons)
    if(!reasonLines.length){setNote('Add at least one reason (one per line).');return}
    const verdict=choice==='explore_first'?'pending':choice as 'chosen'|'discarded'|'pending'
    const draft=choice==='chosen'||choice==='explore_first'?{...campaign,objective:campaign.objective?.trim()||null,openQuestions:(campaign.openQuestions??[]).map(s=>s.trim()).filter(Boolean)}:null
    const newConditions=[...conditions,...(condition.pendingItem.trim()?[condition]:[])].map(cleanCondition)
    const fields={verdict,intent:choice==='explore_first'?'explore_first' as const:null,reasons:reasonLines,campaignDraft:draft}
    const body=revisionBase?{...fields,expectedRevision:revisionBase.decision.revision,addConditions:newConditions}:{...fields,snapshotId,editionId:candidate.editionId,conditions:newConditions}
    setBusy(true);setNote(null)
    const outcome=revisionBase?await reviseConditionalDecision(revisionBase.decisionId,{...fields,expectedRevision:revisionBase.decision.revision,addConditions:newConditions,idempotencyKey:keyFor(body)}):await saveConditionalDecision({...fields,snapshotId,editionId:candidate.editionId,conditions:newConditions,idempotencyKey:keyFor(body)})
    setBusy(false)
    if(outcome.status==='saved'){
      submission.current=null;setBase(outcome.read);setOpen(false);onSaved(outcome.read)
      if(outcome.read.campaign)onOpenCampaign(outcome.read)
    }else{
      setNote(`${outcome.message} Your draft is preserved.`)
      if(outcome.status==='conflict'&&(revisionBase||outcome.decisionId))setConflict({decisionId:revisionBase?.decisionId??outcome.decisionId!,message:outcome.message})
    }
  }
  async function resolve(conditionId:string) {
    if(!revisionBase||busy||conflict)return
    if(!answer.trim()||!attributedTo.trim()||!support.trim()){setNote('Record the answer, who supplied it and its support or reference.');return}
    const body={expectedRevision:revisionBase.decision.revision,resolveConditions:[{conditionId,resolvedNote:answer.trim(),attribution:{attributedTo:attributedTo.trim(),support:support.trim(),sourceIds:[]}}]}
    setBusy(true);setNote(null)
    const outcome=await reviseConditionalDecision(revisionBase.decisionId,{...body,idempotencyKey:keyFor(body)})
    setBusy(false)
    if(outcome.status==='saved'){submission.current=null;setResolving(null);setAnswer('');setSupport('');setBase(outcome.read);onSaved(outcome.read)}
    else {setNote(`${outcome.message} Your written answer is preserved.`);if(outcome.status==='conflict')setConflict({decisionId:revisionBase.decisionId,message:outcome.message})}
  }
  // Only inherited snapshot text is system copy; preserve buyer additions verbatim.
  const savedConditionText=(id:string,description:string)=>{
    const original=bundle.snapshot.alternatives.find(a=>a.editionId===candidate.editionId)?.conditions.find(c=>c.id===id)
    if(!original)return description
    const expected=original.resolution?`${original.description} — Qué respuesta la resolvería: ${original.resolution}`:original.description
    const current=original.resolution?`${original.description} — Answer needed to resolve this: ${original.resolution}`:original.description
    return description===expected||description===current?englishSystemText(description):description
  }
  const href=saved?evaluationHref(runId,{decisionId:saved.decisionId,view:'comparison',revision:saved.decision.revision}):null
  async function copy(message=false) {
    if(!saved||!href)return
    const text=composeDecisionBrief(saved,bundle,`${window.location.origin}${href}`,message)
    setPreview(text);onToast(await copyText(text))
  }
  if(loading)return <p role="status" data-testid="decision-loading">Loading saved decisions…</p>
  return <div className="research-decision" data-testid={saved?'candidate-decision':open?'decision-form':undefined} data-decision-id={saved?.decisionId}>
    {previous&&previousRunId&&<p data-testid="previous-decision" data-decision-id={previous.decisionId}>Previous evaluation decision: {decisionLabel(previous.decision)} · revision {previous.decision.revision}. <button type="button" className="research-link" onClick={()=>onOpenRun(previousRunId,{decisionId:previous.decisionId,view:'comparison',revision:previous.decision.revision})}>Open previous decision</button></p>}
    {saved&&<>
      <p><b data-testid="decision-state">{decisionLabel(saved.decision)}</b> · revision <span data-testid="decision-revision">{saved.decision.revision}</span> · recorded on <span data-testid="decision-decided-at">{saved.decision.decidedAt}</span></p>
      <ul>{saved.decision.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul>
      <div className="research-actions"><button className="research-button" onClick={()=>void copy()}>Copy decision brief</button><button className="research-link" onClick={()=>void copy(true)}>Copy inquiry message</button>
        <button className="research-link" onClick={edit}>Edit decision & brief</button>
        {saved.campaign&&<button className="research-button" data-testid="open-campaign" onClick={()=>onOpenCampaign(saved)}>Open saved campaign draft</button>}
      </div>
      <details><summary>Decision technical details</summary><p>Decision <span data-testid="decision-id">{saved.decisionId}</span> · snapshot {saved.snapshotId}. <a data-testid="decision-link" href={href!}>Internal link</a> <button className="research-link" onClick={async()=>onToast(await copyText(`${window.location.origin}${href}`))}>Copy link</button></p></details>
      <div data-testid="decision-conditions"><p>Conditions (saving does not send messages):</p><ul>{saved.decision.conditions.map(c=><li key={c.id}>
        {c.status==='resolved'?'✔':'○'} {savedConditionText(c.id,c.description)}{c.owner?` · Owner: ${c.owner}`:''}{c.dueBy?` · Due: ${c.dueBy}`:''}{c.answerWouldChangeTo?` · Effect: ${c.answerWouldChangeTo}`:''}
        {c.resolvedNote&&<p>Resolved: {c.resolvedNote} · {attributionText(c.response)}</p>}
        {c.status==='open'&&resolving!==c.id&&<button className="research-link" disabled={busy||!!conflict} onClick={()=>{setBase(saved);setResolving(c.id);setAnswer('');setSupport('');setAttributedTo('Buyer')}}>Mark resolved</button>}
        {resolving===c.id&&<div className="condition-response">
          {c.status==='resolved'&&<p>Your unsaved answer is preserved below; another revision resolved this condition.</p>}
          <label>Answer<input aria-label="Answer resolving the condition" value={answer} onChange={e=>setAnswer(e.target.value)}/></label>
          <label>Response supplied by<input aria-label="Response attributed to" value={attributedTo} onChange={e=>setAttributedTo(e.target.value)}/></label>
          <label>Support or reference<textarea aria-label="Response support" value={support} onChange={e=>setSupport(e.target.value)}/></label>
          <p>Recorded as a buyer report. This does not change the original evidence.</p>
          <button className="research-link" disabled={busy||!!conflict||c.status==='resolved'} onClick={()=>void resolve(c.id)}>Confirm resolution</button>
        </div>}
      </li>)}</ul></div>
      {saved.revisions.length>1&&<details data-testid="decision-history"><summary>Saved revisions ({saved.revisions.length})</summary><ul>{saved.revisions.map(r=><li key={r.id}>revision {r.revision} · {decisionLabel(r)} · reasons: {r.reasons.join(' / ')} <a href={evaluationHref(runId,{decisionId:saved.decisionId,view:'comparison',revision:r.revision})}>Open revision {r.revision}</a></li>)}</ul></details>}
    </>}
    {!open&&!saved&&<button className="research-button research-primary" data-testid="decision-open" onClick={edit}>Record decision</button>}
    {open&&<div data-testid={saved?'decision-edit-form':undefined}>
      <p><b>{saved?'Edit decision & brief':'Record decision'}</b> · reasons are required. Saving does not send a message or book anything.</p>
      <fieldset><legend>Decision</legend>{[['explore_first','Explore first'],['chosen','Choose'],['discarded','Discard'],['pending','Leave pending']].map(([v,label])=><label key={v}><input type="radio" name={`verdict-${candidate.editionId}`} checked={choice===v} disabled={v==='chosen'&&excluded} onChange={()=>setChoice(v)}/>{label}</label>)}</fieldset>
      {excluded&&<p data-testid="decision-excluded-note">A confirmed constraint excludes this event. New evidence and a re-evaluation are needed before choosing it.</p>}
      <label>Reasons (required, one per line)<textarea aria-label="Decision reasons" value={reasons} onChange={e=>setReasons(e.target.value)} rows={3}/></label>
      {(choice==='chosen'||choice==='explore_first')&&<DecisionCampaignFields value={campaign} onChange={setCampaign} sources={bundle.sources} originalCosts={saved?.campaign?originalCostText(saved.campaign):candidate.dossier.costs.map(c=>`${c.label}: ${c.value.state==='pending'?'Pending':c.value.display}`)}/>}
      <p>Original audience, access, cost and date conditions remain attached to the decision.</p>
      {conditions.map((c,i)=><p key={i}>{c.pendingItem} · {c.question}<button className="research-link" onClick={()=>setConditions(conditions.filter((_,n)=>n!==i))}>Remove</button></p>)}
      <details><summary>Add a condition: question, expected answer, effect, owner and due date</summary>
        <label>Pending item<input aria-label="Pending item" value={condition.pendingItem} onChange={e=>setCondition({...condition,pendingItem:e.target.value})}/></label>
        <label>Question to organizer<input aria-label="Question to organizer" value={condition.question??''} onChange={e=>setCondition({...condition,question:e.target.value})}/></label>
        <label>Expected answer<input aria-label="Expected answer" value={condition.expectedAnswer??''} onChange={e=>setCondition({...condition,expectedAnswer:e.target.value})}/></label>
        <label>Effect<select aria-label="Effect on the decision" value={condition.effect??''} onChange={e=>setCondition({...condition,effect:e.target.value?e.target.value as 'chosen'|'discarded':null})}><option value="">To be defined</option><option value="chosen">If confirmed → choose</option><option value="discarded">If confirmed → discard</option></select></label>
        <label>Owner<input aria-label="Owner" value={condition.owner??''} onChange={e=>setCondition({...condition,owner:e.target.value})}/></label>
        <label>Due date<input aria-label="Due date" value={condition.dueBy??''} onChange={e=>setCondition({...condition,dueBy:e.target.value})}/></label>
        <button className="research-button" onClick={()=>{if(condition.pendingItem.trim()){setConditions([...conditions,condition]);setCondition(EMPTY)}}}>Add condition</button>
      </details>
      <div className="research-actions"><button className="research-button research-primary" data-testid="decision-save" disabled={busy||!!conflict} onClick={()=>void save()}>{busy?'Saving…':'Save decision'}</button><button className="research-link" onClick={()=>setOpen(false)}>Cancel</button></div>
    </div>}
    {note&&<p role="alert" data-testid="decision-note">{note}</p>}
    {conflict&&<button className="research-button" disabled={busy} onClick={()=>void reload()}>Load latest revision · keep my draft</button>}
    {preview&&<details open><summary>Copied text preview</summary><textarea aria-label="Decision brief preview" readOnly value={preview} rows={12}/></details>}
  </div>
}
