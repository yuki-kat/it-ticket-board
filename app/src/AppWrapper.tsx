import App from './App'

export default function AppWrapper() {
  // Skip authentication - show app directly
  return <App />
}
