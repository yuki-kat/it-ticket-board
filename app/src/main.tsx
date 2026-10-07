import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Modern design system - establishes color tokens and typography
import './styles/design-system.css'
import './styles/layout-redesign.css'
import './styles/tickets-redesign.css'
import './styles/inventory-redesign.css'
import './styles/home-redesign.css'
import './styles/explore-redesign.css'
import './styles/forms-redesign.css'
// Legacy styles (will be gradually replaced)
import './styles/index.css'
import './styles/board-refresh.css'
import './styles/inventory.css'
import './styles/saved-views.css'
import AppWrapper from './pages/AppWrapper.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
// After App, so its fixes come after every component's own stylesheet.
import './styles/gui-fixes.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppWrapper />
    </AuthProvider>
  </StrictMode>,
)