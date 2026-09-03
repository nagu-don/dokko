import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useVendorCompletedOrder } from '@/hooks/useVendorRequests';
import { t, money, num, iname } from '@/i18n';
import { radius, spacing } from '@/theme';
import { formatOrderDate } from '@/utils/date';
import {
  vendorOrderStatusLabel,
  vendorPaymentStatusLabel,
  vendorPriorityStageLabel,
} from '@/utils/vendorModel';

/**
 * Vendor completed-order detail / history (Phase 13). A READ-ONLY view of a
 * single completed order, resolved through the shared
 * ['vendor','requests','completed'] query (GET /api/vendors/requests/completed).
 *
 * It renders ONLY the server-provided historical snapshot:
 *  - item names/quantities/prices and amounts come from the stored order,
 *    never the live catalog (a retired/re-priced item stays as ordered).
 *  - status / completedAt / acceptedAt are the backend's authoritative values.
 *  - No payment or completion actions appear here (those live on the
 *    accepted-order / collect screens).
 *
 * A failed read keeps the last known data and offers refresh — a network
 * failure is NOT treated as order failure.
 */
export default function VendorCompletedOrderDetailScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id : '';

  const { data: order, isLoading, isError, isRefetching, refetch } = useVendorCompletedOrder(orderId);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/completed');
    }
  };

  let content;

  if (isLoading && !order) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorRequestsLoading')}
        </Text>
      </View>
    );
  } else if (!order) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorOrderNotFoundHint')}
        </Text>
        {isError ? (
          <Text style={[styles.stateHint, { color: palette.textMuted }]}>
            {t(lang, 'vendorCompletedOrdersErrorHint')}
          </Text>
        ) : null}
        <Button title={t(lang, 'vendorGoToDashboard')} onPress={() => router.replace('/dashboard')} />
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
            onRefresh={() => refetch()}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
      >
        {isError ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'vendorCompletedOrdersErrorHint')}
            </Text>
          </View>
        ) : null}

        <View style={[styles.headerCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.codeRow}>
            <Text style={[styles.code, { color: palette.text }]}>{num(lang, order.code)}</Text>
            <View style={[styles.pill, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.pillText, { color: palette.textMuted }]}>
                {vendorOrderStatusLabel(lang, order.status)}
              </Text>
            </View>
          </View>

          {order.acceptedAt ? (
            <Text style={[styles.date, { color: palette.textMuted }]}>
              {t(lang, 'vendorOrderAcceptedOn', {
                date: formatOrderDate(lang, order.acceptedAt),
              })}
            </Text>
          ) : null}

          {order.completedAt ? (
            <Text style={[styles.date, { color: palette.textMuted }]}>
              {t(lang, 'vendorOrderCompletedOn', {
                date: formatOrderDate(lang, order.completedAt),
              })}
            </Text>
          ) : null}

          {order.createdAt ? (
            <Text style={[styles.date, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestPlaced')}: {formatOrderDate(lang, order.createdAt)}
            </Text>
          ) : null}

          {order.priorityStage ? (
            <View style={styles.stage}>
              <Text style={[styles.stageLabel, { color: palette.textMuted }]}>
                {t(lang, 'vendorRequestStage')}
              </Text>
              <Text style={[styles.stageValue, { color: palette.primary }]}>
                {vendorPriorityStageLabel(lang, order.priorityStage)}
              </Text>
            </View>
          ) : null}
        </View>

        <Section title={t(lang, 'vendorRequestCustomer')} palette={palette}>
          <Text style={[styles.customerLine, { color: palette.text }]}>{order.customer.name}</Text>
          {order.customer.phone ? (
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestPhone')}: {num(lang, order.customer.phone)}
            </Text>
          ) : null}
        </Section>

        <Section title={t(lang, 'itemSection')} palette={palette}>
          {order.items.map((row, idx) => (
            <View key={idx} style={styles.lineRow}>
              <View style={styles.lineMain}>
                <Text style={[styles.lineName, { color: palette.text }]}>
                  {iname(lang, row)}
                </Text>
                <Text style={[styles.lineMeta, { color: palette.textMuted }]}>
                  {money(lang, row.priceAtOrder)}/{t(lang, 'unitKg')} · {num(lang, row.quantity)}{' '}
                  {t(lang, 'unitKg')}
                </Text>
              </View>
              <Text style={[styles.lineAmount, { color: palette.text }]}>
                {money(lang, row.quantity * row.priceAtOrder)}
              </Text>
            </View>
          ))}
          <View style={[styles.divider, { borderColor: palette.border }]} />
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

        <Section title={t(lang, 'orderPaymentSection')} palette={palette}>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: palette.textMuted }]}>
              {t(lang, 'vendorPaymentStatus')}
            </Text>
            <Text style={[styles.amountValue, { color: palette.text }]}>
              {vendorPaymentStatusLabel(lang, order.paymentStatus)}
            </Text>
          </View>
          {order.paymentMethod ? (
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {t(lang, 'vendorPaymentMethod')}: {String(order.paymentMethod)}
            </Text>
          ) : null}
        </Section>

        <Section title={t(lang, 'vendorRequestDropoff')} palette={palette}>
          {order.dropoff ? (
            <>
              {order.dropoff.label ? (
                <Text style={[styles.labelText, { color: palette.text }]}>
                  {order.dropoff.label}
                </Text>
              ) : null}
              <Text style={[styles.meta, { color: palette.textMuted }]}>
                {t(lang, 'dropoffCoords', {
                  lat: num(lang, order.dropoff.lat.toFixed(5)),
                  lng: num(lang, order.dropoff.lng.toFixed(5)),
                })}
              </Text>
            </>
          ) : (
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {t(lang, 'dropoffNotSet')}
            </Text>
          )}
        </Section>

        <Button
          variant="secondary"
          title={isRefetching ? t(lang, 'vendorRequestsLoading') : t(lang, 'vendorRefresh')}
          onPress={() => refetch()}
          loading={isRefetching}
        />
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
          {t(lang, 'vendorOrderDetailTitle')}
        </Text>
        <View style={styles.topSpacer} />
      </View>
      {content}
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
  topTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  topSpacer: {
    width: spacing.xl + 8,
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
    textAlign: 'center',
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
  customerLine: {
    fontSize: 15,
    fontWeight: '700',
  },
  labelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
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
});
