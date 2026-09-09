import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import Modal from '../../components/modal/Modal';
import RouteMap from '../../components/map/RouteMap';
import { useUi } from '../../context/UiContext';
import { getAuthHeaders, isAuthError } from '../../utils/api';

const POLL_INTERVAL = 3000;

const Accepted = ({ url, onLogout }) => {
  const { t, tMsg, money, num, iname, iunit } = useUi();
  const token = localStorage.getItem('vendorToken');

  const [orders, setOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null); // { type: 'map' | 'payment', order }
  const [payment, setPayment] = useState(null); // payment initiation state
  const [paymentError, setPaymentError] = useState(null);
  const pollRef = useRef(null);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = async () => {
    try {
      const { data } = await axios.get(`${url}/api/vendors/requests/accepted`, {
        headers: getAuthHeaders(),
      });
      setOrders(data.data);
    } catch (error) {
      if (isAuthError(error)) onLogout();
      else flash('error', t('loadFailedAcc'));
    }
  };

  const loadCompleted = async () => {
    try {
      const { data } = await axios.get(`${url}/api/vendors/requests/completed`, {
        headers: getAuthHeaders(),
      });
      setCompletedOrders(data.data || []);
    } catch (error) {
      if (isAuthError(error)) onLogout();
    }
  };

  const handleRevokeCash = async (orderId) => {
    if (!window.confirm(t('confirmRevokeCash'))) return;

    try {
      await axios.post(
        `${url}/api/vendors/payments/revoke-cash/${orderId}`,
        {},
        { headers: getAuthHeaders() }
      );

      flash('ok', t('cashPaymentRevoked'));
      loadCompleted();
    } catch (error) {
      const msg = error.response?.data?.message;
      if (msg) {
        flash('error', tMsg(msg));
      } else {
        flash('error', t('paymentCancelFailed'));
      }
    }
  };

  useEffect(() => {
    load();
    loadCompleted();
  }, []);

  // stop polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // clean up on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // start polling for payment status once payment data is available
  useEffect(() => {
    if (!payment?.data?.paymentId || payment.statusFinal) {
      stopPolling();
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const resp = await axios.get(
          `${url}/api/vendors/payments/status/${payment.data.paymentId}`,
          { headers: getAuthHeaders() }
        );

        const status = resp.data.data?.status;

        if (status === 'payment_verified') {
          stopPolling();
          setPayment((prev) => prev ? { ...prev, statusFinal: 'verified' } : prev);
          flash('ok', t('paymentSuccess'));
          load();
          if (modal?.order?.id) completeOrder(modal.order.id);
        } else if (['payment_failed', 'payment_expired', 'amount_mismatch', 'cancelled'].includes(status)) {
          stopPolling();
          setPayment((prev) => prev ? { ...prev, statusFinal: 'failed' } : prev);
          setPaymentError(t('paymentFailed'));
        }
        // else keep polling (awaiting_payment, qr_generated, etc.)
      } catch (err) {
        if (err?.response?.status === 404) {
          stopPolling();
          setPayment((prev) => prev ? { ...prev, statusFinal: 'failed' } : prev);
          setPaymentError(t('paymentExpired'));
        }
        // other errors — keep polling
      }
    }, POLL_INTERVAL);

    return stopPolling;
  }, [payment?.data?.paymentId, payment?.statusFinal, url, stopPolling, t, flash, load, completeOrder, modal?.order?.id]);

  // compute the breakdown the backend will also compute
  const orderAmount = (order) => {
    const goods = Number(order.subtotal || 0);
    const delivery = Number(order.deliveryCharge || 0);
    const charges = Number(order.additionalCharges || 0);
    return Math.round((goods + delivery + charges) * 100) / 100;
  };

  const openPaymentModal = (order) => {
    setPayment(null);
    setPaymentError(null);
    setModal({ type: 'payment', order });
    // Automatically initiate QR payment when modal opens
    initiatePayment(undefined, order);
  };

  const downloadQrCode = (qrData, reference) => {
    const link = document.createElement('a');
    link.href = qrData;
    link.download = `QR-${reference}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const initiatePayment = async (provider, order) => {
    const orderToUse = order || modal.order;
    setPaymentError(null);
    setPayment({ loading: true, provider });

    try {
      const { data } = await axios.post(
        `${url}/api/vendors/payments/initiate/${orderToUse.id}`,
        { provider },
        { headers: getAuthHeaders() }
      );

      setPayment({ loading: false, provider, data: data.data });
    } catch (error) {
      setPayment({ loading: false, provider: null, data: null });
      const msg = error.response?.data?.message;
      if (msg) {
        const mapped = tMsg(msg);
        setPaymentError(mapped);
      } else {
        setPaymentError(t('paymentInitFailed'));
      }
    }
  };

  const initiateCashPayment = async () => {
    const order = modal.order;
    setPaymentError(null);
    setPayment({ loading: true, provider: 'cash' });

    try {
      const { data } = await axios.post(
        `${url}/api/vendors/payments/cash/${order.id}`,
        {},
        { headers: getAuthHeaders() }
      );

      setPayment({ loading: false, provider: 'cash', data: { ...data.data, flow: 'cash' } });
      flash('ok', t('paymentSuccess'));
      load();
      completeOrder(order.id);
    } catch (error) {
      setPayment({ loading: false, provider: null, data: null });
      const msg = error.response?.data?.message;
      if (msg) {
        const mapped = tMsg(msg);
        setPaymentError(mapped);
      } else {
        setPaymentError(t('paymentInitFailed'));
      }
    }
  };

  const completeOrder = async (orderId) => {
    try {
      await axios.patch(
        `${url}/api/vendors/requests/complete/${orderId}`,
        {},
        { headers: getAuthHeaders() }
      );
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await axios.patch(
            `${url}/api/vendors/requests/complete/${orderId}`,
            {},
            { headers: getAuthHeaders() }
          );
        } catch {
          flash('ok', t('deliveryMarkedManually'));
        }
      } else {
        flash('ok', t('deliveryMarkedManually'));
      }
    }
  };

  const simulateMockPayment = async () => {
    try {
      await axios.post(`${url}/api/vendors/payments/mock/${payment.data.paymentId}/complete`, {}, { headers: getAuthHeaders() });
      stopPolling();
      setPayment((previous) => previous ? { ...previous, statusFinal: 'verified' } : previous);
      load();
      if (modal?.order?.id) completeOrder(modal.order.id);
    } catch (error) {
      setPaymentError(error.response?.data?.message || t('paymentInitFailed'));
    }
  };

  return (
    <>
      {notice && <div className={`vendor-notice ${notice.type}`}>{notice.text}</div>}

      <section className='vendor-section theme-accepted'>
        <h3>{t('acceptedTitle')} <span>({num(orders.length)})</span></h3>

        {orders.length === 0 ? (
          <p className='empty-line'>{t('nothingInProgress')}</p>
        ) : (
          orders.map((order) => (
            <article
              className='request-card'
              key={order.id}
              onClick={() => setModal({ type: 'map', order })}
            >
              <div className='card-main'>
                <div className='card-title-row'>
                  <strong>{num(order.code)}</strong>
                  <span className='card-total'>{money(order.subtotal)}</span>
                </div>
                <p className='customer-line'>{order.customer.name} · {num(order.customer.phone)}</p>
                <ul className='item-lines'>
                  {order.items.map((row, i) => (
                    <li key={i}>
                      {num(row.quantity)} {iunit(row)} × {iname(row)} @ {money(row.priceAtOrder)}/{iunit(row)}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                className='complete-btn'
                onClick={(e) => {
                  e.stopPropagation();
                  openPaymentModal(order);
                }}
              >
                {t('complete')}
              </button>
            </article>
          ))
        )}
      </section>

      {/* completed orders section */}
      <section className='vendor-section theme-completed'>
        <h3>{t('completedTitle')} <span>({num(completedOrders.length)})</span></h3>

        {completedOrders.length === 0 ? (
          <p className='empty-line'>{t('noCompletedOrders')}</p>
        ) : (
          completedOrders.map((order) => (
            <article
              className='request-card completed-card'
              key={order.id}
            >
              <div className='card-main'>
                <div className='card-title-row'>
                  <strong>{num(order.code)}</strong>
                  <span className='card-total'>{money(order.subtotal)}</span>
                </div>
                <p className='customer-line'>{order.customer?.name}</p>
                <p className='customer-phone'>{num(order.customer?.phone)}</p>
                <div className='card-bottom-row'>
                  <span className={`payment-badge ${order.paymentMethod === 'cash' ? 'payment-cash' : 'payment-qr'}`}>
                    {order.paymentMethod === 'cash' ? t('payWithCash') : t('payWithQr')}
                  </span>
                  {order.paymentMethod === 'cash' && (
                    <button
                      className='revoke-cash-btn'
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRevokeCash(order.id);
                      }}
                    >
                      {t('revoke')}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {/* clicking an accepted card opens turn-by-turn style navigation */}
      {modal?.type === 'map' && (
        <Modal
          title={t('deliveryLocation', { code: modal.order.code })}
          onClose={() => setModal(null)}
          wide
        >
          <p className='modal-customer'>
            {modal.order.customer.name} ·{' '}
            <a className='phone-link' href={`tel:${modal.order.customer.phone}`}>
              {num(modal.order.customer.phone)}
            </a>
          </p>

          {modal.order.dropoff ? (
            <RouteMap url={url} token={token} dropoff={modal.order.dropoff} />
          ) : (
            <p className='modal-note'>{t('dropoffMissing')}</p>
          )}
        </Modal>
      )}

      {/* payment modal — QR code with cash option below */}
      {modal?.type === 'payment' && (
        <Modal title={t('paymentTitle', { code: modal.order.code })} onClose={() => { stopPolling(); setModal(null); }}>
          {/* amount breakdown */}
          <div className='payment-rows'>
            <div><span>{t('subtotal')}</span><b>{money(modal.order.subtotal)}</b></div>
            <div><span>{t('delivery')}</span><b>{money(modal.order.deliveryCharge)}</b></div>
            <div><span>{t('additionalCharges')}</span><b>{money(modal.order.additionalCharges)}</b></div>
            <div className='pay-total'><span>{t('total')}</span><b>{money(orderAmount(modal.order))}</b></div>
          </div>

          {/* loading state */}
          {payment?.loading && (
            <div className='payment-loading'>
              <p>{t('paymentInitiating')}</p>
            </div>
          )}

          {/* error state */}
          {paymentError && (
            <div className='payment-error-box'>
              <p>{paymentError}</p>
              <button className='util-btn' onClick={() => { setPaymentError(null); setPayment(null); }}>
                {t('tryAgain')}
              </button>
            </div>
          )}

          {/* payment result — QR code with cash option */}
          {payment?.data && !payment.loading && !payment.statusFinal && (
            <div className='payment-result'>
              <div className='payment-status-bar'>
                <span className='payment-status-dot' />
                <span>{t('paymentWaiting')}</span>
              </div>

              {/* QR code (always shown first) */}
              {payment.data.flow === 'qr' && payment.data.qrData && (
                <div className='payment-qr'>
                  <img
                    src={payment.data.qrData}
                    alt='Payment QR'
                    className='payment-qr-image'
                    id='qr-code-image'
                  />
                  <p className='payment-hint'>{t('scanQrHint')}</p>
                  <button className='download-qr-btn' onClick={() => downloadQrCode(payment.data.qrData, payment.data.reference)}>
                    {t('downloadQr')}
                  </button>
                </div>
              )}

              {/* Cash option below QR code */}
              {payment.data.flow === 'qr' && (
                <button className='cash-payment-btn' onClick={initiateCashPayment}>
                  {t('payWithCash')}
                </button>
              )}

              {payment.data.flow === 'mock' && (
                <div className='payment-cash-result'>
                  <p className='payment-hint'>Development mock payment — not a real bank transaction.</p>
                  <button className='cash-payment-btn' onClick={simulateMockPayment}>Simulate successful payment</button>
                </div>
              )}

              {/* Cash payment result */}
              {payment.data.flow === 'cash' && (
                <div className='payment-cash-result'>
                  <div className='payment-cash-icon'>✓</div>
                  <p className='payment-hint'>{t('cashPaymentConfirmed')}</p>
                  <p className='payment-cash-note'>{t('cashPaymentNote')}</p>
                </div>
              )}

              {/* common: reference and expiry */}
              <div className='payment-meta'>
                <p>{t('paymentReference')}: <strong>{num(payment.data.reference)}</strong></p>
                {payment.data.expiresAt && (
                  <p className='payment-expires'>
                    {t('paymentExpiresAt')}: {new Date(payment.data.expiresAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* payment verified */}
          {payment?.statusFinal === 'verified' && (
            <div className='payment-result payment-success'>
              <div className='payment-status-bar payment-status-ok'>
                <span className='payment-status-dot-ok' />
                <span>{t('paymentSuccess')}</span>
              </div>
            </div>
          )}

          <div className='payment-actions'>
            {payment?.statusFinal === 'verified' ? (
              <button className='util-btn' onClick={() => { setModal(null); }}>{t('close')}</button>
            ) : payment?.statusFinal === 'failed' ? (
              <>
                <button className='util-btn' onClick={() => { setModal(null); }}>{t('close')}</button>
                <button className='complete-btn' onClick={() => { setPayment(null); setPaymentError(null); }}>{t('tryAgain')}</button>
              </>
            ) : (
              <button className='util-btn' onClick={() => { stopPolling(); setModal(null); }}>{t('close')}</button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};

export default Accepted;
