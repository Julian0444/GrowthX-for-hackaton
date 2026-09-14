export const RICH_SOURCE_URL='https://lu.ma/dp05-source-reading';
export const SOURCE_NOW='2026-09-10T12:00:00.000Z';
export function richSourceHtml(options:{bodyDate?:string;startDate?:string;coordinates?:boolean;body?:string}={}):string {
  const ld={'@type':'Event',name:'DP-05 Security Builders (controlled fixture)',startDate:options.startDate??'2027-04-20T09:30:00-07:00',endDate:'2027-04-20T19:30:00-07:00',organizer:{name:'Builder Collective'},location:{name:'Foundry',address:{streetAddress:'501 Folsom St',addressLocality:'San Francisco',addressRegion:'CA',postalCode:'94105',addressCountry:'US'},...(options.coordinates===false?{}:{geo:{latitude:37.78698,longitude:-122.39447}})},offers:{price:0,priceCurrency:'USD',availability:'https://schema.org/InStock'}};
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><h1>${ld.name}</h1>${options.body??`
    <h2>When & Where</h2><p>${options.bodyDate??'April 21, 2027'} · 9:30 AM PDT</p>
    <h2>Who should come</h2><p>Security researchers, <b>agent builders</b>, and developers. Teams of 1–5.</p>
    <h2>Sponsors</h2><p>Wasmer — SDK track announced.</p><p>Tenki — cloud credits prize.</p>
    <h2>Venue partner — Entrepreneurs First</h2><p>Public venue partner for this edition.</p>
    <h2>Access</h2><p>Approval required: registration is subject to host approval. Remote teams may apply.</p>
    <h2>Agenda</h2><p>Doors: 9:30. Build: 10:00. Demos & judging: 18:00.</p>
    <h2>Location</h2><p>501 Folsom St</p><p>San Francisco, CA 94105, USA</p>
  `}</body></html>`;
}
