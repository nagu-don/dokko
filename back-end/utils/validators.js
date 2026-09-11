/**
 * Shared input-validation helpers for registration and password flows.
 */

/**
 * Pragmatic RFC-5322-ish email check.
 * Rejects obviously malformed input (missing @, missing domain, etc.)
 * without attempting full spec compliance.
 */
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Strong password policy: at least 8 characters, and at least two of the
 * three classes: letters, digits, symbols.
 */
const isStrongPassword = (password) => {
  if (typeof password !== "string" || password.length < 8) return false;

  const hasLetters = /[a-zA-Z]/.test(password);
  const hasDigits = /[0-9]/.test(password);
  const hasSymbols = /[^a-zA-Z0-9]/.test(password);

  const classes = [hasLetters, hasDigits, hasSymbols].filter(Boolean).length;
  return classes >= 2;
};

export { isValidEmail, isStrongPassword };
