import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useUi } from '../../context/UiContext';
import LocationPicker from '../../components/map/LocationPicker';
import './Auth.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

// login / register card — entry is a utility, so it's themed red.
// after creating an account: language prompt -> pick working location on the
// map (GPS preselected, Kathmandu fallback) -> enter the portal.
const Auth = ({ url, onSignIn }) => {
  const { t, tMsg, setLang } = useUi();

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    identifier: '', name: '', email: '', phone: '', password: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleBtnRef = useRef(null);
  const googleInitialized = useRef(false);

  // pending session waiting on the post-registration prompts
  const [pendingAuth, setPendingAuth] = useState(null);
  // which onboarding step is showing: 'language' | 'settlement' | 'payoutForm' | 'location' | null
  const [onboardingStep, setOnboardingStep] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);

  // settlement onboarding state
  const [payoutMethod, setPayoutMethod] = useState(null);
  const [payoutForm, setPayoutForm] = useState({
    accountHolder: '', bankName: '', accountNumber: '',
  });
  const [payoutError, setPayoutError] = useState(null);
  const [savingPayout, setSavingPayout] = useState(false);

  // handle Google credential response
  const handleGoogleCredential = useCallback(async (response) => {
    setGoogleLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(`${url}/api/vendors/google`, {
        credential: response.credential,
      });
      if (!data.success) {
        setError(tMsg(data.message));
        return;
      }
      // treat Google sign-in as a login (skip registration onboarding)
      onSignIn({ token: data.token, name: data.user.name });
    } catch {
      setError(t('somethingWrong'));
    } finally {
      setGoogleLoading(false);
    }
  }, [url, onSignIn, t, tMsg]);

  // load Google Identity Services and render button
  useEffect(() => {
    if (googleInitialized.current) return;

    const loadGoogleScript = () => {
      if (window.google?.accounts?.id) {
        initGoogle();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    };

    const initGoogle = () => {
      if (googleInitialized.current || !window.google?.accounts?.id) return;
      googleInitialized.current = true;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
      });

      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'continue_with',
          shape: 'pill',
        });
      }
    };

    loadGoogleScript();
  }, [handleGoogleCredential]);

  const setField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleAuth = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const path = mode === 'login' ? '/api/vendors/login' : '/api/vendors/register';
      const body =
        mode === 'login'
          ? { identifier: form.identifier, password: form.password }
          : { name: form.name, email: form.email, phone: form.phone, password: form.password };

      const { data } = await axios.post(`${url}${path}`, body);

      if (!data.success) {
        setError(tMsg(data.message));
        return;
      }

      if (mode === 'register') {
        // new account -> ask for the preferred language first
        setPendingAuth({ token: data.token, name: data.user.name });
        setOnboardingStep('language');
      } else {
        onSignIn({ token: data.token, name: data.user.name });
      }
    } catch {
      setError(t('somethingWrong'));
    } finally {
      setBusy(false);
    }
  };

  const chooseLanguage = (lang) => {
    setLang(lang);
    // next onboarding step: choose settlement method
    setOnboardingStep('settlement');
  };

  const selectPayoutMethod = (method) => {
    setPayoutMethod(method);
    setPayoutForm({ accountHolder: '', bankName: '', accountNumber: '' });
    setPayoutError(null);
    setOnboardingStep('payoutForm');
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
        headers: { Authorization: `Bearer ${pendingAuth.token}` },
      });

      if (!data.success) {
        setPayoutError(tMsg(data.message));
        return;
      }

      // next onboarding step: pick the working location on the map
      setOnboardingStep('location');
    } catch {
      setPayoutError(t('somethingWrong'));
    } finally {
      setSavingPayout(false);
    }
  };

  const skipPayout = () => {
    // skip — go directly to location picker
    setOnboardingStep('location');
  };

  const confirmWorkingLocation = async (loc) => {
    setSavingLocation(true);
    try {
      await axios.patch(`${url}/api/vendors/location`, loc, {
        headers: { Authorization: `Bearer ${pendingAuth.token}` },
      });
    } catch {
      // non-fatal — the vendor can change it later from settings
    } finally {
      setSavingLocation(false);
      setPendingAuth(null);
      setOnboardingStep(null);
      onSignIn(pendingAuth);
    }
  };

  return (
    <>
      <form className='vendor-auth' onSubmit={handleAuth}>
        <h2>Dokko Vendor</h2>
        <p className='auth-sub'>
          {mode === 'login' ? t('loginSubtitle') : t('registerSubtitle')}
        </p>

        {/* Google Sign-In */}
        <div className='vendor-google-section'>
          <div ref={googleBtnRef} className='vendor-google-btn-wrapper'></div>
          {googleLoading && <p className='vendor-google-loading'>{t('pleaseWait')}</p>}
        </div>

        <div className='vendor-divider'>
          <span>{t('or')}</span>
        </div>

        {mode === 'register' && (
          <>
            <input placeholder={t('fullName')} value={form.name} onChange={setField('name')} required />
            <input placeholder={t('email')} type='email' value={form.email} onChange={setField('email')} required />
            <input placeholder={t('phone')} value={form.phone} onChange={setField('phone')} required />
          </>
        )}

        {mode === 'login' && (
          <input
            placeholder={t('identifier')}
            value={form.identifier}
            onChange={setField('identifier')}
            required
          />
        )}
        <input placeholder={t('password')} type='password' value={form.password} onChange={setField('password')} required />

        <button type='submit' className='auth-submit' disabled={busy}>
          {busy ? t('pleaseWait') : mode === 'login' ? t('loginBtn') : t('registerBtn')}
        </button>

        <button
          type='button'
          className='auth-toggle'
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? t('needAccount') : t('haveAccount')}
        </button>

        {error && <div className='auth-error'>{error}</div>}
      </form>

      {/* shown right after account creation */}
      {onboardingStep === 'language' && pendingAuth && (
        <div className='lang-prompt-overlay'>
          <div className='lang-prompt'>
            <h3>{t('chooseLanguageTitle')}</h3>
            <p>{t('chooseLanguageSub')}</p>
            <div className='lang-options'>
              <button onClick={() => chooseLanguage('en')}>English</button>
              <button onClick={() => chooseLanguage('np')}>नेपाली</button>
            </div>
          </div>
        </div>
      )}

      {/* choose settlement method */}
      {onboardingStep === 'settlement' && pendingAuth && (
        <div className='lang-prompt-overlay'>
          <div className='lang-prompt'>
            <h3>{t('settlementTitle')}</h3>
            <p>{t('settlementSub')}</p>
            <div className='lang-options'>
              <button onClick={() => selectPayoutMethod('bank')}>{t('bankAccount')}</button>
            </div>
          </div>
        </div>
      )}

      {/* payout details form */}
      {onboardingStep === 'payoutForm' && pendingAuth && (
        <div className='lang-prompt-overlay'>
          <div className='lang-prompt payout-form'>
            <h3>{t('payoutSetupTitle')}</h3>
            <input
              placeholder={t('accountHolderName')}
              value={payoutForm.accountHolder}
              onChange={setPayoutField('accountHolder')}
            />
            {payoutMethod === 'bank' && (
              <>
                <input
                  placeholder={t('bankNameLabel')}
                  value={payoutForm.bankName}
                  onChange={setPayoutField('bankName')}
                />
                <input
                  placeholder={t('accountNumber')}
                  value={payoutForm.accountNumber}
                  onChange={setPayoutField('accountNumber')}
                />
              </>
            )}
            {payoutError && <div className='auth-error'>{payoutError}</div>}
            <div className='payout-actions'>
              <button type='button' className='auth-toggle' onClick={skipPayout}>
                {t('skipPayout')}
              </button>
              <button type='button' className='auth-submit' onClick={savePayoutInfo} disabled={savingPayout}>
                {savingPayout ? t('pleaseWait') : t('savePayout')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* then the vendor picks where they work — GPS preselected */}
      {onboardingStep === 'location' && pendingAuth && (
        <LocationPicker
          title={t('setWorkingTitle')}
          onConfirm={confirmWorkingLocation}
          onClose={() => {
            // skipping is allowed — Kathmandu default stays on the account
            const session = pendingAuth;
            setPendingAuth(null);
            setOnboardingStep(null);
            onSignIn(session);
          }}
        />
      )}

      {savingLocation && (
        <div className='lang-prompt-overlay'>
          <div className='lang-prompt'>
            <h3>{t('pleaseWait')}</h3>
          </div>
        </div>
      )}
    </>
  );
};

export default Auth;
