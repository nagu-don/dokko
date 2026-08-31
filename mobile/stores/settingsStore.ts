import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASYNC_SETTINGS_KEY } from '@/constants';

export type AppLang = 'en' | 'np';
export type ThemeMode = 'light' | 'dark';

interface SettingsState {
  lang: AppLang;
  theme: ThemeMode;
  setLang: (lang: AppLang) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

/**
 * Non-sensitive user preferences persisted to AsyncStorage (NOT SecureStore).
 * Same keys/values the web apps use ("dokkoLang"/"dokkoTheme" semantics).
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      lang: 'en',
      theme: 'light',

      setLang: (lang) => set({ lang }),

      setTheme: (theme) => set({ theme }),

      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
    }),
    {
      name: ASYNC_SETTINGS_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);