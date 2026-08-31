/**
 * Central key registry so storage keys never diverge between the
 * SecureStore/AsyncStorage wrappers and the auth/settings stores.
 */

// Sensitive: tokens + auth profile  -> expo-secure-store
export const SECURE_AUTH_TOKEN_KEY = 'dokko_auth_token';
export const SECURE_AUTH_USER_KEY = 'dokko_auth_user';

// Non-sensitive: persisted app state -> AsyncStorage
export const ASYNC_SETTINGS_KEY = 'dokko:settings';
export const ASYNC_CART_KEY = 'dokko:cart';
// Last confirmed drop-off point, remembered for the next checkout (mirrors
// the web app's `dokkoPreferredDropoff` localStorage key).
export const ASYNC_PREFERRED_DROPOFF_KEY = 'dokkoPreferredDropoff';

// Mirror of the web app's localStorage keys (kept for parity/documentation;
// the platform storage differs but the semantics stay the same).
export const LEGACY_WEB_KEYS = {
  cartItems: 'cartItems',
  authToken: 'authToken',
  vendorToken: 'vendorToken',
  adminToken: 'adminToken',
  lang: 'dokkoLang',
  theme: 'dokkoTheme',
  preferredDropoff: 'dokkoPreferredDropoff',
} as const;