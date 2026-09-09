import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import './AuthPopup.css'
import editIconImg from '../../assets/edit-icon.png'

const AuthPopup = ({ url, onClose }) => {
  // popup defaults to login — switch with the toggle below
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setToken = (value) => {
    if (value) localStorage.setItem('adminToken', value);
    else localStorage.removeItem('adminToken');
    window.dispatchEvent(new Event('admin-auth'));
  };

  // close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
      const endpoint = mode === 'login' ? '/api/admins/login' : '/api/admins/register';
      const body =
        mode === 'login'
          ? { email: form.email.trim(), password: form.password }
          : {
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone.replace(/\D/g, ''),
              password: form.password,
            };

      const response = await axios.post(url + endpoint, body);

      if (response.data.success) {
        setToken(response.data.token);
        onClose();
        toast.success(
          mode === 'login'
            ? `Logged in successfully. Welcome back${response.data.user?.name ? ', ' + response.data.user.name : ''}!`
            : 'Account created successfully. You are now logged in.'
        );
      } else {
        setError(response.data.message || 'Something went wrong');
      }
    } catch (err) {
      setError(err.response?.status === 429
        ? 'Too many attempts. Please try again later.'
        : (err.response?.data?.message || 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='auth-overlay' onClick={onClose}>
      <div className='auth-popup' onClick={(e) => e.stopPropagation()}>

        <button className='auth-close' onClick={onClose} aria-label='Close'>
          ×
        </button>

        <div className='auth-badge'>
          <img src={editIconImg} alt='' />
          <span>Admin Panel</span>
        </div>

        <div className='auth-tabs'>
          <button
            type='button'
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => mode !== 'login' && switchMode()}
          >
            Login
          </button>
          <button
            type='button'
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => mode !== 'signup' && switchMode()}
          >
            Sign Up
          </button>
        </div>

        <h2>{mode === 'login' ? 'Welcome back' : 'Create an admin account'}</h2>

        <form onSubmit={handleSubmit}>

          {mode === 'signup' && (
            <>
              <input
                type='text'
                name='name'
                placeholder='Full name'
                value={form.name}
                onChange={handleChange}
                required
                autoFocus
              />

              <input
                type='tel'
                name='phone'
                placeholder='Phone number (10 digits)'
                value={form.phone}
                onChange={handleChange}
                inputMode='numeric'
                maxLength={10}
                pattern='\d{10}'
                title='Phone number must be exactly 10 digits'
                required
              />
            </>
          )}

          <input
            type='email'
            name='email'
            placeholder='Email address'
            value={form.email}
            onChange={handleChange}
            required
            autoFocus={mode === 'login'}
          />

          <input
            type='password'
            name='password'
            placeholder={mode === 'signup' ? 'Password (min 6 characters)' : 'Password'}
            value={form.password}
            onChange={handleChange}
            minLength={6}
            required
          />

          {error && <p className='auth-error'>{error}</p>}

          <button type='submit' className='auth-submit' disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        <p className='auth-switch'>
          {mode === 'login' ? (
            <>Don&apos;t have an account? <span onClick={switchMode}>Sign up</span></>
          ) : (
            <>Already have an account? <span onClick={switchMode}>Log in</span></>
          )}
        </p>

      </div>
    </div>
  );
};

export default AuthPopup;
