import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled Roboto for the Binboard look (works offline in the single-file build)
import './styles/fonts.css'
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
// Binboard (Material UI) theme: component details the build-time recolour can't express. Before gui-fixes so
// its layout fixes still win.
import './styles/binboard-theme.css'
// After App, so its fixes come after every component's own stylesheet.
import './styles/gui-fixes.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppWrapper />
    </AuthProvider>
  </StrictMode>,
)