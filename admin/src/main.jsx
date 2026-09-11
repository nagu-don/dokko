import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename="/admin">
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </BrowserRouter>,
)