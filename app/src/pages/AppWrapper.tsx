import { useEffect } from 'react'
import App from './App'
import { initTheme } from '../utils/theme'

export default function AppWrapper() {
  useEffect(() => {
    initTheme()
  }, [])

  return <App />
}
