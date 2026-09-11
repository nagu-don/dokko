import { Component } from 'react'
import { reportIssue } from './reportIssue'
import './ErrorBoundary.css'

const ISSUE_SOURCE = 'admin_web'

// Top-level fallback for uncaught render errors: report the crash to the
// issue-reporting pipeline, then show a recover-via-reload screen. No in-place
// recovery — a full reload is the safer default for a web SPA whose client
// state may have been corrupted.
class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    reportIssue({
      source: ISSUE_SOURCE,
      type: 'crash',
      message: error?.message || String(error),
      stack: error?.stack,
      route: window.location.pathname,
      severity: 'critical',
      platform: 'web',
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='error-boundary-fallback'>
          <div className='error-boundary-card'>
            <h1 className='error-boundary-title'>Something went wrong</h1>
            <p className='error-boundary-message'>
              An unexpected error occurred. Please reload the page to continue.
            </p>
            <button className='error-boundary-reload' onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary