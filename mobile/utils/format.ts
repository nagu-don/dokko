/**
 * Quantity / number helpers shared by cart + pricing display.
 * Ported from front-end/src/context/Context.jsx (pure, Phase 0: SAFE).
 */

/** Fine stepper increment for weight-based (kg) items. */
export const STEP = 0.1;
/** Stepper increment when bulk-buying (1 kg / 1 unit). */
export const BULK_STEP = 1;

/** Round to 1 decimal place (kg quantities). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Round to 2 decimal places (money display). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clamp a quantity into the valid range (0..999, 1dp). */
export function clampQuantity(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(999, Math.max(0, round1(value)));
}

/** Display form: kg keeps one decimal, count units render whole. */
export function qtyDisplay(value: number, isKg: boolean): string {
  return isKg ? value.toFixed(1) : String(Math.round(value));
}