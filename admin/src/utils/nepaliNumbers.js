const NEP_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

export const toNe = (value) =>
  String(value).replace(/\d/g, (d) => NEP_DIGITS[Number(d)]);
