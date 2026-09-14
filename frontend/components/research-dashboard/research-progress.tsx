import { englishSystemText } from "../../lib/research/english"
import type { EvaluationRunView } from '../../lib/api/atlas-client'
import { progressSummary, RUN_LABELS, STAGE_LABELS, readableDate } from '../../lib/research/presentation'

export function ResearchProgress({ run, runId, editionCount, onOpenRun }: { run: EvaluationRunView | null; runId: string; editionCount: number; onOpenRun: (id: string) => void }) {
  const summary = run && progressSummary(run, editionCount)
  return <section className="research-progress" aria-label="Saved research progress" data-testid="run-progress" data-run-id={runId}>
    <div className="progress-summary" role="status" aria-live="polite">
      <b>{summary?.label ?? 'Loading research…'}</b>
      <span>{summary?.stage}</span><span>{summary?.findings}</span>
    </div>
    {summary?.limited && <p className="research-pending">{summary.status === 'failed' ? 'A source or provider could not complete the research. Saved findings remain available. Inspect the cause below, then retry the source or adjust the brief.' : summary.status === 'insufficient' ? 'There is not enough evidence to suggest an opportunity. Add a public event URL or adjust the brief.' : 'Some questions remain open. The saved sources are usable; unread pages are not verified findings.'}</p>}
    <details data-testid="research-technical"><summary>Technical details</summary>
      <p>Research <span>{runId}</span> · {run?.workflowVersion} · updated {readableDate(run?.updatedAt)}</p>
      {run && <><ol>{run.steps.map(step => <li key={step.name} className={`step-${step.state}`}><span className="step-label">{STAGE_LABELS[step.name] ?? step.name}</span> <b>{RUN_LABELS[step.state] ?? step.state}</b> · attempts {step.attempts}{step.error && <p>{englishSystemText(step.error)}</p>}</li>)}</ol>
        {run.error && <p role="alert">{englishSystemText(run.error)}</p>}
        {run.previousRunId && <button className="research-link" onClick={() => onOpenRun(run.previousRunId!)}>Open previous research</button>}
        {run.researchPlan && <details data-testid="saved-brief-questions"><summary>Saved research questions</summary><ol>{run.researchPlan.questions.map(question => <li key={question.id}>{englishSystemText(question.text)}</li>)}</ol></details>}
        <details><summary>Persisted response and logs</summary><pre>{JSON.stringify({runId, state: run.state, steps: run.steps, error: run.error, researchPlan: run.researchPlan}, null, 2)}</pre></details>
      </>}
    </details>
  </section>
}
