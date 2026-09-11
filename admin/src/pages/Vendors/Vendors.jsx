import React, { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './Vendors.css'
import { getAuthHeaders, isAuthError } from '../../utils/api'
import { matchesQuery, sortRows } from '../../utils/searchSort'
import SearchSort from '../../components/SearchSort/SearchSort'
import Pagination from '../../components/Pagination/Pagination'

const VENDOR_SORT_FIELDS = {
  name:           { label: 'Name', get: (v) => v.name },
  email:          { label: 'Email', get: (v) => v.email },
  phone:          { label: 'Phone', get: (v) => v.phone },
  hasSetLocation: { label: 'Location set', get: (v) => v.hasSetLocation ? 'Yes' : 'No' },
  createdAt:      { label: 'Joined', type: 'date', get: (v) => v.createdAt },
};

const VENDOR_SORT_OPTIONS = Object.entries(VENDOR_SORT_FIELDS)
  .map(([key, f]) => ({ key, label: f.label }));

const vendorSearchValues = (vendor) => [
  vendor.name,
  vendor.email,
  vendor.phone,
  vendor.hasSetLocation ? 'Yes' : 'No',
  vendor.location?.lat ?? '',
  vendor.location?.lng ?? '',
];

const fmtDate = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const fmtShortDate = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

const Vendors = ({ url }) => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedVendorId, setExpandedVendorId] = useState(null);
  const [vendorOrders, setVendorOrders] = useState({});
  const [ordersLoading, setOrdersLoading] = useState({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${url}/api/vendors`, {
        headers: getAuthHeaders(),
        params: { page, limit: 20 },
      });
      if (response.data.success) {
        setVendors(response.data.data);
        setTotalPages(response.data.pagination.pages);
      }
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired. Please log in again.');
      else toast.error('Failed to fetch vendors');
    } finally {
      setLoading(false);
    }
  }, [url, page]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const fetchVendorOrders = async (vendorId) => {
    if (vendorOrders[vendorId]) return;

    setOrdersLoading((prev) => ({ ...prev, [vendorId]: true }));
    try {
      const response = await axios.get(`${url}/api/orders/vendor/${vendorId}`, {
        headers: getAuthHeaders(),
      });
      if (response.data.success) {
        setVendorOrders((prev) => ({ ...prev, [vendorId]: response.data.data }));
      }
    } catch (error) {
      toast.error('Failed to load vendor orders');
    } finally {
      setOrdersLoading((prev) => ({ ...prev, [vendorId]: false }));
    }
  };

  const toggleExpand = useCallback((vendorId) => {
    setExpandedVendorId((prev) => {
      if (prev === vendorId) return null;
      fetchVendorOrders(vendorId);
      return vendorId;
    });
  }, [vendorOrders]);

  const visibleVendors = sortRows(
    vendors.filter((v) => matchesQuery(query, vendorSearchValues(v))),
    sort.key,
    sort.dir,
    VENDOR_SORT_FIELDS
  );

  return (
    <div className='vendors-page'>
      <h1>Vendors</h1>

      <SearchSort
        placeholder="Search by name, email, phone, location..."
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        sortOptions={VENDOR_SORT_OPTIONS}
      />

      {loading ? (
        <p className='vendors-loading'>Loading vendors...</p>
      ) : visibleVendors.length === 0 ? (
        <p className='vendors-empty'>No matching vendors.</p>
      ) : (
        <div className='vendor-list'>
          {visibleVendors.map((vendor) => {
            const isExpanded = expandedVendorId === (vendor.id || vendor._id);
            const orders = vendorOrders[vendor.id || vendor._id] || [];
            const isLoadingOrders = ordersLoading[vendor.id || vendor._id];

            return (
              <div className={`vendor-card ${isExpanded ? 'expanded' : ''}`} key={vendor.id || vendor._id}>
                <div
                  className='vendor-row'
                  onClick={() => toggleExpand(vendor.id || vendor._id)}
                  role='button'
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') toggleExpand(vendor.id || vendor._id); }}
                >
                  <div className='vendor-avatar'>
                    {vendor.name?.[0]?.toUpperCase() || '?'}
                  </div>

                  <div className='vendor-info'>
                    <strong>{vendor.name}</strong>
                    <span>{vendor.email}</span>
                  </div>

                  <div className='vendor-details'>
                    <span className='detail'>{vendor.phone}</span>
                    <span className='detail'>
                      Location: {vendor.hasSetLocation
                        ? `${vendor.location?.lat?.toFixed(4) ?? '-'}, ${vendor.location?.lng?.toFixed(4) ?? '-'}`
                        : 'Not set'}
                    </span>
                    <span className='detail'>Joined: {fmtDate(vendor.createdAt)}</span>
                  </div>

                  <div className='vendor-expand-icon'>
                    {isExpanded ? '▲' : '▼'}
                  </div>
                </div>

                {isExpanded && (
                  <div className='vendor-orders'>
                    <h4>Orders</h4>
                    {isLoadingOrders ? (
                      <p className='orders-loading'>Loading orders...</p>
                    ) : orders.length === 0 ? (
                      <p className='orders-empty'>No orders for this vendor.</p>
                    ) : (
                      <div className='orders-table'>
                        <div className='orders-header'>
                          <span>Order</span>
                          <span>Customer</span>
                          <span>Items</span>
                          <span>Total</span>
                          <span>Status</span>
                          <span>Date</span>
                        </div>
                        {orders.map((order) => (
                          <div className='order-row' key={order._id}>
                            <span className='order-code'>#{String(order._id).slice(-6).toUpperCase()}</span>
                            <span>{order.user?.name || 'Unknown'}</span>
                            <span>{order.items?.length || 0} items</span>
                            <span>Rs. {order.total?.toFixed(2)}</span>
                            <span className={`status-badge status-${order.status?.toLowerCase()}`}>
                              {order.status}
                            </span>
                            <span>{fmtShortDate(order.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
};

export default Vendors;
