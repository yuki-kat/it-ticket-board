import { useEffect, useRef, useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { requestTicketSuggestion, type SuggestFixTicket, type TicketSuggestion } from './api/suggestFix'

type Result = { kind: 'error'; message: string } | { kind: 'done'; suggestion: TicketSuggestion }

export function AiTroubleshootingGuidance({ ticket, onClose, onAddToNotes }: {
  ticket: SuggestFixTicket
  onClose: () => void
  onAddToNotes?: (suggestion: TicketSuggestion) => void
}) {
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const tagsKey = (ticket.tags || []).join('\0')
  const requestKey = JSON.stringify([attempt, ticket.id, ticket.title, ticket.description, ticket.recordType, ticket.severity, ticket.assignmentGroup, tagsKey])
  const guidanceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void requestTicketSuggestion(ticket).then(
      (suggestion) => { if (active) setResult({ key: requestKey, value: { kind: 'done', suggestion } }) },
      (error: unknown) => {
        if (active) setResult({ key: requestKey, value: { kind: 'error', message: error instanceof Error ? error.message : 'Could not get a suggestion.' } })
      },
    )
    return () => { active = false }
  }, [requestKey, ticket])
  const state = result?.key === requestKey ? result.value : { kind: 'loading' as const }

  useEffect(() => {
    if (state.kind !== 'loading') guidanceRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [state.kind])

  return <div ref={guidanceRef} className="ticket-ai-guidance" role="region" aria-label="AI guidance" aria-live="polite">
    <div className="ai-guidance-header"><h5>AI Guidance</h5><button onClick={onClose} aria-label="Close AI guidance">×</button></div>
    <div className="ai-guidance-content">
      <p><strong>{ticket.title}</strong></p>
      {state.kind === 'loading' && <p className="ai-suggest-status">Getting ticket-specific next steps…</p>}
      {state.kind === 'error' && <>
        <p className="ai-suggest-status is-error" role="alert">{state.message}</p>
        <button className="ai-suggest-button" onClick={() => setAttempt((current) => current + 1)}><RotateCcw size={13} />Try again</button>
      </>}
      {state.kind === 'done' && <div className="ai-suggest-result">
        {state.suggestion.likelyCauses.length > 0 && <><h4>Likely causes</h4><ul>{state.suggestion.likelyCauses.map((cause) => <li key={cause}>{cause}</li>)}</ul></>}
        <h4>Steps to try</h4><ol>{state.suggestion.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>
        {state.suggestion.escalateIf && <><h4>Escalate if</h4><p>{state.suggestion.escalateIf}</p></>}
        {onAddToNotes && <button className="search-add-btn" onClick={() => onAddToNotes(state.suggestion)}><Plus size={14} /> Add to notes</button>}
        <button className="ai-suggest-button" onClick={() => setAttempt((current) => current + 1)}><RotateCcw size={13} />Ask again</button>
      </div>}
    </div>
  </div>
}
