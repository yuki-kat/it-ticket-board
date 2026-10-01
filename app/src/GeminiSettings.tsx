import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { getGeminiConfig, setGeminiConfig } from './api/gemini'

interface GeminiSettingsProps {
  onClose: () => void
}

export default function GeminiSettings({ onClose }: GeminiSettingsProps) {
  const [apiKey, setApiKey] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const config = getGeminiConfig()
    if (config.apiKey) {
      setApiKey(config.apiKey.substring(0, 20) + '...')
      setIsConfigured(true)
    }
  }, [])

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setMessage('API key cannot be empty')
      return
    }

    setIsSaving(true)
    try {
      setGeminiConfig({ apiKey: apiKey.trim() })
      setMessage('Gemini API key saved successfully!')
      setIsConfigured(true)

      // Clear message after 3 seconds
      setTimeout(() => {
        setMessage('')
        onClose()
      }, 3000)
    } catch (error) {
      setMessage(`Error saving API key: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    localStorage.removeItem('gemini_api_key')
    setApiKey('')
    setIsConfigured(false)
    setMessage('Gemini API key removed')
  }

  return (
    <div className="modal-dialog">
      <div className="modal-content" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Gemini AI Settings</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0, marginTop: 'var(--spacing-xs)' }}>
              Configure Google Gemini API for AI-powered features
            </p>
          </div>
          <button
            className="panel-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
            {/* Info Section */}
            <div style={{
              padding: 'var(--spacing-md)',
              background: 'var(--color-primary-bg)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(26, 127, 126, 0.2)'
            }}>
              <h3 style={{ margin: 0, marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary)' }}>
                How to get your API key
              </h3>
              <ol style={{
                margin: 0,
                paddingLeft: 'var(--spacing-lg)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                lineHeight: '1.6'
              }}>
                <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Google AI Studio</a></li>
                <li>Click "Create API Key"</li>
                <li>Copy the API key and paste it below</li>
              </ol>
            </div>

            {/* API Key Input */}
            <div className="form-field">
              <label>Gemini API Key</label>
              <input
                type="password"
                placeholder={isConfigured ? 'API key is configured' : 'Paste your Gemini API key here'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isSaving}
              />
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', margin: 0, marginTop: 'var(--spacing-xs)' }}>
                Your API key is stored locally in your browser and never sent to our servers.
              </p>
            </div>

            {/* Status Message */}
            {message && (
              <div style={{
                padding: 'var(--spacing-md)',
                borderRadius: 'var(--radius-md)',
                background: message.includes('Error') ? 'rgba(201, 76, 70, 0.1)' : 'rgba(74, 155, 111, 0.1)',
                color: message.includes('Error') ? 'var(--color-accent-red)' : 'var(--color-accent-green)',
                fontSize: 'var(--font-size-sm)',
                border: `1px solid ${message.includes('Error') ? 'rgba(201, 76, 70, 0.3)' : 'rgba(74, 155, 111, 0.3)'}`
              }}>
                {message}
              </div>
            )}

            {/* Features Info */}
            <div>
              <h3 style={{ margin: 0, marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                AI-Powered Features
              </h3>
              <ul style={{
                margin: 0,
                paddingLeft: 'var(--spacing-lg)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                lineHeight: '1.8'
              }}>
                <li>Ticket analysis and suggestions</li>
                <li>AI chat responses for tickets</li>
                <li>Asset health analysis</li>
                <li>Queue insights and metrics</li>
                <li>SLA recommendations</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {isConfigured && (
            <button
              className="form-button danger"
              onClick={handleReset}
              disabled={isSaving}
            >
              Remove Key
            </button>
          )}
          <button
            className="form-button secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className="form-button primary"
            onClick={handleSave}
            disabled={isSaving || !apiKey.trim()}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
