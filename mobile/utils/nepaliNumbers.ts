// Devanagari digit conversion for the Nepali UI.
// Ported verbatim from front-end/src/utils/nepaliNumbers.js (Phase 0: SAFE, pure).
export const NEP_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/** Convert every ASCII digit in a string/number to its Nepali counterpart. */
export function toNe(value: string | number): string {
  return String(value).replace(/\d/g, (d) => NEP_DIGITS[Number(d)]);
}