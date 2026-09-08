import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '@/components/form';
import { VendorNavBar } from '@/components/vendor';
import { LocationPickerModal } from '@/components/location';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useSettingsStore, type AppLang, type ThemeMode } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useUpdateVendorLocation, useUpdateVendorPayout, useVendorProfile } from '@/hooks/useVendorRequests';
import { t, tMsg } from '@/i18n';
import { fs, lh, radius, spacing } from '@/theme';
import type { VendorPresentedOrder } from '@/types';

/**
 * Vendor settings screen — mirrors vendor/src/components/settings/Settings.jsx.
 *
 * Contains:
 *  - Language toggle (en/np)
 *  - Theme toggle (light/dark)
 *  - Working location (change on map)
 *  - Payout info (bank account: holder, bank name, account number)
 */
export default function VendorSettingsScreen() {
  const { palette, lang, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const setLang = useSettingsStore((s) => s.setLang);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const logout = useAuthStore((s) => s.logout);

  const profileQuery = useVendorProfile();
  const profile = profileQuery.data;

  const locationMutation = useUpdateVendorLocation();
  const payoutMutation = useUpdateVendorPayout();

  // location picker
  const [pickerOpen, setPickerOpen] = useState(false);

  // payout editing
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    accountHolder: '',
    bankName: '',
    accountNumber: '',
  });
  const [payoutSaved, setPayoutSaved] = useState(false);

  // prefill payout form from profile
  useEffect(() => {
    if (profile && editingPayout) {
      setPayoutForm({
        accountHolder: profile.payoutAccountHolder ?? '',
        bankName: profile.payoutBankName ?? '',
        accountNumber: '',
      });
    }
  }, [profile, editingPayout]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  const handleLocationPick = async (loc: { lat: number; lng: number }) => {
    setPickerOpen(false);
    locationMutation.mutate(loc);
  };

  const savePayout = () => {
    payoutMutation.mutate(
      {
        payoutMethod: 'bank',
        payoutAccountHolder: payoutForm.accountHolder,
        payoutBankName: payoutForm.bankName,
        payoutAccountNumber: payoutForm.accountNumber,
      },
      {
        onSuccess: () => {
          setEditingPayout(false);
          setPayoutSaved(true);
          setTimeout(() => setPayoutSaved(false), 3000);
        },
      }
    );
  };

  const langOptions: { value: AppLang; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'np', label: 'नेपाली' },
  ];

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t(lang, 'themeLight') },
    { value: 'dark', label: t(lang, 'themeDark') },
  ];

  const payoutDisplay = profile?.payoutMethod
    ? `${t(lang, 'vendorSettingsBankAccount')} — ${profile.payoutAccountNumber || ''}`
    : t(lang, 'vendorSettingsPayoutNotSet');

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <VendorNavBar
        title={t(lang, 'settings')}
        onBack={handleBack}
        hideMenu
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {/* Language */}
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.row}>
            <Text style={[styles.label, { color: palette.text }]}>{t(lang, 'languageLabel')}</Text>
            <Segmented value={lang} onChange={setLang} options={langOptions} />
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <View style={styles.row}>
            <Text style={[styles.label, { color: palette.text }]}>{t(lang, 'themeLabel')}</Text>
            <Segmented value={theme} onChange={setTheme} options={themeOptions} />
          </View>
        </View>

        {/* Working location */}
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.label, { color: palette.text }]}>{t(lang, 'vendorSettingsWorkingLocation')}</Text>
          <Text style={[styles.value, { color: palette.textMuted }]}>
            {profile?.location
              ? `${Number(profile.location.lat).toFixed(5)}, ${Number(profile.location.lng).toFixed(5)}`
              : t(lang, 'notSet')}
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.changeBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.changeBtnText, { color: palette.primary }]}>{t(lang, 'changeOnMap')}</Text>
          </Pressable>
        </View>

        {/* Payout */}
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.label, { color: palette.text }]}>{t(lang, 'vendorSettingsPayout')}</Text>

          {payoutSaved && (
            <View style={[styles.notice, { backgroundColor: palette.accentGreenBg }]}>
              <Text style={[styles.noticeText, { color: palette.accentGreen }]}>
                {t(lang, 'vendorSettingsPayoutUpdated')}
              </Text>
            </View>
          )}

          {!editingPayout && (
            <>
              <Text style={[styles.value, { color: palette.textMuted }]}>{payoutDisplay}</Text>
              <Pressable
                onPress={() => setEditingPayout(true)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.changeBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.changeBtnText, { color: palette.primary }]}>
                  {t(lang, 'vendorSettingsChangePayout')}
                </Text>
              </Pressable>
            </>
          )}

          {editingPayout && (
            <View style={styles.payoutForm}>
              <TextInput
                style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                placeholder={t(lang, 'vendorSettingsAccountHolder')}
                placeholderTextColor={palette.textMuted}
                value={payoutForm.accountHolder}
                onChangeText={(v) => setPayoutForm((p) => ({ ...p, accountHolder: v }))}
              />
              <TextInput
                style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                placeholder={t(lang, 'vendorSettingsBankName')}
                placeholderTextColor={palette.textMuted}
                value={payoutForm.bankName}
                onChangeText={(v) => setPayoutForm((p) => ({ ...p, bankName: v }))}
              />
              <TextInput
                style={[styles.input, { color: palette.text, borderColor: palette.border }]}
                placeholder={t(lang, 'vendorSettingsAccountNumber')}
                placeholderTextColor={palette.textMuted}
                value={payoutForm.accountNumber}
                onChangeText={(v) => setPayoutForm((p) => ({ ...p, accountNumber: v }))}
              />

              {payoutMutation.isError ? (
                <Text style={[styles.error, { color: palette.danger }]}>
                  {tMsg(lang, (payoutMutation.error as Error)?.message) || t(lang, 'somethingWrong')}
                </Text>
              ) : null}

              <View style={styles.payoutActions}>
                <Button
                  variant="secondary"
                  title={t(lang, 'cancel')}
                  onPress={() => setEditingPayout(false)}
                />
                <Button
                  title={payoutMutation.isPending ? t(lang, 'pleaseWait') : t(lang, 'vendorSettingsSavePayout')}
                  onPress={savePayout}
                  loading={payoutMutation.isPending}
                  disabled={payoutMutation.isPending}
                />
              </View>
            </View>
          )}
        </View>

        {/* Sign out */}
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Pressable
            onPress={() => void handleSignOut()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.signOutBtn,
              { backgroundColor: palette.danger, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.signOutText}>{t(lang, 'signOut')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <LocationPickerModal
        visible={pickerOpen}
        initial={profile?.location ?? null}
        title={t(lang, 'vendorSetLocationTitle')}
        showNote={false}
        showName={false}
        persistOnConfirm={false}
        onConfirm={handleLocationPick}
        onCancel={() => setPickerOpen(false)}
      />
    </View>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

function Segmented<T extends string>({ value, onChange, options }: SegmentedProps<T>) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segBtn,
              { opacity: pressed ? 0.6 : 1 },
              active && { backgroundColor: palette.primary },
            ]}
          >
            <Text style={[styles.segText, { color: active ? '#FFFFFF' : palette.text }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fs(15),
    fontWeight: '600',
  },
  value: {
    fontSize: fs(14),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  segText: {
    fontSize: fs(14),
    fontWeight: '600',
    textAlign: 'center',
  },
  changeBtn: {
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  changeBtnText: {
    fontSize: fs(14),
    fontWeight: '700',
    textAlign: 'center',
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  noticeText: {
    fontSize: fs(13),
    fontWeight: '600',
  },
  payoutForm: {
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fs(14),
  },
  error: {
    fontSize: fs(13),
    lineHeight: lh(18),
  },
  payoutActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  signOutBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: fs(16),
    fontWeight: '700',
    textAlign: 'center',
  },
});
