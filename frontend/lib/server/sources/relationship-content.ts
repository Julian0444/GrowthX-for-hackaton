import { visibleBlocks, unsafeText } from './extract.ts';

// Bounded public text/link context for entity resolution. No scripts, images,
// hidden metadata, contact details or arbitrary URLs are executed. Final facts
// still become DP-03 claims with their own admitted source fragments.
export interface RelationshipContent {
  blocks: { text: string; locator: string; heading: string }[];
  links: { url: string; text: string; locator: string }[];
  truncated: boolean;
}
export function publicLink(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (/signin|login|signout|logout|\/survey\/|\/connect\/|\/teams\//i.test(url.pathname)) return null;
    url.search = ''; url.hash = '';
    return url.toString();
  } catch { return null; }
}
export function extractRelationshipContent(html: string, base: string): RelationshipContent {
  const visible = visibleBlocks(html);
  let length = 0;
  const blocks: RelationshipContent['blocks'] = [];
  let truncated = false;
  for (const block of visible.blocks) {
    if (unsafeText(block.text) || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(block.text)) continue;
    if (blocks.length >= 180 || length + block.text.length > 36_000) { truncated = true; continue; }
    blocks.push({ text: block.text.slice(0, 1800), locator: block.locator, heading: block.heading });
    length += block.text.length;
  }
  const links = visible.links.flatMap(link => {
    const url = publicLink(link.href, base);
    return url && !unsafeText(link.text) ? [{ url, text: link.text.slice(0, 300), locator: link.locator }] : [];
  });
  return { blocks, links: links.slice(0, 120), truncated: truncated || links.length > 120 };
}
export function validRelationshipContent(value: unknown): value is RelationshipContent {
  if (!value || typeof value !== 'object') return false;
  const v = value as RelationshipContent;
  return typeof v.truncated === 'boolean' && Array.isArray(v.blocks) && v.blocks.length <= 180 &&
    v.blocks.every(b => b && typeof b.text === 'string' && b.text.length <= 1800 && !unsafeText(b.text) && typeof b.locator === 'string' && typeof b.heading === 'string') &&
    Array.isArray(v.links) && v.links.length <= 120 && v.links.every(l => l && typeof l.text === 'string' && l.text.length <= 300 && typeof l.locator === 'string' && typeof l.url === 'string' && publicLink(l.url, l.url) === l.url);
}
