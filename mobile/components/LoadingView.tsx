import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { fs, spacing } from '@/theme';
import { useAppTheme } from '@/hooks/useAppTheme';

/** Full-screen spinner shown while the auth session is restored from storage. */
export function LoadingView({ label = 'Dokko' }: { label?: string }) {
  const { palette } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      <ActivityIndicator size="large" color={palette.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  label: {
    fontSize: fs(18),
    fontWeight: '600',
  },
});