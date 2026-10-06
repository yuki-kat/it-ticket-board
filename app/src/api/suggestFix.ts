export type SuggestFixTicket = {
  id: string
  title: string
  description: string
  recordType: string
  severity: string
  assignmentGroup?: string
  tags?: string[]
}

export type TicketSuggestion = {
  likelyCauses: string[]
  steps: string[]
  escalateIf: string
}

const hostedOnly = 'AI suggestions work on the hosted site only, not in a downloaded copy.'

export async function requestTicketSuggestion(ticket: SuggestFixTicket): Promise<TicketSuggestion> {
  if (location.protocol === 'file:') throw new Error(hostedOnly)

  const response = await fetch('api/suggest-fix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: ticket.title,
      description: ticket.description,
      recordType: ticket.recordType,
      severity: ticket.severity,
      assignmentGroup: ticket.assignmentGroup,
      tags: ticket.tags,
    }),
  })
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok || !data || typeof data !== 'object') {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : response.status === 404 ? hostedOnly : 'Could not get a suggestion.'
    throw new Error(message)
  }

  const suggestion = data as Partial<TicketSuggestion>
  if (
    !Array.isArray(suggestion.likelyCauses) ||
    !suggestion.likelyCauses.every((cause) => typeof cause === 'string') ||
    !Array.isArray(suggestion.steps) ||
    !suggestion.steps.length ||
    !suggestion.steps.every((step) => typeof step === 'string') ||
    typeof suggestion.escalateIf !== 'string'
  ) {
    throw new Error('The AI service returned an invalid suggestion. Please try again.')
  }

  return suggestion as TicketSuggestion
}
