import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

// Shared telemetry helper used by the ErrorBoundary class component and by the
// window 'error' / 'unhandledrejection' listeners registered in main.jsx, so
// every report goes through the same axios call to the issue-reporting endpoint.
// A failed report must never throw — the app has already crashed once.
export const reportIssue = async (payload) => {
  try {
    await axios.post(`${API_BASE_URL}/api/issues`, payload)
  } catch {
    // a failed report must not surface a second error
  }
}