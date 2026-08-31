import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t, money, num } from '@/i18n';
import { radius, spacing } from '@/theme';
import type { Item, ItemGroup } from '@/types';
import { unitOf, variantLabel } from '@/utils/itemDisplay';
import { ItemImage } from './ItemImage';

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
 * variant row opens its details screen at `/item/[id]`.
 */
export const ItemCard = memo(function ItemCard({ group }: ItemCardProps) {
  const { palette, lang } = useAppTheme();
  const router = useRouter();
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
          {group.variants.map((variant) => {
            const label = variantLabel(lang, variant);
            return (
              <Pressable
                key={variant._id}
                onPress={() =>
                  router.push({ pathname: '/item/[id]', params: { id: variant._id } })
                }
                accessibilityRole="button"
                accessibilityLabel={t(lang, 'openVariantAria', { name: label })}
                style={({ pressed }) => [
                  styles.variantRow,
                  { borderTopColor: palette.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.variantName, { color: palette.text }]} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={[styles.variantPrice, { color: palette.text }]}>
                  {money(lang, Number(variant.maxPrice) || 0)}
                  {'/'}
                  {unitOf(lang, variant)}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  variantName: {
    flex: 1,
    fontSize: 14,
  },
  variantPrice: {
    fontSize: 14,
    fontWeight: '600',
  },
});