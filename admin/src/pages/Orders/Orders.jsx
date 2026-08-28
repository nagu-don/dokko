import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Orders.css'
import { getAuthHeaders, isAuthError } from '../../utils/api'
import { matchesQuery, sortRows } from '../../utils/searchSort'
import SearchSort from '../../components/SearchSort/SearchSort'

const STATUSES = ['Pending', 'Processing', 'Delivered', 'Cancelled'];

// sortable parameters for orders
const ORDER_SORT_FIELDS = {
  createdAt:     { label: 'Date', type: 'date', get: (o) => o.createdAt },
  userName:      { label: 'Customer name', get: (o) => o.user?.name },
  userEmail:     { label: 'Customer email', get: (o) => o.user?.email },
  userPhone:     { label: 'Customer phone', get: (o) => o.user?.phone },
  totalQuantity: { label: 'Total quantity', type: 'number', get: (o) => o.totalQuantity },
  status:        { label: 'Status', get: (o) => o.status },
};

const ORDER_SORT_OPTIONS = Object.entries(ORDER_SORT_FIELDS)
  .map(([key, f]) => ({ key, label: f.label }));

// every value an order can be searched by
const orderSearchValues = (order) => [
  order._id,
  '#' + String(order._id).slice(-6).toUpperCase(),
  order.user?.name,
  order.user?.email,
  order.user?.phone,
  order.status,
  order.totalQuantity,
  order.createdAt,
  ...(order.items || []).flatMap((row) => [row.nameEng, row.quantity, row.priceAtOrder ?? row.avgPriceAtOrder]),
];

const rs = (n) => `Rs. ${Math.round(Number(n) * 100) / 100}`;

const linePrice = (row) => Number(row.priceAtOrder ?? row.avgPriceAtOrder ?? 0);

// new orders carry stored money fields; legacy orders are computed on the fly
// deliveryCharge may be null during priority search — show as 0
const orderTotals = (order) => {
  const subtotal =
    order.subtotal ??
    Math.round(
      (order.items || []).reduce((sum, r) => sum + r.quantity * linePrice(r), 0) * 100
    ) / 100;

  const hasFees = order.deliveryCharge != null || order.additionalCharges != null;

  const delivery = hasFees ? (order.deliveryCharge ?? 0) : 0;
  const additional = hasFees ? (order.additionalCharges ?? 0) : 0;
  const total = order.total ?? Math.round((subtotal + delivery + additional) * 100) / 100;

  return { subtotal, delivery, additional, total, hasFees };
};

const fmtDate = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const Orders = ({ url }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  // search + sort controls
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${url}/api/orders/list`, {
        headers: getAuthHeaders(),
      });
      if (response.data.success) setOrders(response.data.data);
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired. Please log in again.');
      else toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const updateStatus = async (id, status) => {
    try {
      const response = await axios.patch(
        `${url}/api/orders/status/${id}`,
        { status },
        { headers: getAuthHeaders() }
      );
      if (response.data.success) {
        setOrders((prev) => prev.map((o) => (o._id === id ? response.data.data : o)));
        toast.success(response.data.message);
      }
    } catch (error) {
      if (isAuthError(error)) toast.error('Please log in to update orders');
      else toast.error('Failed to update order');
    }
  };

  const visible = sortRows(
    orders
      .filter((o) => filter === 'All' || o.status === filter)
      .filter((o) => matchesQuery(query, orderSearchValues(o))),
    sort.key,
    sort.dir,
    ORDER_SORT_FIELDS
  );

  return (
    <div className='orders-page'>
      <div className='page-head'>
        <h1>Track Orders</h1>

        <div className='status-filter'>
          {['All', ...STATUSES].map((s) => (
            <button
              key={s}
              className={`filter-chip ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s}
              {s !== 'All' && (
                <span className='chip-count'>
                  {orders.filter((o) => o.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <SearchSort
        placeholder="Search by id, customer, item, status, date..."
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        sortOptions={ORDER_SORT_OPTIONS}
      />

      {loading ? (
        <p className='orders-loading'>Loading orders...</p>
      ) : visible.length === 0 ? (
        <p className='orders-empty'>No orders found.</p>
      ) : (
        visible.map((order) => (
          <div className='order-card' key={order._id}>
            <div className='order-top'>
              <div className='order-meta'>
                <span className='order-id'>#{order._id.slice(-6).toUpperCase()}</span>
                <span className='order-date'>{fmtDate(order.createdAt)}</span>
              </div>

              <select
                className={`status-select status-${order.status.toLowerCase()}`}
                value={order.status}
                onChange={(e) => updateStatus(order._id, e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className='order-customer'>
              <strong>{order.user?.name || 'Unknown user'}</strong>
              <span>{order.user?.email}</span>
              <span>{order.user?.phone}</span>
            </div>

            <table className='order-items'>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Price/kg</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((row, i) => (
                  <tr key={i}>
                    <td>{row.nameEng}</td>
                    <td>{row.quantity} kg</td>
                    <td>{rs(linePrice(row))}/kg</td>
                    <td>{rs(row.quantity * linePrice(row))}</td>
                  </tr>
                ))}
                {(() => {
                  const t = orderTotals(order);
                  return (
                    <>
                      <tr className='order-total-row'>
                        <td>Subtotal</td>
                        <td>{order.totalQuantity} kg</td>
                        <td></td>
                        <td>{rs(t.subtotal)}</td>
                      </tr>
                      {t.hasFees && (
                        <>
                          <tr className='order-fee-row'>
                            <td>Delivery</td>
                            <td></td>
                            <td></td>
                            <td>{rs(t.delivery)}</td>
                          </tr>
                          <tr className='order-fee-row'>
                            <td>Additional charges</td>
                            <td></td>
                            <td></td>
                            <td>{rs(t.additional)}</td>
                          </tr>
                        </>
                      )}
                      <tr className='order-total-row grand'>
                        <td>Total</td>
                        <td></td>
                        <td></td>
                        <td>{rs(t.total)}</td>
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
};

export default Orders;
