import { useState } from 'react'
import { AlertTriangle, Send, Mail, MessageSquare, Phone } from 'lucide-react'

interface EscalationChannel {
  id: string
  tier: number
  channel_type: string
  channel_identifier: string
  description?: string
}

interface EscalateButtonProps {
  ticketId: string
  ticketTitle: string
  ticketPriority: string
  currentTier: number
  onEscalateSuccess?: () => void
}

const getChannelIcon = (type: string) => {
  switch (type) {
    case 'email':
      return <Mail size={16} />
    case 'slack':
    case 'teams':
      return <MessageSquare size={16} />
    case 'pagerduty':
      return <Phone size={16} />
    default:
      return <Send size={16} />
  }
}

const getChannelLabel = (type: string) => {
  const labels: Record<string, string> = {
    email: 'Email',
    slack: 'Slack',
    teams: 'Microsoft Teams',
    pagerduty: 'PagerDuty',
    custom: 'Custom',
  }
  return labels[type] || type
}

export default function EscalateButton({
  ticketId,
  ticketTitle,
  ticketPriority,
  currentTier,
  onEscalateSuccess,
}: EscalateButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [escalationInfo, setEscalationInfo] = useState<{
    newTier: number
    channel?: EscalationChannel
  } | null>(null)

  const handleEscalateClick = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/tickets/${ticketId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual escalation from UI' }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data = await response.json()
      setEscalationInfo({
        newTier: data.newTier,
        channel: data.escalationChannel,
      })
      setShowConfirm(true)
    } catch (error) {
      console.error('Escalation error:', error)
      alert('Failed to escalate ticket')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmEscalation = async () => {
    if (!escalationInfo) return

    try {
      setIsLoading(true)

      if (escalationInfo.channel) {
        // Send notification to the configured channel
        const notificationResponse = await fetch(`/api/tickets/${ticketId}/notify-escalation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: escalationInfo.channel,
            tier: escalationInfo.newTier,
            ticketTitle,
            ticketPriority,
          }),
        })

        if (!notificationResponse.ok) {
          console.error('Failed to send notification, but escalation was recorded')
        }
      }

      setShowConfirm(false)
      setEscalationInfo(null)
      onEscalateSuccess?.()
    } catch (error) {
      console.error('Confirmation error:', error)
      alert('Escalation recorded but failed to notify recipient')
    } finally {
      setIsLoading(false)
    }
  }

  if (currentTier >= 3) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 bg-gray-300 text-gray-600 rounded cursor-not-allowed opacity-50"
      >
        <AlertTriangle size={16} />
        Max Tier Reached
      </button>
    )
  }

  return (
    <>
      <button
        onClick={handleEscalateClick}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
      >
        <AlertTriangle size={16} />
        {isLoading ? 'Escalating...' : `Escalate to Tier ${currentTier + 1}`}
      </button>

      {showConfirm && escalationInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Escalate to Tier {escalationInfo.newTier}?
            </h2>

            <div className="mb-4 space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Ticket:</span>
                <p className="font-medium text-gray-900">{ticketTitle}</p>
              </div>
              <div>
                <span className="text-gray-600">Priority:</span>
                <p className="font-medium text-gray-900">{ticketPriority}</p>
              </div>
            </div>

            {escalationInfo.channel ? (
              <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  {getChannelIcon(escalationInfo.channel.channel_type)}
                  Notification will be sent to:
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {getChannelLabel(escalationInfo.channel.channel_type)}
                  </p>
                  <p className="text-sm text-gray-600">{escalationInfo.channel.channel_identifier}</p>
                  {escalationInfo.channel.description && (
                    <p className="text-xs text-gray-500 mt-1">{escalationInfo.channel.description}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded">
                <p className="text-sm text-amber-800">
                  No escalation channel configured for Tier {escalationInfo.newTier}. Escalation will be recorded but no notification will be sent.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleConfirmEscalation}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
              >
                {isLoading ? 'Processing...' : 'Confirm Escalation'}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false)
                  setEscalationInfo(null)
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
