import React, { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './AdminRequests.css'
import { getAuthHeaders, isAuthError } from '../../utils/api'
import { useAdminContext } from '../../context/AdminContext'

const AdminRequests = ({ url }) => {
  const { t } = useAdminContext()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${url}/api/admins/pending`, {
        headers: getAuthHeaders(),
      })
      if (response.data.success) {
        setRequests(response.data.data)
      }
    } catch (error) {
      if (isAuthError(error)) {
        toast.error('Session expired. Please log in again.')
      } else {
        toast.error('Failed to load admin requests')
      }
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const handleApprove = async (adminId, name) => {
    if (!window.confirm(`Approve admin account for "${name}"?`)) return

    setProcessing(adminId)
    try {
      const response = await axios.patch(
        `${url}/api/admins/approve/${adminId}`,
        {},
        { headers: getAuthHeaders() }
      )
      if (response.data.success) {
        toast.success(`Admin "${name}" approved successfully`)
        setRequests((prev) => prev.filter((r) => r._id !== adminId))
      } else {
        toast.error(response.data.message || 'Failed to approve')
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to approve admin')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (adminId, name) => {
    if (!window.confirm(`Reject admin account for "${name}"? This cannot be undone.`)) return

    setProcessing(adminId)
    try {
      const response = await axios.patch(
        `${url}/api/admins/reject/${adminId}`,
        {},
        { headers: getAuthHeaders() }
      )
      if (response.data.success) {
        toast.success(`Admin "${name}" rejected`)
        setRequests((prev) => prev.filter((r) => r._id !== adminId))
      } else {
        toast.error(response.data.message || 'Failed to reject')
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reject admin')
    } finally {
      setProcessing(null)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return 'N/A'
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className='admin-requests-page'>
      <div className='admin-requests-header'>
        <h1>{t('adminRequestsTitle')}</h1>
        <p className='admin-requests-subtitle'>{t('adminRequestsSubtitle')}</p>
      </div>

      {loading ? (
        <p className='admin-requests-loading'>{t('loading')}</p>
      ) : requests.length === 0 ? (
        <div className='admin-requests-empty'>
          <span className='empty-icon'>✓</span>
          <p>{t('noPendingRequests')}</p>
        </div>
      ) : (
        <div className='admin-requests-list'>
          <div className='requests-count'>
            {t('pendingCount', { count: requests.length })}
          </div>
          {requests.map((request) => (
            <div className='request-card' key={request._id}>
              <div className='request-main'>
                <div className='request-avatar'>
                  {request.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className='request-info'>
                  <strong className='request-name'>{request.name}</strong>
                  <span className='request-email'>{request.email}</span>
                  <span className='request-phone'>{request.phone}</span>
                </div>
                <div className='request-meta'>
                  <span className='request-date'>
                    {t('requestedAt')}: {formatDate(request.createdAt)}
                  </span>
                  <span className={`status-badge status-${request.status}`}>
                    {t(request.status)}
                  </span>
                </div>
              </div>
              <div className='request-actions'>
                <button
                  className='btn-approve'
                  onClick={() => handleApprove(request._id, request.name)}
                  disabled={processing === request._id}
                >
                  {processing === request._id ? t('processing') : t('approve')}
                </button>
                <button
                  className='btn-reject'
                  onClick={() => handleReject(request._id, request.name)}
                  disabled={processing === request._id}
                >
                  {processing === request._id ? t('processing') : t('reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminRequests
