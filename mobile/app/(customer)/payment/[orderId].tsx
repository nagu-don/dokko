import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/form';
import { BrandTopBar, BRAND_BG } from '@/components/BrandTopBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { myOrdersQueryKey } from '@/hooks/useMyOrders';
import { useInitiateOrderPayment, useOrderPaymentState } from '@/hooks/useOrderPayment';
import { t, money, tMsg } from '@/i18n';
import { getServerMessage, isApiError } from '@/services/api';
import { radius, spacing } from '@/theme';
import type { OrderPaymentState, PaymentProvider } from '@/types';
import { formatOrderDate } from '@/utils/date';
import {
  isTerminalPaymentStatus,
  paymentStatusLabel,
  paymentViewState,
  providerLabel,
} from '@/utils/paymentModel';

/**
 * Customer payment screen (Phase 8C). Enters via GET /api/orders/:orderId/payment,
 * actions via POST /api/orders/:orderId/payment (both order-owner-guarded).
 *
 * Money is ALWAYS server-authoritative: the app renders `state.amount` and the
 * attempt's own `payment.amount` — it never computes, assumes, or submits an
 * amount. Providers are chosen ONLY from the server's `availableProviders` list.
 *
 * Polling is handled by useOrderPaymentState (TanStack refetchInterval, 5s) and
 * STOPS once the order stops requiring payment or the attempt reaches a
 * terminal status — the screen never asks the server again after payment is
 * settled. See hooks/useOrderPayment.ts for the exact conditions.
 *
 * A transport-level initiate failure (no server response) shows the "uncertain"
 * panel instead of an error screen: the order may actually be paid, and the
 * status check keeps running. Server-rejected responses show their message.
 */
export default function PaymentScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === 'string' ? orderId : '';

  const { data, isLoading, isError, isRefetching, refetch } = useOrderPaymentState(id);
  const initiate = useInitiateOrderPayment(id);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const previousPaymentStatus = useRef<string | null>(null);

  useEffect(() => {
    const status = data?.payment?.status ?? null;
    if (
      previousPaymentStatus.current &&
      status &&
      status !== previousPaymentStatus.current &&
      isTerminalPaymentStatus(status)
    ) {
      queryClient.invalidateQueries({ queryKey: myOrdersQueryKey });
    }
    if (status !== previousPaymentStatus.current) {
      previousPaymentStatus.current = status;
    }
  }, [data?.payment?.status, queryClient]);

  useEffect(() => {
    if (!data?.availableProviders?.length) return;
    if (!selectedProvider || !data.availableProviders.includes(selectedProvider)) {
      setSelectedProvider(data.availableProviders[0]);
    }
  }, [data?.availableProviders, selectedProvider]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/orders');
    }
  };

  const openOrder = () => router.replace({ pathname: '/orders/[id]', params: { id } });

  const uncertain =
    !!initiate.error && isApiError(initiate.error) && !initiate.error.isServerResponse;

  const providerOptions = useMemo(
    () => (data?.availableProviders?.length ? data.availableProviders : []),
    [data?.availableProviders]
  );

  let content;
  if (isLoading && !data) {
    content = <LoadingView label={t(lang, 'paymentCheckStatus')} />;
  } else if (!data) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'paymentsErrorHint')}
        </Text>
        <Button title={t(lang, 'retry')} onPress={() => refetch()} />
      </View>
    );
  } else {
    const view = paymentViewState(data);
    const payableAmount = data.amount ?? data.payment?.amount ?? null;
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {isError && !isLoading ? (
          <View
            style={[
              styles.inlineError,
              { backgroundColor: palette.surface, borderColor: palette.danger },
            ]}
          >
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'paymentsErrorHint')}
            </Text>
          </View>
        ) : null}

        {uncertain ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              {t(lang, 'paymentUncertainTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'paymentUncertainHint')}
            </Text>
          </View>
        ) : null}

        {view === 'notRequired' ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              {t(lang, 'paymentNotRequiredTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'paymentNotRequiredHint')}
            </Text>
          </View>
        ) : null}

        {view === 'success' ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.primary }]}>
              {t(lang, 'paymentSuccessTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'paymentSuccessHint')}
            </Text>
            <View style={styles.amountRow}>
              <Text style={[styles.amountLabel, { color: palette.textMuted }]}>
                {t(lang, 'paymentAmountDue')}
              </Text>
              <Text style={[styles.amountValue, { color: palette.text }]}>
                {money(lang, payableAmount ?? data.payment?.amount ?? 0)}
              </Text>
            </View>
          </View>
        ) : null}

        {view === 'pending' || view === 'needsAction' ? (
          <>
            {payableAmount != null ? (
              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={[styles.cardTitle, { color: palette.textMuted }]}>
                  {t(lang, 'paymentAmountDue')}
                </Text>
                <Text style={[styles.bigAmount, { color: palette.text }]}>
                  {money(lang, payableAmount)}
                </Text>
              </View>
            ) : null}

            {data.payment ? (
              <AttemptCard data={data} lang={lang} palette={palette} />
            ) : null}
          </>
        ) : null}

        {view === 'expired' ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              {t(lang, 'paymentExpiredTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'paymentExpiredHint')}
            </Text>
          </View>
        ) : null}

        {view === 'failed' ? (
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.danger }]}>
              {t(lang, 'paymentFailedTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'paymentFailedHint')}
            </Text>
          </View>
        ) : null}

        {initiate.error && !uncertain ? (
          <View
            style={[
              styles.inlineError,
              { backgroundColor: palette.surface, borderColor: palette.danger },
            ]}
          >
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {tMsg(lang, getServerMessage(initiate.error, t(lang, 'paymentInitFailed')))}
            </Text>
          </View>
        ) : null}

        {view === 'needsAction' || view === 'expired' || view === 'failed' ? (
          data.canInitiate ? (
            <>
              {providerOptions.length > 1 ? (
                <View style={styles.providerRow}>
                  {providerOptions.map((p) => {
                    const active = selectedProvider === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setSelectedProvider(p)}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.providerChip,
                          {
                            backgroundColor: active ? palette.primary : palette.surface,
                            borderColor: active ? palette.primary : palette.border,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.providerChipText,
                            { color: active ? palette.primaryText : palette.text },
                          ]}
                        >
                          {providerLabel(lang, p as PaymentProvider)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <Button
                title={t(lang, 'paymentPay')}
                loading={initiate.isPending}
                disabled={initiate.isPending}
                onPress={() => {
                  const provider =
                    providerOptions.length > 1 ? selectedProvider ?? undefined : undefined;
                  initiate.mutate(provider);
                }}
              />
            </>
          ) : (
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'paymentAlreadyReceived')}
            </Text>
          )
        ) : null}

        {view === 'pending' ? (
          <View style={styles.checking}>
            <Text style={[styles.checkingText, { color: palette.textMuted }]}>
              {t(lang, 'paymentCheckStatus')}
            </Text>
          </View>
        ) : null}

        <Button
          variant="secondary"
          title={isRefetching ? t(lang, 'ordersLoading') : t(lang, 'ordersRefresh')}
          onPress={() => refetch()}
          loading={isRefetching}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.navBar, { backgroundColor: BRAND_BG, paddingTop: insets.top }]}>
        <BrandTopBar
          title={t(lang, 'paymentTitle')}
          onBack={handleBack}
          backAriaLabel={t(lang, 'backAria')}
        />
      </View>
      <View style={styles.body}>{content}</View>
    </View>
  );
}

function AttemptCard({
  data,
  lang,
  palette,
}: {
  data: OrderPaymentState;
  lang: 'en' | 'np';
  palette: import('@/theme').Palette;
}) {
  const payment = data.payment!;
  const isQr = !!payment.qrData;
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {isQr ? (
        <>
          <Text style={[styles.cardTitle, { color: palette.text }]}>
            {t(lang, 'paymentPendingTitle')}
          </Text>
          <Text style={[styles.stateHint, { color: palette.textMuted }]}>
            {t(lang, 'paymentQrHint')}
          </Text>
          <View style={styles.qrWrap}>
            <Image source={{ uri: payment.qrData }} style={styles.qr} resizeMode="contain" />
          </View>
        </>
      ) : (
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          {t(lang, 'paymentPendingTitle')}
        </Text>
      )}

      <View style={styles.attemptRow}>
        <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
          {t(lang, 'paymentProviderLabel')}
        </Text>
        <Text style={[styles.attemptValue, { color: palette.text }]}>
          {providerLabel(lang, payment.provider)}
        </Text>
      </View>
      {payment.reference ? (
        <View style={styles.attemptRow}>
          <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
            {t(lang, 'paymentReferenceLabel')}
          </Text>
          <Text style={[styles.attemptValue, { color: palette.text }]}>{payment.reference}</Text>
        </View>
      ) : null}
      {payment.expiresAt ? (
        <View style={styles.attemptRow}>
          <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
            {t(lang, 'paymentExpiresAt')}
          </Text>
          <Text style={[styles.attemptValue, { color: palette.text }]}>
            {formatOrderDate(lang, payment.expiresAt)}
          </Text>
        </View>
      ) : null}
      <View style={styles.attemptRow}>
        <Text style={[styles.attemptLabel, { color: palette.textMuted }]}>
          {t(lang, 'orderStatusLabel')}
        </Text>
        <Text style={[styles.statusValue, { color: palette.primary }]}>
          {paymentStatusLabel(lang, payment.status)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navBar: {
    paddingBottom: spacing.sm,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
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
  bigAmount: { fontSize: 28, fontWeight: '800' },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  amountLabel: { fontSize: 13 },
  amountValue: { fontSize: 14, fontWeight: '700' },
  inlineError: { borderRadius: radius.md, borderWidth: 1, padding: spacing.sm },
  inlineErrorText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  providerChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  providerChipText: { fontSize: 14, fontWeight: '700' },
  checking: { alignItems: 'center' },
  checkingText: { fontSize: 13 },
  qrWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  qr: { width: 240, height: 240 },
  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  attemptLabel: { fontSize: 13 },
  attemptValue: { fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  statusValue: { fontSize: 13, fontWeight: '700' },
});