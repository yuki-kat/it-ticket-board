import { Clock, Bell, AlertTriangle } from 'lucide-react'

interface EscalationMatrixProps {
  priority: string
  currentTier: number
}

const escalationRules = {
  critical: [
    { tier: 1, role: 'Support Analyst', trigger: '0 min', escalate: 'Immediately' },
    { tier: 2, role: 'IT Team Lead', trigger: 'Immediately', escalate: '30 min' },
    { tier: 3, role: 'IT Director', trigger: '30 min', escalate: '—' },
  ],
  high: [
    { tier: 1, role: 'Support Analyst', trigger: '0 min', escalate: '1 hour' },
    { tier: 2, role: 'IT Team Lead', trigger: '1 hour', escalate: '4 hours' },
    { tier: 3, role: 'IT Director', trigger: '4 hours', escalate: '—' },
  ],
  medium: [
    { tier: 1, role: 'Support Analyst', trigger: '0 min', escalate: '1 biz day' },
    { tier: 2, role: 'IT Team Lead', trigger: '1 biz day', escalate: '3 biz days' },
    { tier: 3, role: 'IT Director', trigger: '3 biz days', escalate: '—' },
  ],
  low: [
    { tier: 1, role: 'Support Analyst', trigger: '0 min', escalate: '3 biz days' },
    { tier: 2, role: 'IT Team Lead', trigger: '3 biz days', escalate: 'As needed' },
    { tier: 3, role: 'IT Director', trigger: 'As needed', escalate: '—' },
  ],
}

const priorityLabels = {
  critical: 'P1 - Critical',
  high: 'P2 - High',
  medium: 'P3 - Medium',
  low: 'P4 - Low',
}

const priorityColors = {
  critical: 'bg-red-100 border-red-300',
  high: 'bg-orange-100 border-orange-300',
  medium: 'bg-yellow-100 border-yellow-300',
  low: 'bg-green-100 border-green-300',
}

export default function EscalationMatrix({ priority, currentTier }: EscalationMatrixProps) {
  const rules = escalationRules[priority as keyof typeof escalationRules] || escalationRules.medium
  const label = priorityLabels[priority as keyof typeof priorityLabels] || 'Unknown'
  const colorClass = priorityColors[priority as keyof typeof priorityColors] || 'bg-gray-100 border-gray-300'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={18} className="text-gray-600" />
        <h3 className="font-semibold text-gray-900">{label} Escalation Matrix</h3>
      </div>

      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.tier}
            className={`flex items-center gap-4 p-3 rounded border transition-all ${
              currentTier === rule.tier
                ? colorClass
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-700">
              {rule.tier}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900">{rule.role}</div>
              <div className="text-sm text-gray-600">Trigger: {rule.trigger}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-medium text-gray-600">Escalate after</div>
              <div className="text-sm font-semibold text-gray-900">{rule.escalate}</div>
            </div>
            {currentTier === rule.tier && (
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-current opacity-80" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
        <div className="flex gap-2">
          <Clock size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Current Tier: {currentTier}</span>
            <p className="text-xs mt-1 opacity-85">
              Ticket is currently being handled at Tier {currentTier}. Follow the matrix rules for the next escalation threshold.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
