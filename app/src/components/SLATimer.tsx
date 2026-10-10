import { useState, useEffect } from 'react'
import { Pause, Play, Clock } from 'lucide-react'

interface SLATimerProps {
  ticketId: string
  createdAt: string
  status: string
  responseTimeMinutes?: number
  resolutionTimeHours?: number
  onPauseChange?: (isPaused: boolean) => void
}

export default function SLATimer({
  ticketId,
  createdAt,
  status,
  responseTimeMinutes = 60,
  resolutionTimeHours = 24,
  onPauseChange,
}: SLATimerProps) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isPaused, setIsPaused] = useState(false)
  const [elapsedMinutes, setElapsedMinutes] = useState(0)
  const [loading, setLoading] = useState(false)

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Calculate elapsed time
  useEffect(() => {
    const created = new Date(createdAt)
    const now = new Date()
    const elapsed = Math.floor((now.getTime() - created.getTime()) / 1000 / 60)
    setElapsedMinutes(elapsed)
  }, [createdAt, currentTime])

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
    const interval = setInterval(loadSLAState, 5000)
    return () => clearInterval(interval)
  }, [ticketId])

  const handlePauseResume = async () => {
    setLoading(true)
    try {
      const endpoint = isPaused ? 'resume' : 'pause'
      const response = await fetch(`/api/tickets/${ticketId}/sla/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        const newPausedState = !isPaused
        setIsPaused(newPausedState)
        onPauseChange?.(newPausedState)
      } else {
        const error = await response.json()
        alert(`Error: ${error.error}`)
      }
    } catch (err) {
      console.error('Failed to update SLA pause state:', err)
      alert('Failed to update SLA timer')
    } finally {
      setLoading(false)
    }
  }

  const hours = Math.floor(elapsedMinutes / 60)
  const minutes = elapsedMinutes % 60
  const timeStr = `${hours}h ${minutes}m`

  const responseMinutesRemaining = Math.max(0, responseTimeMinutes - elapsedMinutes)
  const resolutionMinutesRemaining = Math.max(0, resolutionTimeHours * 60 - elapsedMinutes)

  const responseHours = Math.floor(responseMinutesRemaining / 60)
  const responseMins = responseMinutesRemaining % 60
  const responseStr = `${responseHours}h ${responseMins}m`

  const resolutionHours = Math.floor(resolutionMinutesRemaining / 60)
  const resolutionMins = resolutionMinutesRemaining % 60
  const resolutionStr = `${resolutionHours}h ${resolutionMins}m`

  const isOverResponse = elapsedMinutes > responseTimeMinutes
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

      <div className="grid grid-cols-2 gap-4">
        {/* Current Time Clock */}
        <div className="text-center p-3 bg-white rounded border border-gray-200">
          <p className="text-xs text-gray-500 mb-2">Current Time</p>
          <p className="text-2xl font-mono font-bold text-gray-900">
            {currentTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })}
          </p>
        </div>

        {/* Elapsed Time */}
        <div className="text-center p-3 bg-white rounded border border-gray-200">
          <p className="text-xs text-gray-500 mb-2">Elapsed</p>
          <p className="text-2xl font-mono font-bold text-gray-900">{timeStr}</p>
        </div>
      </div>

      {/* SLA Status */}
      <div className="mt-4 space-y-2">
        {/* Response Time */}
        <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="text-sm text-gray-600">Response Time</span>
          <span
            className={`text-sm font-semibold ${
              isOverResponse ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {isOverResponse ? '⚠ ' : '✓ '} {responseStr} remaining
          </span>
        </div>

        {/* Resolution Time */}
        <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="text-sm text-gray-600">Resolution Time</span>
          <span
            className={`text-sm font-semibold ${
              isOverResolution ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {isOverResolution ? '⚠ ' : '✓ '} {resolutionStr} remaining
          </span>
        </div>
      </div>

      {status === 'awaiting-user' && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          SLA timer pauses automatically when awaiting user response
        </p>
      )}
    </div>
  )
}
