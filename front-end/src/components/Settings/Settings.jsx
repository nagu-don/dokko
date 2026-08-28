import { useEffect, useRef, useState } from 'react';
import { useContext } from 'react';
import { Context } from '../../context/Context';
import LocationPicker from '../map/LocationPicker';
import { loadPreferredDropoff, savePreferredDropoff } from '../../utils/location';
import './Settings.css';

const GearIcon = () => (
  <svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
    <circle cx='12' cy='12' r='3.2' />
    <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' />
  </svg>
);

const Segmented = ({ options, value, onChange }) => (
  <div className='dokko-seg'>
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

const Settings = () => {
  const { t, lang, setLang, theme, setTheme } = useContext(Context);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [preferred, setPreferred] = useState(loadPreferredDropoff);
  const rootRef = useRef(null);

  // close when clicking anywhere outside the gear/panel
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const savePreferred = (loc) => {
    savePreferredDropoff(loc);
    setPreferred(loc);
    setPicking(false);
  };

  return (
    <div
      className={`dokko-settings ${theme === 'dark' ? 'dokko-dark' : ''}`}
      ref={rootRef}
    >
      <button
        className='dokko-gear'
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t('settings')}
        title={t('settings')}
      >
        <GearIcon />
      </button>

      {open && (
        <div className='dokko-panel'>
          <h4>{t('settings')}</h4>

          <div className='dokko-row'>
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

          <div className='dokko-row'>
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

          <div className='dokko-row'>
            <span>{t('preferredDropoff')}</span>
            <div className='dokko-dropoff'>
              {/* only the name the user gave the place — no coordinates */}
              <small>
                {preferred?.label ? preferred.label : t('notSet')}
              </small>
              <button type='button' onClick={() => setPicking(true)}>
                {t('changeOnMap')}
              </button>
            </div>
          </div>
        </div>
      )}

      {picking && (
        <LocationPicker
          initial={preferred}
          title={t('selectPreferredTitle')}
          onConfirm={savePreferred}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};

export default Settings;
