import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { VendorNavBar, VendorRouteMap } from '@/components/vendor';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCompleteRequest, useVendorAcceptedOrder } from '@/hooks/useVendorRequests';
import { useVendorLiveLocation } from '@/hooks/useVendorTracking';
import { t, money, num, iname, tMsg } from '@/i18n';
import { getServerMessage, isApiError } from '@/services/api';
import { fs, lh, radius, spacing } from '@/theme';
import { formatOrderDate } from '@/utils/date';
import { unitOf } from '@/utils/itemDisplay';
import {
  vendorOrderStatusLabel,
  vendorPaymentStatusLabel,
  vendorPriorityStageLabel,
} from '@/utils/vendorModel';
import type { VendorPresentedOrder } from '@/types';

/**
 * Accepted-order screen (Phases 10+12). Shows server-authoritative order
 * data after a confirmed acceptance. Supports delivery completion.
 *
 * Order data comes from two sources:
 *  1. Route param `orderJson` — the mutation response serialized on navigation.
 *  2. Accepted orders cache — ['vendor','requests','accepted'] query.
 *
 * Completion flow (Phase 12):
 *  - "Complete Delivery" button shown when order is Processing + payment is
 *    paid/completed (server enforces prerequisites).
 *  - Confirmation dialog prevents accidental taps.
 *  - On success: shows completed state, prevents further actions.
 *  - On network uncertainty: shows advisory, does NOT auto-retry.
 *  - Duplicate taps are blocked by the submitting state (UX safeguard).
 *  - Server is authoritative for all state transitions.
 */
export default function VendorAcceptedOrderScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, orderJson } = useLocalSearchParams<{
    id?: string;
    orderJson?: string;
  }>();
  const orderId = typeof id === 'string' ? id : '';

  const paramOrder = parseOrderParam(orderJson);

  const {
    data: cachedOrder,
    isRefetching,
    refetch,
    isLoading,
    isError,
  } = useVendorAcceptedOrder(orderId);

  const order: VendorPresentedOrder | undefined = cachedOrder ?? paramOrder;

  // ── completion state ────────────────────────────────────────
  const [confirmVisible, setConfirmVisible] = useState(false);
  const completeMutation = useCompleteRequest();

  const handleBack = () => {
    router.replace('/accepted' as Href);
  };

  const handleRefresh = () => {
    void refetch();
  };

  // Completion is allowed when:
  //  - order exists and is Processing
  //  - payment is "paid" or "completed" (server enforces this too)
  const isProcessing = order?.status === 'Processing';
  const paymentReady =
    order?.paymentStatus === 'paid' || order?.paymentStatus === 'completed';
  const canComplete = isProcessing && paymentReady && orderId && !!order;

  // Already completed
  const isCompleted = order?.status === 'Delivered';

  // Foreground live-location reporting while delivering (Phase 14C).
  useVendorLiveLocation(isProcessing);

  // "Show in map" navigation modal (vendor web RouteMap parity).
  const [mapVisible, setMapVisible] = useState(false);

  const handleCompletePress = () => {
    setConfirmVisible(true);
  };

  const handleConfirmComplete = () => {
    setConfirmVisible(false);
    completeMutation.mutate(orderId);
  };

  const handleCancelComplete = () => {
    setConfirmVisible(false);
  };

  // Determine error message for display
  const completionError = completeMutation.error;
  let completionErrorMessage = '';
  if (completionError) {
    if (isApiError(completionError)) {
      const serverMsg = getServerMessage(
        completionError.payload,
        t(lang, 'vendorCompleteError')
      );
      completionErrorMessage = tMsg(lang, serverMsg);
      // Check for specific well-known errors
      if (serverMsg === 'Order already completed') {
        completionErrorMessage = t(lang, 'vendorCompleteAlreadyCompleted');
      } else if (serverMsg === 'Payment must be confirmed before completing delivery') {
        completionErrorMessage = t(lang, 'vendorCompletePaymentRequired');
      } else if (
        serverMsg === 'Only accepted orders can be completed' ||
        serverMsg === 'Order cannot be completed'
      ) {
        completionErrorMessage = t(lang, 'vendorCompleteInvalidState');
      } else if (serverMsg === 'This order is not assigned to you') {
        completionErrorMessage = t(lang, 'vendorCompleteNotAssigned');
      } else if (serverMsg === 'Order not found') {
        completionErrorMessage = t(lang, 'vendorCompleteNotFound');
      }
    } else if (
      !isApiError(completionError) ||
      !(completionError as { isServerResponse?: boolean }).isServerResponse
    ) {
      // Network / timeout uncertainty
      completionErrorMessage = t(lang, 'vendorCompleteUncertain');
    } else {
      completionErrorMessage = t(lang, 'vendorCompleteError');
    }
  }

  const completionUncertain =
    completeMutation.isError &&
    isApiError(completionError) &&
    !completionError.isServerResponse;

  let content;

  if (!order) {
    content = (
      <View style={styles.centered}>
        {isLoading && !isError ? (
          <Text style={[styles.stateTitle, { color: palette.text }]}>
            {t(lang, 'vendorAcceptedLoading')}
          </Text>
        ) : (
          <>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorAcceptedNotAssigned')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestsErrorHint')}
            </Text>
            <Button
              title={t(lang, 'vendorGoToDashboard')}
              onPress={() => router.replace('/dashboard')}
            />
          </>
        )}
      </View>
    );
  } else {
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={palette.primary}
          />
        }
      >
        {/* Banner: completion success */}
        {isCompleted ? (
          <View
            style={[
              styles.successBanner,
              { backgroundColor: palette.primary },
            ]}
          >
            <Text
              style={[styles.successBannerText, { color: palette.primaryText }]}
            >
              {t(lang, 'vendorCompleteSuccess')}
            </Text>
          </View>
        ) : null}

        {/* Order header */}
        <View
          style={[
            styles.headerCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={styles.codeRow}>
            <Text style={[styles.code, { color: palette.text }]}>
              {num(lang, order.code)}
            </Text>
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: isCompleted
                    ? palette.primary
                    : palette.primary,
                },
              ]}
            >
              <Text
                style={[styles.pillText, { color: palette.primaryText }]}
              >
                {vendorOrderStatusLabel(lang, order.status)}
              </Text>
            </View>
          </View>

          <View style={styles.stage}>
            <Text style={[styles.stageLabel, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestStage')}
            </Text>
            <Text style={[styles.stageValue, { color: palette.primary }]}>
              {vendorPriorityStageLabel(lang, order.priorityStage)}
            </Text>
          </View>

          {order.acceptedAt ? (
            <Text style={[styles.date, { color: palette.textMuted }]}>
              {t(lang, 'vendorAcceptedAt')}:{' '}
              {formatOrderDate(lang, order.acceptedAt)}
            </Text>
          ) : null}

          {isCompleted && order.completedAt ? (
            <Text style={[styles.date, { color: palette.textMuted }]}>
              {t(lang, 'completedAtLabel')}:{' '}
              {formatOrderDate(lang, order.completedAt)}
            </Text>
          ) : null}

          {order.createdAt ? (
            <Text style={[styles.date, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestPlaced')}:{' '}
              {formatOrderDate(lang, order.createdAt)}
            </Text>
          ) : null}
        </View>

        {/* Customer */}
        <Section title={t(lang, 'vendorRequestCustomer')} palette={palette}>
          <Text style={[styles.customerLine, { color: palette.text }]}>
            {order.customer.name}
          </Text>
          {order.customer.phone ? (
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestPhone')}:{' '}
              {num(lang, order.customer.phone)}
            </Text>
          ) : null}
        </Section>

        {/* Items */}
        <Section title={t(lang, 'itemSection')} palette={palette}>
          {order.items.map((row, idx) => (
            <View key={idx} style={styles.lineRow}>
              <View style={styles.lineMain}>
                <Text style={[styles.lineName, { color: palette.text }]}>
                  {iname(lang, row)}
                </Text>
                <Text style={[styles.lineMeta, { color: palette.textMuted }]}>
                  {num(lang, row.quantity)} {unitOf(lang, row)} ×{' '}
                  {money(lang, row.priceAtOrder)}/{unitOf(lang, row)}
                </Text>
              </View>
              <Text style={[styles.lineAmount, { color: palette.text }]}>
                {money(lang, row.quantity * row.priceAtOrder)}
              </Text>
            </View>
          ))}
          <View
            style={[styles.divider, { borderColor: palette.border }]}
          />
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'vendorRequestSubtotal')}
            value={money(lang, order.subtotal)}
          />
          {order.deliveryCharge != null ? (
            <AmountRow
              lang={lang}
              palette={palette}
              label={t(lang, 'vendorRequestDelivery')}
              value={money(lang, order.deliveryCharge)}
            />
          ) : null}
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'vendorRequestAdditional')}
            value={money(lang, order.additionalCharges)}
          />
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'vendorRequestTotal')}
            value={money(lang, order.total)}
            strong
          />
        </Section>

        {/* Drop-off map navigation */}
        {order.dropoff ? (
          <View style={styles.actions}>
            <Button title={t(lang, 'showInMap')} onPress={() => setMapVisible(true)} />
          </View>
        ) : null}

        {/* Payment */}
        <Section title={t(lang, 'orderPaymentSection')} palette={palette}>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: palette.textMuted }]}>
              {t(lang, 'vendorPaymentStatus')}
            </Text>
            <Text style={[styles.amountValue, { color: palette.text }]}>
              {vendorPaymentStatusLabel(lang, order.paymentStatus)}
            </Text>
          </View>
          {!isCompleted &&
          (order.paymentStatus === 'unpaid' ||
            order.paymentStatus === 'pending') ? (
            <Button
              title={t(
                lang,
                order.paymentStatus === 'pending'
                  ? 'orderPaymentView'
                  : 'vendorPaymentCollectDigital'
              )}
              onPress={() =>
                router.push({
                  pathname: '/collect/[id]',
                  params: { id: orderId, orderJson },
                })
              }
            />
          ) : null}
        </Section>

        {/* Completion / status card */}
        {isCompleted ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: palette.surface,
                borderColor: palette.primary,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: palette.primary }]}>
              {t(lang, 'vendorCompleteTitle')}
            </Text>
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {t(lang, 'vendorCompleteSuccessHint')}
            </Text>
            {order.completedAt ? (
              <Text style={[styles.date, { color: palette.textMuted }]}>
                {formatOrderDate(lang, order.completedAt)}
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            {/* Completion uncertain banner */}
            {completionUncertain ? (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={[styles.cardTitle, { color: palette.text }]}
                >
                  {t(lang, 'vendorCompleteUncertain')}
                </Text>
                <Text
                  style={[styles.stateHint, { color: palette.textMuted }]}
                >
                  {t(lang, 'paymentUncertainHint')}
                </Text>
                <Button
                  variant="secondary"
                  title={t(lang, 'vendorCompleteCheckAccepted')}
                  onPress={() => router.replace('/dashboard')}
                />
              </View>
            ) : null}

            {/* Completion error */}
            {completionErrorMessage && !completionUncertain ? (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.danger,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.inlineErrorText,
                    { color: palette.danger },
                  ]}
                >
                  {completionErrorMessage}
                </Text>
              </View>
            ) : null}

            {/* Complete delivery action */}
            {canComplete && !completeMutation.isSuccess ? (
              <View style={styles.actions}>
                <Button
                  title={t(lang, 'vendorCompleteTitle')}
                  loading={completeMutation.isPending}
                  disabled={completeMutation.isPending}
                  onPress={handleCompletePress}
                />
              </View>
            ) : null}

            {/* Completion success (after mutation — before cache refresh) */}
            {completeMutation.isSuccess ? (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.primary,
                  },
                ]}
              >
                <Text
                  style={[styles.cardTitle, { color: palette.primary }]}
                >
                  {t(lang, 'vendorCompleteSuccess')}
                </Text>
                <Text
                  style={[styles.stateHint, { color: palette.textMuted }]}
                >
                  {t(lang, 'vendorCompleteSuccessHint')}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <View
      style={[styles.screen, { backgroundColor: palette.background }]}
    >
      <VendorNavBar
        title={t(lang, isCompleted ? 'vendorCompleteTitle' : 'vendorAcceptedTitle')}
        onBack={handleBack}
        hideMenu
      />
      {content}

      {/* Confirmation dialog (inline modal) */}
      {confirmVisible ? (
        <View style={styles.overlay}>
          <View
            style={[
              styles.dialog,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.dialogTitle, { color: palette.text }]}>
              {t(lang, 'vendorCompleteConfirmTitle')}
            </Text>
            <Text style={[styles.dialogMessage, { color: palette.textMuted }]}>
              {t(lang, 'vendorCompleteConfirmMessage')}
            </Text>
            <View style={styles.dialogActions}>
              <Button
                variant="secondary"
                title={t(lang, 'vendorCompleteCancel')}
                onPress={handleCancelComplete}
              />
              <Button
                title={t(lang, 'vendorCompleteConfirm')}
                onPress={handleConfirmComplete}
              />
            </View>
          </View>
        </View>
      ) : null}

      {/* "Show in map" navigation modal */}
      {mapVisible && order && order.dropoff ? (
        <VendorRouteMap
          visible
          code={order.code}
          dropoff={order.dropoff}
          onClose={() => setMapVisible(false)}
        />
      ) : null}
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
    // invalid JSON — fall back to cache only
  }
  return undefined;
}

function Section({
  title,
  palette,
  children,
}: {
  title: string;
  palette: import('@/theme').Palette;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>
        {title}
      </Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function AmountRow({
  lang,
  palette,
  label,
  value,
  strong,
}: {
  lang: Parameters<typeof money>[0];
  palette: import('@/theme').Palette;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, { color: palette.textMuted }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.amountValue,
          { color: palette.text, fontWeight: strong ? '800' : '700' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  stateTitle: {
    fontSize: fs(17),
    fontWeight: '700',
    textAlign: 'center',
  },
  stateHint: {
    fontSize: fs(14),
    lineHeight: lh(20),
    textAlign: 'center',
  },
  successBanner: {
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  successBannerText: {
    fontSize: fs(14),
    fontWeight: '700',
  },
  headerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  code: {
    fontSize: fs(18),
    fontWeight: '800',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: fs(12),
    fontWeight: '700',
  },
  date: {
    fontSize: fs(12),
  },
  stage: {
    gap: spacing.xxs,
  },
  stageLabel: {
    fontSize: fs(12),
  },
  stageValue: {
    fontSize: fs(15),
    fontWeight: '700',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: fs(12),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  cardBody: {
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fs(16),
    fontWeight: '800',
  },
  customerLine: {
    fontSize: fs(15),
    fontWeight: '700',
  },
  meta: {
    fontSize: fs(13),
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  lineMain: {
    flex: 1,
    gap: spacing.xxs,
  },
  lineName: {
    fontSize: fs(14),
    fontWeight: '600',
  },
  lineMeta: {
    fontSize: fs(12),
  },
  lineAmount: {
    fontSize: fs(14),
    fontWeight: '700',
  },
  divider: {
    borderTopWidth: 1,
    marginVertical: spacing.xs,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountLabel: {
    fontSize: fs(13),
  },
  amountValue: {
    fontSize: fs(14),
  },
  noteCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  noteText: {
    fontSize: fs(13),
    lineHeight: lh(18),
    textAlign: 'center',
  },
  actions: {
    gap: spacing.sm,
  },
  inlineErrorText: {
    fontSize: fs(13),
    lineHeight: lh(18),
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialog: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 340,
  },
  dialogTitle: {
    fontSize: fs(17),
    fontWeight: '700',
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: fs(14),
    lineHeight: lh(20),
    textAlign: 'center',
  },
  dialogActions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
