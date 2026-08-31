import { useSettingsStore, type AppLang, type ThemeMode } from '@/stores/settingsStore';
import { palettes, type Palette } from '@/theme/colors';

/** Convenience hook: active palette + language for the current settings. */
export function useAppTheme(): { palette: Palette; lang: AppLang; theme: ThemeMode } {
  const theme = useSettingsStore((s) => s.theme);
  const lang = useSettingsStore((s) => s.lang);
  return { palette: palettes[theme], lang, theme };
}