import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Dev default: reach the backend that runs on the same machine as Metro.
 * - Physical device  -> the LAN host of `expo start` (derived from hostUri).
 * - Android emulator -> 10.0.2.2 maps to the host machine's localhost.
 * - iOS simulator    -> localhost works directly.
 */
function resolveDevHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    null;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return host;
  }
  return null;
}

function resolveApiBase(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim().replace(/\/+$/, '');
  }
  if (__DEV__) {
    const devHost = resolveDevHost();
    if (devHost) return `http://${devHost}:4000`;
    if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
    return 'http://localhost:4000';
  }
  throw new Error(
    'EXPO_PUBLIC_API_URL is not configured. Production builds require a deployed API base URL.'
  );
}

export const API_BASE_URL: string = resolveApiBase();

/** Milliseconds before a request is aborted. */
export const API_TIMEOUT_MS: number = Number(
  process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS ?? 15000
);

/** Backend serves item photos under `${API_BASE}/images/<filename>`. */
export const IMAGE_BASE_URL: string = API_BASE_URL;

export function buildImageUrl(filename?: string | null): string | undefined {
  if (!filename) return undefined;
  return `${IMAGE_BASE_URL}/images/${filename}`;
}

export function isDev(): boolean {
  return __DEV__;
}