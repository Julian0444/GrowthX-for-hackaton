import {readingFromHtml} from '../../lib/server/sources/reader.ts';
import {resolveBackground} from '../../lib/server/relationships/resolve.ts';
import {buildEvaluationProfile} from '../../lib/server/evaluations/wire.ts';
import {classifyDeclaredDate,type EditionDossierRead} from '../../lib/server/catalog/read.ts';
import {briefBody} from './research-brief.ts';
import {relationshipRoutes,AIT_CURRENT,VULTR_CURRENT,NOW} from './relationships.ts';
export const comparisonProfile=()=>buildEvaluationProfile(briefBody(),{profileId:'comparison-profile',createdAt:NOW});
export function comparisonFixture() {
 const profile=comparisonProfile();
 const pages=Object.entries(relationshipRoutes()).map(([url,html])=>readingFromHtml({html,finalUrl:url,requestedUrl:url,fetchedAt:NOW},{isFixture:true}));
 const manifest=resolveBackground(pages,{runId:'dp07-fixture',primaryUrl:AIT_CURRENT,profile}).manifest;
 const dossiers:EditionDossierRead[]=manifest.editions.map(e=>({contractVersion:'1',evaluatedAt:NOW,editionId:e.editionId,editionRevisions:[e],validity:classifyDeclaredDate(e.startDate,NOW),
   organizers:manifest.organizers.filter(o=>e.organizerIds.includes(o.organizerId)).map(o=>({organizerId:o.organizerId,revisions:[o]})),
   claims:manifest.claims.filter(c=>c.subject.type==='edition'&&c.subject.editionId===e.editionId).map(c=>({claimId:c.claimId,revisions:[c]})),
   sources:manifest.sources,companies:manifest.companies,participations:[],curation:null}));
 return {profile,dossiers,ait:dossiers.find(d=>d.editionRevisions[0].canonicalUrl===AIT_CURRENT)!,vultr:dossiers.find(d=>d.editionRevisions[0].canonicalUrl===VULTR_CURRENT)!,manifest};
}
