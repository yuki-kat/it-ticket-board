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
      // Refresh auth state after signup/login
      setTimeout(() => window.location.reload(), 1000)
    }} />
  }

  return (
    <div>
      <button onClick={() => {
        logout()
        window.location.reload()
      }} style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999, padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>
        Logout ({user.name})
      </button>
      <App />
    </div>
  )
}
