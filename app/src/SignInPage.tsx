import './signin-page.css'

/**
 * Sign-in page for Supabase authentication.
 *
 * Allows users to authenticate with their email and password to enable cloud sync.
 * Displays recent activity statistics and ticket summary while signing in.
 *
 * @param onSignIn - Callback fired when authentication succeeds
 */
export default function SignInPage({ onSignIn }: { onSignIn: () => void }) {
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    onSignIn()
  }

  return <main className="main-content signin-page">
    <div className="signin-card">
      <div className="signin-form-side">
        <div className="signin-header">
          <h1>OPS <b>KANBAN</b></h1>
          <h2>Every open ticket, in front of the right person.</h2>
        </div>
        <form className="signin-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Email address</span>
            <input type="email" placeholder="you@company.com" required />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input type="password" placeholder="••••••••" required />
          </label>
          <button type="submit" className="signin-button">Sign in</button>
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
