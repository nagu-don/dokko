import { useEffect, useState } from 'react';
import axios from 'axios';
import { useUi } from '../../context/UiContext';
import { getAuthHeaders, isAuthError } from '../../utils/api';

const NewRequests = ({ url, onLogout }) => {
  const { t, tMsg, money, num, iname, iunit } = useUi();

  const [orders, setOrders] = useState([]);
  const [notice, setNotice] = useState(null);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const load = async () => {
    try {
      const { data } = await axios.get(`${url}/api/vendors/requests/new`, {
        headers: getAuthHeaders(),
      });
      setOrders(data.data);
    } catch (error) {
      if (isAuthError(error)) onLogout();
      else flash('error', t('loadFailedNew'));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          orders.map((order) => (
            <article className='request-card' key={order.id}>
              <div className='card-main'>
                <div className='card-title-row'>
                  <strong>{num(order.code)}</strong>
                  {/* items-only amount — delivery/additional charges don't belong to the vendor */}
                  <span className='card-total'>{money(order.subtotal)}</span>
                </div>
                <p className='customer-line'>{order.customer.name} · {num(order.customer.phone)}</p>
                <div className='card-badges'>
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
          ))
        )}
      </section>
    </>
  );
};

export default NewRequests;
