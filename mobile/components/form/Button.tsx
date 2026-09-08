import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { BRAND_BG } from '@/components/BrandTopBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { fs, radius, spacing } from '@/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'brand';
}

/**
 * Themed action button. While `loading` is true the press is ignored and a
 * spinner replaces the label, preventing duplicate submissions from rapid taps.
 */
export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: ButtonProps) {
  const { palette } = useAppTheme();

  const background =
    variant === 'brand'
      ? BRAND_BG
      : variant === 'primary'
        ? palette.primary
        : variant === 'danger'
          ? palette.danger
          : palette.surface;
  const textColor =
    variant === 'primary' || variant === 'danger' || variant === 'brand'
      ? '#FFFFFF'
      : palette.text;

  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: palette.border,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  label: { fontSize: fs(16), fontWeight: '700', textAlign: 'center' },
});
