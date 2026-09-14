"use client"
import { englishSystemText } from "../../lib/research/english"
import {useRef,useState} from 'react';
import type {EvaluationRunView} from '../../lib/api/atlas-client';
import {backgroundResult,BACKGROUND_WORKFLOW} from '../../lib/contracts/background';

export function BackgroundResearchButton({profileRunId,url,proposedSourceId,onAccepted}:{profileRunId:string|null;url?:string;proposedSourceId?:string;onAccepted:(id:string)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const request=useRef<{signature:string;key:string}|null>(null);
  async function start(){
    if(!profileRunId){setError('Save your company brief first.');return;}
    const body={profileRunId,...(proposedSourceId?{proposedSourceId}:{url})};
    const signature=JSON.stringify(body);if(request.current?.signature!==signature)request.current={signature,key:crypto.randomUUID()};
    setBusy(true);setError(null);
    try{const response=await fetch('/api/events/background',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,idempotencyKey:request.current.key})});const payload=await response.json();if(!response.ok)throw Error(payload.message??'Research could not start.');onAccepted(payload.runId);request.current=null;}catch(error){setError(error instanceof Error?error.message:'Research unavailable.');}finally{setBusy(false);}
  }
  return <><button type="button" className="research-button" disabled={busy||(!url&&!proposedSourceId)} onClick={()=>void start()}>{busy?'Starting research…':'Research organizer & projects'}</button>{error&&<p role="alert">{englishSystemText(error)}</p>}</>;
}
export function BackgroundPanel({run,profileRunId,onAccepted,onEdition}:{run:EvaluationRunView|null;profileRunId:string|null;onAccepted:(id:string)=>void;onEdition:(id:string)=>void}){
  const [url,setUrl]=useState('');const active=run?.workflowVersion===BACKGROUND_WORKFLOW;const result=backgroundResult(run?.result);
  return <section className="d-section" data-testid="background-panel">
    <span className="eyebrow">Organizer background</span><h3>Who is behind this event?</h3>
    <p>Read the event, previous editions and linked projects. Up to six public pages, with evidence and remaining questions.</p>
    <div className="ingest-row"><input className="ingest-input" aria-label="Background source URL" placeholder="Event URL · Luma, AI Tinkerers, Hackathons.team, Cerebral Valley" value={url} onChange={e=>setUrl(e.target.value)}/><BackgroundResearchButton profileRunId={profileRunId} url={url} onAccepted={onAccepted}/></div>
    {active&&<div role="status"><p>{run.state==='completed'?'Research saved':run.state==='failed'?'Research interrupted':'Reading public sources…'}</p>{run.error&&<p role="alert">{englishSystemText(run.error)}</p>}
      {result&&<><p>{result.sourceCount} pages read · {result.status==='partial'?'Partial coverage':result.status==='insufficient'?'Insufficient coverage':'Background ready'}. {result.material==='synthetic'?'Controlled test data — not live research.':'Real public sources · automatic extraction, no human verification.'}</p>
        {result.editionId&&<button className="research-button" onClick={()=>onEdition(result.editionId!)}>Open background dossier</button>}
        {result.limitations.length>0&&<details><summary>Reading limitations ({result.limitations.length})</summary>{result.limitations.map((l,i)=><p key={i}>{englishSystemText(l)}</p>)}</details>}
        <p>Research does not establish attendance, paid sponsorship or commercial outcomes.</p></>}
    </div>}
  </section>;
}
