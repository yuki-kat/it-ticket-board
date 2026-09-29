import { useAuth } from './contexts/AuthContext'
import App from './App'
import SignInPage from './SignInPage'

export default function AppWrapper() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>
  }

  if (!user) {
    return <SignInPage onSignIn={() => window.location.reload()} />
  }

  return (
    <div>
      <button onClick={logout} style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999, padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>
        Logout ({user.name})
      </button>
      <App teamId="team-1" userId={user.id} />
    </div>
  )
}
