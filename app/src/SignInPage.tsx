import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import './signin-page.css'

export default function SignInPage({ onSignIn }: { onSignIn: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignUp) {
        await fetch('http://localhost:3001/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name })
        }).then(r => r.json()).then(d => {
          if (d.error) throw new Error(d.error)
        })
      } else {
        await login(email, password)
      }
      onSignIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return <main className="main-content signin-page">
    <div className="signin-card">
      <div className="signin-form-side">
        <div className="signin-header">
          <h1>OPS <b>KANBAN</b></h1>
          <h2>Every open ticket, in front of the right person.</h2>
        </div>
        <form className="signin-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <label className="form-field">
              <span>Name</span>
              <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
            </label>
          )}
          <label className="form-field">
            <span>Email address</span>
            <input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          {error && <div style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>}
          <button type="submit" className="signin-button" disabled={loading}>
            {loading ? 'Loading...' : isSignUp ? 'Sign up' : 'Sign in'}
          </button>
          <button type="button" style={{ marginTop: '0.5rem', background: 'transparent', color: '#0066cc', border: 'none', cursor: 'pointer' }} onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </form>
      </div>
      <div className="signin-stats-side">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">47</div>
            <div className="stat-label">Open tickets</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">3</div>
            <div className="stat-label">P1/P2 open</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">18</div>
            <div className="stat-label">Resolved today</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">9</div>
            <div className="stat-label">Waiting on user</div>
          </div>
        </div>
        <div className="recent-activity">
          <h3>Recent activity</h3>
          <div className="ticket-list">
            <div className="ticket-item">
              <span className="ticket-id">OPS-142</span>
              <span className="ticket-title">VPN authentication timeout</span>
              <span className="ticket-badge priority-p1">P1</span>
            </div>
            <div className="ticket-item">
              <span className="ticket-id">OPS-141</span>
              <span className="ticket-title">Printer driver rollout</span>
              <span className="ticket-badge priority-p2">P2</span>
            </div>
            <div className="ticket-item">
              <span className="ticket-id">OPS-140</span>
              <span className="ticket-title">Database backup verification</span>
              <span className="ticket-badge priority-p3">P3</span>
            </div>
          </div>
        </div>
        <div className="sla-compliance">
          <div className="sla-label">7-day SLA compliance</div>
          <div className="sla-bar">
            <div className="sla-fill" style={{ width: '87%' }} />
          </div>
          <div className="sla-text">87%</div>
        </div>
      </div>
    </div>
  </main>
}
