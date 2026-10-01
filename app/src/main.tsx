import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Modern design system - establishes color tokens and typography
import './design-system.css'
import './layout-redesign.css'
// Legacy styles (will be gradually replaced)
import './index.css'
import './board-refresh.css'
import './inventory.css'
import './saved-views.css'
import AppWrapper from './AppWrapper.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
// After App, so its fixes come after every component's own stylesheet.
import './gui-fixes.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppWrapper />
    </AuthProvider>
  </StrictMode>,
)