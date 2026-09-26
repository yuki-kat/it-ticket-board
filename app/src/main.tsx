import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './board-refresh.css'
import './inventory.css'
import './saved-views.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
