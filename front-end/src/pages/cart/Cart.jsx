import React, { useContext, useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { Context } from '../../context/Context'
import LocationPicker from '../../components/map/LocationPicker'
import { loadPreferredDropoff } from '../../utils/location'
import './Cart.css'

const isPlaceholderPhone = (phone) => !phone || /^g\d{9}$/.test(phone)

const Cart = () => {

  const { items, url, token, setShowAuth, cartItems, addToCart, decreaseQuantity, removeItemCompletely, getCartTotalQuantity, clearCart, showToast, t, money, num, iname } = useContext(Context)

  const cartProducts = items.filter((item) => cartItems[item._id] > 0)

  const [placing, setPlacing] = useState(false)
  const [pickingLocation, setPickingLocation] = useState(null)
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [additionalCharges, setAdditionalCharges] = useState(null)

  const [userPhone, setUserPhone] = useState(null)
  const [showPhonePopup, setShowPhonePopup] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [phoneSaving, setPhoneSaving] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setOrdersLoading(true)
    axios.get(url + '/api/orders/my', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!cancelled && res.data.success) setOrders(res.data.data || [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setOrdersLoading(false) })
    return () => { cancelled = true }
  }, [token, url])

  useEffect(() => {
    if (!token) return
    axios.get(url + '/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (res.data.success) setUserPhone(res.data.data?.phone || null)
      })
      .catch(() => {})
  }, [token, url])

  useEffect(() => {
    if (!token) setShowAuth(true)
  }, [token])

  useEffect(() => {
    axios.get(url + '/api/orders/config/additional-charges')
      .then(res => {
        if (res.data.success) setAdditionalCharges(res.data.data.additionalCharges)
      })
      .catch(() => {})
  }, [url])

  // lightweight polling while orders are actively searching
  const SEARCHING_STAGES = ['SEARCHING_0_5KM', 'SEARCHING_1KM', 'SEARCHING_CLOSEST']
  const hasSearchingOrders = orders.some(o => SEARCHING_STAGES.includes(o.priorityStage) && o.paymentStatus !== 'completed')
  const pollRef = useRef(null)

  useEffect(() => {
    if (!hasSearchingOrders) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }

    pollRef.current = setInterval(() => {
      if (!token) return
      axios.get(url + '/api/orders/my', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => { if (res.data.success) setOrders(res.data.data || []) })
        .catch(() => {})
    }, 5000)

    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [hasSearchingOrders, token, url])

  const lineTotal = (item) => cartItems[item._id] * (Number(item.maxPrice) || 0)

  const subtotal = Math.round(
    cartProducts.reduce((sum, item) => sum + lineTotal(item), 0) * 100
  ) / 100

  const placeOrder = async (dropoff) => {
    if (placing) return
    setPlacing(true)
    try {
      const payload = {
        items: cartProducts.map((item) => ({
          itemId: item._id,
          quantity: cartItems[item._id],
        })),
        dropoff,
      }

      const response = await axios.post(url + '/api/orders/place', payload, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.data.success) {
        setOrders(prev => [response.data.data, ...prev])
        clearCart()
        showToast(t('orderPlacedPendingDeliveryToast'))
      } else {
        showToast(response.data.message || t('failedPlaceOrder'))
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setShowAuth(true)
        showToast(t('pleaseLoginToast'))
      } else {
        showToast(err.response?.data?.message || t('somethingWrongToast'))
      }
    } finally {
      setPlacing(false)
      setPickingLocation(null)
    }
  }

  const openLocationPicker = () => {
    if (placing) return
    if (isPlaceholderPhone(userPhone)) {
      setPhoneInput('')
      setPhoneError('')
      setShowPhonePopup(true)
      return
    }
    setPickingLocation({ preferred: loadPreferredDropoff() })
  }

  const handlePhoneSave = async () => {
    const digits = phoneInput.replace(/\D/g, '')
    if (!/^\d{10}$/.test(digits)) {
      setPhoneError(t('phoneInvalidError'))
      return
    }
    setPhoneSaving(true)
    setPhoneError('')
    try {
      const res = await axios.patch(url + '/api/users/phone', { phone: digits }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.data.success) {
        setUserPhone(digits)
        setShowPhonePopup(false)
        setPickingLocation({ preferred: loadPreferredDropoff() })
      } else {
        setPhoneError(res.data.message || t('phoneTakenError'))
      }
    } catch (err) {
      setPhoneError(err.response?.data?.message || t('somethingWrongToast'))
    } finally {
      setPhoneSaving(false)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const pendingOrders = orders.filter(o => o.paymentStatus !== 'completed')
  const completedOrders = orders.filter(o => o.paymentStatus === 'completed')

  const getSearchStatusKey = (stage) => {
    switch (stage) {
      case 'SEARCHING_0_5KM': return 'searchStage0_5km'
      case 'SEARCHING_1KM': return 'searchStage1km'
      case 'SEARCHING_CLOSEST': return 'searchStageClosest'
      case 'ASSIGNED': return 'vendorFound'
      case 'NO_VENDOR_AVAILABLE': return 'noVendorAvailable'
      default: return 'searchStage0_5km'
    }
  }

  const renderOrderCard = (order) => (
    <div className='order-card' key={order._id}>
      <div className='order-header'>
        <span className='order-date'>{formatDate(order.createdAt)}</span>
        {!order.vendor && order.priorityStage !== 'NO_VENDOR_AVAILABLE' && (
          <span className='order-status status-pending-badge'>
            {t(getSearchStatusKey(order.priorityStage))}
          </span>
        )}
        {!order.vendor && order.priorityStage === 'NO_VENDOR_AVAILABLE' && (
          <span className='order-status status-no-vendor-badge'>
            {t('noVendorAvailable')}
          </span>
        )}
        {order.vendor && order.paymentStatus === 'completed' && (
          <span className='order-status status-completed-badge'>{t('completedBadge')}</span>
        )}
        {order.vendor && order.paymentStatus !== 'completed' && (
          <span className='order-vendor-name'>
            {order.vendor.name}
          </span>
        )}
      </div>
      {order.vendor && order.paymentStatus !== 'completed' && (
        <div className='order-detail'>
          <span className='order-label'>{t('vendorLabel')}</span>
          <span className='order-value'>
            <a href={`tel:${order.vendor.phone}`} className='vendor-phone-link'>
              {order.vendor.name} · {num(order.vendor.phone)}
            </a>
          </span>
        </div>
      )}
      <div className='order-detail'>
        <span className='order-label'>{t('orderItems')}</span>
        <span className='order-value'>{order.items?.map(i => i.nameEng).join(', ')}</span>
      </div>
      <div className='order-detail'>
        <span className='order-label'>{t('deliveryLabel')}</span>
        <span className='order-value'>
          {order.deliveryCharge != null ? money(order.deliveryCharge) : t('deliveryChargePending')}
        </span>
      </div>
      <div className='order-detail'>
        <span className='order-label'>{t('orderTotal')}</span>
        <span className='order-value order-total'>
          {order.vendor ? money(order.total) : t('totalCalculating')}
        </span>
      </div>
    </div>
  )

  if (!token) {
    return (
      <div className='cart-container'>
        <h1>{t('yourCart')}</h1>
        <div className='cart-login-prompt'>
          <p>{t('cartLoginPrompt')}</p>
          <button onClick={() => setShowAuth(true)}>{t('logIn')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className='cart-container'>
      <h1>{t('yourCart')}</h1>

      {cartProducts.length === 0 && (
        <p className='cart-empty'>{t('emptyCartMsg')}</p>
      )}

      {cartProducts.length > 0 && (
        <>
          <div className='cart-header'>
            <p>{t('colItem')}</p>
            <p>{t('colName')}</p>
            <p>{t('colQuantity')}</p>
            <p>{t('colPrice')}</p>
            <p>{t('colRemove')}</p>
          </div>

          {cartProducts.map((item) => (
            <div className='cart-item' key={item._id}>
              <img
                src={`${url}/images/` + item.image}
                alt={item.nameEng}
                className='cart-item-image'
              />

              <div className='cart-item-name-wrap'>
                <p className='cart-item-name'>{iname(item)}</p>
                <span className='cart-item-unit-price'>{money(item.maxPrice)}{t('perKgShort')}</span>
              </div>

              <div className='cart-item-quantity'>
                <button onClick={() => decreaseQuantity(item._id)}>-</button>
                <span>{num(cartItems[item._id])} {t('unitKg')}</span>
                <button onClick={() => addToCart(item._id)}>+</button>
              </div>

              <span className='cart-item-line-total'>{money(lineTotal(item))}</span>

              <button
                className='cart-item-remove'
                onClick={() => removeItemCompletely(item._id)}
              >
                X
              </button>
            </div>
          ))}

          <div className='cart-summary'>
            <div className='summary-row'>
              <span>{t('subtotalWithCount', { qty: num(getCartTotalQuantity()) })}</span>
              <b>{money(subtotal)}</b>
            </div>
            <div className='summary-row'>
              <span>{t('deliveryLabel')}</span>
              <b className='summary-pending'>{t('deliveryCalculating')}</b>
            </div>
            <div className='summary-row'>
              <span>{t('additionalChargesLabel')}</span>
              <b>{money(additionalCharges ?? 15)}</b>
            </div>
            <div className='summary-row total'>
              <span>{t('totalLabel')}</span>
              <b className='summary-pending'>{t('totalCalculating')}</b>
            </div>
          </div>

          <div className='cart-checkout'>
            <button className='checkout-button' onClick={openLocationPicker} disabled={placing}>
              {placing ? t('placingOrder') : t('placeOrderBtn', { total: t('totalCalculating') })}
            </button>
          </div>
        </>
      )}

      {ordersLoading ? (
        <div className='orders-section'>
          <p className='orders-loading'>{t('pleaseWait')}</p>
        </div>
      ) : (
        <>
          {pendingOrders.length > 0 && (
            <div className='orders-section'>
              <h2 className='orders-title pending-title'>{t('pendingOrders')}</h2>
              <div className='orders-list'>
                {pendingOrders.map(renderOrderCard)}
              </div>
            </div>
          )}

          {completedOrders.length > 0 && (
            <div className='orders-section'>
              <h2 className='orders-title'>{t('purchaseHistory')}</h2>
              <div className='orders-list'>
                {completedOrders.map(renderOrderCard)}
              </div>
            </div>
          )}
        </>
      )}

      {/* phone number popup */}
      {showPhonePopup && (
        <div className='phone-popup-overlay' onClick={() => setShowPhonePopup(false)}>
          <div className='phone-popup' onClick={(e) => e.stopPropagation()}>
            <h2>{t('phoneRequiredTitle')}</h2>
            <p>{t('phoneRequiredMsg')}</p>
            <input
              type='tel'
              placeholder={t('phoneInputPlaceholder')}
              value={phoneInput}
              onChange={(e) => { setPhoneInput(e.target.value); setPhoneError('') }}
              inputMode='numeric'
              maxLength={10}
              pattern='\d{10}'
              autoFocus
            />
            {phoneError && <p className='phone-error'>{phoneError}</p>}
            <div className='phone-popup-actions'>
              <button className='phone-save-btn' onClick={handlePhoneSave} disabled={phoneSaving}>
                {phoneSaving ? t('pleaseWait') : t('phoneSaveBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* delivery-point picker — preselects the preferred drop-off or the GPS */}
      {pickingLocation !== null && (
        <LocationPicker
          initial={pickingLocation.preferred}
          onConfirm={placeOrder}
          onClose={() => setPickingLocation(null)}
        />
      )}
    </div>
  )
}

export default Cart