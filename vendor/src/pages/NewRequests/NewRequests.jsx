import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useUi } from '../../context/UiContext';
import { getAuthHeaders, isAuthError } from '../../utils/api';

// poll cadence matches the backend priority scheduler
// (SCHEDULER_POLL_INTERVAL_MS = 15_000) so new orders appear without
// navigating away, while staying cheap on the backend.
const POLL_INTERVAL = 15000;
// countdown ticks between polls; resynced on every load()
const TICK_INTERVAL = 1000;
// under this many seconds left, the countdown reads as urgent
const URGENT_THRESHOLD = 10;

const NewRequests = ({ url, onLogout }) => {
  const { t, tMsg, money, num, iname, iunit } = useUi();

  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState(null);
  // drives the client-side countdown; bumped every second and on each load()
  const [nowTick, setNowTick] = useState(() => Date.now());
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  const flash = useCallback((type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${url}/api/vendors/requests/new`, {
        headers: getAuthHeaders(),
      });
      setOrders(data.data);
      setNowTick(Date.now()); // resync countdowns against server data
    } catch (error) {
      if (isAuthError(error)) onLogout();
      else flash('error', t('loadFailedNew'));
    }
  }, [url, onLogout, t, flash]);

  // interval polling while mounted, mirroring the setInterval/cleanup
  // pattern used in Accepted.jsx. Pauses while the tab is hidden and
  // refreshes immediately when it becomes visible again.
  useEffect(() => {
    load();

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };

    const startPolling = () => {
      stopPolling();
      pollRef.current = setInterval(load, POLL_INTERVAL);
      tickRef.current = setInterval(() => setNowTick(Date.now()), TICK_INTERVAL);
    };

    const onVisibility = () => {
      if (document.hidden) stopPolling();
      else {
        startPolling();
        load();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    startPolling();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopPolling();
    };
  }, [load]);

  const acceptRequest = async (order) => {
    try {
      await axios.patch(
        `${url}/api/vendors/requests/accept/${order.id}`,
        {},
        { headers: getAuthHeaders() }
      );
      flash('ok', t('acceptedFlash', { code: order.code }));
      load();
    } catch (error) {
      flash('error', error.response?.data?.message ? tMsg(error.response.data.message) : t('acceptFailed'));
      // a lost race (409) leaves a stale card visible — refresh right away
      load();
    }
  };

  return (
    <>
      {notice && <div className={`vendor-notice ${notice.type}`}>{notice.text}</div>}

      <section className='vendor-section theme-new'>
        <h3>{t('newRequestsTitle')} <span>({num(orders.length)})</span></h3>

        {orders.length === 0 ? (
          <p className='empty-line'>{t('noNewRequests')}</p>
        ) : (
          orders.map((order) => {
            const secsLeft = order.priorityExpiresAt
              ? Math.max(0, Math.ceil((new Date(order.priorityExpiresAt).getTime() - nowTick) / 1000))
              : null;
            return (
              <article className='request-card' key={order.id}>
                <div className='card-main'>
                  <div className='card-title-row'>
                    <strong>{num(order.code)}</strong>
                    {/* items-only amount — delivery/additional charges don't belong to the vendor */}
                    <span className='card-total'>{money(order.subtotal)}</span>
                  </div>
                  <p className='customer-line'>{order.customer.name} · {num(order.customer.phone)}</p>
                  <div className='card-badges'>
                    {secsLeft !== null && (
                      <span className={`badge expiry${secsLeft < URGENT_THRESHOLD ? ' expiry-urgent' : ''}`}>
                        {t('expiresIn', { s: secsLeft })}
                      </span>
                    )}
                    {typeof order.distanceKm === 'number' && (
                      <span className='badge distance'>
                        {t('distanceAway', { km: order.distanceKm })}
                      </span>
                    )}
                    {order.isClosestVendor && (
                      <span className='badge closest'>{t('closestVendor')}</span>
                    )}
                  </div>
                  <ul className='item-lines'>
                    {order.items.map((row, i) => (
                      <li key={i}>
                        {num(row.quantity)} {iunit(row)} × {iname(row)} @ {money(row.priceAtOrder)}/{iunit(row)}
                      </li>
                    ))}
                  </ul>
                </div>
                <button className='accept-btn' onClick={() => acceptRequest(order)}>{t('accept')}</button>
              </article>
            );
          })
        )}
      </section>
    </>
  );
};

export default NewRequests;