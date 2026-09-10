import type { SourceRecord } from '../contracts/evaluation.ts';

export type EvidenceLink =
  | { kind: 'public'; href: string }
  | { kind: 'synthetic' | 'invalid' | 'missing'; href: null };

// Captura controlada de QA del 09-09-2026, anterior al marcador test_fixture.
// El hash identifica exactamente el HTML conservado en la prueba visual; no
// se infiere procedencia por nombres/IDs ni se modifica evidencia histórica.
const LEGACY_VISUAL_QA_HASH = '5a5fa514b5e86b8f3f0a85950cd994309b39e7685045b6b5e749a1e1ad6871d2';

export function isSyntheticSource(source: SourceRecord): boolean {
  return /\(synthetic\)/i.test(source.provider)
    || source.method.split('+').includes('test_fixture')
    || (source.content.kind === 'hash' && source.content.sha256 === LEGACY_VISUAL_QA_HASH);
}

// Una URL persistida no garantiza una página visitable. Los dominios de
// ejemplo y el transporte de fixture son evidencia de prueba, no enlaces.
export function evidenceLink(url: string | null, synthetic = false): EvidenceLink {
  if (!url) return { kind: 'missing', href: null };
  if (synthetic) return { kind: 'synthetic', href: null };
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return { kind: 'invalid', href: null };
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (/(^|\.)(example|invalid|test)$/.test(host) || /(^|\.)example\.(com|net|org)$/.test(host)) {
      return { kind: 'synthetic', href: null };
    }
    return { kind: 'public', href: parsed.href };
  } catch {
    return { kind: 'invalid', href: null };
  }
}

export function sourceLink(source: SourceRecord): EvidenceLink {
  return evidenceLink(source.url, isSyntheticSource(source));
}

export function sameEvidenceUrl(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const identity = (value: string): string | null => {
    try {
      const parsed = new URL(value);
      parsed.hash = '';
      if (['lu.ma', 'www.lu.ma', 'luma.com', 'www.luma.com'].includes(parsed.hostname)) {
        parsed.hostname = 'lu.ma';
        parsed.search = '';
        parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
      }
      return parsed.href;
    } catch { return null; }
  };
  const normalized = identity(left);
  return normalized !== null && normalized === identity(right);
}
