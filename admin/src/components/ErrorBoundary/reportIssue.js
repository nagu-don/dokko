import axios from 'axios'
import { getAuthHeaders } from '../../utils/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

// Shared telemetry helper used by the ErrorBoundary class component, so every
// report goes through the same axios call to the issue-reporting endpoint that
// the rest of the admin app uses (auth headers from utils/api).
// A failed report must never throw — the app has already crashed once.
export const reportIssue = async (payload) => {
  try {
    await axios.post(`${API_BASE_URL}/api/issues`, payload, { headers: getAuthHeaders() })
  } catch {
    // a failed report must not surface a second error
  }
}