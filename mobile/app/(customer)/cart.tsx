import { memo, useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ItemImage } from '@/components/catalog';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/form';
import { BrandTopBar, BRAND_BG } from '@/components/BrandTopBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useApprovedItems } from '@/hooks/useApprovedItems';
import { t, money, num, iname } from '@/i18n';
import { useCartStore } from '@/stores/cartStore';
import { radius, spacing } from '@/theme';
import {
  cartAllKg,
  cartLinePrice,
  cartLineTotal,
  cartSubtotal,
  cartTotalQty,
  resolveCartLines,
} from '@/utils/cart';
import { isKgUnit, unitOf } from '@/utils/itemDisplay';
import { qtyDisplay } from '@/utils/format';
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

  const renderLine = useCallback(
    ({ item }: { item: ResolvedCartLine }) => <CartRow line={item} />,
    []
  );

  const footer = useMemo(() => {
    const allKg = cartAllKg(lines);
    return (
      <View
        style={[styles.summary, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>
          {t(lang, allKg ? 'subtotalWithCount' : 'subtotalWithItems', {
            qty: num(lang, cartTotalQty(lines).toFixed(1)),
            count: num(lang, lines.length),
          })}
        </Text>
        <Text style={[styles.summaryValue, { color: palette.text }]}>{money(lang, subtotal)}</Text>
        <Text style={[styles.checkoutNote, { color: palette.textMuted }]}>
          {t(lang, 'checkoutNote')}
        </Text>
        <Button title={t(lang, 'goToCheckout')} onPress={() => router.push('/checkout')} />
      </View>
    );
  }, [lang, palette, lines, subtotal]);

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
        ListFooterComponent={footer}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={12}
        removeClippedSubviews
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.navBar, { backgroundColor: BRAND_BG, paddingTop: insets.top }]}>
        <BrandTopBar title={t(lang, 'yourCart')} onBack={handleBack} backAriaLabel={t(lang, 'backAria')} />
      </View>
      {content}
    </View>
  );
}

interface CartRowProps {
  line: ResolvedCartLine;
}

/**
 * One cart row, memoized so only the tapped row re-renders when a quantity
 * changes. Actions and theme are read from their stores (stable references).
 *
 * `resolveCartLines` rebuilds the `{ line, live }` wrapper objects on every
 * cart change, so a plain shallow compare can never pass — every row would
 * re-render on each tap. The comparator bails out whenever the underlying
 * `line` and `live` references are unchanged, which is exactly the case for
 * every row except the one whose quantity actually moved.
 */
const CartRow = memo(
  function CartRow({ line }: CartRowProps) {
    const { palette, lang } = useAppTheme();
    const increaseQuantity = useCartStore((s) => s.increaseQuantity);
    const decreaseQuantity = useCartStore((s) => s.decreaseQuantity);
    const removeItem = useCartStore((s) => s.removeItem);

    const { live } = line;
    const displayName = iname(lang, live ?? line.line);
    const unit = unitOf(lang, live ?? line.line);
    const isKg = isKgUnit(line.line);
    const price = cartLinePrice(line.line, live);
    const qty = line.line.quantityKg;

    return (
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.rowTop}>
          <ItemImage filename={live?.image ?? line.line.image} name={displayName} />
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
              onPress={() => decreaseQuantity(line.line.itemId)}
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
              <Text style={[styles.qtyText, { color: palette.text }]}>{num(lang, qtyDisplay(qty, isKg))}</Text>
              <Text style={[styles.qtyUnit, { color: palette.textMuted }]}>{unit}</Text>
            </View>
            <Pressable
              onPress={() => increaseQuantity(line.line.itemId)}
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
            {money(lang, cartLineTotal(line.line, live))}
          </Text>
        </View>

      <Pressable
          onPress={() => removeItem(line.line.itemId)}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'removeItemAria', { name: displayName })}
          hitSlop={8}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }, styles.removeWrap]}
        >
          <Text style={[styles.removeText, { color: palette.danger }]}>{t(lang, 'remove')}</Text>
        </Pressable>
      </View>
    );
  },
  (prev, next) => prev.line.line === next.line.line && prev.line.live === next.line.live
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navBar: {
    paddingBottom: spacing.sm,
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