import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t, money, num, iname } from '@/i18n';
import { fs, lh, radius, spacing } from '@/theme';
import type { VendorPresentedOrder } from '@/types';
import { formatOrderDate } from '@/utils/date';
import { unitOf } from '@/utils/itemDisplay';
import { vendorOrderStatusLabel, vendorPaymentStatusLabel } from '@/utils/vendorModel';

interface VendorOrderCardProps {
  order: VendorPresentedOrder;
  /** Label for the primary status pill (e.g. "Active" / "Delivered"). */
  stageLabel?: string;
  /** Date label + ISO value to show under the code (accepted/completed). */
  dateLabel?: string;
  dateIso?: string | null;
  onPress: () => void;
}

/**
 * Tappable summary card for a vendor order (active list + completed history).
 *
 * All values come from the server's presentOrder snapshot (historical where
 * the order is in the history view) — the card never recomputes totals or
 * consults the live catalog.
 */
export function VendorOrderCard({
  order,
  stageLabel,
  dateLabel,
  dateIso,
  onPress,
}: VendorOrderCardProps) {
  const { palette, lang } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${num(lang, order.code)} ${vendorOrderStatusLabel(lang, order.status)}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.code, { color: palette.text }]}>{num(lang, order.code)}</Text>
        <View style={[styles.pill, { backgroundColor: palette.primary }]}>
          <Text style={[styles.pillText, { color: palette.primaryText }]}>
            {stageLabel ?? vendorOrderStatusLabel(lang, order.status)}
          </Text>
        </View>
      </View>

      {dateIso && dateLabel ? (
        <Text style={[styles.date, { color: palette.textMuted }]}>
          {t(lang, dateLabel, { date: formatOrderDate(lang, dateIso) })}
        </Text>
      ) : null}

      <Text style={[styles.customer, { color: palette.textMuted }]} numberOfLines={1}>
        {order.customer.name}
        {order.customer.phone ? ` · ${num(lang, order.customer.phone)}` : ''}
      </Text>

      <View style={styles.itemLines}>
        {order.items.slice(0, 4).map((row, i) => (
          <View key={i} style={styles.itemLine}>
            <Text style={[styles.itemName, { color: palette.text }]} numberOfLines={1}>
              {num(lang, row.quantity)} {unitOf(lang, row)} × {iname(lang, row)}
            </Text>
            <Text style={[styles.itemMeta, { color: palette.textMuted }]}>
              {money(lang, row.quantity * row.priceAtOrder)}
            </Text>
          </View>
        ))}
        {order.items.length > 4 ? (
          <Text style={[styles.moreItems, { color: palette.textMuted }]}>
            +{num(lang, order.items.length - 4)}
          </Text>
        ) : null}
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.payment, { color: palette.textMuted }]}>
          {t(lang, 'vendorOrderPaidPayment', {
            status: vendorPaymentStatusLabel(lang, order.paymentStatus),
          })}
        </Text>
        <Text style={[styles.amount, { color: palette.text }]}>
          {money(lang, order.total)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  code: {
    fontSize: fs(16),
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
  customer: {
    fontSize: fs(13),
  },
  itemLines: {
    gap: spacing.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  itemLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  itemName: {
    flex: 1,
    fontSize: fs(13),
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: fs(12),
    textAlign: 'right',
  },
  moreItems: {
    fontSize: fs(12),
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  payment: {
    fontSize: fs(12),
    flexShrink: 1,
  },
  amount: {
    fontSize: fs(15),
    fontWeight: '800',
  },
});
