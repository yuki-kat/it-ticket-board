import { useAuth } from './contexts/AuthContext'
import App from './App'
import SignInPage from './SignInPage'

export default function AppWrapper() {
  const { user, token, loading, logout } = useAuth()

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>
  }

  // Only show app if authenticated
  if (!user || !token) {
    return <SignInPage onSignIn={() => {
      // Auth state is already updated in AuthContext, just wait for re-render
    }} />
  }

  return (
    <div>
      <button onClick={() => {
        logout()
        window.location.reload()
      }} style={{ position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 9999, padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
        Logout ({user.name})
      </button>
      <App />
    </div>
  )
}
