import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ContextProvider from './context/Context.jsx'
import { BrowserRouter } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx'
import { reportIssue } from './components/ErrorBoundary/reportIssue.js'

// report crashes that happen outside the React tree (uncaught JS errors and
// unhandled promise rejections) to the same issue-reporting endpoint
window.addEventListener('error', (e) => {
  reportIssue({
    source: 'front_end',
    type: 'unhandled_error',
    message: e?.message || e?.error?.message || 'Uncaught error',
    stack: e?.error?.stack,
    route: window.location.pathname,
    severity: 'high',
    platform: 'web',
  })
})

window.addEventListener('unhandledrejection', (e) => {
  reportIssue({
    source: 'front_end',
    type: 'unhandled_error',
    message: e?.reason?.message || (e?.reason ? String(e.reason) : 'Unhandled promise rejection'),
    stack: e?.reason?.stack,
    route: window.location.pathname,
    severity: 'high',
    platform: 'web',
  })
})

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ContextProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ContextProvider>
  </BrowserRouter>,
)