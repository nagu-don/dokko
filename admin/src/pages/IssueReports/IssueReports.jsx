import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './IssueReports.css'
import { getAuthHeaders, isAuthError } from '../../utils/api'
import Pagination from '../../components/Pagination/Pagination'
import { useAdminContext } from '../../context/AdminContext'

const SOURCE_LIST = ['mobile_customer', 'mobile_vendor', 'front_end', 'vendor_web', 'admin_web', 'backend']
const TYPE_LIST = ['crash', 'unhandled_error', 'user_report', 'system_error']
const SEVERITY_LIST = ['low', 'medium', 'high', 'critical']
const STATUS_LIST = ['open', 'acknowledged', 'resolved', 'ignored']
const TARGET_STATUSES = ['acknowledged', 'resolved', 'ignored']

const MSG_LIMIT = 160

// maps each enum value emitted by the issue-reporting pipeline to its
// translation key (see admin/src/i18n/translations.js)
const LABEL_KEY = {
  mobile_customer: 'sourceMobileCustomer',
  mobile_vendor: 'sourceMobileVendor',
  front_end: 'sourceFrontEnd',
  vendor_web: 'sourceVendorWeb',
  admin_web: 'sourceAdminWeb',
  backend: 'sourceBackend',
  crash: 'typeCrash',
  unhandled_error: 'typeUnhandledError',
  user_report: 'typeUserReport',
  system_error: 'typeSystemError',
  low: 'severityLow',
  medium: 'severityMedium',
  high: 'severityHigh',
  critical: 'severityCritical',
  open: 'issueStatusOpen',
  acknowledged: 'issueStatusAcknowledged',
  resolved: 'issueStatusResolved',
  ignored: 'issueStatusIgnored',
}

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—'

const IssueReports = ({ url }) => {
  const { t } = useAdminContext()

  const [issues, setIssues] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [filters, setFilters] = useState({ status: 'all', source: 'all', type: 'all', severity: 'all' })

  // long messages are truncated in the table; this tracks which ones are expanded
  const [expanded, setExpanded] = useState({})

  // modal shown when resolving/ignoring a report (optional admin note)
  const [statusTarget, setStatusTarget] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const setFilter = (key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }))
    setPage(1)
  }

  const fetchSummary = useCallback(async () => {
    try {
      const response = await axios.get(`${url}/api/issues/summary`, {
        headers: getAuthHeaders(),
      })
      if (response.data.success) setSummary(response.data.data)
    } catch (error) {
      if (!isAuthError(error)) toast.error(t('failedToLoadIssueSummary'))
    }
  }, [url, t])

  const fetchIssues = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 20 }
      if (filters.status !== 'all') params.status = filters.status
      if (filters.source !== 'all') params.source = filters.source
      if (filters.type !== 'all') params.type = filters.type
      if (filters.severity !== 'all') params.severity = filters.severity

      const response = await axios.get(`${url}/api/issues`, {
        headers: getAuthHeaders(),
        params,
      })
      if (response.data.success) {
        setIssues(response.data.data)
        setTotalPages(response.data.pagination.pages)
      }
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired. Please log in again.')
      else toast.error(t('failedToLoadIssues'))
    } finally {
      setLoading(false)
    }
  }, [url, page, filters, t])

  useEffect(() => {
    fetchIssues()
  }, [fetchIssues])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const updateStatus = async (id, status, adminNote) => {
    setSubmitting(true)
    try {
      const response = await axios.patch(
        `${url}/api/issues/${id}/status`,
        { status, adminNote: String(adminNote || '').trim() || undefined },
        { headers: getAuthHeaders() }
      )
      if (response.data.success) {
        toast.success(t('issueStatusUpdated'))
        setIssues((prev) => prev.map((r) => (r._id === id ? response.data.data : r)))
        setStatusTarget(null)
        fetchSummary()
      }
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired. Please log in again.')
      else toast.error(t('failedToUpdateIssueStatus'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusSelect = (report, status) => {
    if (!status || status === report.status) return
    if (status === 'acknowledged') {
      updateStatus(report._id, status)
    } else {
      setNote(report.adminNote || '')
      setStatusTarget({ id: report._id, status })
    }
  }

  const confirmStatusChange = () => {
    if (!statusTarget) return
    updateStatus(statusTarget.id, statusTarget.status, note)
  }

  const toggleExpanded = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  const byStatus = summary?.byStatus || {}

  const reporterOf = (r) => {
    const name = r.userId?.name || r.vendorId?.name
    const email = r.userId?.email || r.vendorId?.email || r.contactEmail
    if (name || email) return { name, email }
    return null
  }

  return (
    <div className='issue-reports-page'>
      <div className='issue-reports-header'>
        <h1>{t('issueReportsTitle')}</h1>
        <p className='issue-reports-subtitle'>{t('issueReportsSubtitle')}</p>
      </div>

      {summary && (
        <div className='cash-summary-cards'>
          {STATUS_LIST.map((s) => (
            <div key={s} className={`cash-summary-card issue-card-${s}`}>
              <span className='summary-label'>{t(LABEL_KEY[s])}</span>
              <span className='summary-value'>{byStatus[s] || 0}</span>
            </div>
          ))}
        </div>
      )}

      <div className='issue-filters'>
        <label className='issue-filter-item'>
          <span>{t('filterStatus')}</span>
          <select className='issue-filter-select' value={filters.status} onChange={setFilter('status')}>
            <option value='all'>{t('all')}</option>
            {STATUS_LIST.map((s) => (
              <option key={s} value={s}>{t(LABEL_KEY[s])}</option>
            ))}
          </select>
        </label>
        <label className='issue-filter-item'>
          <span>{t('filterSource')}</span>
          <select className='issue-filter-select' value={filters.source} onChange={setFilter('source')}>
            <option value='all'>{t('all')}</option>
            {SOURCE_LIST.map((s) => (
              <option key={s} value={s}>{t(LABEL_KEY[s])}</option>
            ))}
          </select>
        </label>
        <label className='issue-filter-item'>
          <span>{t('filterType')}</span>
          <select className='issue-filter-select' value={filters.type} onChange={setFilter('type')}>
            <option value='all'>{t('all')}</option>
            {TYPE_LIST.map((s) => (
              <option key={s} value={s}>{t(LABEL_KEY[s])}</option>
            ))}
          </select>
        </label>
        <label className='issue-filter-item'>
          <span>{t('filterSeverity')}</span>
          <select className='issue-filter-select' value={filters.severity} onChange={setFilter('severity')}>
            <option value='all'>{t('all')}</option>
            {SEVERITY_LIST.map((s) => (
              <option key={s} value={s}>{t(LABEL_KEY[s])}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className='issue-reports-loading'>{t('loading')}</p>
      ) : issues.length === 0 ? (
        <p className='issue-reports-empty'>{t('noIssueReports')}</p>
      ) : (
        <>
          <div className='issue-reports-table-wrap'>
            <table className='issue-reports-table'>
              <thead>
                <tr>
                  <th>{t('colDate')}</th>
                  <th>{t('issueColSource')}</th>
                  <th>{t('issueColType')}</th>
                  <th>{t('issueColSeverity')}</th>
                  <th>{t('issueColMessage')}</th>
                  <th>{t('issueColReporter')}</th>
                  <th>{t('colStatus')}</th>
                  <th>{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((r) => {
                  const isLong = (r.message || '').length > MSG_LIMIT
                  const isExpanded = !!expanded[r._id]
                  const shown = isLong && !isExpanded ? `${r.message.slice(0, MSG_LIMIT)}…` : r.message || '—'
                  const reporter = reporterOf(r)

                  return (
                    <tr key={r._id}>
                      <td className='issue-date'>{fmtDate(r.createdAt)}</td>
                      <td>{t(LABEL_KEY[r.source] || r.source)}</td>
                      <td>{t(LABEL_KEY[r.type] || r.type)}</td>
                      <td>
                        <span className={`severity-badge severity-${r.severity}`}>
                          {t(LABEL_KEY[r.severity] || r.severity)}
                        </span>
                      </td>
                      <td className='issue-message'>
                        {shown}
                        {isLong && (
                          <button className='issue-expand-btn' onClick={() => toggleExpanded(r._id)}>
                            {isExpanded ? t('viewLess') : t('viewMore')}
                          </button>
                        )}
                      </td>
                      <td className='issue-reporter'>
                        {reporter ? (
                          <>
                            {reporter.name && <span className='reporter-name'>{reporter.name}</span>}
                            {reporter.email && <span className='reporter-email'>{reporter.email}</span>}
                          </>
                        ) : (
                          t('anonymous')
                        )}
                      </td>
                      <td>
                        <span className={`issue-status-badge status-${r.status}`}>
                          {t(LABEL_KEY[r.status] || r.status)}
                        </span>
                      </td>
                      <td>
                        <select
                          className='issue-status-select'
                          value=''
                          onChange={(e) => handleStatusSelect(r, e.target.value)}
                          disabled={submitting}
                        >
                          <option value='' disabled>{t('changeStatus')}</option>
                          {TARGET_STATUSES.filter((s) => s !== r.status).map((s) => (
                            <option key={s} value={s}>{t(LABEL_KEY[s])}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}

      {statusTarget && (
        <div className='issue-modal-overlay' onClick={() => { if (!submitting) setStatusTarget(null) }}>
          <div className='issue-modal' onClick={(e) => e.stopPropagation()}>
            <div className='issue-modal-header'>
              <h2>{t('issueStatusChangeTitle')}</h2>
              <button className='issue-modal-close' onClick={() => setStatusTarget(null)} disabled={submitting}>
                ×
              </button>
            </div>
            <div className='issue-modal-body'>
              <p className='issue-modal-status'>
                {t('issueChangeStatusTo')}{' '}
                <span className={`issue-status-badge status-${statusTarget.status}`}>
                  {t(LABEL_KEY[statusTarget.status])}
                </span>
              </p>
              <label className='issue-note-label'>
                {t('issueStatusNoteLabel')}
                <textarea
                  className='issue-note-textarea'
                  placeholder={t('issueStatusNotePlaceholder')}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </label>
            </div>
            <div className='issue-modal-actions'>
              <button className='issue-modal-cancel' onClick={() => setStatusTarget(null)} disabled={submitting}>
                {t('issueStatusCancel')}
              </button>
              <button className='issue-modal-confirm' onClick={confirmStatusChange} disabled={submitting}>
                {submitting ? t('loading') : t('issueStatusConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default IssueReports