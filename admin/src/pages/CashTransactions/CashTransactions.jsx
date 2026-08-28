import React, { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './CashTransactions.css'
import { getAuthHeaders, isAuthError } from '../../utils/api'
import { useAdminContext } from '../../context/AdminContext'

const CashTransactions = ({ url }) => {
  const { t, money } = useAdminContext()
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter === 'pending') params.status = 'pending'
      if (filter === 'deducted') params.status = 'deducted'

      const response = await axios.get(`${url}/api/admins/cash-transactions`, {
        headers: getAuthHeaders(),
        params,
      })
      if (response.data.success) {
        setTransactions(response.data.data)
        setSummary(response.data.summary)
      }
    } catch (error) {
      if (isAuthError(error)) {
        toast.error('Session expired. Please log in again.')
      } else {
        toast.error('Failed to load cash transactions')
      }
    } finally {
      setLoading(false)
    }
  }, [url, filter])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const formatDate = (iso) => {
    if (!iso) return 'N/A'
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className='cash-transactions-page'>
      <div className='cash-transactions-header'>
        <h1>{t('cashTransactionsTitle')}</h1>
        <p className='cash-transactions-subtitle'>{t('cashTransactionsSubtitle')}</p>
      </div>

      {summary && (
        <div className='cash-summary-cards'>
          <div className='cash-summary-card'>
            <span className='summary-label'>{t('totalCashPayments')}</span>
            <span className='summary-value'>{summary.totalCashPayments || 0}</span>
          </div>
          <div className='cash-summary-card'>
            <span className='summary-label'>{t('totalCashAmount')}</span>
            <span className='summary-value'>{money(summary.totalCashAmount || 0)}</span>
          </div>
          <div className='cash-summary-card'>
            <span className='summary-label'>{t('totalHandlingFees')}</span>
            <span className='summary-value'>{money(summary.totalHandlingFees || 0)}</span>
          </div>
          <div className='cash-summary-card card-pending'>
            <span className='summary-label'>{t('pendingFees')}</span>
            <span className='summary-value'>{money(summary.pendingFees || 0)}</span>
          </div>
          <div className='cash-summary-card card-deducted'>
            <span className='summary-label'>{t('deductedFees')}</span>
            <span className='summary-value'>{money(summary.deductedFees || 0)}</span>
          </div>
        </div>
      )}

      <div className='cash-filter-buttons'>
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t('all')}
        </button>
        <button
          className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          {t('pendingDeduction')}
        </button>
        <button
          className={`filter-btn ${filter === 'deducted' ? 'active' : ''}`}
          onClick={() => setFilter('deducted')}
        >
          {t('deducted')}
        </button>
      </div>

      {loading ? (
        <p className='cash-transactions-loading'>{t('loading')}</p>
      ) : transactions.length === 0 ? (
        <div className='cash-transactions-empty'>
          <p>{t('noCashTransactions')}</p>
        </div>
      ) : (
        <div className='cash-transactions-list'>
          <div className='cash-table-header'>
            <span>{t('order')}</span>
            <span>{t('vendor')}</span>
            <span>{t('amount')}</span>
            <span>{t('handlingFee')}</span>
            <span>{t('status')}</span>
            <span>{t('date')}</span>
          </div>
          {transactions.map((tx) => (
            <div className='cash-transaction-row' key={tx.paymentId}>
              <span className='tx-order'>#{tx.orderCode || tx.orderId?.slice(-6)}</span>
              <span className='tx-vendor'>{tx.vendorName || 'N/A'}</span>
              <span className='tx-amount'>{money(tx.amount)}</span>
              <span className='tx-fee'>{money(tx.cashHandlingFee)}</span>
              <span className={`tx-status ${tx.cashFeeDeducted ? 'status-deducted' : 'status-pending'}`}>
                {tx.cashFeeDeducted ? t('deducted') : t('pending')}
              </span>
              <span className='tx-date'>{formatDate(tx.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CashTransactions
