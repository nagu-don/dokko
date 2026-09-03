import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t, money, num } from '@/i18n';
import { radius, spacing } from '@/theme';
import type { Item, ItemGroup } from '@/types';
import { unitOf, variantLabel } from '@/utils/itemDisplay';
import { useCartStore } from '@/stores/cartStore';
import { ItemImage } from './ItemImage';
import { QuantityStepper } from './QuantityStepper';

/** Group price label follows the web: lowest `maxPrice` across variants. */
function groupBestPrice(variants: Item[]): number {
  return Math.min(...variants.map((v) => Number(v.maxPrice) || 0));
}

export interface ItemCardProps {
  group: ItemGroup;
}

/**
 * Reusable catalog group card (covers the item image, localized name, unit
 * and from-price). Tapping the header expands the variants inside; tapping a
 * variant row reveals its centered quantity stepper (`−` qty `+`). Once the
 * quantity leaves 0 the running cost shows, italicized, under the row.
 */
export const ItemCard = memo(function ItemCard({ group }: ItemCardProps) {
  const { palette, lang } = useAppTheme();
  const [open, setOpen] = useState(false);

  const cover = group.variants[0];
  const displayName = lang === 'np' && group.nepName ? group.nepName : group.name;
  const unit = unitOf(lang, cover);
  const bestPrice = groupBestPrice(group.variants);
  const countLabel = t(
    lang,
    group.variants.length === 1 ? 'optionOne' : 'optionsMany'
  );

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.header}>
          <ItemImage filename={cover?.image} name={displayName} size={56} />
          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[styles.chevron, { color: palette.textMuted }]}>{open ? '▾' : '▸'}</Text>
            </View>
            <Text style={[styles.price, { color: palette.textMuted }]}>
              {t(lang, 'catalogFromPrice', { price: money(lang, bestPrice), unit })}
            </Text>
            <Text style={[styles.count, { color: palette.textMuted }]}>
              {num(lang, group.variants.length)} {countLabel}
            </Text>
          </View>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.variants}>
          {group.variants.map((variant) => (
            <VariantRow
              key={variant._id}
              variant={variant}
              defaultActive={group.variants.length === 1}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

interface VariantRowProps {
  variant: Item;
  /** Start with the quantity stepper open (used for single-variant groups). */
  defaultActive?: boolean;
}

/**
 * One sub-item row: variant name + per-kg price, with the quantity stepper
 * appearing centered in the row when the row is tapped. Tapping the name or
 * price toggles the stepper; the quantity is typed by tapping the number.
 * A group with a single variant shows its stepper open by default.
 */
const VariantRow = memo(function VariantRow({ variant, defaultActive }: VariantRowProps) {
  const { palette, lang } = useAppTheme();
  const [active, setActive] = useState(defaultActive ?? false);

  const line = useCartStore((s) => s.lines.find((l) => l.itemId === variant._id));
  const qty = line?.quantityKg ?? 0;
  const price = Number(variant.maxPrice) || 0;
  const label = variantLabel(lang, variant);

  const toggle = () => setActive((a) => !a);

  return (
    <View style={[styles.variantRow, { borderTopColor: palette.border }]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: active }}
        accessibilityLabel={t(lang, 'openVariantAria', { name: label })}
        style={({ pressed }) => [styles.variantNamePress, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.variantName, { color: palette.text }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>

      {active ? (
        <QuantityStepper variant={variant} name={label} quantityKg={qty} />
      ) : null}

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={t(lang, 'openVariantAria', { name: label })}
        style={({ pressed }) => [styles.variantPricePress, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.variantPrice, { color: palette.text }]}>
          {money(lang, price)}
          {'/'}
          {unitOf(lang, variant)}
        </Text>
      </Pressable>

      {qty > 0 ? (
        <Text style={[styles.costText, { color: palette.primary }]}>
          {money(lang, Math.round(qty * price * 100) / 100)}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 14,
  },
  price: {
    fontSize: 14,
    fontWeight: '600',
  },
  count: {
    fontSize: 12,
  },
  variants: {
    marginTop: spacing.sm,
    gap: spacing.xxs,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  variantNamePress: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingVertical: spacing.xs,
  },
  variantName: {
    fontSize: 14,
  },
  variantPricePress: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xs,
  },
  variantPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
  costText: {
    width: '100%',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    fontStyle: 'italic',
    opacity: 0.8,
  },
});