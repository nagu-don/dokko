import { API_BASE_URL, API_TIMEOUT_MS, buildImageUrl } from '@/config/env';
import type { AxiosRequestConfig } from 'axios';

/** Timeout shared by all requests. */
export const REQUEST_TIMEOUT_MS = API_TIMEOUT_MS;

/** Single source of truth for the base URL the axios client is built from. */
export const BASE_URL = API_BASE_URL;

/** Default headers for every JSON request. */
export const defaultHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
} as const;

export const baseRequestConfig: AxiosRequestConfig = {
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: defaultHeaders,
};

export { buildImageUrl };