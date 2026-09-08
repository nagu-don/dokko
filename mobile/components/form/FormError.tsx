import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';
import { spacing, radius } from '@/theme';

/** Inline error banner shown above the submit button on failed attempts. */
export function FormError({ message }: { message?: string }) {
  const { palette } = useAppTheme();
  if (!message) return null;
  return (
    <View style={[styles.banner, { backgroundColor: palette.danger, borderColor: palette.danger }]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  text: { color: '#FFFFFF', fontSize: 13 },
});
