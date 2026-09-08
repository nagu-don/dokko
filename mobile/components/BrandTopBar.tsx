import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { spacing } from '@/theme';

/**
 * Dokko brand color (matches front-end/src/assets/logo.svg background).
 * Used as the customer portal's top navigation bar background.
 */
export const BRAND_BG = '#F96004';
export const BRAND_ON_BG = '#FFFFFF';

interface BrandTopBarProps {
  /** Centred title shown when no custom `children` are passed. */
  title?: string;
  onBack?: () => void;
  backAriaLabel?: string;
  /** Content shown at the trailing edge (e.g. a refresh button). */
  right?: ReactNode;
}

/**
 * Top navigation bar for the customer portal. Solid brand-orange so it
 * matches the logo background; all built-in text is white for contrast.
 */
export function BrandTopBar({ title, onBack, backAriaLabel, right }: BrandTopBarProps) {
  return (
    <View style={[styles.bar, { backgroundColor: BRAND_BG }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backAriaLabel}
          hitSlop={8}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.backGlyph, { color: BRAND_ON_BG }]}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}

      {title ? (
        <Text style={[styles.title, { color: BRAND_ON_BG }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}

      <View style={styles.rightSlot}>{right ?? <View style={styles.spacer} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
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
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  rightSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: spacing.xl + 8,
  },
});