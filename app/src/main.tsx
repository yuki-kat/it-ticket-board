import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
// Modern design system - establishes color tokens and typography
import './design-system.css'
import './layout-redesign.css'
import './tickets-redesign.css'
import './inventory-redesign.css'
import './home-redesign.css'
import './explore-redesign.css'
import './forms-redesign.css'
// Legacy styles (will be gradually replaced)
import './index.css'
import './board-refresh.css'
import './inventory.css'
import './saved-views.css'
import AppWrapper from './AppWrapper.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
// After App, so its fixes come after every component's own stylesheet.
import './gui-fixes.css'

declare global { interface Window { __boot?: { stage: (text: string) => void; done: () => void } } }

// Runs after the first render has been committed, so the loading screen only leaves once the board is on screen.
function BootDone() {
  useEffect(() => { requestAnimationFrame(() => window.__boot?.done()) }, [])
  return null
}

window.__boot?.stage('Preparing workspace…')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppWrapper />
      <BootDone />
    </AuthProvider>
  </StrictMode>,
)