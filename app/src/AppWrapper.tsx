import { useAuth } from './contexts/AuthContext'
import App from './App'
import SignInPage from './SignInPage'

export default function AppWrapper() {
  const { user, token, loading } = useAuth()

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>
  }

  // Only show app if authenticated
  if (!user || !token) {
    return <SignInPage onSignIn={() => {
      // Auth state is already updated in AuthContext, just wait for re-render
    }} />
  }

  return <App />
}
