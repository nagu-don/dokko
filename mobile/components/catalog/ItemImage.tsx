import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { buildImageUrl } from '@/config/env';
import { useAppTheme } from '@/hooks/useAppTheme';
import { radius } from '@/theme';

interface ItemImageProps {
  /** Backend filename (e.g. "tomato.jpg" or the "no-preview.jpg" default). */
  filename?: string | null;
  /** Item name used for accessibility + the local placeholder initial. */
  name?: string;
  /** Square box size for the default (thumbnail) layout. */
  size?: number;
  /** Overrides the auto size box — used for hero images (e.g. width '100%'). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Catalog image with a themed fallback.
 * - Real item photos load from `${API_BASE}/images/<filename>`.
 * - Missing filename or a failed/missing remote image falls back to a
 *   plain surface block (with the item name's initial) instead of an
 *   ugly broken-image frame.
 */
export function ItemImage({ filename, name = '', size = 56, style }: ItemImageProps) {
  const { palette } = useAppTheme();
  const [failed, setFailed] = useState(false);
  const uri = buildImageUrl(filename);
  const box: StyleProp<ViewStyle> = style ?? { width: size, height: size };

  if (!uri || failed) {
    return (
      <View
        style={[styles.fallback, { backgroundColor: palette.border }, box]}
      >
        <Text style={[styles.fallbackText, { color: palette.textMuted }]}>
          {name ? name.trim().charAt(0).toUpperCase() : '?'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.imageWrap, box]}>
      <Image
        source={{ uri }}
        style={styles.imageFill}
        resizeMode="cover"
        accessibilityLabel={name || 'item image'}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  imageFill: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontSize: 22,
    fontWeight: '700',
  },
});