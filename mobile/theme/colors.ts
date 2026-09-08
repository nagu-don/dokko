import type { ThemeMode } from '@/stores/settingsStore';

/**
 * Light/dark palette for the foundation. Dokko's web UI uses green accent
 * tones. The vendor portal adds per-section acoustic colors (green / blue /
 * yellow) mirroring vendor/src/index.css --accent-* — each with a matching
 * translucent tint used for the active nav link background.
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

  /** Vendor portal section accents (green/blue/yellow/purple) + their tint backgrounds. */
  accentGreen: string;
  accentGreenBg: string;
  accentBlue: string;
  accentBlueBg: string;
  accentYellow: string;
  accentYellowBg: string;
  accentPurple: string;
  accentPurpleBg: string;

  /**
   * Vendor portal per-section SCREEN backgrounds — the accent tint blended into
   * `background`, so the content area below the navbar is lightly colored by
   * the page's thematic color (green/blue/yellow/purple).
   */
  screenGreen: string;
  screenBlue: string;
  screenYellow: string;
  screenPurple: string;
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
    accentGreen: '#2b8a3e',
    accentGreenBg: 'rgba(47, 158, 68, 0.10)',
    accentBlue: '#1971c2',
    accentBlueBg: 'rgba(25, 113, 194, 0.12)',
    accentYellow: '#9a6700',
    accentYellowBg: 'rgba(240, 180, 0, 0.16)',
    accentPurple: '#722ed1',
    accentPurpleBg: 'rgba(114, 46, 209, 0.12)',
    screenGreen: '#E3EEE3',
    screenBlue: '#DCE7EF',
    screenYellow: '#F6ECCE',
    screenPurple: '#E7DFF1',
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
    accentGreen: '#69db7c',
    accentGreenBg: 'rgba(47, 158, 68, 0.15)',
    accentBlue: '#74c0fc',
    accentBlueBg: 'rgba(25, 113, 194, 0.18)',
    accentYellow: '#ffd43b',
    accentYellowBg: 'rgba(240, 180, 0, 0.18)',
    accentPurple: '#b37feb',
    accentPurpleBg: 'rgba(180, 120, 235, 0.18)',
    screenGreen: '#162919',
    screenBlue: '#122531',
    screenYellow: '#39310E',
    screenPurple: '#2E2638',
  },
};