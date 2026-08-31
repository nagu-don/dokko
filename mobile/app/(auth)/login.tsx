import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import type { AuthAttempt, Role } from '@/types';
import type { LoginCredentials } from '@/services/auth';
import {
  Button,
  FormError,
  FormTextField,
  RoleSelector,
  GoogleButton,
} from '@/components/form';
import { authAuthErrorMessage } from '@/utils/authMessages';
import { spacing } from '@/theme';

export default function LoginScreen() {
  const { palette, lang } = useAppTheme();
  const router = useRouter();
  const loginCustomer = useAuthStore((s) => s.loginCustomer);
  const loginVendor = useAuthStore((s) => s.loginVendor);
  const status = useAuthStore((s) => s.status);

  const [role, setRole] = useState<Role>('customer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});
  const [attempt, setAttempt] = useState<AuthAttempt | null>(null);

  const loading = status === 'loading';
  const identifierError = fieldErrors.identifier;
  const passwordError = fieldErrors.password;

  const handleSubmit = async () => {
    const errors: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) errors.identifier = t(lang, 'errIdentifierRequired');
    if (!password) errors.password = t(lang, 'errPasswordRequired');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setAttempt(null);
    const credentials: LoginCredentials = { identifier: identifier.trim(), password };
    const result =
      role === 'customer'
        ? await loginCustomer(credentials)
        : await loginVendor(credentials);

    if (result.ok) {
      router.replace(role === 'vendor' ? '/dashboard' : '/home');
    } else {
      setAttempt(result);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: palette.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>{t(lang, 'loginTitle')}</Text>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>
            {t(lang, 'loginSubtitle', {
              role: role === 'vendor' ? t(lang, 'roleVendor') : t(lang, 'roleCustomer'),
            })}
          </Text>
        </View>

        <RoleSelector
          value={role}
          onChange={(r) => {
            setRole(r);
            setAttempt(null);
          }}
          disabled={loading}
          label="loginAs"
          hint={t(lang, 'loginRoleHint')}
        />

        <FormTextField
          label={t(lang, 'identifier')}
          placeholder={t(lang, 'identifierPlaceholder')}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={identifierError}
          editable={!loading}
        />

        <FormTextField
          label={t(lang, 'password')}
          placeholder={t(lang, 'passwordPlaceholder')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          error={passwordError}
          editable={!loading}
        />

        <FormError message={authAuthErrorMessage(lang, attempt)} />

        <Button
          title={t(lang, 'continueAs', {
            role: role === 'vendor' ? t(lang, 'roleVendor') : t(lang, 'roleCustomer'),
          })}
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
        />

        <GoogleButton />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: palette.textMuted }]}>
            {t(lang, 'noAccount')}
          </Text>
          <Link href="/register" replace style={styles.footerLink}>
            <Text style={[styles.footerLinkText, { color: palette.primary }]}>
              {t(lang, 'goToRegister')}
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  footerText: { fontSize: 14 },
  footerLink: { paddingVertical: spacing.xxs },
  footerLinkText: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
});
