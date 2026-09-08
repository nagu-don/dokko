/**
 * Typography scale for the mobile app.
 *
 * `FONT_SCALE` (1.2) enlarges every fontSize/lineHeight declared in the app's
 * components. Use `fs()` for fontSize values and `lh()` for lineHeight values
 * so text (including Nepali devanagari) reads comfortably on small screens.
 */
export const FONT_SCALE = 1.2;

export function fs(size: number): number {
  return Math.round(size * FONT_SCALE);
}

export function lh(lineHeight: number): number {
  return Math.round(lineHeight * FONT_SCALE);
}