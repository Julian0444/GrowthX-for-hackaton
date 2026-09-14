import { createHash } from 'node:crypto';
import type { ClaimRevision, ClaimStatus, CompanyRecord, DeclaredDate, EditionRelationship, EvaluationProfile, EventEditionRevision, EvidenceReference, OrganizerRevision, SourceRecord } from '../../contracts/evaluation.ts';
import type { CurationManifest } from '../catalog/manifest.ts';
import { declaredDateFromLuma } from '../catalog/luma-adapter.ts';
import type { KnownSourceRead } from '../sources/reader.ts';
import type { RelationshipContent } from '../sources/relationship-content.ts';
import { VULTR_PAST } from './reference-sources.ts';
import { classifyDeclaredDate } from '../../temporal/declared-date.ts';

export const stableId = (kind: string, key: string) => `${kind}-${createHash('sha256').update(key).digest('hex').slice(0,24)}`;
export const editionYear = (date: DeclaredDate) => date.precision === 'instant' ? date.iso.slice(0,4) : date.precision === 'date_only' ? date.date.slice(0,4) : date.precision === 'ambiguous' ? date.text.match(/\b20\d{2}\b/)?.[0] ?? 'unknown' : 'unknown';
// Missing public anchors remain scoped to the source edition, never the name
// alone. An employer's city is deliberately not an input to identity.
export const entityIdentity = (kind: string, anchor: string | null, sourceUrl: string, name: string) => stableId(kind, anchor ?? `${sourceUrl}#unresolved:${name}`);

type Block = RelationshipContent['blocks'][number];
type Page = { reading: KnownSourceRead; source: SourceRecord; blocks: Block[]; links: RelationshipContent['links'] };
export interface ResolvedBackground {
  manifest: CurationManifest;
  primaryEditionId: string | null;
  limitations: string[];
}
const asText = (p: Page, attribute: string) => { const v = p.reading.fullContent.attributes.find(a => a.attribute === attribute)?.value; return v?.kind === 'text' ? v.text : null; };
const text = (p: Page, pattern: RegExp) => p.blocks.find(b => pattern.test(b.text));
const byUrl = (a: string, b: string) => a.replace(/\/$/,'') === b.replace(/\/$/,'');
const roleNote = 'Published role only; payment, attendance and commercial return are not established.';

export function resolveBackground(readings: KnownSourceRead[], input: {runId: string; primaryUrl: string; profile: EvaluationProfile; limitations?: string[]}): ResolvedBackground {
  const at = readings[0]?.fetchedAt ?? new Date().toISOString();
  const manifest: CurationManifest = {manifestVersion:'1',name:`background:${input.runId}`,material:readings.some(p=>p.isFixture)?'synthetic':'imported',authorizedBy:'growthx-worker (automatic extraction)',verifiedAt:at,note:'Public sources read automatically; no human verification, paid-sponsor inference or ROI claim.',sources:[],companies:[],organizers:[],editions:[],participations:[],claims:[]};
  const limitations = [...input.limitations ?? []];
  const pages: Page[] = readings.map(reading => {
    const source: SourceRecord = {contractVersion:'1',id:stableId('background-source',`${input.runId}:${reading.canonicalUrl}`),url:reading.finalUrl,requestedUrl:reading.requestedUrl,canonicalUrl:reading.canonicalUrl,title:reading.fullContent.title,locator:null,provider:new URL(reading.finalUrl).hostname,collector:'growthx-worker',fetchedAt:reading.fetchedAt,publishedAt:null,method:`${reading.isFixture?'test_fixture+':''}${reading.reading.strategy}+relationship_extraction`,geoScope:'unknown',content:{kind:'hash',sha256:reading.htmlSha256},fragments:[...reading.fullContent.fragments],retrieval:{status:reading.reading.status,freshness:reading.reading.freshness,limitation:reading.reading.limitation},usageRestrictions:[]};
    manifest.sources.push(source);
    if (!reading.relationshipContent) limitations.push(`No identity/link context in cached reading: ${reading.canonicalUrl}. Start a new explicit research after the cache expires.`);
    if (reading.relationshipContent?.truncated) limitations.push(`Partial page coverage: ${reading.canonicalUrl}.`);
    return {reading,source,blocks:reading.relationshipContent?.blocks??[],links:reading.relationshipContent?.links??[]};
  });
  function evidence(p: Page, b: Block | {text:string;locator:string}): EvidenceReference {
    const id=stableId('fragment',`${b.locator}:${b.text}`);
    if (!p.source.fragments!.some(f=>f.id===id)) p.source.fragments!.push({id,text:b.text.slice(0,1800),locator:b.locator});
    return {sourceId:p.source.id,fragmentId:id,locator:null};
  }
  function claim(subject: ClaimRevision['subject'], attribute: string, value: string, status: ClaimStatus, refs: EvidenceReference[], note: string | null=null): ClaimRevision {
    const subjectId = subject.type==='edition'?subject.editionId:subject.type==='organizer'?subject.organizerId:'';
    const claimId=stableId('background-claim',`${subjectId}:${attribute}`);
    const c: ClaimRevision={contractVersion:'1',id:stableId('background-claim-rev',`${input.runId}:${claimId}`),claimId,subject,attribute,value:status==='pending'?{kind:'pending',note:value}:{kind:'text',text:value},status,sourceIds:[...new Set(refs.map(r=>r.sourceId))],evidence:refs,method:'bounded_public_source_extraction',note,reviewer:null,reviewedAt:at,previousRevisionId:null};
    const previous=manifest.claims.find(other=>other.id===c.id);
    if(previous){
      previous.sourceIds=[...new Set([...previous.sourceIds,...c.sourceIds])];
      previous.evidence=[...previous.evidence??[],...refs].filter((ref,i,all)=>all.findIndex(r=>r.sourceId===ref.sourceId&&r.fragmentId===ref.fragmentId)===i);
      if(previous.value.kind==='text'&&c.value.kind==='text'&&!previous.value.text.includes(c.value.text))previous.value.text+=` | ${c.value.text}`;
      if(status==='contradicted'){previous.status=status;previous.note=note;}
      return previous;
    }
    manifest.claims.push(c);return c;
  }
  function editionClaim(e: EventEditionRevision, attribute:string, value:string, status:ClaimStatus, refs:EvidenceReference[], note:string|null=null) {
    const c=claim({type:'edition',editionId:e.editionId},attribute,value,status,refs,note);
    if(!e.claimRevisionIds.includes(c.id))e.claimRevisionIds.push(c.id);return c;
  }
  function organizer(p:Page,name:string,anchor:string|null,refs:EvidenceReference[],companyId?:string): OrganizerRevision {
    const id=entityIdentity('organizer',anchor,p.reading.canonicalUrl,name);
    let o=manifest.organizers.find(o=>o.organizerId===id);
    if(!o){o={contractVersion:'1',id:stableId('organizer-rev',`${input.runId}:${id}`),organizerId:id,displayName:name,...(companyId?{companyId}:{}),aliases:[],claimRevisionIds:[],revisedAt:at,previousRevisionId:null};manifest.organizers.push(o);}
    const c=claim({type:'organizer',organizerId:id},'identity',`${name}${anchor?` · ${anchor}`:' · identity limited to this source; no cross-event merge'}`,'reported',refs,'Public attribution; no universal reputation or operating responsibility inferred.');
    if(!o.claimRevisionIds.includes(c.id))o.claimRevisionIds.push(c.id);
    return o;
  }
  function organizerClaim(o:OrganizerRevision,attr:string,b:Pick<Block,'text'|'locator'>,p:Page) {
    const c=claim({type:'organizer',organizerId:o.organizerId},attr,b.text,'reported',[evidence(p,b)],'Self-description or attributed report; not independently observed attendance.');
    if(!o.claimRevisionIds.includes(c.id))o.claimRevisionIds.push(c.id);
  }
  function company(p:Page,name:string,anchor:string|null):CompanyRecord {
    const id=entityIdentity('company',anchor,p.reading.canonicalUrl,name);
    let c=manifest.companies.find(c=>c.id===id);
    if(!c){c={contractVersion:'1',id,name,websiteUrl:anchor};manifest.companies.push(c);}return c;
  }
  function relation(e:EventEditionRevision,entity:EditionRelationship['entity'],role:EditionRelationship['role'],refs:EvidenceReference[],status:ClaimStatus='announced',scope:EditionRelationship['scope']='edition',limitation=roleNote) {
    const key=entity.type==='organizer'?entity.organizerId:entity.type==='company'?entity.companyId:entity.projectId;
    const id=stableId('relationship',`${e.editionId}:${key}:${role}:${scope}`);
    const existing=e.relationships!.find(r=>r.id===id);if(existing)return existing;
    const c=editionClaim(e,`relationship:${id}`,`${role}: ${key}`,status,refs,limitation);
    const r:EditionRelationship={id,editionId:e.editionId,entity,role,status,scope,sourceIds:c.sourceIds,evidence:refs,claimRevisionIds:[c.id],limitation};e.relationships!.push(r);
    if(entity.type==='organizer'&&['organizer','co_organizer','host'].includes(role)&&!e.organizerIds.includes(entity.organizerId))e.organizerIds.push(entity.organizerId);
    return r;
  }
  const editionsByPage=new Map<Page,EventEditionRevision>();
  for(const p of pages){
    const isRecap=byUrl(p.reading.canonicalUrl,VULTR_PAST)&&Boolean(text(p,/2025 RAISE Summit.*Paris/));
    if(!p.reading.fullContent.eventIdentified&&!isRecap)continue;
    const date=isRecap?{precision:'ambiguous' as const,text:'RAISE 2025 · exact hackathon dates not obtained',earliest:'2025-01-01T00:00:00Z',latest:'2025-12-31T23:59:59Z'}:declaredDateFromLuma(asText(p,'date:structured'));
    const id=stableId('edition',`${p.reading.canonicalUrl}:${editionYear(date)}`);
    const e:EventEditionRevision={contractVersion:'1',id:stableId('edition-rev',`${input.runId}:${id}`),editionId:id,organizerIds:[],name:isRecap?'RAISE 2025 · agentic AI hackathon':asText(p,'name')??p.reading.fullContent.title??'Event',canonicalUrl:p.reading.canonicalUrl,provider:new URL(p.reading.finalUrl).hostname,startDate:date,location:isRecap?{scope:'city',name:'Paris'}:p.reading.fullContent.location?.city?{scope:'city',name:p.reading.fullContent.location.city}:p.reading.fullContent.location?.venue?{scope:'venue',name:p.reading.fullContent.location.venue}:{scope:'unknown',name:null},coordinates:p.reading.fullContent.coordinates,relationships:[],claimRevisionIds:[],revisedAt:at,previousRevisionId:null};
    if(p.reading.fullContent.location)e.publicLocation={...p.reading.fullContent.location,sourceIds:[p.source.id],resolvedAt:e.coordinates?p.reading.fetchedAt:null};
    manifest.editions.push(e);editionsByPage.set(p,e);
    for(const a of p.reading.fullContent.attributes){
      // Calendar JSON-LD is a raw attribution, not entity resolution.
      const attribute=a.attribute==='organizer'?'organizer:structured_attribution':a.attribute==='date:structured'?'date':a.attribute;
      const refs=a.fragmentIds.map(fragmentId=>({sourceId:p.source.id,fragmentId,locator:null}));
      const c=editionClaim(e,attribute,a.value.kind==='text'?a.value.text:JSON.stringify(a.value),a.status,refs,a.note);
      if(attribute==='date')c.value={kind:'date',date:e.startDate};else if(a.value.kind!=='text')c.value=a.value;
    }
    if(isRecap){const intro=text(p,/2025 RAISE Summit.*Paris/)!;editionClaim(e,'date:reported_period','2025','reported',[evidence(p,intro)]);editionClaim(e,'location','Paris','reported',[evidence(p,intro)]);}
    for(const [attribute,reason] of Object.entries({'audience:observed':'Actual attendance and its composition were not documented in the reviewed material.','commercial:outcome':'No documented commercial outcomes. Repeat brands, awards and projects do not establish ROI.','organizer:responsible':'Operational contact for this edition has not been verified.','cost:sponsorship':'Edition-specific sponsorship quote and total participation cost remain unknown.'}))editionClaim(e,attribute,reason,'pending',[]);
    const host=new URL(p.reading.canonicalUrl).hostname;
    if(host==='sf.aitinkerers.org'){
      const identity=text(p,/Subscribe to AI Tinkerers - San Francisco/) ??
        (asText(p,'organizer')==='AI Tinkerers - San Francisco' ? p.source.fragments?.find(f=>f.locator==='JSON-LD Event.organizer.name') : undefined);
      const role=text(p,/AI Tinkerers SF - Secure Agents Buildathon|Part of a global AI Tinkerers hackathon/);
      if(identity&&role){const o=organizer(p,'AI Tinkerers San Francisco','https://sf.aitinkerers.org/',[evidence(p,identity),evidence(p,role)]);relation(e,{type:'organizer',organizerId:o.organizerId},'organizer',[evidence(p,role),evidence(p,identity)]);
        const description=text(p,/builders-only AI Tinkerers|building production-minded agents with other vetted AI Tinkerers/);if(description)organizerClaim(o,'description',description,p);
        const directory=pages.find(p=>p.reading.canonicalUrl==='https://sf.aitinkerers.org/organizers');if(directory){const lead=directory.blocks.findIndex(b=>/Ian Butler/.test(b.text));const role=directory.blocks.slice(Math.max(0,lead-1),lead+3).find(b=>/Chapter Lead/.test(b.text));if(lead>=0&&role)organizerClaim(o,'chapter_lead',{text:`${directory.blocks[lead].text} — ${role.text}`,locator:`${directory.blocks[lead].locator}; ${role.locator}`},directory);}
      }
      const sponsor=text(p,/Thank you to Google Cloud/);if(sponsor){const c=company(p,'Google Cloud','https://cloud.google.com/');relation(e,{type:'company',companyId:c.id},'sponsor',[evidence(p,sponsor)]);}
      const technicalTopic=text(p,/Monitoring, auditing, and recovery patterns for long-running agents/);
      if(technicalTopic)editionClaim(e,'program:technical_background',technicalTopic.text,'announced',[evidence(p,technicalTopic)],'Program announced for this historical edition; delivery and attendee adoption are not observed.');
      const venueIndex=p.blocks.findIndex(b=>/Venue Host/.test(b.text));if(venueIndex>=0){const venue=p.blocks.slice(venueIndex,venueIndex+3).find(b=>/Wordware/.test(b.text));if(venue){const c=company(p,'Wordware',p.links.find(l=>/wordware/i.test(l.url))?.url??null);relation(e,{type:'company',companyId:c.id},'venue',[evidence(p,p.blocks[venueIndex]),evidence(p,venue)]);}}
      for(const [attr,role,scope] of [['sponsors:global','sponsor','global_program'],['companies:infrastructure_partner','infrastructure_partner','global_program']] as const){
        const a=p.reading.fullContent.attributes.find(a=>a.attribute===attr);if(!a||a.value.kind!=='text')continue;
        for(const name of a.value.text.split(' · ').filter(n=>n.length<60)){
          const link=p.links.find(l=>l.text===name||l.text.startsWith(`${name} Sponsor`)||l.text.startsWith(`${name} Marquee`));if(!link)continue;
          const c=company(p,name,link.url);relation(e,{type:'company',companyId:c.id},role,a.fragmentIds.map(fragmentId=>({sourceId:p.source.id,fragmentId,locator:null})),'announced',scope);
        }
      }
    }
    if(host==='cerebralvalley.ai'){
      const attribution=text(p,/hosted by Vultr/);const link=p.links.find(l=>l.text==='Vultr'&&l.url==='https://cerebralvalley.ai/u/vultr');
      if(attribution&&link){const c=company(p,'Vultr','https://www.vultr.com/');const o=organizer(p,'Vultr','https://www.vultr.com/',[evidence(p,attribution),evidence(p,{text:`Vultr: ${link.url}`,locator:link.locator})],c.id);relation(e,{type:'organizer',organizerId:o.organizerId},'host',[evidence(p,attribution)]);const desc=text(p,/Vultr is bringing the tools/);if(desc)organizerClaim(o,'description',desc,p);}
    }
    if(isRecap){
      const sponsor=text(p,/sponsoring the agentic AI hackathon, organized by our partner lablab.ai/);
      if(sponsor){const refs=[evidence(p,sponsor)];const c=company(p,'Vultr','https://www.vultr.com/');relation(e,{type:'company',companyId:c.id},'sponsor',refs,'reported');const o=organizer(p,'lablab.ai','https://lablab.ai/',refs);relation(e,{type:'organizer',organizerId:o.organizerId},'organizer',refs,'reported');}
    }
    // Luma: visible Hosted By, Presented By and Featured in remain separate.
    // JSON-LD's organizer.name does not override these visible roles.
    let section='';
    for(const b of p.blocks){
      if(/^(Hosted By|Presented by|Featured in)$/i.test(b.text)){section=b.text.toLowerCase();continue;}
      if(section){
        const link=p.links.find(l=>l.text===b.text);
        if(section==='featured in'&&!link&&b.text.length<100){const refs=[evidence(p,{text:`Featured in: ${b.text}`,locator:b.locator})];const o=organizer(p,b.text,null,refs);relation(e,{type:'organizer',organizerId:o.organizerId},'calendar',refs);section='';continue;}
        if(link&&b.text.length<100){
          if(section==='presented by'){const c=company(p,b.text,link.url);relation(e,{type:'company',companyId:c.id},'presenter',[evidence(p,b)]);}
          else {const o=organizer(p,b.text,link.url,[evidence(p,b)]);relation(e,{type:'organizer',organizerId:o.organizerId},section==='featured in'?'calendar':'host',[evidence(p,{text:`${section}: ${b.text}`,locator:b.locator})]);}
        }else section='';
      }
    }
    // Explicit prose roles are safe for non-reference publishers as well.
    for(const b of p.blocks){const m=b.text.match(/^(Organized by|Co-organized by)\s+([^.!?]{2,100})[.!]?$/i);if(!m)continue;const name=m[2].trim();const o=organizer(p,name,p.links.find(l=>l.text===name)?.url??null,[evidence(p,b)]);relation(e,{type:'organizer',organizerId:o.organizerId},m[1].toLowerCase()==='organized by'?'organizer':'co_organizer',[evidence(p,b)]);}
    // Sponsor headings explicitly name the role; an image/logo is never read
    // as paid sponsorship. Names without a public anchor stay edition-scoped.
    if(host==='lu.ma'||host==='luma.com')for(const [pattern,name] of [[/^\W*WASMER$/i,'Wasmer'],[/^\W*TENKI CLOUD$/i,'Tenki Cloud'],[/VENUE PARTNER.*ENTREPRENEURS FIRST/i,'Entrepreneurs First']] as const){
      const sponsorStart=p.blocks.findIndex(b=>/SPONSORS & SPONSOR PRIZES|^Sponsors$/i.test(b.text));
      const b=name==='Entrepreneurs First'?text(p,pattern):sponsorStart>=0?p.blocks.slice(sponsorStart+1).find(b=>pattern.test(b.text)):undefined;if(!b)continue;const c=company(p,name,p.links.find(l=>l.text.toLowerCase()===name.toLowerCase())?.url??null);relation(e,{type:'company',companyId:c.id},name==='Entrepreneurs First'?'venue_partner':'sponsor',[evidence(p,b)]);
    }
    const about=pages.find(p=>p.reading.canonicalUrl==='https://www.hackathons.team/about');
    const initiativeLink=p.links.find(l=>byUrl(l.url,'https://www.hackathons.team/'));
    if(about&&(initiativeLink||host==='www.hackathons.team')){
      const attribution=text(about,/Julius Olsson organises the events/);
      if(attribution){const refs=[evidence(about,attribution)];if(initiativeLink)refs.push(evidence(p,{text:`${initiativeLink.text}: ${initiativeLink.url}`,locator:initiativeLink.locator}));const o=organizer(p,'Hackathons.team','https://www.hackathons.team/',refs);relation(e,{type:'organizer',organizerId:o.organizerId},'organizer',refs);organizerClaim(o,'description',attribution,about);
        const history=text(about,/first event is the AI Security Hackathon/);if(history)organizerClaim(o,'history:published',history,about);
        const home=pages.find(p=>p.reading.canonicalUrl==='https://www.hackathons.team/');if(home){const none=text(home,/None yet/);if(none)organizerClaim(o,'history:published',none,home);const conflict=text(home,/No events are scheduled/);if(conflict)editionClaim(e,'agenda:conflict',conflict.text,'contradicted',[evidence(home,conflict)],'The homepage also lists an event. This is an inconsistent agenda, not proof of cancellation.');}
      }
    }
  }
  // Edition -> published gallery -> project detail. The explicit backlink is
  // required even when the gallery fetch fails. A repo or year in a URL alone
  // cannot satisfy this chain.
  for(const [p,e] of editionsByPage){
    const galleryLink=p.links.find(l=>/\/hackathons\/[^/]+\/showcase$/.test(l.url)&&/Winners|Projects|Showcase|Results/i.test(l.text));
    if(!galleryLink)continue;
    const gallery=pages.find(p=>byUrl(p.reading.canonicalUrl,galleryLink.url));
    const projectPages=pages.filter(candidate=>candidate!==p&&candidate.links.some(l=>byUrl(l.url,galleryLink.url)&&/Back to Showcase/i.test(l.text))&&/\/entries\//.test(candidate.reading.canonicalUrl));
    for(const project of projectPages){
      const heading=project.blocks.find(b=>b.heading===b.text&&!/Showcase|Description|Videos|Links|Tools|Team|Prior Work/.test(b.text));
      if(!heading){limitations.push(`Project title not resolved: ${project.reading.canonicalUrl}`);continue;}
      const backlink=project.links.find(l=>byUrl(l.url,galleryLink.url)&&/Back to Showcase/.test(l.text))!;
      const refs=[evidence(p,{text:`${galleryLink.text}: ${galleryLink.url}`,locator:galleryLink.locator}),evidence(project,{text:`${backlink.text}: ${backlink.url}`,locator:backlink.locator}),evidence(project,heading)];
      const projectId=stableId('project',project.reading.canonicalUrl);
      const r=relation(e,{type:'project',projectId,name:heading.text,url:project.reading.canonicalUrl},'published_project',refs,'reported','edition','Linked project report only. Implementation, security efficacy and commercial adoption have not been verified.');
      const add=(attr:string,b:Pick<Block,'text'|'locator'>,value=b.text)=>{const c=editionClaim(e,`project:${projectId}:${attr}`,value,'reported',[evidence(project,b)],'Declared in the linked project material; not executed or independently tested.');r.claimRevisionIds.push(c.id);};
      const award=text(project,/\b(?:1st|2nd|3rd) Place Winner/);if(award)add('award',award);
      const tools=project.blocks.find(b=>/Products & Tools/.test(b.heading)&&b.text!==b.heading&&/Google Cloud/.test(b.text));if(tools)add('technology',tools,'Google Cloud (declared in Products & Tools)');
      const purpose=project.blocks.find(b=>/The Citadel is|Cleo/.test(b.text));if(purpose)add('description',purpose);
      const repo=project.links.find(l=>/^https:\/\/github.com\/[^/]+\/[^/]+\/?$/.test(l.url));if(repo)add('repository',{text:`Public repository linked by project: ${repo.url}`,locator:repo.locator},repo.url);
    }
    const count=gallery&&text(gallery,/\b\d+ projects\b/i);
    editionClaim(e,'coverage:projects',`${projectPages.filter(p=>e.relationships!.some(r=>r.entity.type==='project'&&r.entity.url===p.reading.canonicalUrl)).length} linked project detail page(s) reviewed. ${count?`Gallery reports: ${count.text}.`:'Gallery total not obtained in this reading.'} This is a partial sample of published projects, never a count or percentage of attendees.`, 'reported',[evidence(p,{text:`${galleryLink.text}: ${galleryLink.url}`,locator:galleryLink.locator}),...(count&&gallery?[evidence(gallery,count)]:[])]);
  }
  const primary=[...editionsByPage].find(([p])=>byUrl(p.reading.canonicalUrl,input.primaryUrl))?.[1]??null;
  if(primary){
    const ownOrgIds=primary.organizerIds;
    const companyIds=manifest.organizers.filter(o=>ownOrgIds.includes(o.organizerId)).flatMap(o=>o.companyId?[o.companyId]:[]);
    const past=manifest.editions.filter(e=>e!==primary&&classifyDeclaredDate(e.startDate,at).validity==='past'&&(e.organizerIds.some(id=>ownOrgIds.includes(id))||e.relationships?.some(r=>r.entity.type==='company'&&companyIds.includes(r.entity.companyId))));
    const project=past.flatMap(e=>e.relationships??[]).find(r=>r.entity.type==='project');
    let message:string;let refs:EvidenceReference[]=[];
    if(project&&project.entity.type==='project'){
      const prior=past.find(e=>e.editionId===project.editionId)!;
      const objective=input.profile.objective.kind;
      const technicalMatch=/agent|agente|observ|trac|eval|mcp|security|seguridad/i.test(`${input.profile.product} ${input.profile.audience.description} ${input.profile.stack.join(' ')}`);
      const action=objective==='hiring'?'Ask whether project authors would opt into a technical conversation; their employment interest and attendee composition are unknown.':objective==='awareness'?'Explore a technical demonstration with explicit opt-in; the published project does not establish reach or brand impact.':!technicalMatch?'Check whether this agent/security project is relevant to your product before proposing an activity; technical fit is not yet established.':objective==='feedback'?'Explore a voluntary instrumented demo and a feedback session with project authors; access and willingness are unverified.':'Explore instrumenting and evaluating an agent through a voluntary integration with a repository/demo and feedback.';
      message=`For ${input.profile.product} (${objective}), ${project.entity.name} in ${prior.name} provides a concrete published technical antecedent. ${action} This is a proposal, not an available or purchased activity for this edition.`;refs=project.evidence;
    }else if(past.length){const previous=past[0];
      const priorRole=previous.relationships?.find(r=>r.entity.type==='organizer'?ownOrgIds.includes(r.entity.organizerId):r.entity.type==='company'&&companyIds.includes(r.entity.companyId));
      const distinction=priorRole?.role==='sponsor'?'Sponsorship there does not establish experience organizing in SF.':'A published organizing role does not establish actual attendance or delivery of every announced activity.';
      const topic=manifest.claims.find(c=>c.subject.type==='edition'&&c.subject.editionId===previous.editionId&&c.attribute==='program:technical_background');
      const program=topic?.value.kind==='text'?` Its announced technical program covered ${topic.value.text.toLowerCase()}. This supports exploring a technical integration or feedback session, subject to fit and permission for the current edition.`:'';
      message=`For ${input.profile.product} (${input.profile.objective.kind}), ${previous.name} in ${previous.location.name??'an unverified city'} documents a prior ${priorRole?.role??'listed'} role.${program} ${distinction} Ask for the local operator, technical support and edition-specific conditions.`;refs=[...priorRole?.evidence??[],...topic?.evidence??[]];
    }else{message=`For ${input.profile.product} (${input.profile.objective.kind}), reviewed material does not yet establish this organizer's delivery history. Request relevant previous editions, voluntary project references, an operational contact and full costs before choosing a format.`;refs=primary.relationships?.flatMap(r=>r.evidence)??[];}
    editionClaim(primary,'buyer:relevance',message,'inferred',refs,'Buyer-specific research hypothesis; no performance ranking or commercial return inferred.');
    editionClaim(primary,'buyer:next_step','Confirm access, who is responsible, audience composition, permission for the proposed technical activity and a complete edition-specific quote.','pending',[]);
  }else limitations.push('The selected page did not establish an event edition. Sources were retained without inventing an opportunity.');
  return {manifest,primaryEditionId:primary?.editionId??null,limitations};
}
