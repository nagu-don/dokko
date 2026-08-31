import type { ThemeMode } from '@/stores/settingsStore';

/**
 * Minimal light/dark palette for the foundation. Extended by the design
 * system in a later phase. Dokko's web UI uses green accent tones.
 */
export interface Palette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
}

export const palettes: Record<ThemeMode, Palette> = {
  light: {
    background: '#F7F7F5',
    surface: '#FFFFFF',
    text: '#1B1E1B',
    textMuted: '#6B7280',
    border: '#E5E7EB',
    primary: '#16A34A',
    primaryText: '#FFFFFF',
    danger: '#DC2626',
  },
  dark: {
    background: '#111411',
    surface: '#1C211C',
    text: '#F3F4F6',
    textMuted: '#9CA3AF',
    border: '#2A2F2A',
    primary: '#22C55E',
    primaryText: '#FFFFFF',
    danger: '#F87171',
  },
};