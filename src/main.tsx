import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { UpdatePrompt } from './components/UpdatePrompt.tsx'
import { initInstall } from './lib/pwaInstall.ts'
import './index.css'

// Install-Event früh abfangen (für „App installieren" / iOS-Push-Hinweis).
initInstall()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
)
