import type { ComparisonReading } from '../../lib/contracts/comparison'

const labels: Record<string, string> = {
  product: 'Product', audience: 'Audience', objective: 'Goal', budget: 'Budget',
  window: 'Date window', restrictions: 'Constraints', formats: 'Formats', stack: 'Stack',
  comparableCompanies: 'Comparable companies', geography: 'City',
}
const objectives: Record<string, string> = {adoption:'Adoption',feedback:'Feedback',hiring:'Hiring',awareness:'Awareness'}
function display(field: string, serialized: string): string {
  const value = JSON.parse(serialized)
  if (value === null) return 'Not declared'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item.name).join(', ') || 'None'
  if (field === 'audience') return [value.description, ...(value.profiles ?? [])].join(' · ')
  if (field === 'objective') return `${objectives[value.kind] ?? value.kind} (${value.confirmation === 'confirmed' ? 'Confirmed' : 'Provisional'}) · success: ${value.successDefinition?.text ?? 'Pending'}`
  if (field === 'budget') return value.status === 'declared' ? `${value.currency} ${value.amount}` : 'Pending'
  if (field === 'window') return `${value.from ?? 'Start pending'} — ${value.to ?? 'End pending'}`
  if (field === 'geography') return value.city
  return 'Not declared'
}
export function BriefDifferences({changes}: {changes: NonNullable<ComparisonReading['differences']>['briefChanges']}) {
  return <ul>{changes.map(change => <li key={change.field}><b>{labels[change.field] ?? change.field}:</b> {display(change.field,change.before)} → {display(change.field,change.after)}</li>)}</ul>
}
