import { useEffect } from 'react'
import App from './App'

export default function AppWrapper() {
  useEffect(() => {
    // Dark mode is disabled; pinning light also stops the OS dark setting from applying.
    document.documentElement.setAttribute('data-theme', 'light')
  }, [])

  return <App />
}
