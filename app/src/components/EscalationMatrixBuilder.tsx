import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2 } from 'lucide-react'

interface EscalationRule {
  id: string
  ticket_type: string
  priority: string
  escalation_tier: number
  assignment_group_id: string
  group_name: string
  escalation_method: string
  escalate_after_hours?: number
  escalate_on_sla_breach: boolean
  notify_channels: string
  is_final_escalation: boolean
}

interface AssignmentGroup {
  id: string
  name: string
}

interface EscalationMatrixBuilderProps {
  teamId: string
  rules?: EscalationRule[]
  groups?: AssignmentGroup[]
  loading?: boolean
  error?: string
  onRuleCreate?: (data: Omit<EscalationRule, 'id' | 'group_name'>) => Promise<void>
  onRuleUpdate?: (id: string, data: Omit<EscalationRule, 'id' | 'group_name'>) => Promise<void>
  onRuleDelete?: (id: string) => Promise<void>
  onRulesRefresh?: () => Promise<void>
}

const TICKET_TYPES = ['incident', 'service_request', 'change', 'problem']
const PRIORITIES = ['critical', 'high', 'medium', 'low']
const TIERS = [1, 2, 3]

export default function EscalationMatrixBuilder({
  teamId,
  rules: propsRules,
  groups: propsGroups,
  loading: propsLoading,
  error: propsError,
  onRuleCreate,
  onRuleUpdate,
  onRuleDelete,
  onRulesRefresh,
}: EscalationMatrixBuilderProps) {
  const usePropsMode = propsRules !== undefined
  const [localRules, setLocalRules] = useState<EscalationRule[]>([])
  const [localGroups, setLocalGroups] = useState<AssignmentGroup[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  const rules = usePropsMode ? propsRules : localRules
  const groups = usePropsMode ? propsGroups : localGroups
  const loading = usePropsMode ? propsLoading : localLoading
  const error = usePropsMode ? propsError : localError
  const setError = usePropsMode ? () => {} : setLocalError
  const [form, setForm] = useState({
    ticket_type: 'incident',
    priority: 'critical',
    escalation_tier: 1,
    assignment_group_id: '',
    escalation_method: 'automatic',
    escalate_after_hours: 30,
    escalate_on_sla_breach: true,
    notify_channels: 'email,slack',
    is_final_escalation: false,
  })

  useEffect(() => {
    loadRulesAndGroups()
  }, [teamId])

  const loadRulesAndGroups = async () => {
    if (usePropsMode) {
      await onRulesRefresh?.()
      return
    }
    try {
      setLocalLoading(true)
      const [rulesRes, groupsRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/escalation-rules`),
        fetch(`/api/teams/${teamId}/assignment-groups`),
      ])

      if (!rulesRes.ok) throw new Error(await rulesRes.text())
      if (!groupsRes.ok) throw new Error(await groupsRes.text())

      const rulesData = await rulesRes.json()
      const groupsData = await groupsRes.json()

      setLocalRules(Array.isArray(rulesData) ? rulesData : [])
      setLocalGroups(Array.isArray(groupsData) ? groupsData : [])
    } catch (err) {
      setLocalError(`Failed to load: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLocalLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.assignment_group_id) {
      setError('Please select an assignment group')
      return
    }

    try {
      const payload = {
        ...form,
        escalation_tier: parseInt(form.escalation_tier.toString()),
        escalate_after_hours: form.escalation_method === 'automatic' ? parseInt(form.escalate_after_hours?.toString() || '0') : null,
      }

      if (usePropsMode) {
        if (editingId && onRuleUpdate) {
          await onRuleUpdate(editingId, payload)
        } else if (!editingId && onRuleCreate) {
          await onRuleCreate(payload)
        }
      } else {
        const method = editingId ? 'PUT' : 'POST'
        const url = editingId
          ? `/api/teams/${teamId}/escalation-rules/${editingId}`
          : `/api/teams/${teamId}/escalation-rules`

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) throw new Error(await response.text())
      }

      setForm({
        ticket_type: 'incident',
        priority: 'critical',
        escalation_tier: 1,
        assignment_group_id: '',
        escalation_method: 'automatic',
        escalate_after_hours: 30,
        escalate_on_sla_breach: true,
        notify_channels: 'email,slack',
        is_final_escalation: false,
      })
      setShowForm(false)
      setEditingId(null)
      await loadRulesAndGroups()
    } catch (err) {
      setError(`Failed to save rule: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this escalation rule? This cannot be undone.')) return
    try {
      if (usePropsMode && onRuleDelete) {
        await onRuleDelete(id)
      } else {
        const response = await fetch(`/api/teams/${teamId}/escalation-rules/${id}`, {
          method: 'DELETE',
        })
        if (!response.ok) throw new Error(await response.text())
      }
      await loadRulesAndGroups()
    } catch (err) {
      setError(`Failed to delete rule: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleEdit = (rule: EscalationRule) => {
    setForm({
      ticket_type: rule.ticket_type,
      priority: rule.priority,
      escalation_tier: rule.escalation_tier,
      assignment_group_id: rule.assignment_group_id,
      escalation_method: rule.escalation_method,
      escalate_after_hours: rule.escalate_after_hours || 30,
      escalate_on_sla_breach: rule.escalate_on_sla_breach,
      notify_channels: rule.notify_channels,
      is_final_escalation: rule.is_final_escalation,
    })
    setEditingId(rule.id)
    setShowForm(true)
  }

  const groupedRules = TICKET_TYPES.map((type) => ({
    type,
    rules: PRIORITIES.map((priority) => ({
      priority,
      rules: rules.filter((r) => r.ticket_type === type && r.priority === priority),
    })),
  }))

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {!showForm ? (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Escalation Rules</h2>
            <button
              onClick={() => {
                setShowForm(true)
                setEditingId(null)
              }}
              disabled={groups.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              New Rule
            </button>
          </div>

          {groups.length === 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
              Create assignment groups first before setting up escalation rules.
            </div>
          )}

          {loading ? (
            <p className="text-gray-600">Loading...</p>
          ) : rules.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No escalation rules yet. Create one to get started.</p>
          ) : (
            <div className="space-y-8">
              {groupedRules.map((typeGroup) => (
                <div key={typeGroup.type}>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                    {typeGroup.type}
                  </h3>
                  <div className="space-y-3">
                    {typeGroup.rules.map((priorityGroup) => (
                      <div key={`${typeGroup.type}-${priorityGroup.priority}`}>
                        <div className="text-xs font-medium text-gray-600 mb-2 px-2">
                          Priority: {priorityGroup.priority}
                        </div>
                        <div className="space-y-2 pl-2">
                          {priorityGroup.rules.map((rule) => (
                            <div key={rule.id} className="p-3 bg-gray-50 border border-gray-200 rounded">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">
                                    Tier {rule.escalation_tier} → {rule.group_name}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1 space-x-3">
                                    <span>Method: {rule.escalation_method}</span>
                                    {rule.escalate_after_hours && (
                                      <span>After: {rule.escalate_after_hours}min</span>
                                    )}
                                    <span>SLA breach: {rule.escalate_on_sla_breach ? 'Yes' : 'No'}</span>
                                    {rule.is_final_escalation && <span className="font-semibold">FINAL TIER</span>}
                                  </div>
                                </div>
                                <div className="flex gap-2 ml-4">
                                  <button
                                    onClick={() => handleEdit(rule)}
                                    className="p-2 hover:bg-gray-200 rounded"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(rule.id)}
                                    className="p-2 hover:bg-red-100 text-red-600 rounded"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {editingId ? 'Edit Escalation Rule' : 'Create Escalation Rule'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ticket Type *
                </label>
                <select
                  required
                  value={form.ticket_type}
                  onChange={(e) => setForm({ ...form, ticket_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {TICKET_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority *
                </label>
                <select
                  required
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tier *
                </label>
                <select
                  required
                  value={form.escalation_tier}
                  onChange={(e) => setForm({ ...form, escalation_tier: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      Tier {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assignment Group *
              </label>
              <select
                required
                value={form.assignment_group_id}
                onChange={(e) => setForm({ ...form, assignment_group_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="">Select a group...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Escalation Method
                </label>
                <select
                  value={form.escalation_method}
                  onChange={(e) => setForm({ ...form, escalation_method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                  <option value="both">Both</option>
                </select>
              </div>

              {form.escalation_method !== 'manual' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Escalate After (minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.escalate_after_hours || 0}
                    onChange={(e) => setForm({ ...form, escalate_after_hours: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notification Channels
              </label>
              <input
                type="text"
                value={form.notify_channels}
                onChange={(e) => setForm({ ...form, notify_channels: e.target.value })}
                placeholder="email,slack,sms,phone"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">Comma-separated channel names</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.escalate_on_sla_breach}
                  onChange={(e) => setForm({ ...form, escalate_on_sla_breach: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">
                  Escalate on SLA breach (80% threshold)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_final_escalation}
                  onChange={(e) => setForm({ ...form, is_final_escalation: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">
                  This is the final escalation (Tier 3)
                </span>
              </label>
            </div>

            <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
              <button
                type="submit"
                className="px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                {editingId ? 'Update Rule' : 'Create Rule'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                  setForm({
                    ticket_type: 'incident',
                    priority: 'critical',
                    escalation_tier: 1,
                    assignment_group_id: '',
                    escalation_method: 'automatic',
                    escalate_after_hours: 30,
                    escalate_on_sla_breach: true,
                    notify_channels: 'email,slack',
                    is_final_escalation: false,
                  })
                }}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
