import React, { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './ManageAdmins.css'
import { getAuthHeaders, isAuthError } from '../../utils/api'
import { useAdminContext } from '../../context/AdminContext'

const ManageAdmins = ({ url }) => {
  const { t } = useAdminContext()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [activities, setActivities] = useState({})
  const [loadingActivity, setLoadingActivity] = useState(null)
  const [processing, setProcessing] = useState(null)
  const [currentAdminId, setCurrentAdminId] = useState(null)

  const PRIME_ADMIN_EMAIL = "prime@admin"

  const fetchAdmins = useCallback(async () => {
    setLoading(true)
    try {
      const response = await axios.get(`${url}/api/admins/all`, {
        headers: getAuthHeaders(),
      })
      if (response.data.success) {
        setAdmins(response.data.data)
        const current = response.data.data.find(a => a.email === PRIME_ADMIN_EMAIL)
        if (current) setCurrentAdminId(current._id)
      }
    } catch (error) {
      if (isAuthError(error)) {
        toast.error('Session expired. Please log in again.')
      } else {
        toast.error('Failed to load admins')
      }
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    fetchAdmins()
  }, [fetchAdmins])

  const fetchActivity = async (adminId) => {
    if (expandedId === adminId) {
      setExpandedId(null)
      return
    }
    setExpandedId(adminId)
    setLoadingActivity(adminId)

    if (!activities[adminId]) {
      try {
        const response = await axios.get(`${url}/api/admins/activity/${adminId}`, {
          headers: getAuthHeaders(),
        })
        if (response.data.success) {
          setActivities(prev => ({ ...prev, [adminId]: response.data.data }))
        }
      } catch (error) {
        toast.error('Failed to load activity')
      }
    }
    setLoadingActivity(null)
  }

  const handleRemove = async (adminId, name, email) => {
    if (email === PRIME_ADMIN_EMAIL) {
      toast.error('Cannot remove the prime admin account')
      return
    }

    if (!window.confirm(`Remove admin "${name}"? This cannot be undone.`)) return

    setProcessing(adminId)
    try {
      const response = await axios.delete(`${url}/api/admins/remove/${adminId}`, {
        headers: getAuthHeaders(),
      })
      if (response.data.success) {
        toast.success(`Admin "${name}" removed successfully`)
        setAdmins(prev => prev.filter(a => a._id !== adminId))
      } else {
        toast.error(response.data.message || 'Failed to remove admin')
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove admin')
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

  const formatTime = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getActionLabel = (action) => {
    const labels = {
      login: t('actionLogin'),
      logout: t('actionLogout'),
      approve_admin: t('actionApproveAdmin'),
      reject_admin: t('actionRejectAdmin'),
      remove_admin: t('actionRemoveAdmin'),
      create_product: t('actionCreateProduct'),
      update_product: t('actionUpdateProduct'),
      delete_product: t('actionDeleteProduct'),
      update_order: t('actionUpdateOrder'),
      create_settlement: t('actionCreateSettlement'),
      update_settings: t('actionUpdateSettings'),
      other: t('actionOther'),
    }
    return labels[action] || action
  }

  const getStatusClass = (status) => {
    switch (status) {
      case 'active': return 'status-active'
      case 'pending': return 'status-pending'
      case 'rejected': return 'status-rejected'
      default: return 'status-default'
    }
  }

  return (
    <div className='manage-admins-page'>
      <div className='manage-admins-header'>
        <h1>{t('manageAdminsTitle')}</h1>
        <p className='manage-admins-subtitle'>{t('manageAdminsSubtitle')}</p>
      </div>

      {loading ? (
        <p className='manage-admins-loading'>{t('loading')}</p>
      ) : admins.length === 0 ? (
        <div className='manage-admins-empty'>
          <p>{t('noAdminsFound')}</p>
        </div>
      ) : (
        <div className='admins-list'>
          {admins.map((admin) => (
            <div className='admin-card' key={admin._id}>
              <div className='admin-main'>
                <div className='admin-avatar'>
                  {admin.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className='admin-info'>
                  <strong className='admin-name'>
                    {admin.name}
                    {admin.email === PRIME_ADMIN_EMAIL && (
                      <span className='prime-badge'>{t('primeAdmin')}</span>
                    )}
                  </strong>
                  <span className='admin-email'>{admin.email}</span>
                  <span className='admin-phone'>{admin.phone}</span>
                </div>
                <div className='admin-meta'>
                  <span className={`status-badge ${getStatusClass(admin.status)}`}>
                    {t(admin.status)}
                  </span>
                  <span className='admin-joined'>
                    {t('joinedAt')}: {formatDate(admin.createdAt)}
                  </span>
                </div>
                <div className='admin-actions'>
                  <button
                    className='btn-expand'
                    onClick={() => fetchActivity(admin._id)}
                    disabled={loadingActivity === admin._id}
                  >
                    {expandedId === admin._id ? t('hideActivity') : t('showActivity')}
                  </button>
                  {admin.email !== PRIME_ADMIN_EMAIL && (
                    <button
                      className='btn-remove'
                      onClick={() => handleRemove(admin._id, admin.name, admin.email)}
                      disabled={processing === admin._id}
                    >
                      {processing === admin._id ? t('processing') : t('remove')}
                    </button>
                  )}
                </div>
              </div>

              {expandedId === admin._id && (
                <div className='admin-activity'>
                  <h4>{t('todaysActivity')}</h4>
                  {loadingActivity === admin._id ? (
                    <p className='activity-loading'>{t('loading')}</p>
                  ) : activities[admin._id]?.length > 0 ? (
                    <div className='activity-list'>
                      {activities[admin._id].map((activity) => (
                        <div className='activity-item' key={activity._id}>
                          <span className='activity-time'>{formatTime(activity.createdAt)}</span>
                          <span className={`activity-action action-${activity.action}`}>
                            {getActionLabel(activity.action)}
                          </span>
                          {activity.description && (
                            <span className='activity-desc'>{activity.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className='no-activity'>{t('noActivityToday')}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ManageAdmins
