import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { baseRequestConfig, BASE_URL, REQUEST_TIMEOUT_MS } from './config';
import { toApiError } from './errors';
import { getAuthToken, notifyUnauthorized } from '@/services/auth/tokenProvider';

/**
 * Centralized axios client. All feature services are expected to go through
 * this instance — screens never create raw axios calls.
 *
 * - base URL / timeout come from config/env
 * - `Authorization: Bearer <token>` is attached automatically
 * - transport + HTTP error responses are normalized to `ApiError`
 *
 * Response bodies are NOT unwrapped: the backend uses inconsistent envelopes
 * (top-level auth responses vs `{ success, data }` reads), so services decide
 * which slice to read. See types/api.ts.
 */
export const client: AxiosInstance = axios.create(baseRequestConfig);

client.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      // The backend rejected our token (missing / expired / invalid / wrong
      // role) — tell the auth store to drop the stale session so protected
      // screens redirect to the auth routes.
      //
      // 403 is intentionally NOT handled here: the backend reserves 403 for
      // authenticated-but-forbidden business-rule outcomes (e.g. accepting
      // a request outside the eligible radius) that the caller should see
      // as an inline error, not a forced logout.
      notifyUnauthorized();
    }
    return Promise.reject(toApiError(error));
  }
);

/** Thin typed helpers so services write `api.get<...>(url)` and get types back. */
export const api = {
  get<T = unknown>(url: string, config?: Parameters<AxiosInstance['get']>[1]) {
    return client.get<T, AxiosResponse<T>>(url, config);
  },
  post<T = unknown>(url: string, data?: unknown, config?: Parameters<AxiosInstance['post']>[2]) {
    return client.post<T, AxiosResponse<T>>(url, data, config);
  },
  patch<T = unknown>(url: string, data?: unknown, config?: Parameters<AxiosInstance['patch']>[2]) {
    return client.patch<T, AxiosResponse<T>>(url, data, config);
  },
  put<T = unknown>(url: string, data?: unknown, config?: Parameters<AxiosInstance['put']>[2]) {
    return client.put<T, AxiosResponse<T>>(url, data, config);
  },
  delete<T = unknown>(url: string, config?: Parameters<AxiosInstance['delete']>[1]) {
    return client.delete<T, AxiosResponse<T>>(url, config);
  },
};

/** For debugging/tests. */
export function getBaseUrl(): string {
  return BASE_URL;
}

export function getTimeoutMs(): number {
  return REQUEST_TIMEOUT_MS;
}

export { BASE_URL };

export default client;