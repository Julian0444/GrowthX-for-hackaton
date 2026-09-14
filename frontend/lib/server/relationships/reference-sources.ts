// Reviewed DP-01 URLs are discovery hints, NEVER factual records. Each page
// must be fetched and each relation supported anew. No fallback fixture.
export const AIT_CURRENT = 'https://sf.aitinkerers.org/p/agents-everywhere-bots-channels-more-global-hackathon';
export const AIT_PAST = 'https://sf.aitinkerers.org/p/ai-tinkerers-sf-secure-agents-buildathon';
export const AIT_GALLERY = 'https://sf.aitinkerers.org/hackathons/h_3D-tFFdFiYo/showcase';
export const AIT_PROJECTS = [
  'https://sf.aitinkerers.org/hackathons/h_3D-tFFdFiYo/entries/ht_-q61ElFncwo',
  'https://sf.aitinkerers.org/hackathons/h_3D-tFFdFiYo/entries/ht_pL8a-_-lqzk',
];
export const VULTR_CURRENT = 'https://cerebralvalley.ai/e/vultr-the-agent-arena';
export const VULTR_PAST = 'https://blogs.vultr.com/vultr-at-RAISE-2025';
export function referenceSourceHints(url: string): string[] {
  if (url === AIT_CURRENT || url === AIT_PAST) return [AIT_PAST, AIT_GALLERY, ...AIT_PROJECTS, 'https://sf.aitinkerers.org/organizers'];
  if (url === VULTR_CURRENT) return [VULTR_PAST];
  if (url === 'https://lu.ma/7a4iutvp' || url.startsWith('https://www.hackathons.team/events/')) return [
    'https://www.hackathons.team/about', 'https://www.hackathons.team/',
    'https://www.hackathons.team/events/ai-security-hackathon-2026', 'https://www.hackathons.team/sponsor/enquire',
  ];
  return [];
}
