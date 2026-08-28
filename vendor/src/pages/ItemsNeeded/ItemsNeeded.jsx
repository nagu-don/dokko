import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useUi } from '../../context/UiContext';
import { getAuthHeaders, isAuthError } from '../../utils/api';

const ItemsNeeded = ({ url, onLogout }) => {
  const { t, money, num, iname } = useUi();

  const [rows, setRows] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [notice, setNotice] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${url}/api/vendors/summary`, {
        headers: getAuthHeaders(),
      });
      setRows(data.data);
      setGrandTotal(data.grandTotal);
    } catch (error) {
      if (isAuthError(error)) onLogout();
      else setNotice({ type: 'error', text: t('loadFailedNew') });
    }
  }, [url, onLogout, t]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Refresh when page becomes visible (e.g., after completing an order in another tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        load();
      }
    };

    const handleFocus = () => {
      load();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [load]);

  // Poll for updates every 5 seconds to recalculate items when orders are completed
  useEffect(() => {
    const interval = setInterval(() => {
      load();
    }, 5000);

    return () => clearInterval(interval);
  }, [load]);

  const handleCheckAll = () => {
    const allChecked = {};
    rows.forEach((row) => {
      allChecked[row.nameEng] = true;
    });
    setCheckedItems(allChecked);
  };

  const handleUncheckAll = () => {
    setCheckedItems({});
  };

  const handleCheckboxChange = (nameEng) => {
    setCheckedItems((prev) => ({
      ...prev,
      [nameEng]: !prev[nameEng],
    }));
  };

  const handleOk = async () => {
    const itemsToHide = Object.keys(checkedItems).filter((key) => checkedItems[key]);

    if (itemsToHide.length === 0) {
      setNotice({ type: 'error', text: t('noItemsSelected') });
      return;
    }

    try {
      await axios.post(
        `${url}/api/vendors/summary/hide-items`,
        { itemNames: itemsToHide },
        { headers: getAuthHeaders() }
      );

      // Reload the list
      await load();
      setCheckedItems({});
      setNotice({ type: 'ok', text: t('itemsRemoved') });
    } catch (error) {
      setNotice({ type: 'error', text: t('failedToRemoveItems') });
    }
  };

  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  return (
    <>
      {notice && <div className={`vendor-notice ${notice.type}`}>{notice.text}</div>}

      <section className='vendor-section theme-summary'>
        <h3>{t('itemsNeededTitle')} <span>({num(rows.length)})</span></h3>

        {rows.length === 0 ? (
          <p className='empty-line'>{t('noOpenOrders')}</p>
        ) : (
          <>
            <table className='summary-table'>
              <thead>
                <tr>
                  <th className='checkbox-col'>
                    <input
                      type='checkbox'
                      checked={checkedCount === rows.length && rows.length > 0}
                      onChange={checkedCount === rows.length ? handleUncheckAll : handleCheckAll}
                      id='check-all'
                    />
                  </th>
                  <th>{t('itemCol')}</th>
                  <th>{t('quantityCol')}</th>
                  <th>{t('pricePerKgCol')}</th>
                  <th>{t('totalCol')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.nameEng} className={checkedItems[row.nameEng] ? 'row-checked' : ''}>
                    <td>
                      <input
                        type='checkbox'
                        checked={!!checkedItems[row.nameEng]}
                        onChange={() => handleCheckboxChange(row.nameEng)}
                      />
                    </td>
                    <td>{iname(row)}</td>
                    <td>{num(row.quantity)} {t('unitKg')}</td>
                    <td>{money(row.pricePerKg)}</td>
                    <td>{money(row.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  <td>{t('grandTotal')}</td>
                  <td></td>
                  <td></td>
                  <td>{money(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>

            <div className='items-needed-actions'>
              <span className='checked-count'>
                {checkedCount > 0 && `${checkedCount} ${t('selected')}`}
              </span>
              <button
                className='ok-btn'
                onClick={handleOk}
                disabled={checkedCount === 0}
              >
                {t('ok')}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
};

export default ItemsNeeded;
