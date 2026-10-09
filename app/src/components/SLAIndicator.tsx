import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface SLAStatus {
  responseDeadline: number
  resolutionDeadline: number
  timeToResponseDeadline: number
  timeToResolutionDeadline: number
  responseBreached: boolean
  resolutionBreached: boolean
  overallBreached: boolean
  status: 'at-risk' | 'breached' | 'safe'
  currentTier: number
}

interface SLAIndicatorProps {
  slaStatus: SLAStatus
  priority: string
}

export function formatTimeDelta(ms: number): string {
  const abs = Math.abs(ms)
  const seconds = Math.floor(abs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

const priorityColors = {
  critical: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  low: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
}

export default function SLAIndicator({ slaStatus, priority }: SLAIndicatorProps) {
  const colors = priorityColors[priority as keyof typeof priorityColors] || priorityColors.medium

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md border ${colors.bg} ${colors.border} ${colors.text} text-sm`}
    >
      {slaStatus.status === 'breached' && <AlertTriangle size={16} className="flex-shrink-0" />}
      {slaStatus.status === 'at-risk' && <Clock size={16} className="flex-shrink-0" />}
      {slaStatus.status === 'safe' && <CheckCircle2 size={16} className="flex-shrink-0" />}

      <div className="flex flex-col gap-1">
        <div className="font-semibold">
          {slaStatus.status === 'breached' && 'SLA Breached'}
          {slaStatus.status === 'at-risk' && 'At Risk'}
          {slaStatus.status === 'safe' && 'On Track'}
        </div>
        <div className="text-xs opacity-85">
          {slaStatus.status === 'breached'
            ? `Breached ${formatTimeDelta(Date.now() - slaStatus.resolutionDeadline)} ago`
            : `${formatTimeDelta(slaStatus.timeToResolutionDeadline)} to deadline`}
        </div>
        {slaStatus.currentTier > 1 && (
          <div className="text-xs font-medium">Tier {slaStatus.currentTier}</div>
        )}
      </div>
    </div>
  )
}
