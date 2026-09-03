import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ItemImage } from '@/components/catalog';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/form';
import { BrandTopBar, BRAND_BG } from '@/components/BrandTopBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useApprovedItems } from '@/hooks/useApprovedItems';
import { t, money, iname, num } from '@/i18n';
import { useCartStore } from '@/stores';
import { radius, spacing } from '@/theme';
import { catalogErrorMessage } from '@/utils/catalogMessages';
import { groupForItem, unitOf, variantLabel, toSelectedItem } from '@/utils/itemDisplay';
import { buildGroups } from '@/utils/search';
import type { Item, ItemGroup } from '@/types';

/**
 * Item details with variant selection.
 *
 * The item (and its sibling variants) is resolved from the SHARED approved
 * catalog cache (`['items','approved']`) — never refetched. The selected
 * variant is canonicalized in the URL via `router.setParams({ id })`, so the
 * route always reflects what the user is looking at (deep-link safe, no
 * local state to drift). Availability is not shown, matching the web.
 */
export default function ItemDetailsScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const { data, isLoading, isError, error, refetch } = useApprovedItems();

  const cartLines = useCartStore((s) => s.lines);
  const addToCart = useCartStore((s) => s.addToCart);
  const increaseQuantity = useCartStore((s) => s.increaseQuantity);
  const decreaseQuantity = useCartStore((s) => s.decreaseQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const groups = useMemo(() => buildGroups(data ?? []), [data]);
  const group: ItemGroup | undefined = useMemo(
    () => (data ? groupForItem(groups, id) : undefined),
    [groups, id, data]
  );
  const item: Item | null = useMemo(
    () => group?.variants.find((v) => v._id === id) ?? null,
    [group, id]
  );
  const cartLine = useMemo(
    () => (item ? cartLines.find((l) => l.itemId === item._id) : undefined),
    [cartLines, item]
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  let content: ReactNode;

  if (isLoading && !data) {
    content = <LoadingView label={t(lang, 'loadingCatalog')} />;
  } else if (isError && !data) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'catalogErrorTitle')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {catalogErrorMessage(lang, error)}
        </Text>
        <Button title={t(lang, 'retry')} onPress={() => refetch()} />
      </View>
    );
  } else if (!item) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'itemNotFoundTitle')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {t(lang, 'itemNotFoundHint')}
        </Text>
        <Button title={t(lang, 'backToHome')} onPress={() => router.replace('/home')} />
      </View>
    );
  } else {
    const price = Number(item.maxPrice) || 0;
    const avg = Number(item.avgPrice) || 0;
    const min = Number(item.minPrice) || 0;
    const unit = unitOf(lang, item);
    const displayName = iname(lang, item);
    const multiVariant = group != null && group.variants.length > 1;

    content = (
      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ItemImage
          filename={item.image}
          name={displayName}
          style={[styles.hero, { backgroundColor: palette.border }]}
        />

        <View style={styles.body}>
          <Text style={[styles.name, { color: palette.text }]}>{displayName}</Text>

          {multiVariant ? (
            <View style={styles.variantSection}>
              <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
                {t(lang, 'selectVariant')}
              </Text>
              <View style={styles.chips}>
                {group?.variants.map((variant) => {
                  const selected = variant._id === item._id;
                  return (
                    <Pressable
                      key={variant._id}
                      onPress={() => router.setParams({ id: variant._id })}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? palette.primary : palette.border,
                          backgroundColor: selected ? palette.primary : palette.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: selected ? palette.primaryText : palette.text },
                        ]}
                        numberOfLines={1}
                      >
                        {variantLabel(lang, variant)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.priceCard,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.bigPrice, { color: palette.text }]}>
              {money(lang, price)}
              {'/'}
              {unit}
            </Text>
            {avg > 0 ? (
              <Text style={[styles.meta, { color: palette.textMuted }]}>
                {t(lang, 'detailsAvg', { price: money(lang, avg), unit })}
              </Text>
            ) : null}
            {min > 0 ? (
              <Text style={[styles.meta, { color: palette.textMuted }]}>
                {t(lang, 'detailsRange', {
                  min: money(lang, min),
                  max: money(lang, price),
                  unit,
                })}
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.cartCard,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            {cartLine ? (
              <>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => decreaseQuantity(item._id)}
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
                    <Text style={[styles.qtyText, { color: palette.text }]}>
                      {num(lang, cartLine.quantityKg.toFixed(1))}
                    </Text>
                    <Text style={[styles.qtyUnit, { color: palette.textMuted }]}>{unit}</Text>
                  </View>
                  <Pressable
                    onPress={() => increaseQuantity(item._id)}
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
                <Pressable
                  onPress={() => removeItem(item._id)}
                  accessibilityRole="button"
                  accessibilityLabel={t(lang, 'removeItemAria', { name: displayName })}
                  hitSlop={8}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }, styles.removeWrap]}
                >
                  <Text style={[styles.removeText, { color: palette.danger }]}>
                    {t(lang, 'remove')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Button
                title={t(lang, 'addToCart')}
                onPress={() => addToCart({ ...toSelectedItem(item), image: item.image })}
              />
            )}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.navBar, { backgroundColor: BRAND_BG, paddingTop: insets.top }]}>
        <BrandTopBar
          title={t(lang, 'itemDetailsTitle')}
          onBack={handleBack}
          backAriaLabel={t(lang, 'backAria')}
        />
      </View>
      {content}
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  hero: {
    width: '100%',
    height: 210,
    borderRadius: radius.lg,
  },
  body: {
    gap: spacing.lg,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
  },
  variantSection: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  priceCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  bigPrice: {
    fontSize: 28,
    fontWeight: '800',
  },
  meta: {
    fontSize: 14,
    lineHeight: 20,
  },
  cartCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  qtyBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  qtyValue: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  qtyText: {
    fontSize: 20,
    fontWeight: '800',
  },
  qtyUnit: {
    fontSize: 13,
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
});