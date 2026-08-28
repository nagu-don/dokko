import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import Modal from '../../components/modal/Modal'
import { useUi } from '../../context/UiContext'
import { getAuthHeaders, isAuthError } from '../../utils/api'

const NEPAL_TIMEZONE = 'Asia/Kathmandu'
const REFRESH_HOUR = 6 // 6:00 AM Nepal Time

const Completed = ({ url, onLogout }) => {
  const { t, tMsg, money, num, iname } = useUi()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  // Get current time in Nepal
  const getNepalTime = () => {
    return new Date(new Date().toLocaleString('en-US', { timeZone: NEPAL_TIMEZONE }))
  }

  // Check if we need to refresh (6 AM Nepal Time)
  const shouldRefresh = () => {
    const now = getNepalTime()
    const currentHour = now.getHours()

    if (!lastRefresh) return true

    const last = new Date(lastRefresh)
    const lastDate = last.toDateString()
    const todayDate = now.toDateString()

    // Refresh if it's a new day and past 6 AM
    if (lastDate !== todayDate && currentHour >= REFRESH_HOUR) return true

    // Refresh if we haven't refreshed today and it's past 6 AM
    if (lastDate === todayDate && currentHour >= REFRESH_HOUR && last.getHours() < REFRESH_HOUR) return true

    return false
  }

  const fetchCompletedOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(`${url}/api/vendors/requests/completed`, {
        headers: getAuthHeaders(),
      })
      setOrders(data.data || [])
      setLastRefresh(new Date().toISOString())
    } catch (error) {
      if (isAuthError(error)) onLogout()
      else flash('error', t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [url, onLogout, t])

  // Initial load
  useEffect(() => {
    fetchCompletedOrders()
  }, [fetchCompletedOrders])

  // Check for refresh on component mount and every minute
  useEffect(() => {
    const checkRefresh = () => {
      if (shouldRefresh()) {
        fetchCompletedOrders()
      }
    }

    const interval = setInterval(checkRefresh, 60000) // Check every minute
    return () => clearInterval(interval)
  }, [fetchCompletedOrders, lastRefresh])

  const flash = (type, text) => {
    setNotice({ type, text })
    setTimeout(() => setNotice(null), 4000)
  }

  const handleRevokeCash = async (orderId) => {
    if (!window.confirm(t('confirmRevokeCash'))) return

    try {
      await axios.post(
        `${url}/api/vendors/payments/revoke-cash/${orderId}`,
        {},
        { headers: getAuthHeaders() }
      )

      flash('ok', t('cashPaymentRevoked'))
      fetchCompletedOrders()
      setModal(null)
    } catch (error) {
      const msg = error.response?.data?.message
      if (msg) {
        flash('error', tMsg(msg))
      } else {
        flash('error', t('paymentCancelFailed'))
      }
    }
  }

  const openOrderModal = (order) => {
    setModal({ type: 'order', order })
  }

  const formatDate = (iso) => {
    if (!iso) return 'N/A'
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const getPaymentMethodBadge = (method) => {
    if (method === 'cash') {
      return <span className='payment-badge payment-cash'>{t('payWithCash')}</span>
    }
    return <span className='payment-badge payment-qr'>{t('payWithQr')}</span>
  }

  return (
    <>
      {notice && <div className={`vendor-notice ${notice.type}`}>{notice.text}</div>}

      <section className='vendor-section theme-completed'>
        <div className='section-header'>
          <h3>{t('completedTitle')} <span>({num(orders.length)})</span></h3>
          <span className='refresh-note'>{t('completedRefreshNote')}</span>
        </div>

        {loading ? (
          <p className='empty-line'>{t('loading')}</p>
        ) : orders.length === 0 ? (
          <p className='empty-line'>{t('noCompletedOrders')}</p>
        ) : (
          orders.map((order) => (
            <article
              className='request-card'
              key={order.id}
              onClick={() => openOrderModal(order)}
            >
              <div className='card-main'>
                <div className='card-title-row'>
                  <span className='card-code'>#{order.code}</span>
                  {getPaymentMethodBadge(order.paymentMethod)}
                </div>
                <div className='card-customer'>
                  <span className='card-customer-name'>{order.customer?.name}</span>
                  <span className='card-customer-phone'>{order.customer?.phone}</span>
                </div>
                <div className='card-summary'>
                  <span>{money(order.total)}</span>
                  <span className='card-date'>{formatDate(order.completedAt || order.updatedAt)}</span>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {/* order detail modal */}
      {modal?.type === 'order' && (
        <Modal title={`Order #${modal.order.code}`} onClose={() => setModal(null)}>
          <div className='order-detail'>
            <div className='order-detail-section'>
              <h4>{t('customer')}</h4>
              <p>{modal.order.customer?.name}</p>
              <p>{modal.order.customer?.phone}</p>
            </div>

            <div className='order-detail-section'>
              <h4>{t('payment')}</h4>
              <p>{t('paymentMethod')}: {getPaymentMethodBadge(modal.order.paymentMethod)}</p>
              <p>{t('amount')}: {money(modal.order.total)}</p>
              <p>{t('paymentStatus')}: {modal.order.paymentStatus}</p>
            </div>

            {modal.order.paymentMethod === 'cash' && (
              <div className='order-detail-actions'>
                <button
                  className='revoke-btn'
                  onClick={() => handleRevokeCash(modal.order.id)}
                >
                  {t('revoke')} {t('payWithCash')}
                </button>
                <p className='revoke-note'>{t('confirmRevokeCash')}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

export default Completed
