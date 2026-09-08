import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore } from '@/stores/authStore';
import { t } from '@/i18n';
import { getBaseUrl, getTimeoutMs } from '@/services/api';
import { spacing, radius } from '@/theme';

interface PlaceholderScreenProps {
  title: string;
  subtitle?: string;
  /** Show a "Sign out" action (role homes only). */
  showSignOut?: boolean;
  /** Extra content (auth forms will replace these in the next phase). */
  children?: ReactNode;
}

/**
 * Temporary screen body used by every route in this phase. It proves the
 * foundation actually initialized: theme, i18n, API config and auth state.
 * Replaced by real feature screens in later phases.
 */
export function PlaceholderScreen({
  title,
  subtitle,
  showSignOut = false,
  children,
}: PlaceholderScreenProps) {
  const { palette, lang } = useAppTheme();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role);
  const status = useAuthStore((s) => s.status);

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: palette.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>{subtitle}</Text>
      ) : null}

      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <StatusRow label={t(lang, 'foundationReady')} value="✓" valueColor={palette.primary} />
        <StatusRow
          label={t(lang, 'foundationHint')}
          value={role === 'vendor' ? t(lang, 'vendorExperience') : t(lang, 'customerExperience')}
        />
      </View>

      {children}

      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.devTitle, { color: palette.textMuted }]}>Dev info</Text>
        <StatusRow label="API base" value={getBaseUrl()} />
        <StatusRow label="Timeout" value={`${getTimeoutMs()} ms`} />
        <StatusRow label="Language" value={lang} />
        <StatusRow label="Auth" value={status} />
      </View>

      {showSignOut ? (
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.danger, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.buttonText}>{t(lang, 'signOut')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function StatusRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor ?? palette.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 21 },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  devTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: spacing.xxs },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});