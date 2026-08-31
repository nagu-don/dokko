import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ItemImage } from '@/components/catalog';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useApprovedItems } from '@/hooks/useApprovedItems';
import { t, money, num, iname } from '@/i18n';
import { useCartStore } from '@/stores/cartStore';
import { radius, spacing } from '@/theme';
import {
  cartLinePrice,
  cartLineTotal,
  cartSubtotal,
  cartTotalKg,
  resolveCartLines,
} from '@/utils/cart';
import { unitOf } from '@/utils/itemDisplay';
import type { ResolvedCartLine } from '@/utils/cart';

/**
 * Customer cart — local to the device (see stores/cartStore.ts).
 *
 * Row presentation: live approved-catalog data (price/name/image) overlays the
 * persisted snapshot whenever the item still exists; otherwise the snapshot
 * renders alone (offline / item removed from catalog). Quantities step by
 * STEP (0.1 kg); decreasing a 0-quantity line removes it; an explicit Remove
 * deletes the whole line. The summary shows the subtotal only — delivery and
 * the final total are decided server-side at order placement (checkout phase).
 *
 * The catalog query is advisory here: it never blocks the cart. If it is still
 * loading or failed, rows fall back to their own snapshots.
 */
export default function CartScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lines = useCartStore((s) => s.lines);
  const hydrated = useCartStore((s) => s.hydrated);
  const increaseQuantity = useCartStore((s) => s.increaseQuantity);
  const decreaseQuantity = useCartStore((s) => s.decreaseQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const { data: catalog } = useApprovedItems();
  const byId = useMemo(
    () => new Map((catalog ?? []).map((item) => [item._id, item])),
    [catalog]
  );
  const resolved = useMemo(() => resolveCartLines(lines, byId), [lines, byId]);
  const subtotal = cartSubtotal(lines, byId);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  const renderLine = ({ item }: { item: ResolvedCartLine }) => {
    const { line, live } = item;
    const displayName = iname(lang, live ?? line);
    const unit = unitOf(lang, live ?? line);
    const price = cartLinePrice(line, live);
    const qty = line.quantityKg;

    return (
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.rowTop}>
          <ItemImage filename={live?.image ?? line.image} name={displayName} />
          <View style={styles.rowTopText}>
            <Text style={[styles.name, { color: palette.text }]} numberOfLines={2}>
              {displayName}
            </Text>
            <Text style={[styles.unitPrice, { color: palette.textMuted }]}>
              {money(lang, price)}
              {'/'}
              {unit}
            </Text>
          </View>
        </View>

        <View style={styles.rowControls}>
          <View style={styles.qtyRow}>
            <Pressable
              onPress={() => decreaseQuantity(line.itemId)}
              accessibilityRole="button"
              accessibilityLabel={t(lang, 'decreaseAria', { name: displayName })}
              style={({ pressed }) => [
                styles.qtyBtn,
                { borderColor: palette.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.qtyBtnText, { color: palette.text }]}>−</Text>
            </Pressable>
            <View style={styles.qtyValue}>
              <Text style={[styles.qtyText, { color: palette.text }]}>{num(lang, qty.toFixed(1))}</Text>
              <Text style={[styles.qtyUnit, { color: palette.textMuted }]}>{unit}</Text>
            </View>
            <Pressable
              onPress={() => increaseQuantity(line.itemId)}
              accessibilityRole="button"
              accessibilityLabel={t(lang, 'increaseAria', { name: displayName })}
              style={({ pressed }) => [
                styles.qtyBtn,
                { borderColor: palette.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.qtyBtnText, { color: palette.text }]}>+</Text>
            </Pressable>
          </View>
          <Text style={[styles.lineTotal, { color: palette.text }]}>
            {money(lang, cartLineTotal(line, live))}
          </Text>
        </View>

        <Pressable
          onPress={() => removeItem(line.itemId)}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'removeItemAria', { name: displayName })}
          hitSlop={8}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }, styles.removeWrap]}
        >
          <Text style={[styles.removeText, { color: palette.danger }]}>{t(lang, 'remove')}</Text>
        </Pressable>
      </View>
    );
  };

  let content;

  if (!hydrated) {
    content = <LoadingView label={t(lang, 'loadingCatalog')} />;
  } else if (lines.length === 0) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'emptyCartMsg')}
        </Text>
        <Button title={t(lang, 'browseItems')} onPress={() => router.replace('/home')} />
      </View>
    );
  } else {
    content = (
      <FlatList
        data={resolved}
        keyExtractor={(row) => row.line.itemId}
        renderItem={renderLine}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        ListFooterComponent={
          <View style={[styles.summary, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>
              {t(lang, 'subtotalWithCount', { qty: num(lang, cartTotalKg(lines).toFixed(1)) })}
            </Text>
            <Text style={[styles.summaryValue, { color: palette.text }]}>{money(lang, subtotal)}</Text>
            <Text style={[styles.checkoutNote, { color: palette.textMuted }]}>
              {t(lang, 'checkoutNote')}
            </Text>
            <Button title={t(lang, 'goToCheckout')} onPress={() => router.push('/checkout')} />
          </View>
        }
      />
    );
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.background, paddingTop: insets.top },
      ]}
    >
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
          {t(lang, 'yourCart')}
        </Text>
        <View style={styles.topSpacer} />
      </View>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  back: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
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
  listContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowTopText: {
    flex: 1,
    gap: spacing.xxs,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  unitPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  qtyValue: {
    alignItems: 'center',
    minWidth: 56,
    gap: spacing.xxs,
  },
  qtyText: {
    fontSize: 18,
    fontWeight: '800',
  },
  qtyUnit: {
    fontSize: 12,
  },
  lineTotal: {
    fontSize: 16,
    fontWeight: '800',
  },
  removeWrap: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  summary: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  checkoutNote: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
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
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
});