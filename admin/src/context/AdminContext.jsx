import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { translations } from '../i18n/translations';
import { toNe } from '../utils/nepaliNumbers';

const AdminContext = createContext(null);

export const useAdminContext = () => useContext(AdminContext);

export const AdminProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('dokkoAdminLang') || 'en');
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const url = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

  useEffect(() => {
    localStorage.setItem('dokkoAdminLang', lang);
    document.documentElement.lang = lang === 'np' ? 'ne' : 'en';
  }, [lang]);

  const refreshAdmin = useCallback(async () => {
    // the provider only renders while an admin is logged in, so a missing
    // token is not a state change — just skip
    const token = localStorage.getItem('adminToken') || '';
    if (!token) return;
    try {
      const response = await axios.get(`${url}/api/admins/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCurrentAdmin(response.data.success ? response.data.data : null);
    } catch {
      setCurrentAdmin(null);
    }
  }, [url]);

  useEffect(() => {
    refreshAdmin();
    const sync = () => refreshAdmin();
    window.addEventListener('admin-auth', sync);
    return () => window.removeEventListener('admin-auth', sync);
  }, [refreshAdmin]);

  const canManageFinance = !!currentAdmin?.canManageFinance;

  const t = (key, vars) => {
    let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        str = str.replaceAll(`{${name}}`, String(value));
      }
    }
    return lang === 'np' ? toNe(str) : str;
  };

  const money = (n) => {
    const rounded = Math.round(Number(n || 0) * 100) / 100;
    const text = `${lang === 'np' ? 'रु.' : 'Rs.'} ${rounded}`;
    return lang === 'np' ? toNe(text) : text;
  };

  return (
    <AdminContext.Provider value={{ lang, setLang, t, money, currentAdmin, canManageFinance, refreshAdmin }}>
      {children}
    </AdminContext.Provider>
  );
};