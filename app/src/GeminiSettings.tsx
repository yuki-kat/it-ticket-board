import { useState, useEffect } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { getGeminiConfig } from './api/gemini'

interface GeminiSettingsProps {
  onClose: () => void
}

export default function GeminiSettings({ onClose }: GeminiSettingsProps) {
  const [status, setStatus] = useState<'loading' | 'available' | 'unavailable' | 'error'>('loading')

  useEffect(() => {
    let active = true
    void getGeminiConfig()
      .then((config) => {
        if (active) setStatus(config.configured ? 'available' : 'unavailable')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => { active = false }
  }, [])

  return (
    <div className="modal-dialog">
      <div className="modal-content" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">AI Gateway Settings</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0, marginTop: 'var(--spacing-xs)' }}>
              Vercel AI Gateway status and configuration
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
              background: status === 'available' ? 'rgba(74, 155, 111, 0.1)' : status === 'loading' ? 'var(--color-bg-subtle)' : 'rgba(201, 76, 70, 0.1)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${status === 'available' ? 'rgba(74, 155, 111, 0.3)' : status === 'loading' ? 'var(--color-border)' : 'rgba(201, 76, 70, 0.3)'}`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--spacing-md)'
            }}>
              {status === 'loading' ? (
                <div>
                  <h3 style={{ margin: 0, marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                    Checking AI Gateway…
                  </h3>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                    Checking server-side configuration.
                  </p>
                </div>
              ) : status === 'available' ? (
                <>
                  <CheckCircle size={20} style={{ color: 'var(--color-accent-green)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h3 style={{ margin: 0, marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-green)' }}>
                      AI Gateway Configured
                    </h3>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                      The server has an AI Gateway credential configured. Try an AI feature to confirm it can reach the selected model.
                    </p>
                  </div>
                </>
              ) : status === 'unavailable' ? (
                <>
                  <AlertCircle size={20} style={{ color: 'var(--color-accent-red)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h3 style={{ margin: 0, marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-red)' }}>
                      AI Gateway Not Configured
                    </h3>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                      Set the AI_GATEWAY_API_KEY environment variable on your server to enable AI features.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle size={20} style={{ color: 'var(--color-accent-red)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h3 style={{ margin: 0, marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-red)' }}>
                      AI Gateway Status Unavailable
                    </h3>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                      Could not check the server configuration. Confirm the server is reachable and try again.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Info Section */}
            <div>
              <h3 style={{ margin: 0, marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                How to configure AI Gateway
              </h3>
              <ol style={{
                margin: 0,
                paddingLeft: 'var(--spacing-lg)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                lineHeight: '1.6'
              }}>
                <li>Set up Vercel AI Gateway for your Vercel account</li>
                <li>Provide the <code>AI_GATEWAY_API_KEY</code> environment variable to the server (or use the Gateway credential from macOS Keychain locally)</li>
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
              <strong>Security:</strong> Your Gateway key stays on the server and is never exposed to the browser. AI requests are proxied through the backend.
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
