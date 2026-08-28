import { useContext, useEffect, useState } from 'react'
import axios from 'axios'
import { Context } from '../../context/Context'
import './PurchaseHistory.css'

const PurchaseHistory = () => {
  const { url, token, t, money } = useContext(Context)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    axios.get(url + '/api/orders/my', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!cancelled && res.data.success) setOrders(res.data.data || [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token, url])

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (loading) {
    return <div className='purchase-history'><p className='ph-loading'>{t('pleaseWait')}</p></div>
  }

  if (orders.length === 0) {
    return <div className='purchase-history'><p className='ph-empty'>{t('noOrdersYet')}</p></div>
  }

  return (
    <div className='purchase-history'>
      <h2>{t('purchaseHistory')}</h2>
      <div className='ph-list'>
        {orders.map(order => (
          <div className='ph-card' key={order._id}>
            <div className='ph-row ph-header'>
              <span className='ph-date'>{formatDate(order.createdAt)}</span>
              <span className={`ph-status status-${order.status?.toLowerCase()}`}>{order.status}</span>
            </div>
            <div className='ph-row'>
              <span className='ph-label'>{t('orderItems')}</span>
              <span className='ph-value'>{order.items?.map(i => i.nameEng).join(', ')}</span>
            </div>
            <div className='ph-row'>
              <span className='ph-label'>{t('orderTotal')}</span>
              <span className='ph-value ph-total'>{money(order.total)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PurchaseHistory
