import type {ResolutionInput} from '../../lib/server/geocoding/resolve.ts';
export function geoInput():ResolutionInput {
  const time='2026-09-10T00:00:00Z';
  return {
    edition:{contractVersion:'1',id:'edition-r1',editionId:'edition',organizerIds:[],name:'Controlled address event',canonicalUrl:'https://lu.ma/dp08-controlled',provider:'luma',startDate:{precision:'unknown'},location:{scope:'city',name:'San Francisco'},coordinates:null,publicLocation:{originalAddress:'501 Folsom St, San Francisco, CA 94105',address:{streetAddress:'501 Folsom St',locality:'San Francisco',region:'CA',postalCode:'94105',country:'USA'},venue:'Public venue',city:'San Francisco',precision:'city',method:'unknown',provider:null,resolvedAt:null,sourceIds:['source'],status:'announced',limitation:null},claimRevisionIds:['address-r1'],revisedAt:time,previousRevisionId:null},
    claims:[{contractVersion:'1',id:'address-r1',claimId:'address',subject:{type:'edition',editionId:'edition'},attribute:'address',value:{kind:'text',text:'501 Folsom St, San Francisco, CA 94105'},status:'announced',sourceIds:['source'],method:'test_fixture',note:null,reviewer:null,reviewedAt:time,previousRevisionId:null}],
    sources:[{contractVersion:'1',id:'source',url:'https://lu.ma/dp08-controlled',locator:null,provider:'test_fixture',collector:'test',fetchedAt:time,publishedAt:null,method:'test_fixture',geoScope:'city',content:{kind:'hash',sha256:'a'.repeat(64)},usageRestrictions:[]}],
  };
}
export function censusResponse(){return {result:{addressMatches:[{coordinates:{x:-122.3944,y:37.7872},matchedAddress:'501 FOLSOM ST, SAN FRANCISCO, CA, 94105',addressComponents:{city:'SAN FRANCISCO',state:'CA',zip:'94105'},geographies:{Counties:[{GEOID:'06075'}]}}]}};}
export function locationHtml(options:{street?:string|null;city?:string;coordinates?:{latitude:number;longitude:number};hidden?:boolean;name?:string}={}) {
  const street=options.street===undefined?'501 Folsom St':options.street;
  return `<html><head><script type="application/ld+json">${JSON.stringify({'@type':'Event',name:options.name??'DP-08 controlled event',startDate:'2027-04-20T18:00:00-07:00',location:{'@type':'Place',name:'Public venue',address:{'@type':'PostalAddress',streetAddress:street,addressLocality:options.city??'San Francisco',addressRegion:'CA',postalCode:'94105',addressCountry:'USA'},...(options.coordinates?{geo:options.coordinates}:{})}})}</script></head><body><h1>DP-08 controlled event</h1>${options.hidden?'<p>Address shared after acceptance.</p>':''}</body></html>`;
}
