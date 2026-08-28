import { createContext, useContext, useEffect, useState } from 'react';
import { translations, SERVER_MESSAGE_KEYS } from '../i18n/translations';
import { toNe } from '../utils/nepaliNumbers';

const LANG_KEY = 'vendorLang';
const THEME_KEY = 'vendorTheme';

const UiContext = createContext(null);

export const UiProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || 'en');
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang === 'np' ? 'ne' : 'en';
  }, [lang]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // translate a key; in Nepali every number inside the result becomes Devanagari
  const t = (key, vars) => {
    let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        str = str.replaceAll(`{${name}}`, value);
      }
    }
    return lang === 'np' ? toNe(str) : str;
  };

  // backend messages translated when a mapping exists
  const tMsg = (message) => {
    const key = SERVER_MESSAGE_KEYS[message];
    return key ? t(key) : message;
  };

  // currency follows the language: Rs. / रु. — digits localized in Nepali
  const money = (n) => {
    const text = `${lang === 'np' ? 'रु.' : 'Rs.'} ${Math.round(Number(n || 0) * 100) / 100}`;
    return lang === 'np' ? toNe(text) : text;
  };

  // localize standalone numbers ("1.4" -> "१.४")
  const num = (n) => (lang === 'np' ? toNe(n) : String(n));

  // item names follow the language, falling back to English when missing
  // (orders placed before Nepali snapshots carry no nameNep)
  const iname = (row) =>
    lang === 'np' && row?.nameNep ? row.nameNep : row?.nameEng;

  return (
    <UiContext.Provider value={{ lang, setLang, theme, setTheme, t, tMsg, money, num, iname }}>
      {children}
    </UiContext.Provider>
  );
};

export const useUi = () => useContext(UiContext);
