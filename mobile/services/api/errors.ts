import type { AxiosError } from 'axios';

/**
 * Central error normalization. Every rejected call behind the API client
 * rejects with an `ApiError` so screens / services switch on one type.
 *
 * The backend is inconsistent: most endpoints fail via real HTTP status
 * codes, but auth endpoints return HTTP 200 with `success:false`.
 * Both paths are normalized here.
 */
export class ApiError extends Error {
  readonly status?: number;
  readonly payload?: unknown;
  /** True when the server actually responded (any status, incl. 2xx/4xx/5xx). */
  readonly isServerResponse: boolean;
  /** Transport-level failure class: 'network' (no response) / 'timeout' / 'http' / 'unknown'. */
  readonly kind: 'network' | 'timeout' | 'http' | 'unknown';

  constructor(
    message: string,
    options: {
      status?: number;
      payload?: unknown;
      cause?: unknown;
      kind?: ApiError['kind'];
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.payload = options.payload;
    this.isServerResponse = options.status !== undefined || !!options.payload as unknown as boolean;
    this.kind = options.kind ?? (options.status !== undefined ? 'http' : 'unknown');
    // keep the prototype chain correct when transpiled
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

interface ErrorBody {
  message?: string;
  error?: string;
  errors?: { msg?: string; message?: string }[];
}

function extractMessage(status: number | undefined, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as ErrorBody;
    if (b.message) return b.message;
    if (b.error) return b.error;
    if (Array.isArray(b.errors) && b.errors[0]) {
      return b.errors[0].msg ?? b.errors[0].message ?? `Request failed with status ${status}`;
    }
  }
  if (status) {
    const label =
      status === 401
        ? 'Authentication failed'
        : status === 403
          ? 'Request was not permitted'
          : status === 404
            ? 'Requested resource was not found'
            : status === 500
              ? 'Server error'
              : 'Request failed';
    return `${label} (${status})`;
  }
  return 'Network request failed';
}

/**
 * Normalize any thrown value into an ApiError.
 * - Axios errors get status + response body preserved (so `success:false`
 *   payloads and server messages survive).
 * - Plain network failures become a friendly ApiError with no status.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (typeof error === 'object' && error !== null && 'isAxiosError' in error) {
    const axiosError = error as AxiosError<ErrorBody>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const isTimeout = axiosError.code === 'ECONNABORTED';
    const isNetwork = !axiosError.response;
    const kind: ApiError['kind'] = isNetwork ? (isTimeout ? 'timeout' : 'network') : 'http';
    const message =
      kind !== 'http' ? extractMessage(undefined, undefined) : extractMessage(status, body);
    return new ApiError(message, { status, payload: body, kind, cause: error });
  }

  if (error instanceof Error) {
    const lower = (error.message ?? '').toLowerCase();
    const kind: ApiError['kind'] = lower.includes('timeout')
      ? 'timeout'
      : /network|internet|failed to fetch|enotfound|econnrefused/.test(lower)
        ? 'network'
        : 'unknown';
    return new ApiError(error.message, { cause: error, kind });
  }

  return new ApiError('Unexpected error', { cause: error });
}

/**
 * Pull the human message out of a `success:false` payload (auth endpoints
 * return HTTP 200 with success:false instead of an error status).
 */
export function getServerMessage(payload: unknown, fallback = 'Something went wrong'): string {
  if (payload && typeof payload === 'object') {
    const message = (payload as ErrorBody).message;
    if (message) return message;
  }
  return fallback;
}