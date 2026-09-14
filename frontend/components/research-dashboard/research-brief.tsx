import type { EvaluationProfile } from '../../lib/contracts/evaluation'
import { readableDate } from '../../lib/research/presentation'

export function ResearchBrief({ profile, onEdit }: { profile: EvaluationProfile; onEdit: () => void }) {
  return <section className="compact-brief" aria-label="Research brief" data-testid="compact-brief">
    <div><span className="eyebrow">Your brief · v{profile.profileVersion}</span><p>{profile.product}</p></div>
    <div className="brief-conditions"><span>{({adoption:'Product adoption', feedback:'Technical feedback', hiring:'Hiring', awareness:'Awareness'})[profile.objective.kind]} · {profile.objective.confirmation === 'confirmed' ? 'Declared' : 'Provisional'}</span><span>{profile.budget.status === 'declared' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.budget.currency, maximumFractionDigits: 2 }).format(profile.budget.amount) : 'Budget pending'}</span><span>{profile.window.from ? readableDate(profile.window.from) : 'Start pending'} → {profile.window.to ? readableDate(profile.window.to) : 'End pending'}</span></div>
    <button type="button" className="research-button" onClick={onEdit}>Edit brief</button>
    <details><summary>Audience and constraints</summary><p>{profile.audience.description}</p><p>Formats: {profile.formats?.join(', ') || 'Open'}. Restrictions: {profile.restrictions.join('; ') || 'None declared'}.</p><p>Success: {profile.objective.successDefinition.status === 'defined' ? profile.objective.successDefinition.text : 'Pending'}. Geography: San Francisco.</p></details>
  </section>
}
