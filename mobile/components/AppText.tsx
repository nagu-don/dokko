import { Text, type TextProps, type TextStyle } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * App-wide <Text>. All screens/components import this instead of react-native's
 * `Text` directly (imported as `AppText` to keep call sites identical).
 *
 * When the vendor portal is in Nepali (`role==='vendor' && lang==='np'`) every
 * fontSize / lineHeight is multiplied by `NEPALI_TEXT_SCALE` (1.1) so devanagari
 * labels render comfortably. Every other context (customer portal, auth screens,
 * English mode) renders untouched — style objects are returned as-is so nothing
 * is recreated and layout is never re-derived.
 */
export const NEPALI_TEXT_SCALE = 1.1;

function scaleOne(style: TextStyle, factor: number): TextStyle {
  const next: TextStyle = { ...style };
  if (typeof style.fontSize === 'number') {
    next.fontSize = Math.round(style.fontSize * factor);
  }
  if (typeof style.lineHeight === 'number') {
    next.lineHeight = Math.round(style.lineHeight * factor);
  }
  return next;
}

type TextStyleInput = TextProps['style'];

function scaleStyle(style: TextStyleInput, factor: number): TextStyleInput {
  if (Array.isArray(style)) {
    return style.map((item) => scaleStyle(item as TextStyleInput, factor));
  }
  if (style && typeof style === 'object') {
    return scaleOne(style, factor);
  }
  return style;
}

export function AppText({ style, ...props }: TextProps) {
  const role = useAuthStore((s) => s.role);
  const lang = useSettingsStore((s) => s.lang);
  const scaleNext = role === 'vendor' && lang === 'np';
  return (
    <Text {...props} style={scaleNext ? scaleStyle(style, NEPALI_TEXT_SCALE) : style} />
  );
}