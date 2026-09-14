import type { EvaluationProfile } from '../contracts/evaluation.ts';
import { DISCOVERY_LIMITS, type DiscoveryPlan } from '../contracts/discovery.ts';

const goal = { adoption: 'hands-on API adoption and developer projects', feedback: 'technical feedback and product workshops', hiring: 'engineering recruiting and opt-in candidate conversations', awareness: 'developer audience exposure and technical talks' };
const compact = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

// No publication-date filter: a page publication date is not an event date.
export function buildDiscoveryPlan(profile: EvaluationProfile, limits: Partial<DiscoveryPlan['limits']> = {}): DiscoveryPlan {
  const bounded = Object.fromEntries(Object.entries(DISCOVERY_LIMITS).map(([key, max]) => {
    const value = limits[key as keyof typeof limits] ?? max;
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Límite discovery inválido: ${key}`);
    return [key, value];
  })) as DiscoveryPlan['limits'];
  const criteria: DiscoveryPlan['criteria'] = {
    product: profile.product, audience: [profile.audience.description, ...profile.audience.profiles].join('; '),
    objective: profile.objective.kind, window: profile.window,
    city: profile.geography?.city ?? 'San Francisco', timezone: profile.geography?.timezone ?? 'America/Los_Angeles',
    formats: profile.formats ?? [], restrictions: profile.restrictions,
  };
  const context = `${compact(criteria.product, 140)}; audience ${compact(criteria.audience, 160)}; ${compact(profile.stack.join(' '), 100)}`;
  const window = `${criteria.window.from ?? 'date to be determined'} through ${criteria.window.to ?? 'end date to be determined'} (${criteria.timezone})`;
  const activity = criteria.formats.length ? compact(criteria.formats.join(' or '), 100) : 'developer workshop, meetup or hackathon';
  const queries: DiscoveryPlan['queries'] = [
    { id: 'opportunities', purpose: 'opportunities', questionIds: ['fit', 'objective', 'eligibility'], text: `${criteria.city} ${activity} ${window}. ${context}. Goal: ${goal[profile.objective.kind]}. Find official event pages and programs.` },
    { id: 'background', purpose: 'background', questionIds: ['history', 'fit'], text: `${criteria.city} developer event organizer recaps, published projects and past editions relevant to ${context}. Goal: ${goal[profile.objective.kind]}. Comparables supplied by buyer: ${compact(profile.comparableCompanies.map(c => c.name).join(', '), 100) || 'none'}. Background for activities in ${window}.` },
    { id: 'conditions', purpose: 'conditions', questionIds: ['eligibility', 'objective', ...profile.restrictions.map((_, i) => `restriction-${i + 1}`)], text: `${criteria.city} ${activity} ${window}. ${context}. Participation, registration, sponsor prospectus and access conditions for ${goal[profile.objective.kind]}. Restrictions to investigate: ${compact(criteria.restrictions.join('; '), 200) || 'none declared'}.` },
  ];
  return { version: 1, profileId: profile.id, profileVersion: profile.profileVersion, criteria, limits: bounded, queries: queries.slice(0, bounded.maxQueries) };
}
