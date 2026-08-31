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
import { PHONE_RE, MIN_PASSWORD_LENGTH, type RegisterInput } from '@/services/auth';
import type { AuthAttempt, Role } from '@/types';
import { Button, FormError, FormTextField, RoleSelector, GoogleButton } from '@/components/form';
import { authAuthErrorMessage } from '@/utils/authMessages';
import { spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { palette, lang } = useAppTheme();
  const router = useRouter();
  const registerCustomer = useAuthStore((s) => s.registerCustomer);
  const registerVendor = useAuthStore((s) => s.registerVendor);
  const status = useAuthStore((s) => s.status);

  const [role, setRole] = useState<Role>('customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [attempt, setAttempt] = useState<AuthAttempt | null>(null);

  const loading = status === 'loading';

  const validate = (): boolean => {
    const errors: Record<string, string | undefined> = {};
    if (!name.trim()) errors.name = t(lang, 'errNameRequired');
    if (!email.trim()) errors.email = t(lang, 'errEmailRequired');
    else if (!EMAIL_RE.test(email.trim())) errors.email = t(lang, 'errEmailInvalid');
    if (!phone.trim()) errors.phone = t(lang, 'errPhoneRequired');
    else if (!PHONE_RE.test(phone.replace(/\D/g, ''))) errors.phone = t(lang, 'errPhoneDigits');
    if (!password) errors.password = t(lang, 'errPasswordRequired');
    else if (password.length < MIN_PASSWORD_LENGTH) errors.password = t(lang, 'errPasswordShort');
    setFieldErrors(errors);
    return Object.values(errors).every((v) => v === undefined);
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setAttempt(null);
    const input: RegisterInput = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.replace(/\D/g, ''),
      password,
    };
    const result =
      role === 'customer' ? await registerCustomer(input) : await registerVendor(input);

    // Registration auto-authenticates by returning a token (backend contract),
    // so a success already routes via the store + role guards.
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>{t(lang, 'registerTitle')}</Text>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>
            {t(lang, 'registerSubtitle', {
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
          label="registerAs"
        />

        <FormTextField
          label={t(lang, 'name')}
          placeholder={t(lang, 'namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          error={fieldErrors.name}
          editable={!loading}
        />
        <FormTextField
          label={t(lang, 'email')}
          placeholder={t(lang, 'emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={fieldErrors.email}
          editable={!loading}
        />
        <FormTextField
          label={t(lang, 'phone')}
          placeholder={t(lang, 'phonePlaceholder')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={10}
          error={fieldErrors.phone}
          editable={!loading}
        />
        <FormTextField
          label={t(lang, 'password')}
          placeholder={t(lang, 'passwordPlaceholder')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          error={fieldErrors.password}
          editable={!loading}
        />

        <FormError message={authAuthErrorMessage(lang, attempt)} />

        <Button
          title={t(lang, 'registerButton')}
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
        />

        <GoogleButton />

        <View style={styles.footer}>
          <Link href="/login" replace style={styles.footerLink}>
            <Text style={[styles.footerLinkText, { color: palette.primary }]}>
              {t(lang, 'goToLogin')}
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
    marginTop: spacing.sm,
  },
  footerLink: { paddingVertical: spacing.xxs },
  footerLinkText: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
});
