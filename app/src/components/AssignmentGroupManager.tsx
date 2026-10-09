import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Mail, MessageSquare, Phone } from 'lucide-react'

interface AssignmentGroup {
  id: string
  name: string
  description?: string
  group_type: 'support' | 'engineering' | 'management' | 'vendor'
  contact_type: 'email_group' | 'slack_channel' | 'pagerduty_schedule' | 'individual'
  contact_address: string
  contact_phone?: string
  timezone: string
  business_hours_start: number
  business_hours_end: number
  member_count: number
  on_call_count: number
}

interface AssignmentGroupManagerProps {
  teamId: string
  groups?: AssignmentGroup[]
  loading?: boolean
  error?: string
  onGroupCreate?: (data: Omit<AssignmentGroup, 'id' | 'member_count' | 'on_call_count'>) => Promise<void>
  onGroupUpdate?: (id: string, data: Omit<AssignmentGroup, 'id' | 'member_count' | 'on_call_count'>) => Promise<void>
  onGroupDelete?: (id: string) => Promise<void>
  onGroupsRefresh?: () => Promise<void>
}

const TIMEZONES = [
  'UTC',
  'US/Eastern',
  'US/Central',
  'US/Mountain',
  'US/Pacific',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
]

const CONTACT_TYPES = [
  { id: 'email_group', label: 'Email Group', icon: Mail },
  { id: 'slack_channel', label: 'Slack Channel', icon: MessageSquare },
  { id: 'pagerduty_schedule', label: 'PagerDuty', icon: Phone },
  { id: 'individual', label: 'Individual', icon: Mail },
]

export default function AssignmentGroupManager({
  teamId,
  groups: propsGroups,
  loading: propsLoading,
  error: propsError,
  onGroupCreate,
  onGroupUpdate,
  onGroupDelete,
  onGroupsRefresh,
}: AssignmentGroupManagerProps) {
  // Use props if provided, otherwise use internal state
  const usePropsMode = propsGroups !== undefined
  const [localGroups, setLocalGroups] = useState<AssignmentGroup[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  const groups = usePropsMode ? propsGroups : localGroups
  const loading = usePropsMode ? propsLoading : localLoading
  const error = usePropsMode ? propsError : localError
  const setError = usePropsMode ? () => {} : setLocalError
  const [form, setForm] = useState({
    name: '',
    description: '',
    group_type: 'support' as 'support' | 'engineering' | 'management' | 'vendor',
    contact_type: 'email_group' as 'email_group' | 'slack_channel' | 'pagerduty_schedule' | 'individual',
    contact_address: '',
    contact_phone: '',
    timezone: 'UTC',
    business_hours_start: 9,
    business_hours_end: 18,
  })

  useEffect(() => {
    loadGroups()
  }, [teamId])

  const loadGroups = async () => {
    if (usePropsMode) {
      await onGroupsRefresh?.()
      return
    }
    try {
      setLocalLoading(true)
      const response = await fetch(`/api/teams/${teamId}/assignment-groups`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) throw new Error(await response.text())
      const data = await response.json()
      setLocalGroups(Array.isArray(data) ? data : [])
    } catch (err) {
      setLocalError(`Failed to load groups: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLocalLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (usePropsMode) {
        if (editingId && onGroupUpdate) {
          await onGroupUpdate(editingId, form)
        } else if (!editingId && onGroupCreate) {
          await onGroupCreate(form)
        }
      } else {
        const method = editingId ? 'PUT' : 'POST'
        const url = editingId
          ? `/api/teams/${teamId}/assignment-groups/${editingId}`
          : `/api/teams/${teamId}/assignment-groups`

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })

        if (!response.ok) throw new Error(await response.text())
      }

      setForm({
        name: '',
        description: '',
        group_type: 'support',
        contact_type: 'email_group',
        contact_address: '',
        contact_phone: '',
        timezone: 'UTC',
        business_hours_start: 9,
        business_hours_end: 18,
      })
      setShowForm(false)
      setEditingId(null)
      await loadGroups()
    } catch (err) {
      setError(`Failed to save group: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this assignment group? This cannot be undone.')) return
    try {
      if (usePropsMode && onGroupDelete) {
        await onGroupDelete(id)
      } else {
        const response = await fetch(`/api/teams/${teamId}/assignment-groups/${id}`, {
          method: 'DELETE',
        })
        if (!response.ok) throw new Error(await response.text())
      }
      await loadGroups()
    } catch (err) {
      setError(`Failed to delete group: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleEdit = (group: AssignmentGroup) => {
    setForm({
      name: group.name,
      description: group.description || '',
      group_type: group.group_type as 'support' | 'engineering' | 'management' | 'vendor',
      contact_type: group.contact_type as 'email_group' | 'slack_channel' | 'pagerduty_schedule' | 'individual',
      contact_address: group.contact_address,
      contact_phone: group.contact_phone || '',
      timezone: group.timezone,
      business_hours_start: group.business_hours_start,
      business_hours_end: group.business_hours_end,
    })
    setEditingId(group.id)
    setShowForm(true)
  }

  const getContactIcon = (type: string) => {
    const contactType = CONTACT_TYPES.find((ct) => ct.id === type)
    return contactType ? <contactType.icon size={16} /> : null
  }

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
            <h2 className="text-lg font-semibold text-gray-900">Assignment Groups</h2>
            <button
              onClick={() => {
                setShowForm(true)
                setEditingId(null)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              <Plus size={16} />
              New Group
            </button>
          </div>

          {loading ? (
            <p className="text-gray-600">Loading...</p>
          ) : groups.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No assignment groups yet. Create one to get started.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{group.name}</h3>
                      {group.description && <p className="text-sm text-gray-600 mt-1">{group.description}</p>}
                      <div className="flex gap-4 mt-2 text-sm text-gray-600">
                        <span>Type: {group.group_type}</span>
                        <span className="flex items-center gap-1">
                          {getContactIcon(group.contact_type)}
                          {group.contact_address}
                        </span>
                        <span>TZ: {group.timezone}</span>
                        <span>Members: {group.member_count}</span>
                        {group.on_call_count > 0 && <span className="font-semibold">On-call: {group.on_call_count}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleEdit(group)}
                        className="p-2 hover:bg-gray-200 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(group.id)}
                        className="p-2 hover:bg-red-100 text-red-600 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {editingId ? 'Edit Assignment Group' : 'Create Assignment Group'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Group Name *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Service Desk, Desktop Engineers"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g., First line support team"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group Type
                </label>
                <select
                  value={form.group_type}
                  onChange={(e) =>
                    setForm({ ...form, group_type: e.target.value as 'support' | 'engineering' | 'management' | 'vendor' })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="support">Support</option>
                  <option value="engineering">Engineering</option>
                  <option value="management">Management</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <select
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Method *
              </label>
              <select
                required
                value={form.contact_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contact_type: e.target.value as 'email_group' | 'slack_channel' | 'pagerduty_schedule' | 'individual',
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                {CONTACT_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Address *
              </label>
              <input
                type="text"
                required
                value={form.contact_address}
                onChange={(e) => setForm({ ...form, contact_address: e.target.value })}
                placeholder={
                  form.contact_type === 'email_group'
                    ? 'helpdesk@company.com'
                    : form.contact_type === 'slack_channel'
                      ? '#support-team'
                      : 'schedule-id-or-email'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Phone (optional)
              </label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="+1-555-0100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Hours Start
                </label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={form.business_hours_start}
                  onChange={(e) => setForm({ ...form, business_hours_start: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Hours End
                </label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={form.business_hours_end}
                  onChange={(e) => setForm({ ...form, business_hours_end: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
              <button
                type="submit"
                className="px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                {editingId ? 'Update Group' : 'Create Group'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                  setForm({
                    name: '',
                    description: '',
                    group_type: 'support',
                    contact_type: 'email_group',
                    contact_address: '',
                    contact_phone: '',
                    timezone: 'UTC',
                    business_hours_start: 9,
                    business_hours_end: 18,
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
