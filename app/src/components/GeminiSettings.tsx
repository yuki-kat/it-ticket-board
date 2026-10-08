import { useState, useEffect } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { getGeminiConfig } from '../api/gemini'

interface GeminiSettingsProps {
  onClose: () => void
}

export default function GeminiSettings({ onClose }: GeminiSettingsProps) {
  const [isConfigured, setIsConfigured] = useState(false)

  useEffect(() => {
    const config = getGeminiConfig()
    setIsConfigured(config.configured)
  }, [])

  return (
    <div className="modal-dialog">
      <div className="modal-content" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Gemini AI Settings</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0, marginTop: 'var(--spacing-xs)' }}>
              Google Gemini API status and configuration
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
            {/* Status Section */}
            <div style={{
              padding: 'var(--spacing-md)',
              background: isConfigured ? 'rgba(74, 155, 111, 0.1)' : 'rgba(201, 76, 70, 0.1)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${isConfigured ? 'rgba(74, 155, 111, 0.3)' : 'rgba(201, 76, 70, 0.3)'}`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--spacing-md)'
            }}>
              {isConfigured ? (
                <>
                  <CheckCircle size={20} style={{ color: 'var(--color-accent-green)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h3 style={{ margin: 0, marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-green)' }}>
                      Gemini API Configured
                    </h3>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                      Your server has been configured with a Gemini API key. AI features are active and ready to use.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle size={20} style={{ color: 'var(--color-accent-red)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h3 style={{ margin: 0, marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-red)' }}>
                      Gemini API Not Configured
                    </h3>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                      Set the GEMINI_API_KEY environment variable on your server to enable AI features.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Info Section */}
            <div>
              <h3 style={{ margin: 0, marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                How to configure Gemini API
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
                <li>Set the <code>GEMINI_API_KEY</code> environment variable on your server</li>
                <li>Restart the server for changes to take effect</li>
              </ol>
            </div>

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

            {/* Security Note */}
            <div style={{
              padding: 'var(--spacing-md)',
              background: 'var(--color-bg-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              lineHeight: '1.6'
            }}>
              <strong>Security:</strong> Your API key is stored securely on the server and never exposed to the client. All Gemini requests are proxied through the backend.
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="form-button primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
