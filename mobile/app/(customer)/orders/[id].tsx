import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/form';
import { BrandTopBar, BRAND_BG } from '@/components/BrandTopBar';
import { LiveTrackingMap } from '@/components/tracking';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMyOrder } from '@/hooks/useMyOrders';
import { t, money, num } from '@/i18n';
import { radius, spacing } from '@/theme';
import type { OrderRead, OrderReadItem } from '@/types';
import { formatOrderDate } from '@/utils/date';
import {
  isSearching,
  orderBucket,
  orderCode,
  orderStatusLabel,
  priorityStageLabel,
} from '@/utils/orderModel';
import { orderPaymentStatusLabel } from '@/utils/paymentModel';

/**
 * Customer order details / tracking. Shows the SERVER-authoritative state of a
 * single order from GET /api/orders/my, resolved through the SAME shared
 * TanStack query as the history list (['orders','mine']) — so polling is
 * owned once and this screen never opens a second request for the same order.
 *
 * - status  + priorityStage are displayed from the backend, never overwritten.
 * - item names/prices/quantities come from the ORDER SNAPSHOT (historical),
 *   not the current catalog — retired or re-priced items stay as ordered.
 * - dropoff + vendor come from the order's own historical fields.
 * - amounts are the backend's stored subtotal/delivery/charges/total.
 *
 * A read that fails keeps the last known server state and offers refresh (a
 * network failure is NOT treated as an order failure). 401/403 follow the
 * existing auth interceptor.
 */
export default function OrderDetailScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id : '';

  const { data: order, isLoading, isError, isRefetching, refetch } = useMyOrder(orderId);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/orders');
    }
  };

  const openList = () => router.replace('/orders');

  let content;
  if (isLoading && !order) {
    content = <LoadingView label={t(lang, 'ordersLoading')} />;
  } else if (!order) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'orderNotTrackable')}
        </Text>
        {isError ? (
          <Text style={[styles.stateHint, { color: palette.textMuted }]}>
            {t(lang, 'ordersErrorHint')}
          </Text>
        ) : null}
        <Button title={t(lang, 'viewOrders')} onPress={openList} />
      </View>
    );
  } else {
    const active = orderBucket(order) === 'active';
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {isError ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'ordersErrorHint')}
            </Text>
          </View>
        ) : null}

        <View style={[styles.headerCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.codeRow}>
            <Text style={[styles.code, { color: palette.text }]}>{orderCode(order)}</Text>
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: active ? palette.primary : palette.surface,
                  borderColor: active ? palette.primary : palette.border,
                },
              ]}
            >
              <Text
                style={[styles.pillText, { color: active ? palette.primaryText : palette.textMuted }]}
              >
                {orderStatusLabel(lang, order)}
              </Text>
            </View>
          </View>

          {order.createdAt ? (
            <Text style={[styles.date, { color: palette.textMuted }]}>
              {t(lang, 'orderDate')}: {formatOrderDate(lang, order.createdAt)}
            </Text>
          ) : null}

          <View style={styles.stage}>
            <Text style={[styles.stageLabel, { color: palette.textMuted }]}>
              {isSearching(order) || order.priorityStage === 'ASSIGNED'
                ? t(lang, 'priorityStageLabel2')
                : t(lang, 'orderStatusLabel')}
            </Text>
            <Text style={[styles.stageValue, { color: palette.primary }]}>
              {priorityStageLabel(lang, order)}
            </Text>
          </View>
        </View>

        <LiveTrackingMap order={order} />

        <Section title={t(lang, 'itemSection')} palette={palette}>
          {order.items.map((item, idx) => (
            <LineRow key={idx} lang={lang} palette={palette} item={item} />
          ))}
          <View style={[styles.divider, { borderColor: palette.border }]} />
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'orderSubtotal')}
            value={money(lang, order.subtotal)}
          />
          {order.deliveryCharge != null ? (
            <AmountRow
              lang={lang}
              palette={palette}
              label={t(lang, 'orderDelivery')}
              value={money(lang, order.deliveryCharge)}
            />
          ) : (
            <Text style={[styles.pendingCharge, { color: palette.textMuted }]}>
              {t(lang, 'checkoutNote')}
            </Text>
          )}
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'orderAdditionalCharges')}
            value={money(lang, order.additionalCharges)}
          />
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'orderTotal')}
            value={money(lang, order.total)}
            strong
          />
        </Section>

        <Section title={t(lang, 'orderPaymentSection')} palette={palette}>
          <View style={styles.paymentRow}>
            <Text style={[styles.paymentLabel, { color: palette.textMuted }]}>
              {t(lang, 'orderStatusLabel')}
            </Text>
            <Text style={[styles.paymentValue, { color: palette.text }]}>
              {orderPaymentStatusLabel(lang, order.paymentStatus)}
            </Text>
          </View>
          {order.status === 'Processing' && order.paymentStatus === 'unpaid' ? (
            <Button
              title={t(lang, 'orderPaymentPayNow')}
              onPress={() =>
                router.push({ pathname: '/payment/[orderId]', params: { orderId: order._id } })
              }
            />
          ) : (
            <>
              {order.paymentStatus === 'unpaid' ? (
                <Text style={[styles.paymentHint, { color: palette.textMuted }]}>
                  {t(lang, 'orderPaymentNotReady')}
                </Text>
              ) : null}
              {order.paymentStatus === 'pending' ? (
                <Text style={[styles.paymentHint, { color: palette.textMuted }]}>
                  {t(lang, 'orderPaymentReceivedNote')}
                </Text>
              ) : null}
              {(order.paymentStatus === 'pending' ||
                order.paymentStatus === 'failed' ||
                order.paymentStatus === 'refunded') && (
                <Button
                  variant="secondary"
                  title={t(lang, 'orderPaymentView')}
                  onPress={() =>
                    router.push({ pathname: '/payment/[orderId]', params: { orderId: order._id } })
                  }
                />
              )}
            </>
          )}
        </Section>

        <Section title={t(lang, 'dropoffSection')} palette={palette}>
          {order.dropoff ? (
            <>
              {order.dropoff.label ? (
                <Text style={[styles.labelText, { color: palette.text }]}>{order.dropoff.label}</Text>
              ) : null}
              <Text style={[styles.meta, { color: palette.textMuted }]}>
                {t(lang, 'dropoffCoords', {
                  lat: num(lang, order.dropoff.lat?.toFixed(5) ?? ''),
                  lng: num(lang, order.dropoff.lng?.toFixed(5) ?? ''),
                })}
              </Text>
            </>
          ) : (
            <Text style={[styles.meta, { color: palette.textMuted }]}>{t(lang, 'dropoffNotSet')}</Text>
          )}
        </Section>

        <Section title={t(lang, 'vendorSection')} palette={palette}>
          {order.vendor ? (
            <>
              {order.vendor.name ? (
                <Text style={[styles.labelText, { color: palette.text }]}>{order.vendor.name}</Text>
              ) : null}
              {order.vendor.phone ? (
                <Text style={[styles.meta, { color: palette.textMuted }]}>{order.vendor.phone}</Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {isSearching(order) ? t(lang, 'notYetAssigned') : t(lang, 'stageNoVendor')}
            </Text>
          )}
        </Section>

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
          title={t(lang, 'trackOrderTitle')}
          onBack={handleBack}
          backAriaLabel={t(lang, 'backAria')}
        />
      </View>
      <View style={styles.body}>{content}</View>
    </View>
  );
}

function LineRow({
  lang,
  palette,
  item,
}: {
  lang: Parameters<typeof money>[0];
  palette: import('@/theme').Palette;
  item: OrderReadItem;
}) {
  const name = lang === 'np' && item.nameNep ? item.nameNep : item.nameEng;
  return (
    <View style={styles.lineRow}>
      <View style={styles.lineMain}>
        <Text style={[styles.lineName, { color: palette.text }]}>{name}</Text>
        <Text style={[styles.lineMeta, { color: palette.textMuted }]}>
          {money(lang, item.priceAtOrder)}/{t(lang, 'unitKg')} · {num(lang, item.quantity.toFixed(1))}{' '}
          {t(lang, 'unitKg')}
        </Text>
      </View>
      <Text style={[styles.lineAmount, { color: palette.text }]}>
        {money(lang, item.quantity * item.priceAtOrder)}
      </Text>
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
      <Text style={[styles.amountLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text
        style={[
          styles.amountValue,
          { color: palette.text, fontWeight: strong ? '800' : '600' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
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
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
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
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
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
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateHint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  inlineError: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  inlineErrorText: {
    fontSize: 13,
    lineHeight: 18,
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
    fontSize: 18,
    fontWeight: '800',
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  date: {
    fontSize: 12,
  },
  stage: {
    gap: spacing.xxs,
  },
  stageLabel: {
    fontSize: 12,
  },
  stageValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  cardBody: {
    gap: spacing.sm,
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
    fontSize: 14,
    fontWeight: '600',
  },
  lineMeta: {
    fontSize: 12,
  },
  lineAmount: {
    fontSize: 14,
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
    fontSize: 13,
  },
  amountValue: {
    fontSize: 14,
  },
  pendingCharge: {
    fontSize: 12,
    lineHeight: 16,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  paymentLabel: {
    fontSize: 13,
  },
  paymentValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  paymentHint: {
    fontSize: 12,
    lineHeight: 17,
  },
});
