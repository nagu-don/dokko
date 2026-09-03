import { api, ApiError, getServerMessage } from '@/services/api';
import type {
  ApiEnvelope,
  OrderListResponse,
  OrderRead,
  OrderReadItem,
  OrderVendorRef,
  OrderVendorLocationResponse,
} from '@/types';

/**
 * Customer order reading — GET /api/orders/my (authUser).
 *
 * Verified backend contract (back-end/controllers/orderController.js `myOrders`
 * + back-end/models/orderModel.js): returns `{ success, data: [ raw order ] }`
 * sorted createdAt desc, with `vendor` populated (name/phone) and `dropoff` as
 * GeoJSON `coordinates:[lng, lat]`. The response is a RAW mongoose doc, so we
 * normalize defensively into the `OrderRead` shape used by the UI:
 *  - dropoff.coordinates ([lng, lat]) is expanded into lat/lng for display.
 *  - unknown/optional fields fall back to safe defaults instead of crashing.
 *
 * This endpoint has NO client-side idempotency/correlation field — see the
 * uncertain-order recovery notes in the checkout surface. A new order is never
 * inferred from "newest first" here; callers decide correlation explicitly.
 */
export async function getMyOrders(): Promise<OrderRead[]> {
  const { data } = await api.get<OrderListResponse>('/api/orders/my');

  if (!data || data.success !== true || !Array.isArray(data.data)) {
    throw new ApiError(getServerMessage(data, 'Failed to load your orders'), {
      payload: data,
      status: 500,
      kind: 'http',
    });
  }

  return data.data.map(normalizeOrder);
}

/**
 * Read the assigned vendor's LIVE location for one of my orders.
 * GET /api/orders/:orderId/vendor-location (authUser, ownership-enforced).
 *
 * Verified backend contract (back-end/controllers/orderController.js
 * getOrderVendorLocation): `{ success, data: { tracking, vendor?, location } }`.
 *  - `tracking` is true ONLY while the order is Processing and assigned.
 *  - `location.lat/lng/+lastUpdatedAt` come from the vendor's dedicated
 *    `liveLocation` field (never the static working `location`).
 *  - 403 for another customer's order, 404 for a missing order.
 */
export async function getOrderVendorLocation(
  orderId: string
): Promise<OrderVendorLocationResponse> {
  const { data } = await api.get<
    ApiEnvelope<OrderVendorLocationResponse> | undefined
  >(`/api/orders/${encodeURIComponent(orderId)}/vendor-location`);

  if (!data || data.success !== true || !data.data || typeof data.data !== 'object') {
    throw new ApiError(getServerMessage(data, 'Failed to load vendor location'), {
      payload: data,
      status: data?.success === false ? 403 : 500,
      kind: 'http',
    });
  }

  return normalizeVendorLocation(data.data);
}

function normalizeVendorLocation(raw: unknown): OrderVendorLocationResponse {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<OrderVendorLocationResponse>;
  const tracking = d.tracking === true;

  let location: OrderVendorLocationResponse['location'] = null;
  const loc = d.location;
  if (loc && typeof loc === 'object') {
    const lat = Number((loc as { lat?: unknown }).lat);
    const lng = Number((loc as { lng?: unknown }).lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      location = {
        lat,
        lng,
        lastUpdatedAt:
          (loc as { lastUpdatedAt?: unknown }).lastUpdatedAt == null
            ? null
            : String((loc as { lastUpdatedAt?: unknown }).lastUpdatedAt),
      };
    }
  }

  let vendor: OrderVendorLocationResponse['vendor'] = null;
  const v = d.vendor;
  if (v && typeof v === 'object') {
    const id = typeof (v as { id?: unknown }).id === 'string' ? (v as { id: string }).id : '';
    vendor = {
      id,
      name: typeof (v as { name?: unknown }).name === 'string' ? (v as { name: string }).name : undefined,
    };
  }

  return { tracking, vendor, location };
}

/** Best-effort normalization of a raw mongoose order doc into OrderRead. */
function normalizeOrder(raw: unknown): OrderRead {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<OrderRead>;
  const id = typeof o._id === 'string' ? o._id : String(o._id ?? '');

  const items: OrderReadItem[] = Array.isArray(o.items)
    ? o.items
        .filter((it): it is OrderReadItem => !!it && typeof it === 'object')
        .map((it) => ({
          item: typeof it.item === 'string' ? it.item : undefined,
          nameEng: typeof it.nameEng === 'string' ? it.nameEng : '',
          nameNep: typeof it.nameNep === 'string' ? it.nameNep : '',
          quantity: numOrZero(it.quantity),
          priceAtOrder: numOrZero(it.priceAtOrder),
        }))
    : [];

  const dropoff = normalizeDropoff(o.dropoff);

  return {
    _id: id,
    items,
    totalQuantity: numOrZero(o.totalQuantity),
    subtotal: numOrZero(o.subtotal),
    deliveryCharge: o.deliveryCharge == null ? null : numOrZero(o.deliveryCharge),
    additionalCharges: numOrZero(o.additionalCharges),
    total: numOrZero(o.total),
    status: typeof o.status === 'string' ? o.status : 'Pending',
    priorityStage: typeof o.priorityStage === 'string' ? o.priorityStage : '',
    priorityStartedAt: strOrNull(o.priorityStartedAt),
    priorityExpiresAt: strOrNull(o.priorityExpiresAt),
    dropoff,
    vendor: normalizeVendor(o.vendor),
    acceptedAt: strOrNull(o.acceptedAt),
    completedAt: strOrNull(o.completedAt),
    paymentStatus: typeof o.paymentStatus === 'string' ? o.paymentStatus : undefined,
    paymentMethod: o.paymentMethod == null ? null : String(o.paymentMethod),
    createdAt: strOrEmpty(o.createdAt),
    updatedAt: strOrEmpty(o.updatedAt),
  };
}

function normalizeDropoff(raw: unknown): OrderRead['dropoff'] {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<OrderRead['dropoff'] & { coordinates?: unknown }>;
  if (!Array.isArray(d.coordinates) || d.coordinates.length < 2) return null;

  const lng = Number(d.coordinates[0]);
  const lat = Number(d.coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  return {
    type: typeof d.type === 'string' ? d.type : 'Point',
    coordinates: [lng, lat],
    label: typeof d.label === 'string' ? d.label : undefined,
    lat,
    lng,
  };
}

function normalizeVendor(raw: unknown): OrderRead['vendor'] {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Partial<OrderVendorRef>;
  return {
    _id: typeof v._id === 'string' ? v._id : String(v._id ?? ''),
    name: typeof v.name === 'string' ? v.name : undefined,
    phone: typeof v.phone === 'string' ? v.phone : undefined,
  };
}

function numOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function strOrEmpty(value: unknown): string {
  return value == null ? '' : String(value);
}
