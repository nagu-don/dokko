// Devanagari digit conversion for the Nepali UI
const NEP_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

// convert every ASCII digit in a string/number to its Nepali counterpart
export const toNe = (value) =>
  String(value).replace(/\d/g, (d) => NEP_DIGITS[Number(d)]);
