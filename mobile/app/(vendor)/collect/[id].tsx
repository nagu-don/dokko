import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  useCancelVendorPayment,
  useCompleteMockVendorPayment,
  useInitiateVendorPayment,
  useRecordVendorCashPayment,
  useRevokeVendorCashPayment,
  useVerifyVendorPayment,
  useVendorPaymentStatus,
} from '@/hooks/useVendorPayment';
import { useVendorAcceptedOrder } from '@/hooks/useVendorRequests';
import { t, money, num, tMsg } from '@/i18n';
import { getServerMessage, isApiError } from '@/services/api';
import { radius, spacing } from '@/theme';
import type { PaymentProvider, PaymentStatus, VendorPresentedOrder } from '@/types';
import { formatOrderDate } from '@/utils/date';
import { paymentStatusLabel, providerLabel } from '@/utils/paymentModel';
import { vendorPaymentStatusLabel } from '@/utils/vendorModel';

/**
 * Vendor payment / collection screen (Phase 11).
 *
 * The vendor payment flow is CUSTOMER PAYMENT COLLECTION:
 *  - The vendor initiates a digital payment (server generates a QR the
 *    customer scans) via POST /api/vendors/payments/initiate/:orderId.
 *  - If the customer pays cash, the vendor records it via
 *    POST /api/vendors/payments/cash/:orderId.
 *  - Once a digital payment is received, the vendor can trigger server-side
 *    verification via POST /api/vendors/payments/verify/:paymentId.
 *
 * All money values are SERVER-AUTHORITATIVE. The app never computes amounts
 * and never submits one. Provider secrets stay server-side.
 *
 * Polling: after a payment is initiated we poll GET
 * /api/vendors/payments/status/:paymentId (3s) while it is non-terminal.
 * The vendor NEVER auto-repeats a state-changing action; a transport timeout
 * shows an "uncertain" notice and the on-screen/backend state is resolved by
 * re-querying the payment status or the accepted-order list.
 */
export default function VendorCollectPaymentScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, orderJson } = useLocalSearchParams<{ id?: string; orderJson?: string }>();
  const orderId = typeof id === 'string' ? id : '';

  const paramOrder = parseOrderParam(orderJson);

  // Authoritative order from the accepted-orders cache; fall back to route param.
  const { data: cachedOrder, refetch } = useVendorAcceptedOrder(orderId);
  const order: VendorPresentedOrder | undefined = cachedOrder ?? paramOrder;

  // Payment attempt state (server-driven).
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [initiatedInfo, setInitiatedInfo] = useState<{
    provider: string;
    amount: number;
    expiresAt: string | null;
    reference?: string;
    qrData?: string;
  } | null>(null);

  const initiate = useInitiateVendorPayment();
  const recordCash = useRecordVendorCashPayment();
  const verify = useVerifyVendorPayment();
  const cancelPay = useCancelVendorPayment();
  const revokeCash = useRevokeVendorCashPayment();
  const completeMock = useCompleteMockVendorPayment();

  // Authoritative payment status polled from the server once we know paymentId.
  const statusQuery = useVendorPaymentStatus(paymentId ?? undefined);

  // When a payment is initiated, the server returns paymentId + QR data.
  useEffect(() => {
    if (initiate.isSuccess && initiate.data) {
      const d = initiate.data;
      setPaymentId(d.paymentId);
      setInitiatedInfo({
        provider: d.provider,
        amount: d.amount,
        expiresAt: d.expiresAt ?? null,
        reference: d.reference,
        qrData: d.qrData,
      });
    }
  }, [initiate.isSuccess, initiate.data]);

  // The polled attempt status is the server-authoritative one. When it becomes
  // terminal (verified/failed/expired/cancelled) the poll hook auto-stops.
  const attemptStatus = statusQuery.data?.status;

  const handleBack = () => {
    router.replace({ pathname: '/accepted/[id]', params: { id: orderId } });
  };

  const uncertain =
    !!initiate.error && isApiError(initiate.error) && !initiate.error.isServerResponse;

  // Determine the current view based on server-order paymentStatus + polled attempt status.
  const orderPaymentStatus = order?.paymentStatus;
  const view = resolveView(orderPaymentStatus, attemptStatus, paymentId);

  let content;

  if (!order) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorPaymentNotReady')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {t(lang, 'vendorAcceptedNotAssigned')}
        </Text>
        <Button title={t(lang, 'vendorGoToDashboard')} onPress={() => router.replace('/dashboard')} />
      </View>
    );
  } else {
    const amount = order.total;
    const canRecordCash =
      orderPaymentStatus === 'unpaid' || orderPaymentStatus === 'pending';
    const isCashOrder = orderPaymentStatus === 'completed';

    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {/* Header card: order + amount */}
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.codeRow}>
            <Text style={[styles.code, { color: palette.text }]}>{num(lang, order.code)}</Text>
            <View style={[styles.pill, { backgroundColor: palette.surface, borderColor: palette.primary }]}>
              <Text style={[styles.pillText, { color: palette.primary }]}>
                {vendorPaymentStatusLabel(lang, orderPaymentStatus)}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardTitle, { color: palette.textMuted }]}>
            {t(lang, 'vendorPaymentAmount')}
          </Text>
          <Text style={[styles.bigAmount, { color: palette.text }]}>{money(lang, amount)}</Text>
        </View>

        {uncertain ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              {t(lang, 'vendorPaymentUncertain')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'paymentUncertainHint')}
            </Text>
          </View>
        ) : null}

        {initiate.error && !uncertain ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {tMsg(lang, getServerMessage(initiate.error, t(lang, 'paymentInitFailed')))}
            </Text>
          </View>
        ) : null}

        {/* Digital payment in flight -> QR + status + verify/cancel */}
        {view === 'digitalPending' || view === 'needsVerify' ? (
          <PaymentAttemptCard
            lang={lang}
            palette={palette}
            status={attemptStatus ?? (orderPaymentStatus as PaymentStatus)}
            provider={initiatedInfo?.provider}
            amount={initiatedInfo?.amount}
            expiresAt={initiatedInfo?.expiresAt}
            reference={initiatedInfo?.reference}
            qrData={initiatedInfo?.qrData}
          />
        ) : null}

        {/* Success (digital verified or cash completed) */}
        {view === 'success' ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.primary }]}>
            <Text style={[styles.cardTitle, { color: palette.primary }]}>
              {t(lang, isCashOrder ? 'vendorPaymentCashRecorded' : 'vendorPaymentSuccess')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorPaymentSuccessHint')}
            </Text>
          </View>
        ) : null}

        {/* Expired / cancelled / failed terminal informational */}
        {view === 'expired' ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              {t(lang, 'vendorPaymentExpired')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorPaymentExpiredHint')}
            </Text>
          </View>
        ) : null}

        {view === 'failed' ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.danger }]}>
              {t(lang, 'vendorPaymentFailed')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorPaymentFailedHint')}
            </Text>
          </View>
        ) : null}

        {/* Actions */}
        {view === 'collectAction' || view === 'expired' || view === 'failed' ? (
          <View style={styles.actions}>
            {canRecordCash ? (
              <Button
                variant="secondary"
                title={t(lang, 'vendorPaymentCollectCash')}
                loading={recordCash.isPending}
                disabled={recordCash.isPending}
                onPress={() => recordCash.mutate(orderId)}
              />
            ) : null}
            <Button
              title={t(lang, 'vendorPaymentCollectDigital')}
              loading={initiate.isPending}
              disabled={initiate.isPending || recordCash.isPending}
              onPress={() => initiate.mutate({ orderId })}
            />
          </View>
        ) : null}

        {view === 'digitalPending' && paymentId ? (
          <View style={styles.actions}>
            <Button
              title={t(lang, 'vendorPaymentVerify')}
              variant="secondary"
              loading={verify.isPending}
              disabled={verify.isPending}
              onPress={() => verify.mutate(paymentId)}
            />
            <Button
              title={t(lang, 'vendorPaymentCancel')}
              variant="danger"
              loading={cancelPay.isPending}
              disabled={cancelPay.isPending}
              onPress={() => cancelPay.mutate(orderId)}
            />
          </View>
        ) : null}

        {view === 'needsVerify' && paymentId ? (
          <View style={styles.actions}>
            <Button
              title={t(lang, 'vendorPaymentVerify')}
              loading={verify.isPending}
              disabled={verify.isPending}
              onPress={() => verify.mutate(paymentId)}
            />
          </View>
        ) : null}

        {view === 'success' && isCashOrder ? (
          <View style={styles.actions}>
            <Button
              title={t(lang, 'vendorPaymentRevokeCash')}
              variant="danger"
              loading={revokeCash.isPending}
              disabled={revokeCash.isPending}
              onPress={() => revokeCash.mutate(orderId)}
            />
          </View>
        ) : null}

        {/* Dev-only mock completion (hidden behind a subtle link). */}
        {!isCashOrder && view !== 'success' ? (
          <Pressable
            onPress={() => {
              if (paymentId && !completeMock.isPending) completeMock.mutate(paymentId);
            }}
            disabled={!paymentId || completeMock.isPending}
            style={styles.mockLink}
            accessibilityRole="button"
          >
            {completeMock.isPending ? (
              <ActivityIndicator color={palette.textMuted} />
            ) : (
              <Text style={[styles.mockLinkText, { color: palette.textMuted }]}>
                {t(lang, 'vendorPaymentMockComplete')}
              </Text>
            )}
          </Pressable>
        ) : null}

        {recordCash.error ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {tMsg(lang, getServerMessage(recordCash.error, t(lang, 'paymentInitFailed')))}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'backAria')}
          hitSlop={8}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.backGlyph, { color: palette.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: palette.text }]} numberOfLines={1}>
          {t(lang, 'vendorPaymentTitle')}
        </Text>
        <Pressable
          onPress={() => refetch()}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.refreshText, { color: palette.primary }]}>
            {t(lang, 'vendorRefresh')}
          </Text>
        </Pressable>
      </View>
      {content}
    </View>
  );
}

function parseOrderParam(json: string | undefined): VendorPresentedOrder | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
      return parsed as unknown as VendorPresentedOrder;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Resolve the UI view from the server-authoritative sources:
 *  - order.paymentStatus (coarse: unpaid/pending/paid/failed/completed)
 *  - attemptStatus (polled via GET /payments/status/:paymentId, attempt-level)
 *
 * The server decides authoritative terminal states. A tallied "success" view
 * only appears when the order is actually paid or cash-completed.
 */
function resolveView(
  orderPaymentStatus: string | null | undefined,
  attemptStatus: PaymentStatus | undefined,
  paymentId: string | null
): 'collectAction' | 'digitalPending' | 'needsVerify' | 'success' | 'failed' | 'expired' {
  if (orderPaymentStatus === 'paid' || orderPaymentStatus === 'completed') {
    return 'success';
  }

  // A digital attempt exists. The polled attempt-status refines the view.
  if (paymentId) {
    // Poll has not returned yet — show the in-flight attempt (QR/pending).
    if (!attemptStatus) return 'digitalPending';

    switch (attemptStatus) {
      case 'payment_verified':
        return 'success';
      case 'payment_received':
        return 'needsVerify';
      case 'payment_failed':
      case 'amount_mismatch':
        return 'failed';
      case 'payment_expired':
        return 'expired';
      case 'cancelled':
        return 'failed';
      default:
        return 'digitalPending';
    }
  }

  // No payment in flight locally. Drive from the coarse order status.
  switch (orderPaymentStatus) {
    case 'failed':
      return 'failed';
    case 'pending':
    case 'unpaid':
    default:
      return 'collectAction';
  }
}

function PaymentAttemptCard({
  lang,
  palette,
  status,
  provider,
  amount,
  expiresAt,
  reference,
  qrData,
}: {
  lang: 'en' | 'np';
  palette: import('@/theme').Palette;
  status: string | null | undefined;
  provider?: string;
  amount?: number;
  expiresAt?: string | null;
  reference?: string;
  qrData?: string;
}) {
  const isQr = !!qrData;
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {isQr ? (
        <>
          <Text style={[styles.cardTitle, { color: palette.text }]}>
            {t(lang, 'vendorPaymentShowQr')}
          </Text>
          <Text style={[styles.stateHint, { color: palette.textMuted }]}>
            {t(lang, 'vendorPaymentPendingHint')}
          </Text>
          <View style={styles.qrWrap}>
            <Image source={{ uri: qrData } as never} style={styles.qr} resizeMode="contain" />
          </View>
        </>
      ) : (
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          {t(lang, 'vendorPaymentPending')}
        </Text>
      )}

      {provider ? (
        <View style={styles.attemptRow}>
          <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
            {t(lang, 'vendorPaymentMethod')}
          </Text>
          <Text style={[styles.attemptValue, { color: palette.text }]}>
            {providerLabel(lang, provider as PaymentProvider)}
          </Text>
        </View>
      ) : null}
      {amount != null ? (
        <View style={styles.attemptRow}>
          <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
            {t(lang, 'vendorPaymentAmount')}
          </Text>
          <Text style={[styles.attemptValue, { color: palette.text }]}>{money(lang, amount)}</Text>
        </View>
      ) : null}
      {reference ? (
        <View style={styles.attemptRow}>
          <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
            {t(lang, 'vendorPaymentReference')}
          </Text>
          <Text style={[styles.attemptValue, { color: palette.text }]}>{reference}</Text>
        </View>
      ) : null}
      {expiresAt ? (
        <View style={styles.attemptRow}>
          <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
            {t(lang, 'vendorPaymentExpiresAt')}
          </Text>
          <Text style={[styles.attemptValue, { color: palette.text }]}>
            {formatOrderDate(lang, expiresAt)}
          </Text>
        </View>
      ) : null}
      <View style={styles.attemptRow}>
        <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
          {t(lang, 'vendorPaymentStatus')}
        </Text>
        <Text style={[styles.statusValue, { color: palette.primary }]}>
          {paymentStatusLabel(lang, status as PaymentStatus)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  back: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
  },
  backGlyph: {
    fontSize: 34,
    fontWeight: '400',
    lineHeight: 36,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '700',
  },
  topTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  scroll: { flex: 1 },
  content: { gap: spacing.md },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  stateTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  stateHint: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  bigAmount: { fontSize: 30, fontWeight: '800' },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  code: { fontSize: 18, fontWeight: '800' },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  actions: { gap: spacing.sm },
  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  attemptLabel: { fontSize: 13 },
  attemptValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  statusValue: { fontSize: 13, fontWeight: '700' },
  qrWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  qr: { width: 240, height: 240 },
  inlineErrorText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  mockLink: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  mockLinkText: { fontSize: 12, textDecorationLine: 'underline' },
});
