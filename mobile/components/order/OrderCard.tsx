import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t, money, num } from '@/i18n';
import { radius, spacing } from '@/theme';
import type { OrderRead } from '@/types';
import { formatOrderDate } from '@/utils/date';
import {
  isSearching,
  orderBucket,
  orderCode,
  orderStatusLabel,
  priorityStageLabel,
} from '@/utils/orderModel';

interface OrderCardProps {
  order: OrderRead;
  onPress: () => void;
}

/** tappable summary card for one order (history list + active list). */
export function OrderCard({ order, onPress }: OrderCardProps) {
  const { palette, lang } = useAppTheme();
  const bucket = orderBucket(order);
  const itemCount = order.items?.length ?? 0;
  const totalKg = order.totalQuantity ?? 0;
  const searching = isSearching(order);
  const sub = order.subtotal ?? 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${orderCode(order)} ${orderStatusLabel(lang, order)}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.code, { color: palette.text }]}>{orderCode(order)}</Text>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: bucket === 'active' ? palette.primary : palette.surface,
              borderColor: bucket === 'active' ? palette.primary : palette.border,
            },
          ]}
        >
          <Text
            style={[
              styles.pillText,
              { color: bucket === 'active' ? palette.primaryText : palette.textMuted },
            ]}
          >
            {orderStatusLabel(lang, order)}
          </Text>
        </View>
      </View>

      {order.createdAt ? (
        <Text style={[styles.date, { color: palette.textMuted }]}>
          {t(lang, 'orderPlacedAt', { date: formatOrderDate(lang, order.createdAt) })}
        </Text>
      ) : null}

      {searching || order.priorityStage === 'ASSIGNED' ? (
        <Text style={[styles.stage, { color: palette.primary }]}>
          {priorityStageLabel(lang, order)}
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: palette.textMuted }]}>
          {t(lang, 'orderItemsSummary', {
            count: num(lang, itemCount),
            kg: num(lang, (totalKg || 0).toFixed(1)),
          })}
        </Text>
        <Text style={[styles.amount, { color: palette.text }]}>{money(lang, sub)}</Text>
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
    fontSize: 16,
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
    fontSize: 13,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  meta: {
    fontSize: 13,
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
  },
});
