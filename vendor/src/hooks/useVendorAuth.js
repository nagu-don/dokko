import { useEffect, useState } from 'react';

const TOKEN_KEY = 'vendorToken';
const NAME_KEY = 'vendorName';
const AUTH_EVENT = 'vendor-auth';

// keeps token/name in localStorage and syncs across tabs via an event
export default function useVendorAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [vendorName, setVendorName] = useState(() => localStorage.getItem(NAME_KEY) || '');

  useEffect(() => {
    const sync = () => {
      setToken(localStorage.getItem(TOKEN_KEY));
      setVendorName(localStorage.getItem(NAME_KEY) || '');
    };
    window.addEventListener(AUTH_EVENT, sync);
    return () => window.removeEventListener(AUTH_EVENT, sync);
  }, []);

  const signIn = ({ token: newToken, name }) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(NAME_KEY, name);
    window.dispatchEvent(new Event(AUTH_EVENT));
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
    window.dispatchEvent(new Event(AUTH_EVENT));
  };

  return { token, vendorName, signIn, signOut };
}
