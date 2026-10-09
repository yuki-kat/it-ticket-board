import { useState, useEffect } from 'react'
import { Clock, AlertTriangle, CheckCircle, User } from 'lucide-react'

interface EscalationEvent {
  id: string
  ticket_id: string
  from_tier: number
  to_tier: number
  from_group_id?: string
  to_group_id: string
  to_group_name: string
  escalation_reason: string
  escalated_by?: string
  escalated_by_name?: string
  notification_sent: boolean
  notification_channels?: string
  notification_timestamp?: string
  sla_impact: string
  ticket_priority: string
  ticket_type: string
  created_at: string
}

interface EscalationHistoryViewerProps {
  teamId: string
  ticketId: string
  showFull?: boolean
}

const getReasonLabel = (reason: string) => {
  const labels: Record<string, string> = {
    time_based: 'Time-based escalation',
    sla_breach: 'SLA breach',
    sla_at_risk: 'SLA at risk',
    manual: 'Manual escalation',
    priority_change: 'Priority change',
  }
  return labels[reason] || reason
}

const getSLAColor = (impact: string) => {
  switch (impact) {
    case 'breached':
      return 'text-red-600 bg-red-50 border-red-200'
    case 'at_risk':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'within_sla':
      return 'text-green-600 bg-green-50 border-green-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

export default function EscalationHistoryViewer({
  teamId,
  ticketId,
  showFull = false,
}: EscalationHistoryViewerProps) {
  const [events, setEvents] = useState<EscalationEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(showFull)

  useEffect(() => {
    loadHistory()
  }, [teamId, ticketId])

  const loadHistory = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch(
        `/api/teams/${teamId}/tickets/${ticketId}/escalation-history`,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (response.status === 403) {
        setError('You do not have permission to view this escalation history.')
        return
      }

      if (!response.ok) {
        setError('Failed to load escalation history')
        return
      }

      const data = await response.json()
      setEvents(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-gray-600">Loading...</div>
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
        {error}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="text-gray-600 text-center py-4">
        No escalations recorded for this ticket
      </div>
    )
  }

  const displayEvents = expanded ? events : events.slice(0, 3)

  return (
    <div className="space-y-3">
      {displayEvents.map((event, index) => (
        <div
          key={event.id}
          className={`p-3 border-l-4 border-orange-500 bg-orange-50 rounded`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-orange-600 flex-shrink-0" />
                <span className="font-semibold text-gray-900">
                  Escalated to Tier {event.to_tier}: {event.to_group_name}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-2 space-y-1">
                <div>Reason: {getReasonLabel(event.escalation_reason)}</div>
                <div>
                  SLA Impact:{' '}
                  <span
                    className={`font-medium ${event.sla_impact === 'breached' ? 'text-red-600' : event.sla_impact === 'at_risk' ? 'text-orange-600' : 'text-green-600'}`}
                  >
                    {event.sla_impact}
                  </span>
                </div>
                {event.escalated_by_name && (
                  <div className="flex items-center gap-1">
                    <User size={12} />
                    Escalated by: {event.escalated_by_name}
                  </div>
                )}
                {event.notification_sent && event.notification_channels && (
                  <div className="flex items-center gap-1">
                    <CheckCircle size={12} className="text-green-600" />
                    Notified via: {event.notification_channels}
                  </div>
                )}
                <div className="flex items-center gap-1 text-gray-500">
                  <Clock size={12} />
                  {new Date(event.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {!expanded && events.length > 3 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm text-orange-600 hover:text-orange-700 font-medium"
        >
          Show all {events.length} escalations
        </button>
      )}

      {expanded && events.length > 3 && (
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-orange-600 hover:text-orange-700 font-medium"
        >
          Show less
        </button>
      )}
    </div>
  )
}
