import { useState } from 'react'
import { Plus, Edit2, Trash2, Clock } from 'lucide-react'

interface SLATemplate {
  id: string
  name: string
  priority: string
  response_time_minutes: number
  resolution_time_hours: number
}

interface SLAManagementProps {
  templates: SLATemplate[]
  onAdd?: (template: Omit<SLATemplate, 'id'>) => void
  onUpdate?: (id: string, template: Partial<SLATemplate>) => void
  onDelete?: (id: string) => void
}

const defaultTemplates = [
  { name: 'P1 - Critical', priority: 'critical', response: 15, resolution: 4 },
  { name: 'P2 - High', priority: 'high', response: 30, resolution: 8 },
  { name: 'P3 - Medium', priority: 'medium', response: 240, resolution: 48 },
  { name: 'P4 - Low', priority: 'low', response: 1440, resolution: 120 },
]

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

function formatHours(hours: number): string {
  if (hours < 24) return `${hours}h`
  const days = hours / 24
  return `${days % 1 === 0 ? days : days.toFixed(1)}d`
}

const priorityColors = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
}

export default function SLAManagement({
  templates,
  onAdd,
  onUpdate,
  onDelete,
}: SLAManagementProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    priority: 'medium',
    response_time_minutes: 240,
    resolution_time_hours: 48,
  })

  const handleAdd = () => {
    if (formData.name && onAdd) {
      onAdd(formData as any)
      setFormData({
        name: '',
        priority: 'medium',
        response_time_minutes: 240,
        resolution_time_hours: 48,
      })
      setShowAddForm(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-gray-600" />
          <h2 className="text-xl font-semibold text-gray-900">SLA Templates</h2>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} />
          Add Template
        </button>
      </div>

      {showAddForm && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Template Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., P1 - Critical"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Response Time (min)</label>
                <input
                  type="number"
                  value={formData.response_time_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, response_time_minutes: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Resolution Time (hours)</label>
              <input
                type="number"
                value={formData.resolution_time_hours}
                onChange={(e) =>
                  setFormData({ ...formData, resolution_time_hours: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAdd}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Template
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No SLA templates configured. Create one to get started.</p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className={`flex items-center justify-between p-4 rounded-lg border ${
                priorityColors[template.priority as keyof typeof priorityColors] || 'bg-gray-100'
              }`}
            >
              <div className="flex-1">
                <h4 className="font-semibold">{template.name}</h4>
                <p className="text-sm opacity-85">
                  Response: {formatMinutes(template.response_time_minutes)} • Resolution:{' '}
                  {formatHours(template.resolution_time_hours)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingId(template.id)}
                  className="p-2 hover:bg-white hover:bg-opacity-50 rounded"
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => onDelete?.(template.id)}
                  className="p-2 hover:bg-white hover:bg-opacity-50 rounded"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">Default Matrix</h4>
        <div className="space-y-1 text-sm text-blue-800">
          {defaultTemplates.map((t) => (
            <div key={t.priority}>
              <span className="font-medium">{t.name}:</span> {t.response}m response, {t.resolution}h resolution
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
