import { useState, useEffect } from 'react'
import { Clock, Pause, Play } from 'lucide-react'
import { onPauseChange, readPause, togglePause, type PauseState } from '../utils/slaPause'

const pad = (n: number) => String(n).padStart(2, '0')

function formatDuration(totalSeconds: number) {
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (d) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`
  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`
  return `${m}m ${pad(s)}s`
}


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
  const [now, setNow] = useState(() => Date.now())
  const [pause, setPause] = useState<PauseState>(() => readPause(ticketId))

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setPause(readPause(ticketId))
    return onPauseChange(() => setPause(readPause(ticketId)))
  }, [ticketId])

  const isPaused = pause.pausedAt !== null
  const pausedMs = pause.pausedMs + (isPaused ? now - (pause.pausedAt as number) : 0)
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime() - pausedMs) / 1000))

  const handlePauseResume = (e: React.MouseEvent) => {
    e.stopPropagation()
    togglePause(ticketId)
  }

  const responseSecondsLeft = responseTimeMinutes * 60 - elapsedSeconds
  const resolutionSecondsLeft = resolutionTimeHours * 3600 - elapsedSeconds
  const isOverResponse = responseSecondsLeft < 0
  const isOverResolution = resolutionSecondsLeft < 0
  const statusColor = isOverResolution ? 'text-red-600' : 'text-green-600'
  const countdown = (secondsLeft: number) => `${formatDuration(Math.abs(secondsLeft))} ${secondsLeft < 0 ? 'overdue' : 'remaining'}`

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <div className="flex items-center gap-1" title={`Resolution SLA: ${countdown(resolutionSecondsLeft)}`}>
          <Clock size={14} className={statusColor} />
          <span className={`font-semibold ${statusColor}`} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {isOverResolution ? '-' : ''}{formatDuration(Math.abs(resolutionSecondsLeft))} {isPaused && '(⏸)'}
          </span>
        </div>
        {status === 'awaiting-user' && (
          <button
            onClick={handlePauseResume}
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

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <Clock size={20} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900" style={{ whiteSpace: 'nowrap' }}>SLA Timer</h3>
          {isPaused && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded" style={{ whiteSpace: 'nowrap' }}>
              {pause.reason === 'resolved' ? 'Stopped · resolved' : pause.reason === 'waiting-on-user' ? 'Paused · waiting on user' : 'Paused'}
            </span>
          )}
        </div>
        <button
          onClick={handlePauseResume}
          disabled={status === 'Resolved'}
          className={`p-2 rounded transition-colors ${
            isPaused
              ? 'bg-green-100 text-green-600 hover:bg-green-200'
              : 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isPaused ? 'Resume SLA timer' : 'Pause SLA timer'}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
          <span>{isPaused ? 'Resume SLA timer' : 'Pause SLA timer'}</span>
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="text-sm text-gray-600">Elapsed</span>
          <span className="text-sm font-mono font-bold text-gray-900">{formatDuration(elapsedSeconds)}</span>
        </div>

        <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="text-sm text-gray-600">Response Time</span>
          <span className={`text-sm font-semibold ${isOverResponse ? 'text-red-600' : 'text-green-600'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {isOverResponse ? '⚠ ' : '✓ '}{countdown(responseSecondsLeft)}
          </span>
        </div>

        <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="text-sm text-gray-600">Resolution Time</span>
          <span className={`text-sm font-semibold ${isOverResolution ? 'text-red-600' : 'text-green-600'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {isOverResolution ? '⚠ ' : '✓ '}{countdown(resolutionSecondsLeft)}
          </span>
        </div>
      </div>
    </div>
  )
}
