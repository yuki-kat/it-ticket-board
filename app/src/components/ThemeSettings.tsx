import { useState, useEffect } from 'react'
import { X, Moon, Sun, Monitor } from 'lucide-react'
import { getTheme, setTheme, type Theme } from '../utils/theme'

interface ThemeSettingsProps {
  onClose: () => void
}

export default function ThemeSettings({ onClose }: ThemeSettingsProps) {
  const [theme, setCurrentTheme] = useState<Theme>('system')

  useEffect(() => {
    setCurrentTheme(getTheme())
  }, [])

  const handleThemeChange = (newTheme: Theme) => {
    setCurrentTheme(newTheme)
    setTheme(newTheme)
  }

  return (
    <div className="modal-dialog">
      <div className="modal-content" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Appearance</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: 0, marginTop: 'var(--spacing-xs)' }}>
              Choose how the app looks
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            {/* Light Mode */}
            <button
              onClick={() => handleThemeChange('light')}
              style={{
                padding: 'var(--spacing-md)',
                border: `2px solid ${theme === 'light' ? 'var(--color-primary)' : 'var(--color-neutral-border)'}`,
                borderRadius: 'var(--radius-md)',
                background: theme === 'light' ? 'var(--color-primary-bg)' : 'var(--color-neutral-white)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)'
              }}
            >
              <Sun size={20} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                  Light
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Always use light mode
                </div>
              </div>
            </button>

            {/* Dark Mode */}
            <button
              onClick={() => handleThemeChange('dark')}
              style={{
                padding: 'var(--spacing-md)',
                border: `2px solid ${theme === 'dark' ? 'var(--color-primary)' : 'var(--color-neutral-border)'}`,
                borderRadius: 'var(--radius-md)',
                background: theme === 'dark' ? 'var(--color-primary-bg)' : 'var(--color-neutral-white)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)'
              }}
            >
              <Moon size={20} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                  Dark
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Always use dark mode
                </div>
              </div>
            </button>

            {/* System */}
            <button
              onClick={() => handleThemeChange('system')}
              style={{
                padding: 'var(--spacing-md)',
                border: `2px solid ${theme === 'system' ? 'var(--color-primary)' : 'var(--color-neutral-border)'}`,
                borderRadius: 'var(--radius-md)',
                background: theme === 'system' ? 'var(--color-primary-bg)' : 'var(--color-neutral-white)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)'
              }}
            >
              <Monitor size={20} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                  System
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Match your system settings
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="form-button primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
