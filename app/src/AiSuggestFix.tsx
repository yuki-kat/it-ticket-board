import { useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { requestTicketSuggestion, type SuggestFixTicket, type TicketSuggestion } from './api/suggestFix'

// "Suggest fix" in the ticket record panel. AI Gateway is called through the site's own /api/suggest-fix
// (app/api/suggest-fix.ts), so the API key never reaches the browser. It only works on the hosted site:
// the downloaded file and the test link have no server behind them.

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; suggestion: TicketSuggestion }

export function AiSuggestFix({ ticket }: { ticket: SuggestFixTicket }) {
  const [savedState, setSavedState] = useState<{ ticketId: string; value: State }>(() => ({ ticketId: ticket.id, value: { kind: 'idle' } }))
  const state = savedState.ticketId === ticket.id ? savedState.value : { kind: 'idle' as const }
  const setState = (value: State) => setSavedState({ ticketId: ticket.id, value })

  const ask = async () => {
    setState({ kind: 'loading' })
    try {
      const suggestion = await requestTicketSuggestion(ticket)
      setState({ kind: 'done', suggestion })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not get a suggestion.' })
    }
  }

  return <section className="record-section ai-suggest-fix" aria-live="polite">
    <div className="record-section-heading"><h3>Suggested fix</h3><span>AI Gateway · check before acting</span></div>
    {state.kind === 'idle' && <><p>Ask AI for likely causes and troubleshooting steps. It sees this ticket's type, severity, group, tags and descriptions, not people's names or emails.</p><button className="ai-suggest-button" onClick={ask}><Sparkles size={13} />Suggest fix</button></>}
    {state.kind === 'loading' && <p className="ai-suggest-status">Asking AI…</p>}
    {state.kind === 'error' && <><p className="ai-suggest-status is-error">{state.message}</p><button className="ai-suggest-button" onClick={ask}><RotateCcw size={13} />Try again</button></>}
    {state.kind === 'done' && <div className="ai-suggest-result">
      {state.suggestion.likelyCauses.length > 0 && <><h4>Likely causes</h4><ul>{state.suggestion.likelyCauses.map((cause) => <li key={cause}>{cause}</li>)}</ul></>}
      <h4>Steps to try</h4><ol>{state.suggestion.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {state.suggestion.escalateIf && <><h4>Escalate if</h4><p>{state.suggestion.escalateIf}</p></>}
      <button className="ai-suggest-button" onClick={ask}><RotateCcw size={13} />Ask again</button>
    </div>}
  </section>
}
