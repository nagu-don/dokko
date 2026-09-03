import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelVendorPayment,
  completeMockVendorPayment,
  getVendorPaymentStatus,
  initiateVendorPayment,
  recordVendorCashPayment,
  revokeVendorCashPayment,
  verifyVendorPayment,
} from '@/services/vendors/vendorPaymentService';
import { vendorAcceptedQueryKey } from './useVendorRequests';
import type {
  VendorCancelPaymentResponse,
  VendorCashPaymentResponse,
  VendorInitiatePaymentResponse,
  VendorPaymentStatusResponse,
  VendorVerifyPaymentResponse,
} from '@/types';
import { isTerminalPaymentStatus, isActivePaymentStatus } from '@/utils/paymentModel';

/**
 * Vendor payment server state (Phase 11).
 *
 * `useVendorPaymentStatus` polls GET /api/vendors/payments/status/:paymentId
 * ONLY while the payment is in a non-terminal state. Once the payment reaches
 * a terminal state (verified, failed, expired, cancelled, cash_recorded,
 * amount_mismatch), polling stops.
 *
 * Mutations are no-retry (one tap = one request). On success they invalidate
 * the accepted orders query so the order list refreshes paymentStatus.
 *
 * The vendor NEVER automatically repeats a state-changing operation.
 * Network uncertainty → query the server state to resolve.
 */

/** Polling interval for digital payment status — matches vendor web's 3s cadence. */
export const VENDOR_PAYMENT_POLL_MS = 3_000;

/** Query key for vendor payment status polling. */
export const vendorPaymentStatusQueryKey = (paymentId: string) =>
  ['vendor', 'payment', 'status', paymentId] as const;

/**
 * Poll payment status while the payment is in a non-terminal state.
 * Stops automatically when the server returns a terminal status.
 */
export function useVendorPaymentStatus(paymentId: string | undefined) {
  return useQuery<VendorPaymentStatusResponse>({
    queryKey: vendorPaymentStatusQueryKey(paymentId!),
    queryFn: () => getVendorPaymentStatus(paymentId!),
    staleTime: 5_000,
    enabled: !!paymentId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return VENDOR_PAYMENT_POLL_MS;
      if (isTerminalPaymentStatus(data.status)) return false;
      if (data.status === 'payment_received') return VENDOR_PAYMENT_POLL_MS;
      if (isActivePaymentStatus(data.status)) return VENDOR_PAYMENT_POLL_MS;
      return false;
    },
  });
}

/**
 * POST /payments/initiate/:orderId — start (or reuse) a digital payment.
 * On success: invalidates accepted orders (paymentStatus updates) and
 * the caller can use the returned paymentId to start polling.
 * retry=0: never auto-retry a state-changing mutation.
 */
export function useInitiateVendorPayment() {
  const queryClient = useQueryClient();
  return useMutation<VendorInitiatePaymentResponse, unknown, { orderId: string; provider?: string }>({
    mutationFn: ({ orderId, provider }) => initiateVendorPayment(orderId, provider),
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorAcceptedQueryKey });
    },
  });
}

/**
 * POST /payments/cash/:orderId — record a cash payment.
 * On success: invalidates accepted orders (paymentStatus → completed).
 */
export function useRecordVendorCashPayment() {
  const queryClient = useQueryClient();
  return useMutation<VendorCashPaymentResponse, unknown, string>({
    mutationFn: recordVendorCashPayment,
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorAcceptedQueryKey });
    },
  });
}

/**
 * POST /payments/verify/:paymentId — trigger verification.
 * On success: invalidates accepted orders (paymentStatus → paid if verified).
 * On success: also invalidates the payment status query.
 */
export function useVerifyVendorPayment() {
  const queryClient = useQueryClient();
  return useMutation<VendorVerifyPaymentResponse, unknown, string>({
    mutationFn: verifyVendorPayment,
    retry: 0,
    onSuccess: (_data, paymentId) => {
      queryClient.invalidateQueries({ queryKey: vendorPaymentStatusQueryKey(paymentId) });
      queryClient.invalidateQueries({ queryKey: vendorAcceptedQueryKey });
    },
  });
}

/**
 * POST /payments/cancel/:orderId — cancel an active digital payment.
 * On success: invalidates accepted orders (paymentStatus → unpaid).
 */
export function useCancelVendorPayment() {
  const queryClient = useQueryClient();
  return useMutation<VendorCancelPaymentResponse, unknown, string>({
    mutationFn: cancelVendorPayment,
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorAcceptedQueryKey });
    },
  });
}

/**
 * POST /payments/revoke-cash/:orderId — revoke a cash payment.
 * On success: invalidates accepted orders (paymentStatus → unpaid).
 */
export function useRevokeVendorCashPayment() {
  const queryClient = useQueryClient();
  return useMutation<VendorCancelPaymentResponse, unknown, string>({
    mutationFn: revokeVendorCashPayment,
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorAcceptedQueryKey });
    },
  });
}

/**
 * POST /payments/mock/:paymentId/complete — dev-only mock completion.
 * On success: invalidates payment status + accepted orders.
 * NOT for production.
 */
export function useCompleteMockVendorPayment() {
  const queryClient = useQueryClient();
  return useMutation<VendorVerifyPaymentResponse, unknown, string>({
    mutationFn: completeMockVendorPayment,
    retry: 0,
    onSuccess: (_data, paymentId) => {
      queryClient.invalidateQueries({ queryKey: vendorPaymentStatusQueryKey(paymentId) });
      queryClient.invalidateQueries({ queryKey: vendorAcceptedQueryKey });
    },
  });
}
