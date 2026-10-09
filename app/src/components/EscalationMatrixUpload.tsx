import { useState } from 'react'
import { Upload, Download, Trash2, Plus, Edit2, X } from 'lucide-react'

interface EscalationChannel {
  id: string
  tier: number
  channel_type: string
  channel_identifier: string
  user_id?: string
  description?: string
}

interface EscalationMatrix {
  id: string
  file_name: string
  file_type: string
  file_size: number
  created_at: string
}

interface EscalationMatrixUploadProps {
  teamId: string
  onUploadComplete?: () => void
}

const channelTypeOptions = ['email', 'slack', 'teams', 'pagerduty', 'custom']
const tierOptions = [1, 2, 3]

export default function EscalationMatrixUpload({
  teamId,
  onUploadComplete,
}: EscalationMatrixUploadProps) {
  const [matrix, setMatrix] = useState<EscalationMatrix | null>(null)
  const [channels, setChannels] = useState<EscalationChannel[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    tier: 1,
    channel_type: 'email',
    channel_identifier: '',
    description: '',
  })

  // Load matrix and channels on mount
  const loadData = async () => {
    try {
      setLoading(true)
      const [matrixRes, channelsRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/escalation-matrix`),
        fetch(`/api/teams/${teamId}/escalation-channels`),
      ])

      if (matrixRes.ok) {
        setMatrix(await matrixRes.json())
      }
      if (channelsRes.ok) {
        setChannels(await channelsRes.json())
      }
    } catch (error) {
      console.error('Failed to load escalation data:', error)
    } finally {
      setLoading(false)
    }
  }

  useState(() => {
    loadData()
  }, [teamId])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      const formDataObj = new FormData()
      formDataObj.append('file', file)

      const response = await fetch(`/api/teams/${teamId}/escalation-matrix/upload`, {
        method: 'POST',
        body: formDataObj,
      })

      if (!response.ok) throw new Error('Upload failed')

      setMatrix(await response.json())
      onUploadComplete?.()
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to upload file')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteMatrix = async () => {
    if (!confirm('Delete the uploaded escalation matrix?')) return

    try {
      const response = await fetch(`/api/teams/${teamId}/escalation-matrix`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Delete failed')
      setMatrix(null)
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete matrix')
    }
  }

  const handleDownloadMatrix = () => {
    if (!matrix) return
    window.location.href = `/api/teams/${teamId}/escalation-matrix/download`
  }

  const handleAddChannel = async () => {
    if (!formData.channel_identifier) {
      alert('Please fill in all required fields')
      return
    }

    try {
      const response = await fetch(`/api/teams/${teamId}/escalation-channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) throw new Error('Add channel failed')

      const newChannel = await response.json()
      setChannels([...channels, newChannel])
      setFormData({ tier: 1, channel_type: 'email', channel_identifier: '', description: '' })
      setShowAddChannel(false)
    } catch (error) {
      console.error('Add channel error:', error)
      alert('Failed to add escalation channel')
    }
  }

  const handleDeleteChannel = async (channelId: string) => {
    if (!confirm('Delete this escalation channel?')) return

    try {
      const response = await fetch(`/api/teams/${teamId}/escalation-channels/${channelId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Delete failed')
      setChannels(channels.filter((c) => c.id !== channelId))
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete channel')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading...</div>
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Upload Section */}
      <div className="border-b pb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Escalation Matrix</h3>

        {matrix ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm text-gray-600">Current file:</p>
              <p className="font-medium text-gray-900">{matrix.file_name}</p>
              <p className="text-xs text-gray-500">Size: {formatFileSize(matrix.file_size)}</p>
              <p className="text-xs text-gray-500">
                Uploaded: {new Date(matrix.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDownloadMatrix}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                <Download size={16} />
                Download
              </button>
              <button
                onClick={handleDeleteMatrix}
                className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </div>
        ) : (
          <label className="flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-gray-400 cursor-pointer">
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.txt"
            />
            <div className="text-center">
              <Upload className="mx-auto mb-2 text-gray-400" size={32} />
              <p className="font-medium text-gray-900">
                {uploading ? 'Uploading...' : 'Upload Escalation Matrix'}
              </p>
              <p className="text-sm text-gray-500">
                PNG, JPG, PDF, Word, or TXT • Max 10MB
              </p>
            </div>
          </label>
        )}
      </div>

      {/* Escalation Channels Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Escalation Channels</h3>
          <button
            onClick={() => setShowAddChannel(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            <Plus size={16} />
            Add Channel
          </button>
        </div>

        {showAddChannel && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Escalation Tier</label>
              <select
                value={formData.tier}
                onChange={(e) => setFormData({ ...formData, tier: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {tierOptions.map((tier) => (
                  <option key={tier} value={tier}>
                    Tier {tier}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Channel Type</label>
              <select
                value={formData.channel_type}
                onChange={(e) => setFormData({ ...formData, channel_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {channelTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient{' '}
                {formData.channel_type === 'email' && '(email address)'}
                {formData.channel_type === 'slack' && '(Slack channel or user ID)'}
                {formData.channel_type === 'teams' && '(Teams channel ID)'}
              </label>
              <input
                type="text"
                value={formData.channel_identifier}
                onChange={(e) =>
                  setFormData({ ...formData, channel_identifier: e.target.value })
                }
                placeholder={
                  formData.channel_type === 'email'
                    ? 'manager@example.com'
                    : formData.channel_type === 'slack'
                      ? 'U123456 or #escalations'
                      : 'identifier'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Manager on call, Senior Engineer"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddChannel}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add Channel
              </button>
              <button
                onClick={() => setShowAddChannel(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {channels.length === 0 ? (
          <p className="text-center text-gray-500 py-6">
            No escalation channels configured. Add one to define where escalations go.
          </p>
        ) : (
          <div className="space-y-2">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Tier {channel.tier}</div>
                  <div className="text-sm text-gray-600">
                    {channel.channel_type.toUpperCase()}: {channel.channel_identifier}
                  </div>
                  {channel.description && (
                    <div className="text-xs text-gray-500">{channel.description}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteChannel(channel.id)}
                  className="p-2 hover:bg-red-50 rounded text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
