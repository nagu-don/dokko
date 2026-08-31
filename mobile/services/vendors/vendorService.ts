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
 *
 * Boundary rules for this layer:
 *  - Every displayed value comes from the server; the app never computes
 *    distance/eligibility or fabricates availability state.
 *  - Approval/acceptance, payments, payout and settlement endpoints exist on
 *    the backend but are deliberately NOT wired here (later phases).
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

function strOrEmpty(value: unknown): string {
  return value == null ? '' : String(value);
}