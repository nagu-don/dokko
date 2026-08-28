import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Users.css'
import { getAuthHeaders, isAuthError } from '../../utils/api'
import { matchesQuery, sortRows } from '../../utils/searchSort'
import SearchSort from '../../components/SearchSort/SearchSort'

// sortable parameters for users
const USER_SORT_FIELDS = {
  name:            { label: 'Name', get: (u) => u.name },
  email:           { label: 'Email', get: (u) => u.email },
  phone:           { label: 'Phone', get: (u) => u.phone },
  totalOrders:     { label: 'Order count', type: 'number', get: (u) => u.totalOrders },
  totalKgOrdered:  { label: 'Total kg ordered', type: 'number', get: (u) => u.totalKgOrdered },
};

const USER_SORT_OPTIONS = Object.entries(USER_SORT_FIELDS)
  .map(([key, f]) => ({ key, label: f.label }));

// every value a user can be searched by
const userSearchValues = (user) => [
  user.name,
  user.email,
  user.phone,
  user.totalOrders,
  user.totalKgOrdered,
];

const fmtDate = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const Users = ({ url }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // search + sort controls
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });

  // which user's order history is expanded
  const [openUserId, setOpenUserId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${url}/api/users/all`, {
        headers: getAuthHeaders(),
      });
      if (response.data.success) setUsers(response.data.data);
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired. Please log in again.');
      else toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleUserOrders = async (userId) => {
    if (openUserId === userId) {
      setOpenUserId(null);
      return;
    }

    setOpenUserId(userId);
    setOrders([]);
    setOrdersLoading(true);

    try {
      const response = await axios.get(`${url}/api/orders/list`, {
        params: { userId },
        headers: getAuthHeaders(),
      });
      if (response.data.success) setOrders(response.data.data);
    } catch {
      toast.error('Failed to fetch order history');
    } finally {
      setOrdersLoading(false);
    }
  };

  const visibleUsers = sortRows(
    users.filter((u) => matchesQuery(query, userSearchValues(u))),
    sort.key,
    sort.dir,
    USER_SORT_FIELDS
  );

  return (
    <div className='users-page'>
      <h1>Registered Users</h1>

      <SearchSort
        placeholder="Search by name, email, phone, orders..."
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        sortOptions={USER_SORT_OPTIONS}
      />

      {loading ? (
        <p className='users-loading'>Loading users...</p>
      ) : visibleUsers.length === 0 ? (
        <p className='users-empty'>No matching users.</p>
      ) : (
        <div className='user-list'>
          {visibleUsers.map((user) => {
            const isOpen = openUserId === user._id;

            return (
              <div className='user-card' key={user._id}>
                <button
                  className='user-row'
                  onClick={() => toggleUserOrders(user._id)}
                  aria-expanded={isOpen}
                >
                  <div className='user-avatar'>
                    {user.name?.[0]?.toUpperCase() || '?'}
                  </div>

                  <div className='user-info'>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </div>

                  <div className='user-stats'>
                    <span className='stat'>
                      <b>{user.totalOrders}</b> orders
                    </span>
                    <span className='stat'>
                      <b>{user.totalKgOrdered}</b> kg
                    </span>
                    <span className={`chevron ${isOpen ? 'up' : ''}`}>▾</span>
                  </div>
                </button>

                {isOpen && (
                  <div className='order-history'>
                    <h3>Order history</h3>

                    {ordersLoading ? (
                      <p>Loading orders...</p>
                    ) : orders.length === 0 ? (
                      <p className='history-empty'>This user hasn&apos;t placed any orders yet.</p>
                    ) : (
                      orders.map((order) => (
                        <div className='history-order' key={order._id}>
                          <div className='history-head'>
                            <span className='history-id'>
                              #{order._id.slice(-6).toUpperCase()}
                            </span>
                            <span className='history-date'>{fmtDate(order.createdAt)}</span>
                            <span className={`status-pill status-${order.status.toLowerCase()}`}>
                              {order.status}
                            </span>
                          </div>

                                          <ul>
                            {order.items.map((row, i) => (
                              <li key={i}>
                                {row.nameEng} — {row.quantity} kg @ Rs.{' '}
                                {row.priceAtOrder ?? row.avgPriceAtOrder}/kg
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Users;
