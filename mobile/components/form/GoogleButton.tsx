import { Pressable, StyleSheet } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t } from '@/i18n';
import { spacing, radius } from '@/theme';

/**
 * Google sign-in entry point.
 *
 * The backend's `/api/users|vendors/google` endpoints require a NATIVE Google
 * ID token (verified via JWKS against GOOGLE_CLIENT_ID). Producing one needs
 * `@react-native-google-signin/google-signin`, a configured Google OAuth web
 * client and an Expo development build — none are set up yet, so the button is
 * intentionally disabled and explains it is coming soon. It does NOT fake a
 * login or substitute an id/email.
 */
export function GoogleButton() {
  const { palette, lang } = useAppTheme();

  return (
    <Pressable
      disabled
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      style={[
        styles.button,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text style={styles.mark}>G</Text>
      <Text style={[styles.label, { color: palette.text }]}>{t(lang, 'googleContinue')}</Text>
      <Text style={[styles.note, { color: palette.textMuted }]}>{t(lang, 'googleComingSoon')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    minHeight: 50,
    opacity: 0.6,
  },
  label: { fontSize: 16, fontWeight: '600' },
  mark: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  note: { fontSize: 12, marginLeft: 'auto' },
});
