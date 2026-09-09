import { useContext, useEffect, useState, useRef, useCallback } from 'react'
import axios from 'axios'
import './AuthPopup.css'
import logo from '../../assets/logo.svg'
import { Context } from '../../context/Context'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'

const AuthPopup = () => {
  const { url, setShowAuth, setAuthToken, showToast, t } = useContext(Context);

  // popup defaults to login — switch with the toggle below
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleBtnRef = useRef(null);
  const googleInitialized = useRef(false);

  // close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setShowAuth(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // handle Google credential response
  const handleGoogleCredential = useCallback(async (response) => {
    setGoogleLoading(true);
    setError('');
    try {
      const res = await axios.post(url + '/api/users/google', {
        credential: response.credential,
      });
      if (res.data.success) {
        setAuthToken(res.data.token);
        setShowAuth(false);
        showToast(t('welcomeBackToast', { name: res.data.user?.name ? `, ${res.data.user.name}` : '' }));
      } else {
        setError(res.data.message || t('somethingWrongToast'));
      }
    } catch (err) {
      setError(err.response?.data?.message || t('somethingWrongToast'));
    } finally {
      setGoogleLoading(false);
    }
  }, [url, setAuthToken, setShowAuth, showToast, t]);

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

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = mode === 'login' ? '/api/users/login' : '/api/users/register';
      const body =
        mode === 'login'
          ? { identifier: form.email.trim(), password: form.password }
          : {
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone.replace(/\D/g, ''),
              password: form.password,
            };

      const response = await axios.post(url + endpoint, body);

      if (response.data.success) {
        setAuthToken(response.data.token);
        setShowAuth(false);
        showToast(
          mode === 'login'
            ? t('welcomeBackToast', {
                name: response.data.user?.name ? `, ${response.data.user.name}` : '',
              })
            : t('accountCreatedToast')
        );
      } else {
        setError(response.data.message || t('somethingWrongToast'));
      }
    } catch (err) {
      setError(err.response?.status === 429 ? t('tooManyAttempts') : err.response?.data?.message || t('somethingWrongToast'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='auth-overlay' onClick={() => setShowAuth(false)}>
      <div className='auth-popup' onClick={(e) => e.stopPropagation()}>

        <button className='auth-close' onClick={() => setShowAuth(false)} aria-label='Close'>
          ×
        </button>

        <img src={logo} className='auth-logo' alt='Logo' />

        <div className='auth-tabs'>
          <button
            type='button'
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => mode !== 'login' && switchMode()}
          >
            {t('loginTab')}
          </button>
          <button
            type='button'
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => mode !== 'signup' && switchMode()}
          >
            {t('signupTab')}
          </button>
        </div>

        <h2>{mode === 'login' ? t('welcomeBackTitle') : t('createAccountTitle')}</h2>

        {/* Google Sign-In */}
        <div className='auth-google-section'>
          <div ref={googleBtnRef} className='auth-google-btn-wrapper'></div>
          {googleLoading && <p className='auth-google-loading'>{t('pleaseWait')}</p>}
        </div>

        <div className='auth-divider'>
          <span>{t('or')}</span>
        </div>

        <form onSubmit={handleSubmit}>

          {mode === 'signup' && (
            <>
              <input
                type='text'
                name='name'
                placeholder={t('fullName')}
                value={form.name}
                onChange={handleChange}
                required
                autoFocus
              />

              <input
                type='tel'
                name='phone'
                placeholder={t('phonePlaceholder')}
                value={form.phone}
                onChange={handleChange}
                inputMode='numeric'
                maxLength={10}
                pattern='\d{10}'
                title={t('phonePlaceholder')}
                required
              />
            </>
          )}

          <input
            type={mode === 'login' ? 'text' : 'email'}
            name='email'
            placeholder={mode === 'login' ? t('emailOrPhonePlaceholder') : t('emailAddress')}
            value={form.email}
            onChange={handleChange}
            required
            autoFocus={mode === 'login'}
          />

          <input
            type='password'
            name='password'
            placeholder={mode === 'signup' ? t('passwordPlaceholderSignup') : t('passwordPlaceholder')}
            value={form.password}
            onChange={handleChange}
            minLength={6}
            required
          />

          {error && <p className='auth-error'>{error}</p>}

          <button type='submit' className='auth-submit' disabled={loading}>
            {loading ? t('pleaseWait') : mode === 'login' ? t('authLoginBtn') : t('authSignupBtn')}
          </button>
        </form>

        <p className='auth-switch'>
          {mode === 'login' ? (
            <>{t('noAccountPrompt')} <span onClick={switchMode}>{t('signupLink')}</span></>
          ) : (
            <>{t('hasAccountPrompt')} <span onClick={switchMode}>{t('loginLink')}</span></>
          )}
        </p>

      </div>
    </div>
  );
};

export default AuthPopup;
