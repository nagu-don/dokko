import { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';
import { toNe } from '../utils/nepaliNumbers';

const AdminContext = createContext(null);

export const useAdminContext = () => useContext(AdminContext);

export const AdminProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('dokkoAdminLang') || 'en');

  useEffect(() => {
    localStorage.setItem('dokkoAdminLang', lang);
    document.documentElement.lang = lang === 'np' ? 'ne' : 'en';
  }, [lang]);

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
    <AdminContext.Provider value={{ lang, setLang, t, money }}>
      {children}
    </AdminContext.Provider>
  );
};
