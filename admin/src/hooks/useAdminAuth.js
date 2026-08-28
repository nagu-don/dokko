import { useEffect, useState } from 'react'

// reads the admin token from localStorage and stays in sync
// across components via the `admin-auth` window event
const useAdminAuth = () => {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || '');

  useEffect(() => {
    const sync = () => setToken(localStorage.getItem('adminToken') || '');
    window.addEventListener('admin-auth', sync);
    return () => window.removeEventListener('admin-auth', sync);
  }, []);

  return token;
};

export default useAdminAuth;
