import { api, ApiError, getServerMessage } from '@/services/api';
import type {
  ApiEnvelope,
  LatLng,
  UpdateVendorLocationInput,
  VendorPresentedOrder,
  VendorProfile,
} from '@/types';

/**
 * Vendor network layer. Endpoints mirror the backend EXACTLY (verified against
 * back-end/controllers/vendorController.js + vendorRouter.js):
 *
 *  - GET   /api/vendors/me             → profile (masked payout)
 *  - PATCH /api/vendors/location       → set/change working location
 *  - GET   /api/vendors/requests/new   → incoming, unclaimed requests
 *  - PATCH /api/vendors/requests/accept/:id → claim an order (Phase 10)
 *  - GET   /api/vendors/requests/accepted  → active/accepted orders (Phase 13)
 *  - GET   /api/vendors/requests/completed → completed order history (Phase 13)
 *
 * Boundary rules for this layer:
 *  - Every displayed value comes from the server; the app never computes
 *    distance/eligibility or fabricates availability state.
 *  - Acceptance is server-authoritative: the backend revalidates everything
 *    atomically (findOneAndUpdate with vendor:null guard). A 409 means
 *    another vendor won the race or the request expired/changed state.
 *  - No body is sent on accept; all data comes from server-side order state.
 */

export async function getVendorProfile(): Promise<VendorProfile> {
  const { data } = await api.get<ApiEnvelope<Partial<VendorProfile>> | undefined>(
    '/api/vendors/me'
  );

  if (!data || data.success !== true || !data.data || typeof data.data !== 'object') {
    throw new ApiError(getServerMessage(data, 'Failed to load profile'), {
      payload: data,
      status: 500,
      kind: 'http',
    });
  }

  const d = data.data;
  return {
    id: str(d.id),
    name: str(d.name),
    email: str(d.email),
    phone: str(d.phone),
    hasSetLocation: d.hasSetLocation === true,
    location: normalizeLatLng(d.location),
    payoutMethod: typeof d.payoutMethod === 'string' ? d.payoutMethod : undefined,
    payoutAccountHolder: strOrNull(d.payoutAccountHolder),
    payoutBankName: strOrNull(d.payoutBankName),
    payoutAccountNumber: strOrNull(d.payoutAccountNumber),
  };
}

/** Set/change the "working at" location chosen on the map. */
export async function updateVendorLocation(input: UpdateVendorLocationInput): Promise<LatLng> {
  const { data } = await api.patch<ApiEnvelope<{ lat?: unknown; lng?: unknown }>>(
    '/api/vendors/location',
    input
  );

  if (!data || data.success !== true) {
    throw new ApiError(getServerMessage(data, 'Failed to update location'), {
      payload: data,
      status: data?.success === false ? 400 : 500,
      kind: 'http',
    });
  }

  const lat = Number(data.data?.lat);
  const lng = Number(data.data?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError('Server response was incomplete', { status: 500, kind: 'http' });
  }
  return { lat, lng };
}

/**
 * Send the vendor's live GPS position while delivering an accepted order.
 * PATCH /api/vendors/live-location (authVendor, self-only).
 *
 * Server rules (verified in back-end/controllers/vendorController.js):
 *  - Only while the vendor has an active (Processing) assigned order → 409
 *    "No active delivery to track" otherwise.
 *  - Coordinates validated to |lat|<=90, |lng|<=180 → 400 otherwise.
 *  - A rate guard returns 429 if updates arrive too fast — the tracking loop
 *    should treat 429 as a back-off hint, not a hard error.
 *  - `data` echoes the stored { lat, lng, updatedAt } (updatedAt is server-set).
 */
export async function updateVendorLiveLocation(input: {
  lat: number;
  lng: number;
}): Promise<{ lat: number; lng: number; updatedAt: string }> {
  const { data } = await api.patch<
    ApiEnvelope<{ lat?: unknown; lng?: unknown; updatedAt?: unknown }>
  >('/api/vendors/live-location', input);

  if (!data || data.success !== true) {
    throw new ApiError(getServerMessage(data, 'Failed to update live location'), {
      payload: data,
      status: data?.success === false ? 409 : 500,
      kind: 'http',
    });
  }

  const lat = Number(data.data?.lat);
  const lng = Number(data.data?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError('Server response was incomplete', { status: 500, kind: 'http' });
  }
  return {
    lat,
    lng,
    updatedAt: typeof data.data?.updatedAt === 'string' ? data.data.updatedAt : '',
  };
}

/** Incoming requests — the SERVER decides which orders this vendor may see. */
export async function getNewRequests(): Promise<VendorPresentedOrder[]> {
  const { data } = await api.get<
    ApiEnvelope<unknown[]> | undefined
  >('/api/vendors/requests/new');

  if (!data || data.success !== true || !Array.isArray(data.data)) {
    throw new ApiError(getServerMessage(data, 'Failed to load new requests'), {
      payload: data,
      status: 500,
      kind: 'http',
    });
  }

  return data.data
    .map(normalizeRequest)
    .filter((r): r is VendorPresentedOrder => r !== null);
}

/** Accepted orders currently assigned to this vendor. */
export async function getAcceptedRequests(): Promise<VendorPresentedOrder[]> {
  const { data } = await api.get<
    ApiEnvelope<unknown[]> | undefined
  >('/api/vendors/requests/accepted');

  if (!data || data.success !== true || !Array.isArray(data.data)) {
    throw new ApiError(getServerMessage(data, 'Failed to load accepted orders'), {
      payload: data,
      status: 500,
      kind: 'http',
    });
  }

  return data.data
    .map(normalizeRequest)
    .filter((r): r is VendorPresentedOrder => r !== null);
}

/**
 * Completed orders assigned to this vendor (history).
 *
 * Backend semantics (back-end/controllers/vendorController.js
 * listCompletedRequests): orders where `paymentStatus === "completed"` for
 * THIS vendor, sorted by `updatedAt` desc. The backend drives the definition —
 * the app only renders what the server returns.
 */
export async function getCompletedRequests(): Promise<VendorPresentedOrder[]> {
  const { data } = await api.get<
    ApiEnvelope<unknown[]> | undefined
  >('/api/vendors/requests/completed');

  if (!data || data.success !== true || !Array.isArray(data.data)) {
    throw new ApiError(getServerMessage(data, 'Failed to load completed orders'), {
      payload: data,
      status: 500,
      kind: 'http',
    });
  }

  return data.data
    .map(normalizeRequest)
    .filter((r): r is VendorPresentedOrder => r !== null);
}

/** Best-effort normalization of a `presentOrder` payload into the UI shape. */
function normalizeRequest(raw: unknown): VendorPresentedOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<VendorPresentedOrder>;

  const id = str(o.id);
  if (!id) return null;

  const items = Array.isArray(o.items)
    ? o.items
        .filter((it): it is VendorPresentedOrder['items'][number] => !!it && typeof it === 'object')
        .map((it) => ({
          nameEng: str(it.nameEng),
          nameNep: typeof it.nameNep === 'string' ? it.nameNep : '',
          quantity: numOrZero(it.quantity),
          priceAtOrder: numOrZero(it.priceAtOrder),
        }))
    : [];

  return {
    id,
    code: str(o.code) || orderCodeFromId(id),
    customer: {
      name: typeof o.customer?.name === 'string' ? o.customer.name : '',
      phone: typeof o.customer?.phone === 'string' ? o.customer.phone : '',
      email: typeof o.customer?.email === 'string' ? o.customer.email : '',
    },
    dropoff: o.dropoff && typeof o.dropoff === 'object'
      ? normalizeDropoff(o.dropoff)
      : null,
    items,
    totalQuantity: numOrZero(o.totalQuantity),
    subtotal: numOrZero(o.subtotal),
    deliveryCharge: o.deliveryCharge == null ? null : numOrZero(o.deliveryCharge),
    additionalCharges: numOrZero(o.additionalCharges),
    total: numOrZero(o.total),
    status: typeof o.status === 'string' ? o.status : 'Pending',
    paymentStatus: typeof o.paymentStatus === 'string' ? o.paymentStatus : undefined,
    paymentMethod: o.paymentMethod == null ? null : String(o.paymentMethod),
    acceptedAt: strOrNull(o.acceptedAt),
    completedAt: strOrNull(o.completedAt),
    priorityStage: typeof o.priorityStage === 'string' ? o.priorityStage : '',
    createdAt: strOrEmpty(o.createdAt),
    distanceKm: typeof o.distanceKm === 'number' && Number.isFinite(o.distanceKm)
      ? o.distanceKm
      : undefined,
    isClosestVendor: o.isClosestVendor === true,
  };
}

function normalizeDropoff(raw: VendorPresentedOrder['dropoff']): VendorPresentedOrder['dropoff'] {
  const d = raw as { lat?: unknown; lng?: unknown; label?: unknown };
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    label: typeof d.label === 'string' && d.label ? d.label : undefined,
  };
}

function normalizeLatLng(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== 'object') return null;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  const nlat = Number(lat);
  const nlng = Number(lng);
  if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) return null;
  return { lat: nlat, lng: nlng };
}

/** Fallback display code when the backend payload omits it (web parity). */
function orderCodeFromId(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

function numOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function strOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

/**
 * Accept a request. PATCH /api/vendors/requests/accept/:id (authVendor).
 *
 * The backend atomically claims the order (vendor:null guard) and returns the
 * authoritative presentOrder with priorityStage=ASSIGNED, status=Processing,
 * deliveryCharge set by stage. No request body is read.
 *
 * Possible server errors mapped here:
 *  - 404 "Order not found"
 *  - 409 "This request is no longer available" (stage not searching)
 *  - 409 "This search stage has expired"
 *  - 409 "Your shop is currently unavailable to accept orders"
 *  - 403 "Location required to accept orders"
 *  - 403 "You are outside the delivery radius for this stage"
 *  - 409 "This request has already been taken" (race condition — another vendor won)
 *  - 500 "Failed to accept request"
 *
 * On network timeout the caller MUST NOT retry automatically — the outcome
 * is uncertain and must be resolved by querying the request list.
 */
export async function acceptRequest(orderId: string): Promise<VendorPresentedOrder> {
  const { data } = await api.patch<
    ApiEnvelope<unknown> | undefined
  >(`/api/vendors/requests/accept/${encodeURIComponent(orderId)}`);

  if (!data || data.success !== true || !data.data || typeof data.data !== 'object') {
    throw new ApiError(getServerMessage(data, 'Failed to accept request'), {
      payload: data,
      status: data?.success === false ? 409 : 500,
      kind: 'http',
    });
  }

  const order = normalizeRequest(data.data);
  if (!order) {
    throw new ApiError('Server response was incomplete', { status: 500, kind: 'http' });
  }
  return order;
}

/**
 * Complete a delivery. PATCH /api/vendors/requests/complete/:id (authVendor).
 *
 * The backend atomically transitions the order from Processing → Delivered
 * when vendor ownership, status, and payment prerequisite are all satisfied.
 * No request body is read.
 *
 * Possible server errors:
 *  - 404 "Order not found"
 *  - 403 "This order is not assigned to you"
 *  - 409 "Order already completed" (idempotent safe — already Delivered)
 *  - 409 "Only accepted orders can be completed" (wrong status)
 *  - 409 "Payment must be confirmed before completing delivery"
 *  - 409 "Order cannot be completed" (generic guard failure)
 *  - 500 "Failed to complete order"
 *
 * On network timeout the caller MUST NOT retry automatically — the outcome
 * is uncertain and must be resolved by querying the accepted order list.
 */
export async function completeRequest(orderId: string): Promise<VendorPresentedOrder> {
  const { data } = await api.patch<
    ApiEnvelope<unknown> | undefined
  >(`/api/vendors/requests/complete/${encodeURIComponent(orderId)}`);

  if (!data || data.success !== true || !data.data || typeof data.data !== 'object') {
    throw new ApiError(getServerMessage(data, 'Failed to complete order'), {
      payload: data,
      status: data?.success === false ? 409 : 500,
      kind: 'http',
    });
  }

  const order = normalizeRequest(data.data);
  if (!order) {
    throw new ApiError('Server response was incomplete', { status: 500, kind: 'http' });
  }
  return order;
}

function strOrEmpty(value: unknown): string {
  return value == null ? '' : String(value);
}