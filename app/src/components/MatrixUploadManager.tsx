import { useState, useEffect, useRef } from 'react'
import { apiFetch, responseError } from '../api/base'
import { Upload, Download, Trash2, AlertCircle, Check } from 'lucide-react'

interface Matrix {
  id: string
  file_name: string
  file_type: string
  file_size: number
  uploaded_by?: string
  created_at?: string
}

interface MatrixUploadManagerProps {
  teamId: string
  type: 'escalation' | 'sla'
  title: string
  description: string
  canEdit?: boolean
}

export default function MatrixUploadManager({
  teamId,
  type,
  title,
  description,
  canEdit = true,
}: MatrixUploadManagerProps) {
  const replaceInput = useRef<HTMLInputElement>(null)
  const [matrix, setMatrix] = useState<Matrix | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [uploading, setUploading] = useState(false)

  const endpoint = type === 'escalation' ? 'escalation-matrix' : 'sla-matrix'

  useEffect(() => {
    loadMatrix()
  }, [teamId, type])

  const loadMatrix = async () => {
    try {
      setLoading(true)
      const response = await apiFetch(`/teams/${teamId}/${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok) {
        const data = await response.json()
        setMatrix(data)
      } else {
        setMatrix(null)
      }
      setError('')
    } catch (err) {
      setError(`Failed to load ${type} matrix: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      setError('')
      const formData = new FormData()
      formData.append('file', file)

      const response = await apiFetch(`/teams/${teamId}/${endpoint}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Upload failed')
      }

      const data = await response.json()
      setMatrix(data)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(`Failed to upload ${type} matrix: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete ${type} matrix?`)) return

    try {
      setLoading(true)
      const response = await apiFetch(`/teams/${teamId}/${endpoint}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Delete failed')

      setMatrix(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(`Failed to delete ${type} matrix: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!matrix) return
    try {
      // A plain link can't carry the sign-in token, so fetch the file and save it from memory.
      const response = await apiFetch(`/teams/${teamId}/${endpoint}/download`)
      if (!response.ok) throw new Error(await responseError(response))
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = matrix.file_name || `${type}-matrix`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(`Failed to download file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="p-6 border border-gray-200 rounded-lg">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-4">{description}</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded flex gap-2 text-red-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded flex gap-2 text-green-700 text-sm">
          <Check size={16} className="flex-shrink-0 mt-0.5" />
          <span>{type} matrix updated successfully</span>
        </div>
      )}

      {!matrix && !canEdit ? (
        <p className="text-sm text-gray-600">No {type} matrix uploaded yet. A team admin can add one.</p>
      ) : !matrix ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <label className="cursor-pointer">
            <div className="flex flex-col items-center gap-2">
              <Upload size={32} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Upload {type} matrix</span>
              <span className="text-xs text-gray-500">PDF, PNG, JPG, or DOCX (max 10MB)</span>
            </div>
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.txt"
            />
          </label>
          {uploading && <p className="text-sm text-gray-500 mt-2">Uploading...</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{matrix.file_name}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {formatFileSize(matrix.file_size)} • Type: {matrix.file_type}
                </p>
                {matrix.created_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Uploaded {new Date(matrix.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={handleDownload}
                  disabled={loading}
                  className="p-2 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                  title="Download"
                >
                  <Download size={18} />
                </button>
                {canEdit && (
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="p-2 hover:bg-red-100 text-red-600 rounded transition-colors"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={18} />
                </button>
                )}
              </div>
            </div>
          </div>

          {canEdit && (
            <div>
              {/* A button inside a <label> does not open the file picker, so open it from the button. */}
              <button
                type="button"
                onClick={() => replaceInput.current?.click()}
                disabled={uploading || loading}
                className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : `Replace ${type} matrix`}
              </button>
              <input
                ref={replaceInput}
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.txt"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
