import { toNe } from '@/utils/nepaliNumbers';
import { en } from './en';
import { np } from './np';
import type { AppLang } from '@/stores/settingsStore';

/**
 * i18n foundation. Helpers replicate front-end Context.jsx / UiContext.jsx
 * formatters exactly (pure, lang-parameterized instead of context-bound):
 *  - t(key, vars)        translate with {name} substitution, toNe in Nepali
 *  - money(n)            Rs. / रु.+ 2dp, localized
 *  - num(n)              standalone number, localized
 *  - iname(item)         item name in the active language
 *  - tMsg(message)       map raw backend messages to translated keys
 */
export const translations: Record<AppLang, Record<string, string>> = { en, np };

export type TKey = keyof typeof en;

export function t(lang: AppLang, key: string, vars?: Record<string, string | number>): string {
  let str = translations[lang]?.[key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replaceAll(`{${name}}`, String(value));
    }
  }
  return lang === 'np' ? toNe(str) : str;
}

export function money(lang: AppLang, n: number | string): string {
  const rounded = Math.round(Number(n || 0) * 100) / 100;
  const text = `${lang === 'np' ? 'रु.' : 'Rs.'} ${rounded}`;
  return lang === 'np' ? toNe(text) : text;
}

export function num(lang: AppLang, n: number | string): string {
  return lang === 'np' ? toNe(n) : String(n);
}

export function iname<T extends { nameNep?: string; nameEng?: string }>(
  lang: AppLang,
  item: T | undefined | null
): string {
  return lang === 'np' && item?.nameNep ? item.nameNep : (item?.nameEng ?? '');
}

/** Maps raw backend messages to translation keys so errors localize too. */
export const SERVER_MESSAGE_KEYS: Record<string, string> = {
  'Invalid email/phone or password': 'errInvalidCredentials',
  'Server did not return a session': 'errNoSession',
  'Server response was incomplete': 'errIncompleteResponse',
  'Email/phone and password are required': 'errAuthRequiredFields',
  'Failed to create account': 'errCreateFailed',
  'Failed to log in': 'errLoginFailed',
  'Google credential is required': 'errGoogleCredentialRequired',
  'Invalid Google credential': 'errGoogleInvalidCredential',
  'Google account must have an email': 'errGoogleNoEmail',
  'An account with this email already exists': 'errEmailExists',
  'An account with this phone number already exists': 'errPhoneExists',
  'An account with this email or phone already exists': 'errAccountExists',
  'Name, email, phone and password are required': 'errFieldsRequired',
  'Phone number must be exactly 10 digits': 'errPhoneDigits',
  'This phone number is already in use': 'errPhoneInUse',
  'Failed to update phone': 'errPhoneUpdateFailed',
  'Cart is empty': 'errOrderCartEmpty',
  'A valid delivery location is required': 'errOrderInvalidLocation',
  'One or more items no longer exist': 'errOrderItemMissing',
  'Failed to place order': 'errOrderPlaceFailed',
  'Password must be at least 6 characters': 'errPasswordShort',
  'This request has already been taken': 'errRequestTaken',
  'Order not found': 'errOrderNotFound',
  'This order is not assigned to you': 'errNotYourOrder',
  'Only accepted orders can be completed': 'errOnlyAccepted',
  'Valid payout method is required (bank)': 'errPayoutMethod',
  'Account holder name is required': 'errAccountHolderRequired',
  'Bank name is required': 'errBankNameRequired',
  'Account number is required': 'errAccountNumberRequired',
  'Payment already verified for this order': 'paymentDuplicate',
  'Payment gateway is not configured': 'paymentGatewayDown',
  'Payment provider "': 'paymentProviderUnavailable',
  'Payment provider error. Please try again.': 'paymentInitFailed',
  'Failed to initiate payment': 'paymentInitFailed',
  'Payment not found': 'paymentInitFailed',
  'Not authorised to check this payment': 'paymentInitFailed',
  'Not authorised to verify this payment': 'paymentInitFailed',
  'No provider transaction to verify yet': 'paymentInitFailed',
  'Failed to verify payment': 'paymentInitFailed',
  'Payment already received — awaiting confirmation': 'paymentAlreadyReceived',
  'Payment already recorded for this order': 'paymentDuplicate',
  'Delivery charge not finalized yet': 'errDeliveryChargePending',
  'Valid latitude and longitude are required': 'errVendorLocation',
  'Failed to load profile': 'errVendorProfile',
  'Failed to update location': 'errVendorLocationUpdate',
  'Failed to load new requests': 'errVendorRequests',
  'This request is no longer available': 'vendorAcceptStageExpired',
  'This search stage has expired': 'vendorAcceptStageExpired',
  'Your shop is currently unavailable to accept orders': 'vendorAcceptUnavailable',
  'Location required to accept orders': 'vendorAcceptLocationRequired',
  'You are outside the delivery radius for this stage': 'vendorAcceptRadiusExceeded',
  'Failed to accept request': 'vendorAcceptError',
  'Failed to load accepted orders': 'errVendorRequests',
  'Failed to complete order': 'vendorCompleteError',
  'Order already completed': 'vendorCompleteAlreadyCompleted',
  'Payment must be confirmed before completing delivery': 'vendorCompletePaymentRequired',
  'Order cannot be completed': 'vendorCompleteInvalidState',
  'Failed to load payment status': 'paymentInitFailed',
  'Failed to record cash payment': 'paymentInitFailed',
  'Failed to cancel payment': 'paymentInitFailed',
  'Failed to revoke cash payment': 'paymentInitFailed',
  'Failed to complete mock payment': 'paymentInitFailed',
  'Cash payment recorded successfully': 'vendorPaymentCashRecorded',
  'Payment cancelled successfully': 'vendorPaymentCancelled',
  'Cash payment revoked successfully': 'vendorPaymentCancelled',
  'Order is not in Processing status': 'vendorPaymentNotReady',
  'No active payment to cancel': 'vendorPaymentNotReady',
  'No cash payment found to revoke': 'vendorPaymentNotReady',
  'Payment verification successful': 'vendorPaymentSuccess',
  'Payment already verified': 'vendorPaymentSuccess',
  'Payment verification failed — try again or check later': 'vendorPaymentFailed',
  'No active delivery to track': 'vendorNoActiveDelivery',
  'Location update too frequent': 'vendorTrackTooFrequent',
  'Failed to update live location': 'vendorTrackUpdateFailed',
  'You can only track your own orders': 'errNotYourOrder',
  'Failed to load vendor location': 'trackingLoadFailed',
  'Failed to fetch vendor location': 'trackingLoadFailed',
  'Failed to load notices': 'vendorLoadFailedNotices',
  'Too many attempts. Please try again later.': 'errTooManyAttempts',
};

export function tMsg(lang: AppLang, message: string | undefined): string {
  if (!message) return '';
  const key = SERVER_MESSAGE_KEYS[message];
  return key ? t(lang, key) : message;
}