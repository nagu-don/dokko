import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { LoadingView } from '@/components/LoadingView';
import { LocationPickerModal } from '@/components/location';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  useUpdateVendorLocation,
  useVendorProfile,
} from '@/hooks/useVendorRequests';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme';
import { isVendorReady } from '@/utils/vendorModel';

/**
 * First-run onboarding for a vendor: choose a working location.
 *
 * The backend only admits vendors with `hasSetLocation === true` into its
 * request lists, so this is the single required setup step. Payout info is
 * NOT required to receive requests, so no payout fields are gathered here
 * (the backend exposes payout mutations but they belong to a later phase).
 *
 * No availability switch: `isAvailable` has no vendor-facing endpoint — the
 * limitation is documented in the dashboard + mobileref, never faked here.
 */
export default function VendorOnboardingScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const profileQuery = useVendorProfile();
  const locationMutation = useUpdateVendorLocation();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const profile = profileQuery.data;

  const handleLocationPick = async (dropoff: { lat: number; lng: number }) => {
    setPickerOpen(false);
    locationMutation.mutate(
      { lat: dropoff.lat, lng: dropoff.lng },
      {
        onSuccess: () => setSaved(true),
      }
    );
  };

  if (profileQuery.isLoading && !profile) {
    return <LoadingView label={t(lang, 'foundationReady')} />;
  }

  if (!profile) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.background }]}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>{t(lang, 'vendorProfileError')}</Text>
        <Button title={t(lang, 'vendorRefresh')} onPress={() => profileQuery.refetch()} />
      </View>
    );
  }

  if (isVendorReady(profile)) {
    // Already set up (e.g. arrived here via a deep link) — fall through.
    return <Redirect href="/dashboard" />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <Text style={[styles.title, { color: palette.text }]}>{t(lang, 'vendorOnboardingTitle')}</Text>
        <Text style={[styles.hint, { color: palette.textMuted }]}>
          {t(lang, 'vendorOnboardingHint1')}
        </Text>
        <Text style={[styles.hint, { color: palette.textMuted }]}>
          {t(lang, 'vendorOnboardingHint2')}
        </Text>

        {saved ? (
          <View
            style={[styles.doneCard, { backgroundColor: palette.surface, borderColor: palette.primary }]}
          >
            <Text style={[styles.doneText, { color: palette.text }]}>
              {t(lang, 'vendorOnboardingDone')}
            </Text>
            <Button title={t(lang, 'vendorGoToDashboard')} onPress={() => router.replace('/dashboard')} />
          </View>
        ) : (
          <Button
            title={t(lang, 'vendorOnboardingCTA')}
            loading={locationMutation.isPending}
            disabled={locationMutation.isPending}
            onPress={() => setPickerOpen(true)}
          />
        )}

        {locationMutation.isError && !saved ? (
          <Text style={[styles.saveError, { color: palette.danger }]}>
            {t(lang, 'vendorLocationSaveError')}
          </Text>
        ) : null}
      </ScrollView>

      <LocationPickerModal
        visible={pickerOpen}
        initial={profile.location ?? null}
        title={t(lang, 'vendorSetLocationTitle')}
        hint={t(lang, 'vendorSetLocationHint')}
        showNote={false}
        persistOnConfirm={false}
        onConfirm={handleLocationPick}
        onCancel={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  hint: {
    fontSize: 15,
    lineHeight: 22,
  },
  doneCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  doneText: {
    fontSize: 15,
    fontWeight: '600',
  },
  saveError: {
    fontSize: 13,
    lineHeight: 18,
  },
});