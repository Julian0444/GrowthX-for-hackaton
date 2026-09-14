export const BACKGROUND_WORKFLOW='background-research/1';
export interface BackgroundResult {
  kind:'background_research';version:1;editionId:string|null;editionRevisionIds:string[];organizerIds:string[];
  status:'completed'|'partial'|'insufficient';limitations:string[];sourceCount:number;attemptedUrls:string[];material:'synthetic'|'imported';
}
export function backgroundResult(value:unknown):BackgroundResult|null {
  if(!value||typeof value!=='object')return null;
  const r=value as BackgroundResult;
  return r.kind==='background_research'&&r.version===1&&(r.editionId===null||typeof r.editionId==='string')&&['completed','partial','insufficient'].includes(r.status)&&['synthetic','imported'].includes(r.material)&&Number.isInteger(r.sourceCount)&&[r.editionRevisionIds,r.organizerIds,r.limitations,r.attemptedUrls].every(a=>Array.isArray(a)&&a.every(x=>typeof x==='string'))?r:null;
}
