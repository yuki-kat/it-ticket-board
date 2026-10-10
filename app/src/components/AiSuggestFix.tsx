import { useEffect, useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { API_BASE, authHeader } from '../api/base'

// "Suggest fix" in the ticket record panel. Gemini is called through the backend's /api/suggest-fix
// (server/src/api/suggest-fix.ts), so the API key never reaches the browser. It needs a reachable backend:
// the downloaded file and the test link have no server behind them.

type Suggestion = { likelyCauses: string[]; steps: string[]; escalateIf: string }
type SuggestFixTicket = { id: string; title: string; description: string; recordType: string; severity: string; assignmentGroup?: string; tags?: string[] }
type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; suggestion: Suggestion }

const hostedOnly = 'AI suggestions work on the hosted site only, not in a downloaded copy.'

export function AiSuggestFix({ ticket }: { ticket: SuggestFixTicket }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  useEffect(() => { setState({ kind: 'idle' }) }, [ticket.id])

  const ask = async () => {
    if (location.protocol === 'file:') { setState({ kind: 'error', message: hostedOnly }); return }
    setState({ kind: 'loading' })
    try {
      const response = await fetch(`${API_BASE}/suggest-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ title: ticket.title, description: ticket.description, recordType: ticket.recordType, severity: ticket.severity, assignmentGroup: ticket.assignmentGroup, tags: ticket.tags }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data) { setState({ kind: 'error', message: data?.error || (response.status === 404 ? hostedOnly : 'Could not get a suggestion.') }); return }
      setState({ kind: 'done', suggestion: data })
    } catch {
      setState({ kind: 'error', message: hostedOnly })
    }
  }

  return <section className="record-section ai-suggest-fix" aria-live="polite">
    <div className="record-section-heading"><h3>Suggested fix</h3><span>Gemini · check before acting</span></div>
    {state.kind === 'idle' && <><p>Ask Gemini for likely causes and troubleshooting steps. It sees this ticket's type, severity, group, tags and descriptions, not people's names or emails.</p><button className="ai-suggest-button" onClick={ask}><Sparkles size={13} />Suggest fix</button></>}
    {state.kind === 'loading' && <p className="ai-suggest-status">Asking Gemini…</p>}
    {state.kind === 'error' && <><p className="ai-suggest-status is-error">{state.message}</p><button className="ai-suggest-button" onClick={ask}><RotateCcw size={13} />Try again</button></>}
    {state.kind === 'done' && <div className="ai-suggest-result">
      {state.suggestion.likelyCauses.length > 0 && <><h4>Likely causes</h4><ul>{state.suggestion.likelyCauses.map((cause) => <li key={cause}>{cause}</li>)}</ul></>}
      <h4>Steps to try</h4><ol>{state.suggestion.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {state.suggestion.escalateIf && <><h4>Escalate if</h4><p>{state.suggestion.escalateIf}</p></>}
      <button className="ai-suggest-button" onClick={ask}><RotateCcw size={13} />Ask again</button>
    </div>}
  </section>
}
