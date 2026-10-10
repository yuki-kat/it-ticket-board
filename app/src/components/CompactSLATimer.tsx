import { useState, useEffect } from 'react'
import { Clock, Pause, Play } from 'lucide-react'

interface CompactSLATimerProps {
  ticketId: string
  createdAt: string
  status: string
  responseTimeMinutes?: number
  resolutionTimeHours?: number
  compact?: boolean
}

export default function CompactSLATimer({
  ticketId,
  createdAt,
  status,
  responseTimeMinutes = 60,
  resolutionTimeHours = 24,
  compact = true,
}: CompactSLATimerProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [loading, setLoading] = useState(false)

  // Calculate elapsed time
  useEffect(() => {
    const calculateElapsed = () => {
      const created = new Date(createdAt)
      const now = new Date()
      const elapsed = Math.floor((now.getTime() - created.getTime()) / 1000 / 60)
      setElapsedMinutes(elapsed)
    }

    calculateElapsed()
    const interval = setInterval(calculateElapsed, 10000) // Update every 10 seconds
    return () => clearInterval(interval)
  }, [createdAt])

  // Load SLA pause state
  useEffect(() => {
    const loadSLAState = async () => {
      try {
        const response = await fetch(`/api/tickets/${ticketId}/sla/effective-time`, {
          headers: { 'Content-Type': 'application/json' },
        })
        if (response.ok) {
          const data = await response.json()
          setIsPaused(data.isPaused)
        }
      } catch (err) {
        console.error('Failed to load SLA state:', err)
      }
    }

    loadSLAState()
  }, [ticketId])

  const handlePauseResume = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLoading(true)
    try {
      const endpoint = isPaused ? 'resume' : 'pause'
      const response = await fetch(`/api/tickets/${ticketId}/sla/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        setIsPaused(!isPaused)
      }
    } catch (err) {
      console.error('Failed to update SLA pause state:', err)
    } finally {
      setLoading(false)
    }
  }

  const responseMinutesRemaining = Math.max(0, responseTimeMinutes - elapsedMinutes)
  const isOverResponse = elapsedMinutes > responseTimeMinutes
  const statusColor = isOverResponse ? 'text-red-600' : 'text-green-600'

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <div className="flex items-center gap-1">
          <Clock size={14} className={statusColor} />
          <span className={`font-semibold ${statusColor}`}>
            {responseMinutesRemaining}m {isPaused && '(⏸)'}
          </span>
        </div>
        {status === 'awaiting-user' && (
          <button
            onClick={handlePauseResume}
            disabled={loading}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
            title={isPaused ? 'Resume SLA' : 'Pause SLA'}
          >
            {isPaused ? (
              <Play size={12} className="text-green-600" />
            ) : (
              <Pause size={12} className="text-yellow-600" />
            )}
          </button>
        )}
      </div>
    )
  }

  // Full view
  const hours = Math.floor(elapsedMinutes / 60)
  const minutes = elapsedMinutes % 60
  const timeStr = `${hours}h ${minutes}m`

  const resolutionMinutesRemaining = Math.max(0, resolutionTimeHours * 60 - elapsedMinutes)
  const isOverResolution = elapsedMinutes > resolutionTimeHours * 60

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">SLA Timer</h3>
          {isPaused && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">
              Paused
            </span>
          )}
        </div>
        <button
          onClick={handlePauseResume}
          disabled={loading || status === 'resolved' || status === 'closed'}
          className={`p-2 rounded transition-colors ${
            isPaused
              ? 'bg-green-100 text-green-600 hover:bg-green-200'
              : 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isPaused ? 'Resume SLA' : 'Pause SLA'}
        >
          {isPaused ? <Play size={18} /> : <Pause size={18} />}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="text-sm text-gray-600">Elapsed</span>
          <span className="text-sm font-mono font-bold text-gray-900">{timeStr}</span>
        </div>

        <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="text-sm text-gray-600">Response Time</span>
          <span className={`text-sm font-semibold ${isOverResponse ? 'text-red-600' : 'text-green-600'}`}>
            {isOverResponse ? '⚠ ' : '✓ '}{responseMinutesRemaining}m remaining
          </span>
        </div>

        <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="text-sm text-gray-600">Resolution Time</span>
          <span className={`text-sm font-semibold ${isOverResolution ? 'text-red-600' : 'text-green-600'}`}>
            {isOverResolution ? '⚠ ' : '✓ '}{resolutionMinutesRemaining}m remaining
          </span>
        </div>
      </div>
    </div>
  )
}
