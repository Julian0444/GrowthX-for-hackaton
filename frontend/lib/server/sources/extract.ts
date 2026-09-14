// Deterministic extraction: page text is data, never a prompt or executable code.
// Values are exact excerpts or typed JSON-LD values. Entity resolution belongs
// to DP-06; a sponsor mention here is not a paid participation or an organizer.
import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { findJsonLdEvent } from '../../api/luma.ts';
import type { ClaimValue, SourceFragment, PublicEventLocation } from '../../contracts/evaluation.ts';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
export interface ExtractedAttribute {
  attribute: string;
  value: ClaimValue;
  status: 'announced' | 'reported' | 'observed' | 'contradicted';
  fragmentIds: string[];
  note: string | null;
}
export interface SourceExtraction {
  version: 1;
  title: string | null;
  eventIdentified: boolean;
  fragments: SourceFragment[];
  attributes: ExtractedAttribute[];
  location: Omit<PublicEventLocation, 'sourceIds' | 'resolvedAt'> | null;
  coordinates: { lat: number; lng: number } | null;
  warnings: string[];
  visibleCharacters: number;
}
interface Block { text: string; locator: string; heading: string; headingLevel?: number }
const record = (v: unknown): Record<string, unknown> | null => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;
const first = (v: unknown) => Array.isArray(v) ? v[0] : v;
export const cleanText = (v: unknown, max = 1600): string | null => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null : null;
export const unsafeText = (v: string) => /ignore\s+(all\s+)?(previous|prior)|system\s+prompt|developer\s+message|api[_ -]?key|\bBearer\s+[A-Za-z0-9._-]{12}|(?:sk-|apify_api_)[A-Za-z0-9_-]{16}/i.test(v);
const attrs = (n: Element) => Object.fromEntries(n.attrs.map(a => [a.name, a.value]));
const element = (n: Node): n is Element => 'tagName' in n;
const blockTags = new Set(['p','li','h1','h2','h3','h4','h5','h6','div','section','article','main','tr','dt','dd','br']);

// DOM parsing handles entities, inline markup and malformed HTML. Explicitly
// hidden nodes and non-content chrome are excluded; no CSS/JS is executed.
export function visibleBlocks(html: string): { blocks: Block[]; links: { href: string; text: string; locator: string; heading: string }[]; title: string | null } {
  const root = parse(html, { sourceCodeLocationInfo: true });
  const blocks: Block[] = [], links: { href: string; text: string; locator: string; heading: string }[] = [];
  let buffer = '', line = 1, heading = '', headingLevel = 0, title: string | null = null;
  const textOf = (n: Node): string => n.nodeName === '#text' && 'value' in n ? n.value : 'childNodes' in n ? n.childNodes.map(textOf).join(' ') : '';
  const flush = () => {
    const text = cleanText(buffer, 6000); buffer = '';
    if (text) blocks.push({ text, heading, headingLevel, locator: `HTML line ${line}` });
  };
  function walk(n: Node) {
    if (n.nodeName === '#text' && 'value' in n) { if (!buffer.trim()) line = n.sourceCodeLocation?.startLine ?? line; buffer += n.value; return; }
    if (element(n)) {
      const a = attrs(n);
      if (n.tagName === 'title') { title = cleanText(textOf(n), 300); return; }
      if (['script','style','noscript','template','svg','iframe','nav','footer','form','button'].includes(n.tagName) || 'hidden' in a || a['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.style ?? '')) return;
      if (blockTags.has(n.tagName)) flush();
      if (/^h[1-6]$/.test(n.tagName)) { heading = cleanText(textOf(n), 160) ?? ''; headingLevel = Number(n.tagName[1]); }
      if (n.tagName === 'a' && a.href) links.push({ href: a.href, text: cleanText(textOf(n)) ?? '', heading, locator: `HTML line ${n.sourceCodeLocation?.startLine ?? 1} a[href]` });
    }
    if ('childNodes' in n) for (const c of n.childNodes) walk(c);
    if (element(n) && blockTags.has(n.tagName)) flush();
  }
  walk(root); flush();
  const seen = new Set<string>();
  return { blocks: blocks.filter(b => { const key = b.text; if (seen.has(key)) return false; seen.add(key); return true; }), links, title };
}

const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function explicitDay(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const named = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);
  const day = iso?.[1] ?? (named ? `${named[3]}-${String(monthNames.indexOf(named[1].toLowerCase().slice(0,3)) + 1).padStart(2,'0')}-${named[2].padStart(2,'0')}` : null);
  if (!day || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0,10) !== day) return null;
  return day;
}

export function extractSource(html: string): SourceExtraction {
  const visible = visibleBlocks(html), ld = findJsonLdEvent(html);
  const fragments: SourceFragment[] = [], attributes: ExtractedAttribute[] = [], warnings: string[] = [];
  const add = (attribute: string, value: ClaimValue, text: string, locator: string, status: ExtractedAttribute['status'] = 'announced') => {
    const excerpt = cleanText(text, 1800);
    if (!excerpt || unsafeText(excerpt) || (value.kind === 'text' && unsafeText(value.text))) { warnings.push('Instruction-like or credential-like text excluded from factual extraction.'); return; }
    const existing=attributes.find(a => a.attribute === attribute && JSON.stringify(a.value) === JSON.stringify(value));
    if (fragments.length >= 64) { warnings.push('Extraction fragment limit reached; remaining content is not represented as facts.'); return; }
    const id = `fragment-${createHash('sha256').update(`${locator}:${excerpt}`).digest('hex').slice(0,16)}`;
    if (!fragments.some(f => f.id === id)) fragments.push({ id, text: excerpt, locator });
    if(existing){existing.fragmentIds=[...new Set([...existing.fragmentIds,id])];return;}
    attributes.push({ attribute, value, status, fragmentIds: [id], note: null });
  };
  const structured = (attribute: string, raw: unknown, path: string, value?: ClaimValue) => {
    const text = cleanText(raw, 1000); if (text) add(attribute, value ?? { kind: 'text', text }, `${path}: ${text}`, `JSON-LD Event.${path}`);
  };
  if (ld) {
    for (const [attribute, path] of [['name','name'],['date:structured','startDate'],['end_date','endDate'],['format','eventAttendanceMode']] as const) structured(attribute, ld[path], path);
    const org = record(first(ld.organizer)); structured('organizer', org?.name, 'organizer.name');
    const offer = record(first(ld.offers));
    if (offer && (typeof offer.price === 'number' || typeof offer.price === 'string') && String(offer.price).trim() && Number.isFinite(Number(offer.price)) && Number(offer.price) >= 0 && typeof offer.priceCurrency === 'string' && /^[A-Z]{3}$/.test(offer.priceCurrency)) {
      add('cost:attendance', { kind: 'money', amount: Number(offer.price), currency: offer.priceCurrency }, `offers.price: ${offer.price}; offers.priceCurrency: ${offer.priceCurrency}`, 'JSON-LD Event.offers');
    }
    if (typeof offer?.availability === 'string' && offer.availability.endsWith('/SoldOut')) structured('access', 'sold_out', 'offers.availability');
  }

  const loc = record(first(ld?.location)), addr = record(loc?.address), geo = record(loc?.geo);
  let city = cleanText(addr?.addressLocality, 120);
  const venue = cleanText(loc?.name, 200);
  let address: PublicEventLocation['address'] = addr ? { streetAddress: cleanText(addr.streetAddress, 300), locality: city, region: cleanText(addr.addressRegion,120), postalCode: cleanText(addr.postalCode,30), country: cleanText(record(addr.addressCountry)?.name ?? addr.addressCountry,120) } : null;
  let originalAddress = address?.streetAddress ? Object.values(address).filter(Boolean).join(', ') : cleanText(loc?.address);
  let coordinates: SourceExtraction['coordinates'] = null;
  let coordinateProvider: string | null = null;
  const lat = Number(geo?.latitude), lng = Number(geo?.longitude);
  if (geo?.latitude != null && geo?.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    coordinates = { lat, lng }; coordinateProvider = 'event JSON-LD';
    add('coordinates', { kind: 'text', text: `${lat}, ${lng}` }, `location.geo.latitude: ${geo.latitude}; location.geo.longitude: ${geo.longitude}`, 'JSON-LD Event.location.geo');
  }
  if (geo && (geo.latitude != null || geo.longitude != null) && !coordinates) warnings.push('Invalid published coordinates; review latitude/longitude without swapping.');
  if (venue) structured('venue', venue, 'location.name');
  if (city) structured('location', city, 'location.address.addressLocality', { kind:'location', scope:'city', name:city });
  if (originalAddress) structured('address', originalAddress, 'location.address');

  let section = '', sectionTitle = '', sectionLevel = 0, hiddenLocation = false;
  const visibleDates: { day: string; text: string; locator: string }[] = [];
  const yearlessDates: Block[] = [];
  const collected = new Map<string, Block[]>();
  const collect = (attribute: string, block: Block) => {
    if (unsafeText(block.text)) { warnings.push('Instruction-like or credential-like text excluded from factual extraction.'); return; }
    const list = collected.get(attribute) ?? []; if (list.length < 32) list.push({ ...block, heading: sectionTitle || block.heading }); collected.set(attribute,list);
  };
  for (const block of visible.blocks) {
    const t = block.text, lower = t.toLowerCase().replace(/^[^a-z]+/,'');
    if(unsafeText(t)){warnings.push('Instruction-like or credential-like text excluded from factual extraction.');continue;}
    // Several publishers use bold paragraphs as headings, not h2/h3.
    const heading = t.length < 100 && (/^(who should come|who (?:is|it.s).*for|audience|sponsors?(?:\s*&.*)?|global sponsors|developer infrastructure partners|presented by|hosted by|hosts$|venue partner|when & where|location$|the day$|agenda$|schedule$|program$|judging$|what every team submits|what sponsors get|what sponsorship does not include|past events|upcoming events|next event|event details|about event|registration$)/i.test(lower));
    if (heading) { section = lower; sectionTitle = t; sectionLevel = block.headingLevel ?? 0; if (!/venue partner.*[—:-]/i.test(t)) continue; }
    else if (t === block.heading && (block.headingLevel ?? 0) <= sectionLevel) { section = ''; sectionTitle = ''; }
    if (/\b(shared upon acceptance|available after.*approval|(?:location|address).*(?:hidden|withheld|after (?:registration|acceptance|approval)|upon acceptance))\b/i.test(t)) { hiddenLocation = true; collect('location:restriction',block); }
    if ((/who should come|who (?:is|it.s).*for|^audience/.test(section) && /engineers|builders|developers|researchers|teams|founders|experience|levels/i.test(t)) || /\b(?:hackathon for builders|for security researchers|teams may have|builders-only)\b/i.test(t)) collect('audience',block);
    if (/\b(?:approval required|subject to.*approval|application only|by application|must apply|applicants must|does not (?:confirm|guarantee).*attend|register below|spots are limited|remote teams|remote:|in.person.*preferred|by invitation|invite.only)\b/i.test(t)) collect('access',block);
    if (/\b(?:in.person hackathon|format:|fully in.person|one.day.*hackathon)\b/i.test(t)) collect('format',block);
    if (/global sponsors/.test(section)) collect('sponsors:global',block);
    else if (/^sponsors and partners/.test(section)) collect('companies:listed',block);
    else if (/^sponsors/.test(section)) collect('sponsors:announced',block);
    else if (/^developer infrastructure partners/.test(section)) collect('companies:infrastructure_partner',block);
    else if (/^presented by/.test(section) && t.length < 100 && !/follow/i.test(t)) collect('companies:presenter',block);
    else if (/^venue partner/.test(section)) collect('companies:venue_partner',block);
    else if (/^hosted by|^hosts$/.test(section) && t.length < 100 && !/going|follow|others|contact|report/i.test(t)) collect('hosts:listed',block);
    if (/^the day|^agenda|^schedule|^program|^judging|^what every team submits/.test(section) || /(?:doors:|build:|demos & judging:|public GitHub repository|two-minute video)/i.test(t)) collect('program',block);
    if (/^what sponsors get|^what sponsorship does not include/.test(section) || /we do not publish packages|opt-in introductions|office.hours slot|short report afterwards/i.test(t)) collect('sponsorship:terms',block);
    if (/^past events/.test(section)) collect('history:published',block);
    if (/no (?:upcoming )?events.*(?:scheduled|planned)|nothing.*scheduled|no events on the calendar/i.test(t)) collect('agenda:limitation',block);
    // Dates in event details/body, not arbitrary deadlines or historic recaps.
    const day = explicitDay(t);
    if (day && t.length < 220 && !/deadline|submit by|applications close|past|previous|copyright/i.test(t)) visibleDates.push({ day, text: t, locator: block.locator });
    if (!day && t.length < 220 && /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\s+(?:at\s+)?\d{1,2}:\d{2}/i.test(t)) yearlessDates.push(block);
    if (!/organizer.*(?:office|address)|headquarters|registered office|contact (?:us|address)/i.test(`${section} ${block.heading} ${t}`) && (/^location|^when & where|^event details/.test(section) || Boolean(address?.streetAddress)) && /\b\d{1,6}\s+[\w .'-]+\s(?:St(?:reet)?|Ave(?:nue)?|Rd|Road|Blvd|Boulevard|Way|Dr(?:ive)?|Lane|Ln)\b/i.test(t) && t.length < 250) {
      const street = t.match(/\b\d{1,6}\s+[\w .'-]+?\s(?:St(?:reet)?|Ave(?:nue)?|Rd|Road|Blvd|Boulevard|Way|Dr(?:ive)?|Lane|Ln)\b/i)![0];
      const visibleLocality = t.slice(t.indexOf(street)+street.length).match(/^,?\s*([A-Za-z .'-]+),\s*(?:[A-Z]{2}|California)(?:[ ,]|$)/)?.[1]?.trim();
      if (city && visibleLocality && city.toLowerCase() !== visibleLocality.toLowerCase()) warnings.push('Public city differs between structured and visible address; location needs reconciliation.');
      if (address?.streetAddress && address.streetAddress.toLowerCase() !== street.toLowerCase()) warnings.push('Public address differs between structured and visible content; location needs reconciliation.');
      if (!address?.streetAddress) { address = { streetAddress:street,locality:city,region:null,postalCode:null,country:null }; originalAddress = t; }
      add('address', {kind:'text',text:t},t,block.locator);
    }
    if (!/organizer|headquarters|contact/i.test(`${section} ${block.heading}`) && /\bSan Francisco\b/.test(t) && /^San Francisco,?\s*(?:CA|California)(?:\s+\d{5})?(?:,?\s*(?:USA|United States))?\s*$/.test(t)) {
      if (city && !/^(San Francisco|SF)$/i.test(city)) { warnings.push('Public city differs between structured and visible address; location needs reconciliation.'); add('location',{kind:'location',scope:'city',name:'San Francisco'},t,block.locator,'contradicted'); }
      if (!city) { city = 'San Francisco'; add('location',{kind:'location',scope:'city',name:city},t,block.locator); }
      if (address) { address.locality = city; address.region = 'CA'; address.postalCode = t.match(/\b\d{5}\b/)?.[0] ?? address.postalCode; address.country = /USA|United States/.test(t) ? 'USA' : address.country; originalAddress = Object.values(address).filter(Boolean).join(', '); add('address',{kind:'text',text:originalAddress},`${address.streetAddress}; ${t}`,`${block.locator}; preceding street address`); }
    }
  }
  for (const [attribute, blocks] of collected) {
    // Bounded chunks retain complete clauses and the role heading. They never
    // synthesize an assertion about payment, attendance or commercial outcome.
    let text = '', locations: string[] = [], count = 0, lastHeading='';
    const names = attribute.startsWith('sponsors:') || attribute === 'companies:infrastructure_partner'
      ? blocks.map(b=>b.text.replace(/^[^\p{L}]+/u,'')).filter(t=>t.length<80 && t.split(/\s+/).length<=5 && /^[\p{L}\p{N}& ._-]+$/u.test(t) && !/[.!?]$/.test(t) && !/follow|learn more|sign in/i.test(t)) : [];
    const flush = () => {
      if (text) {
        const supportedNames=names.filter(name=>text.includes(name));
        add(attribute,{kind:'text',text:supportedNames.length?[...new Set(supportedNames)].join(' · '):text},text,[...new Set(locations)].join('; '),attribute==='history:published'?'reported':'announced'); count++;
      }
      text=''; locations=[];
    };
    for (const b of blocks) {
      const part = `${b.heading && b.heading !== b.text && b.heading !== lastHeading ? `${b.heading}:\n` : ''}${b.text}`;
      if (text.length + part.length > 1600) flush();
      if (count >= 4) { warnings.push(`Relevant text for ${attribute} exceeded excerpt limit; coverage is partial.`); break; }
      text += `${text ? '\n' : ''}${part.slice(0,1600)}`; locations.push(b.locator); lastHeading=b.heading;
    }
    flush();
  }
  // Map destinations are read as data only, never followed. Coordinates must
  // come from a public location link in this page, not arbitrary geo text.
  if (!hiddenLocation && (venue || address?.streetAddress)) for (const link of visible.links) {
    try {
      if (/organizer|headquarters|contact|office address/i.test(`${link.heading} ${link.text}`)) continue;
      if (!/^location$|^when & where$/i.test(link.heading) && ![address?.streetAddress, venue].some(name => name && link.text.toLowerCase().includes(name.toLowerCase()))) continue;
      const u = new URL(link.href);
      if (!['www.google.com','maps.google.com','google.com'].includes(u.hostname) || !u.pathname.startsWith('/maps')) continue;
      const pair = (u.searchParams.get('query') ?? u.searchParams.get('q') ?? '').match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
      if (pair && Math.abs(Number(pair[1])) <= 90 && Math.abs(Number(pair[2])) <= 180) {
        const point = {lat:Number(pair[1]),lng:Number(pair[2])};
        if (coordinates && (Math.abs(coordinates.lat-point.lat) > .0001 || Math.abs(coordinates.lng-point.lng) > .0001)) warnings.push('Published coordinates disagree; no exact point selected.');
        else { coordinates = point; coordinateProvider = 'Google Maps link published by event'; }
        add('coordinates',{kind:'text',text:`${pair[1]}, ${pair[2]}`},`Public location link: ${u.origin}${u.pathname}?query=${encodeURIComponent(pair[0])}`,link.locator);
      }
    } catch { /* Relative/unrelated links are not fetched or used as locations. */ }
  }
  let structuredDay = typeof ld?.startDate === 'string' ? ld.startDate.slice(0,10) : null;
  // A UTC day differs from the local event day without being a conflict.
  // Convert only when the page itself supplies a Pacific zone abbreviation.
  if(typeof ld?.startDate === 'string' && /Z$/.test(ld.startDate) && Number.isFinite(Date.parse(ld.startDate))) {
    const zones = new Set(visible.blocks.flatMap(b => b.text.match(/\b(?:PDT|PST)\b/g) ?? []));
    if(zones.size===1)structuredDay=new Date(Date.parse(ld.startDate)-(zones.has('PDT')?7:8)*3_600_000).toISOString().slice(0,10);
  }
  for (const d of visibleDates) add('date:visible',{kind:'text',text:d.text},d.text,d.locator);
  for (const d of yearlessDates) add('date:visible',{kind:'text',text:d.text},d.text,d.locator);
  if ((structuredDay && visibleDates.some(d => d.day !== structuredDay)) || new Set(visibleDates.map(d=>d.day)).size > 1) {
    warnings.push('Structured start date and visible event date disagree; both are retained.');
    for (const a of attributes.filter(a => a.attribute === 'date:structured' || a.attribute === 'date:visible')) { a.status = 'contradicted'; a.note = 'Structured start date and visible event date disagree; verify the event date with the organizer.'; }
  }
  const locationConflict = warnings.some(w => /address differs|city differs|coordinates disagree/.test(w));
  const invalidCoordinates = warnings.some(w => /Invalid published coordinates/.test(w));
  if (hiddenLocation || locationConflict || invalidCoordinates) coordinates = null;
  if (locationConflict) for (const a of attributes.filter(a => ['location','address','coordinates'].includes(a.attribute))) { a.status = 'contradicted'; a.note = 'Published location representations disagree; no exact point selected.'; }
  const location: SourceExtraction['location'] = city || venue || originalAddress || hiddenLocation ? {
    originalAddress: hiddenLocation ? null : originalAddress, address: hiddenLocation ? null : address, venue: hiddenLocation ? null : venue, city,
    precision: hiddenLocation || locationConflict || !coordinates ? (city ? 'city' : 'unknown') : address?.streetAddress ? 'address' : venue ? 'venue' : city ? 'city' : 'unknown',
    method: coordinates ? 'published_coordinates' : 'unknown', provider: coordinates ? coordinateProvider : null,
    status: locationConflict ? 'contradicted' : 'announced',
    limitation: invalidCoordinates ? 'Invalid published coordinates; review latitude/longitude without swapping.' : hiddenLocation ? 'Address withheld until acceptance; no location reconstructed.' : locationConflict ? 'Conflicting public location; reconciliation required.' : coordinates ? 'Published point associated with the place; metric accuracy and entrance not verified.' : 'No published coordinates; geocoding has not been performed.',
  } : null;
  const title=cleanText(ld?.name,300) ?? visible.title;
  return {version:1,title:title&&!unsafeText(title)?title:null,eventIdentified:Boolean(ld),fragments,attributes,location,coordinates,warnings:[...new Set(warnings)],visibleCharacters:visible.blocks.reduce((n,b)=>n+b.text.length,0)};
}
