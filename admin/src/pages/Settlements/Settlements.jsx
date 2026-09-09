import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './Settlements.css';
import { getAuthHeaders, isAuthError } from '../../utils/api';
import { matchesQuery, sortRows } from '../../utils/searchSort';
import SearchSort from '../../components/SearchSort/SearchSort';
import Pagination from '../../components/Pagination/Pagination';
import { useAdminContext } from '../../context/AdminContext';

const STATUS_LIST = ['pending', 'approved', 'paid', 'failed', 'cancelled'];

const SORT_FIELDS = {
  createdAt:         { label: 'Date', type: 'date', get: (s) => s.createdAt },
  vendorName:        { label: 'Vendor', get: (s) => s.vendorId?.name },
  customerPaymentAmount: { label: 'Customer Payment', type: 'number', get: (s) => s.customerPaymentAmount },
  companyAmount:     { label: 'Company Share', type: 'number', get: (s) => s.companyAmount },
  vendorAmount:      { label: 'Vendor Amount', type: 'number', get: (s) => s.vendorAmount },
  status:            { label: 'Status', get: (s) => s.status },
};

const SORT_OPTIONS = Object.entries(SORT_FIELDS).map(([key, f]) => ({ key, label: f.label }));

const fmtDate = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const maskDestination = (dest) => {
  if (!dest) return '—';
  const id = dest.accountNumber || '';
  if (id.length <= 4) return id;
  return '*'.repeat(id.length - 4) + id.slice(-4);
};

const Settlements = ({ url }) => {
  const { t, money } = useAdminContext();

  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocs, setTotalDocs] = useState(0);

  const [companyAccount, setCompanyAccount] = useState(null);

  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filter !== 'all') params.status = filter;

      const response = await axios.get(`${url}/api/admins/settlements`, {
        headers: getAuthHeaders(),
        params,
      });
      if (response.data.success) {
        setSettlements(response.data.data);
        setTotalPages(response.data.pagination.pages);
        setTotalDocs(response.data.pagination.total);
      }
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired. Please log in again.');
      else toast.error(t('failedToLoadList'));
    } finally {
      setLoading(false);
    }
  }, [url, page, filter, t]);

  const fetchCompanyAccount = useCallback(async () => {
    try {
      const response = await axios.get(`${url}/api/admins/company-account`, {
        headers: getAuthHeaders(),
      });
      if (response.data.success) setCompanyAccount(response.data.data);
    } catch {
      // non-critical, silently ignore
    }
  }, [url]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  useEffect(() => {
    fetchCompanyAccount();
  }, [fetchCompanyAccount]);

  const openDetail = async (settlement) => {
    setDetailLoading(true);
    setSelected(null);
    try {
      const response = await axios.get(`${url}/api/admins/settlements/${settlement._id}`, {
        headers: getAuthHeaders(),
      });
      if (response.data.success) setSelected(response.data.data);
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired.');
      else toast.error(t('failedToLoadDetails'));
    } finally {
      setDetailLoading(false);
    }
  };

  const approveSettlement = async (id) => {
    try {
      const response = await axios.patch(
        `${url}/api/admins/settlements/${id}/approve`,
        {},
        { headers: getAuthHeaders() }
      );
      if (response.data.success) {
        toast.success(t('approveSuccess'));
        setSelected((prev) => prev ? { ...prev, status: 'approved' } : prev);
        setSettlements((prev) => prev.map((s) => s._id === id ? { ...s, status: 'approved' } : s));
      }
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired.');
      else toast.error(t('failedToApprove'));
    }
  };

  const cancelSettlement = async (id) => {
    try {
      const response = await axios.patch(
        `${url}/api/admins/settlements/${id}/cancel`,
        {},
        { headers: getAuthHeaders() }
      );
      if (response.data.success) {
        toast.success(t('cancelSuccess'));
        setSelected((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
        setSettlements((prev) => prev.map((s) => s._id === id ? { ...s, status: 'cancelled' } : s));
      }
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired.');
      else toast.error(t('failedToCancel'));
    }
  };

  const searchValues = (s) => [
    s._id,
    '#' + String(s._id).slice(-6).toUpperCase(),
    s.vendorId?.name,
    s.vendorId?.email,
    s.vendorId?.phone,
    s.status,
    s.createdAt,
    s.payoutMethod,
    s.payoutDestination?.accountNumber,
  ];

  const visible = sortRows(
    settlements.filter((s) => matchesQuery(query, searchValues(s))),
    sort.key,
    sort.dir,
    SORT_FIELDS
  );

  const filteredCounts = { all: totalDocs };
  STATUS_LIST.forEach((st) => { filteredCounts[st] = settlements.filter((s) => s.status === st).length; });

  return (
    <div className='settlements-page'>
      <div className='page-head'>
        <h1>{t('settlementTitle')}</h1>
        <div className='status-filter'>
          {['all', ...STATUS_LIST].map((s) => (
            <button
              key={s}
              className={`filter-chip ${filter === s ? 'active' : ''}`}
              onClick={() => { setFilter(s); setPage(1); }}
            >
              {t(s)}
              {s !== 'all' && (
                <span className='chip-count'>
                  {settlements.filter((x) => x.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <SearchSort
        placeholder={t('searchPlaceholder')}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        sortOptions={SORT_OPTIONS}
      />

      {companyAccount && (
        <div className='totals-bar'>
          <div className='totals-card'>
            <span className='totals-label'>{t('totalCustomerPayments')}</span>
            <span className='totals-value'>{money(companyAccount.collectedAmount)}</span>
          </div>
          <div className='totals-card'>
            <span className='totals-label'>{t('totalCompanyShare')}</span>
            <span className='totals-value totals-company'>{money(companyAccount.collectedAmount - companyAccount.disbursedAmount)}</span>
          </div>
          <div className='totals-card'>
            <span className='totals-label'>{t('totalVendorPayable')}</span>
            <span className='totals-value totals-vendor'>{money(companyAccount.disbursedAmount)}</span>
          </div>
          <div className='totals-card'>
            <span className='totals-label'>{t('totalPendingSettlements')}</span>
            <span className='totals-value totals-pending'>{companyAccount.pendingPayouts}</span>
          </div>
          <div className='totals-card'>
            <span className='totals-label'>{t('totalPaidSettlements')}</span>
            <span className='totals-value totals-paid'>{companyAccount.totalSettlements - companyAccount.pendingPayouts}</span>
          </div>
        </div>
      )}

      {loading ? (
        <p className='settlements-loading'>{t('loading')}</p>
      ) : visible.length === 0 ? (
        <p className='settlements-empty'>{t('noSettlements')}</p>
      ) : (
        <>
          <div className='settlements-table-wrap'>
            <table className='settlements-table'>
              <thead>
                <tr>
                  <th>{t('colOrder')}</th>
                  <th>{t('colVendor')}</th>
                  <th>{t('colCustomerPayment')}</th>
                  <th>{t('colGoods')}</th>
                  <th>{t('colDelivery')}</th>
                  <th>{t('colCompanyShare')}</th>
                  <th>{t('colVendorAmount')}</th>
                  <th>{t('colPayoutMethod')}</th>
                  <th>{t('colPayoutDestination')}</th>
                  <th>{t('colStatus')}</th>
                  <th>{t('colDate')}</th>
                  <th>{t('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s._id}>
                    <td className='settlement-order-id'>
                      {t('orderPrefix')}{String(s.orderId?._id || s._id).slice(-6).toUpperCase()}
                    </td>
                    <td>{s.vendorId?.name || t('notAvailable')}</td>
                    <td>{money(s.customerPaymentAmount)}</td>
                    <td>{money(s.goodsAmount)}</td>
                    <td>{money(s.deliveryAmount + s.additionalChargesAmount)}</td>
                    <td className='settlement-company'>{money(s.companyAmount)}</td>
                    <td className='settlement-vendor-amt'>{money(s.vendorAmount)}</td>
                    <td>{s.payoutMethod === 'bank' ? t('bank') : t('none')}</td>
                    <td className='settlement-masked'>{maskDestination(s.payoutDestination)}</td>
                    <td>
                      <span className={`status-badge status-${s.status}`}>{t(s.status)}</span>
                    </td>
                    <td className='settlement-date'>{fmtDate(s.createdAt)}</td>
                    <td>
                      <button className='settlement-view-btn' onClick={() => openDetail(s)}>
                        {t('viewDetails')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}

      {detailLoading && (
        <div className='settlement-modal-overlay'>
          <div className='settlement-modal detail-modal'>
            <p className='settlements-loading'>{t('loading')}</p>
          </div>
        </div>
      )}

      {selected && !detailLoading && (
        <SettlementDetail
          settlement={selected}
          url={url}
          t={t}
          money={money}
          onClose={() => setSelected(null)}
          onApprove={approveSettlement}
          onCancel={cancelSettlement}
          onOpenPay={() => setShowPayModal(true)}
          onPaid={(updated) => {
            setSelected((prev) => prev ? { ...prev, ...updated } : prev);
            setSettlements((prev) => prev.map((s) => s._id === updated._id ? { ...s, ...updated } : s));
          }}
          showPayModal={showPayModal}
          setShowPayModal={setShowPayModal}
        />
      )}
    </div>
  );
};

const SettlementDetail = ({
  settlement: s, url, t, money,
  onClose, onApprove, onCancel, onOpenPay, onPaid,
  showPayModal, setShowPayModal,
}) => {
  const canApprove = s.status === 'pending';
  const canPay = ['pending', 'approved'].includes(s.status);
  const canCancel = ['pending', 'approved'].includes(s.status);

  return (
    <>
      <div className='settlement-modal-overlay' onClick={onClose}>
        <div className='settlement-modal detail-modal' onClick={(e) => e.stopPropagation()}>
          <div className='detail-header'>
            <h2>{t('settlementDetails')}</h2>
            <button className='detail-close' onClick={onClose}>×</button>
          </div>

          <div className='detail-grid'>
            <div className='detail-row'>
              <span className='detail-label'>{t('colOrder')}</span>
              <span className='detail-value'>#{String(s.orderId?._id || s._id).slice(-6).toUpperCase()}</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('vendorLabel')}</span>
              <span className='detail-value'>{s.vendorId?.name} ({s.vendorId?.email})</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('customerPaymentLabel')}</span>
              <span className='detail-value'>{money(s.customerPaymentAmount)}</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('goodsAmountLabel')}</span>
              <span className='detail-value'>{money(s.goodsAmount)}</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('deliveryChargeLabel')}</span>
              <span className='detail-value'>{money(s.deliveryAmount)}</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('additionalChargesLabel')}</span>
              <span className='detail-value'>{money(s.additionalChargesAmount)}</span>
            </div>
            <div className='detail-row highlight'>
              <span className='detail-label'>{t('companyShareLabel')}</span>
              <span className='detail-value'>{money(s.companyAmount)}</span>
            </div>
            {Number(s.cashFeesDeducted) > 0 && (
              <div className='detail-row'>
                <span className='detail-label'>{t('cashFeesDeductedLabel')}</span>
                <span className='detail-value'>-{money(s.cashFeesDeducted)}</span>
              </div>
            )}
            <div className='detail-row highlight vendor'>
              <span className='detail-label'>{t('vendorPayableLabel')}</span>
              <span className='detail-value'>{money(s.vendorAmount)}</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('gatewayLabel')}</span>
              <span className='detail-value'>{s.paymentId?.provider || t('notAvailable')}</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('gatewayTransactionLabel')}</span>
              <span className='detail-value'>{s.paymentId?.merchantReference || t('notAvailable')}</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('payoutMethodLabel')}</span>
              <span className='detail-value'>{s.payoutMethod === 'bank' ? t('bank') : t('none')}</span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('maskedDestination')}</span>
              <span className='detail-value'>
                {s.payoutDestination?.accountNumber
                  ? `${s.payoutDestination.bankName || ''} ${maskDestination({ accountNumber: s.payoutDestination.accountNumber })}`
                  : t('notAvailable')}
              </span>
            </div>
            <div className='detail-row'>
              <span className='detail-label'>{t('settlementStatusLabel')}</span>
              <span className='detail-value'>
                <span className={`status-badge status-${s.status}`}>{t(s.status)}</span>
              </span>
            </div>
            {s.paidByAdminId && (
              <div className='detail-row'>
                <span className='detail-label'>{t('paidByLabel')}</span>
                <span className='detail-value'>{s.paidByAdminId.name}</span>
              </div>
            )}
            {s.paidAt && (
              <div className='detail-row'>
                <span className='detail-label'>{t('paidAtLabel')}</span>
                <span className='detail-value'>{fmtDate(s.paidAt)}</span>
              </div>
            )}
            {s.payoutReference && (
              <div className='detail-row'>
                <span className='detail-label'>{t('referenceLabel')}</span>
                <span className='detail-value'>{s.payoutReference}</span>
              </div>
            )}
            {s.adminNote && (
              <div className='detail-row'>
                <span className='detail-label'>{t('adminNoteLabel')}</span>
                <span className='detail-value'>{s.adminNote}</span>
              </div>
            )}
          </div>

          <div className='detail-actions'>
            {canApprove && (
              <button className='btn-approve' onClick={() => onApprove(s._id)}>{t('approve')}</button>
            )}
            {canPay && (
              <button className='btn-pay' onClick={onOpenPay}>{t('markAsPaid')}</button>
            )}
            {canCancel && (
              <button className='btn-cancel' onClick={() => onCancel(s._id)}>{t('cancelSettlement')}</button>
            )}
            <button className='btn-close-detail' onClick={onClose}>{t('close')}</button>
          </div>
        </div>
      </div>

      {showPayModal && (
        <PayModal
          settlement={s}
          url={url}
          t={t}
          money={money}
          onClose={() => setShowPayModal(false)}
          onPaid={onPaid}
        />
      )}
    </>
  );
};

const PayModal = ({ settlement: s, url, t, money, onClose, onPaid }) => {
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const methodLabel = s.payoutMethod === 'bank' ? t('bank') : t('none');
  const dest = s.payoutDestination?.accountNumber
    ? `${s.payoutDestination.bankName || ''} ${maskDestination({ accountNumber: s.payoutDestination.accountNumber })}`
    : t('notAvailable');

  const handleSubmit = async () => {
    if (!reference.trim()) {
      toast.error(t('markPaidReferenceRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const response = await axios.patch(
        `${url}/api/admins/settlements/${s._id}/pay`,
        { payoutReference: reference.trim(), payoutMethod: s.payoutMethod, adminNote: note.trim() || undefined },
        { headers: getAuthHeaders() }
      );
      if (response.data.success) {
        toast.success(t('markPaidSuccess'));
        onPaid(response.data.data);
        onClose();
      }
    } catch (error) {
      if (isAuthError(error)) toast.error('Session expired.');
      else toast.error(t('markPaidError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='settlement-modal-overlay' onClick={onClose}>
      <div className='settlement-modal pay-modal' onClick={(e) => e.stopPropagation()}>
        <div className='detail-header'>
          <h2>{t('markPaidTitle')}</h2>
          <button className='detail-close' onClick={onClose}>×</button>
        </div>

        <div className='pay-summary'>
          <div className='pay-row'>
            <span>{t('markPaidVendor')}</span>
            <strong>{s.vendorId?.name}</strong>
          </div>
          <div className='pay-row'>
            <span>{t('markPaidAmount')}</span>
            <strong className='pay-amount'>{money(s.vendorAmount)}</strong>
          </div>
          <div className='pay-row'>
            <span>{t('markPaidMethod')}</span>
            <strong>{methodLabel}</strong>
          </div>
          <div className='pay-row'>
            <span>{t('markPaidDestination')}</span>
            <strong>{dest}</strong>
          </div>
        </div>

        <div className='pay-form'>
          <label className='pay-label'>
            {t('markPaidReferenceLabel')}
            <input
              type='text'
              className='pay-input'
              placeholder={t('markPaidReferencePlaceholder')}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label className='pay-label'>
            {t('markPaidNoteLabel')}
            <textarea
              className='pay-textarea'
              placeholder={t('markPaidNotePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </label>
        </div>

        <div className='pay-actions'>
          <button className='btn-cancel' onClick={onClose} disabled={submitting}>{t('markPaidCancel')}</button>
          <button className='btn-pay' onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('loading') : t('markPaidConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settlements;
