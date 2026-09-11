import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, FormError, FormTextField } from '@/components/form';
import { BrandTopBar, BRAND_BG } from '@/components/BrandTopBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMyProfile } from '@/hooks/useMyProfile';
import { t } from '@/i18n';
import { reportIssue } from '@/services/issues/reportIssue';
import { radius, spacing } from '@/theme';

/**
 * Customer "Report a problem" — a manaul entry point for reporting a bad
 * delivery, a payment issue, or an app bug.
 *
 * Opened either generically (from Settings, no `orderId`) or pre-filled for a
 * specific order (from the order detail screen, with `orderId`). Submits a
 * `user_report` to the backend issue-reporting endpoint; on success shows an
 * inline confirmation then navigates back. Failures surface inline (never a
 * silent drop).
 */
export default function ReportProblemScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const orderIdParam = typeof orderId === 'string' ? orderId : undefined;

  const { data: profile } = useMyProfile();
  const profileEmail = typeof profile?.email === 'string' ? profile.email : undefined;

  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const emailSeeded = useRef(false);
  const navigateBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (emailSeeded.current || !profileEmail) return;
    emailSeeded.current = true;
    setEmail(profileEmail);
  }, [profileEmail]);

  useEffect(
    () => () => {
      if (navigateBackTimer.current) clearTimeout(navigateBackTimer.current);
    },
    []
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  const handleSubmit = async () => {
    if (submitting || submitted) return;

    setSubmitError('');
    setDescriptionError('');

    const text = description.trim();
    if (text.length < 10) {
      setDescriptionError(t(lang, 'reportProblemDescriptionShort'));
      return;
    }

    setSubmitting(true);
    try {
      const metadata: Record<string, unknown> = {};
      if (orderIdParam) metadata.orderId = orderIdParam;
      const contactEmail = email.trim();
      if (contactEmail) metadata.contactEmail = contactEmail;

      await reportIssue({
        type: 'user_report',
        severity: 'medium',
        message: text,
        route: orderIdParam ? '/orders/[id]' : '/settings',
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });

      setSubmitting(false);
      setSubmitted(true);
      navigateBackTimer.current = setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/home');
        }
      }, 900);
    } catch {
      setSubmitting(false);
      setSubmitError(t(lang, 'reportProblemError'));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.navBar, { backgroundColor: BRAND_BG, paddingTop: insets.top }]}>
        <BrandTopBar
          title={t(lang, 'reportProblemTitle')}
          onBack={submitted ? undefined : handleBack}
          backAriaLabel={t(lang, 'backAria')}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          {submitted ? (
            <View style={[styles.successCard, { backgroundColor: palette.surface, borderColor: palette.primary }]}>
              <Text style={[styles.successText, { color: palette.text }]}>
                {t(lang, 'reportProblemSuccess')}
              </Text>
            </View>
          ) : (
            <>
              {submitError ? <FormError message={submitError} /> : null}

              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                  {t(lang, 'reportProblemDescriptionLabel')}
                </Text>
                <FormTextField
                  label=""
                  value={description}
                  onChangeText={(value) => {
                    setDescription(value);
                    if (descriptionError) setDescriptionError('');
                  }}
                  placeholder={t(lang, 'reportProblemPlaceholder')}
                  placeholderTextColor={palette.textMuted}
                  multiline
                  numberOfLines={6}
                  style={styles.textArea}
                  editable={!submitting}
                  error={descriptionError}
                />
              </View>

              <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                  {t(lang, 'reportProblemEmailLabel')}
                </Text>
                <FormTextField
                  label=""
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t(lang, 'reportProblemEmailPlaceholder')}
                  placeholderTextColor={palette.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </View>

              <Button
                title={t(lang, 'reportProblemSubmit')}
                onPress={() => void handleSubmit()}
                loading={submitting}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navBar: {
    paddingBottom: spacing.sm,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 140,
    textAlignVertical: 'top',
  },
  successCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  successText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
});