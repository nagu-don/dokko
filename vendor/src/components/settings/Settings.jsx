import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useUi } from '../../context/UiContext';
import LocationPicker from '../map/LocationPicker';
import './Settings.css';

// icon-only gear button — no text label
const GearIcon = () => (
  <svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
    <circle cx='12' cy='12' r='3.2' />
    <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' />
  </svg>
);

const Segmented = ({ options, value, onChange }) => (
  <div className='seg'>
    {options.map((option) => (
      <button
        key={option.value}
        type='button'
        className={value === option.value ? 'on' : ''}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Settings = ({ url }) => {
  const { lang, setLang, theme, setTheme, t, tMsg } = useUi();
  const [open, setOpen] = useState(false);
  // working location + its picker
  const [workLoc, setWorkLoc] = useState(null);
  const [picking, setPicking] = useState(false);
  const rootRef = useRef(null);
  const token = localStorage.getItem('vendorToken');

  // payout state
  const [payout, setPayout] = useState(null);
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState(null);
  const [payoutForm, setPayoutForm] = useState({
    accountHolder: '', bankName: '', accountNumber: '',
  });
  const [payoutError, setPayoutError] = useState(null);
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);

  // close when clicking anywhere outside the gear/panel
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // load the saved working location and payout info whenever the panel opens
  useEffect(() => {
    if (!open || !token) return;
    axios
      .get(`${url}/api/vendors/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(({ data }) => {
        setWorkLoc(data.data?.location || null);
        setPayout({
          payoutMethod: data.data?.payoutMethod || null,
          payoutAccountHolder: data.data?.payoutAccountHolder || null,
          payoutBankName: data.data?.payoutBankName || null,
          payoutAccountNumber: data.data?.payoutAccountNumber || null,
        });
      })
      .catch(() => {});
  }, [open, token, url]);

  const saveWorkingLocation = async (loc) => {
    try {
      await axios.patch(`${url}/api/vendors/location`, loc, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWorkLoc(loc);
    } catch {
      /* leave the picker state as-is on failure */
    }
    setPicking(false);
  };

  const startEditPayout = () => {
    setPayoutMethod(payout?.payoutMethod || null);
    setPayoutForm({
      accountHolder: payout?.payoutAccountHolder || '',
      bankName: payout?.payoutBankName || '',
      accountNumber: '',
    });
    setPayoutError(null);
    setPayoutSaved(false);
    setEditingPayout(true);
  };

  const setPayoutField = (field) => (e) =>
    setPayoutForm((prev) => ({ ...prev, [field]: e.target.value }));

  const savePayoutInfo = async () => {
    setPayoutError(null);
    setSavingPayout(true);
    try {
      const body = {
        payoutMethod,
        payoutAccountHolder: payoutForm.accountHolder,
      };
      if (payoutMethod === 'bank') {
        body.payoutBankName = payoutForm.bankName;
        body.payoutAccountNumber = payoutForm.accountNumber;
      }

      const { data } = await axios.patch(`${url}/api/vendors/payout`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!data.success) {
        setPayoutError(tMsg(data.message));
        return;
      }

      setPayout(data.data);
      setEditingPayout(false);
      setPayoutSaved(true);
      setTimeout(() => setPayoutSaved(false), 3000);
    } catch {
      setPayoutError(t('somethingWrong'));
    } finally {
      setSavingPayout(false);
    }
  };

  const selectPayoutMethod = (method) => {
    setPayoutMethod(method);
    setPayoutForm({ accountHolder: '', bankName: '', accountNumber: '' });
    setPayoutError(null);
  };

  return (
    <div className='settings-root' ref={rootRef}>
      <button
        className='settings-gear'
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t('settings')}
        title={t('settings')}
      >
        <GearIcon />
      </button>

      {open && (
        <div className='settings-panel'>
          <h4>{t('settings')}</h4>

          <div className='setting-row'>
            <span>{t('languageLabel')}</span>
            <Segmented
              value={lang}
              onChange={setLang}
              options={[
                { value: 'en', label: 'English' },
                { value: 'np', label: 'नेपाली' },
              ]}
            />
          </div>

          <div className='setting-row'>
            <span>{t('themeLabel')}</span>
            <Segmented
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: t('themeLight') },
                { value: 'dark', label: t('themeDark') },
              ]}
            />
          </div>

          <div className='setting-row setting-col'>
            <span>{t('workingLocation')}</span>
            <div className='loc-row'>
              <small className='loc-value'>
                {workLoc
                  ? `${Number(workLoc.lat).toFixed(5)}, ${Number(workLoc.lng).toFixed(5)}`
                  : t('notSet')}
              </small>
              <button type='button' className='loc-btn' onClick={() => setPicking(true)}>
                {t('changeOnMap')}
              </button>
            </div>
          </div>

          <div className='setting-row setting-col'>
            <span>{t('payoutLabel')}</span>
            {payoutSaved && (
              <div className='payout-notice ok'>{t('payoutUpdated')}</div>
            )}
            {!editingPayout && (
              <div className='loc-row'>
                <small className='loc-value'>
                  {payout?.payoutMethod
                    ? `${payout.payoutMethod === 'bank' ? t('bankAccount') : ''} — ${
                        payout.payoutAccountNumber || ''
                      }`
                    : t('payoutNotSet')}
                </small>
                <button type='button' className='loc-btn' onClick={startEditPayout}>
                  {t('changePayout')}
                </button>
              </div>
            )}
            {editingPayout && (
              <div className='payout-edit'>
                <div className='seg payout-seg'>
                  <button
                    type='button'
                    className={payoutMethod === 'bank' ? 'on' : ''}
                    onClick={() => selectPayoutMethod('bank')}
                  >
                    {t('bankAccount')}
                  </button>
                </div>
                {payoutMethod && (
                  <>
                    <input
                      className='payout-input'
                      placeholder={t('accountHolderName')}
                      value={payoutForm.accountHolder}
                      onChange={setPayoutField('accountHolder')}
                    />
                    {payoutMethod === 'bank' && (
                      <>
                        <input
                          className='payout-input'
                          placeholder={t('bankNameLabel')}
                          value={payoutForm.bankName}
                          onChange={setPayoutField('bankName')}
                        />
                        <input
                          className='payout-input'
                          placeholder={t('accountNumber')}
                          value={payoutForm.accountNumber}
                          onChange={setPayoutField('accountNumber')}
                        />
                      </>
                    )}
                  </>
                )}
                {payoutError && <div className='auth-error'>{payoutError}</div>}
                <div className='payout-btn-row'>
                  <button type='button' className='auth-toggle' onClick={() => setEditingPayout(false)}>
                    {t('cancel')}
                  </button>
                  <button
                    type='button'
                    className='loc-btn'
                    onClick={savePayoutInfo}
                    disabled={savingPayout || !payoutMethod}
                  >
                    {savingPayout ? t('pleaseWait') : t('savePayout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* re-pick the "working at" spot on the map */}
      {picking && (
        <LocationPicker
          initial={workLoc}
          title={t('setWorkingTitle')}
          onConfirm={saveWorkingLocation}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};

export default Settings;
