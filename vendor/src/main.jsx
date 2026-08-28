import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { UiProvider } from './context/UiContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <UiProvider>
        <App />
      </UiProvider>
    </BrowserRouter>
  </StrictMode>,
)
