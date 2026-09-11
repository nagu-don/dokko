import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BrandTopBar, BRAND_BG } from '@/components/BrandTopBar';
import { LocationPickerModal } from '@/components/location';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useSettingsStore, type AppLang, type ThemeMode } from '@/stores/settingsStore';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme';
import { loadPreferredDropoff, savePreferredDropoff } from '@/utils/location';
import type { Dropoff } from '@/types';

/**
 * Customer settings — mirrors the web app's Settings gear panel: language,
 * theme, and the preferred drop-off point. Values come from the local
 * settings store (AsyncStorage) and persist immediately on change. The
 * preferred drop-off reuses the checkout location picker and saves to the
 * same `dokkoPreferredDropoff` key the web app uses.
 */
export default function SettingsScreen() {
  const { palette, lang, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const setLang = useSettingsStore((s) => s.setLang);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const [preferred, setPreferred] = useState<Dropoff | null>(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void loadPreferredDropoff().then(setPreferred);
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  const savePreferred = (dropoff: Dropoff) => {
    void savePreferredDropoff(dropoff);
    setPreferred(dropoff);
    setPicking(false);
  };

  const langOptions: { value: AppLang; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'np', label: 'नेपाली' },
  ];

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t(lang, 'themeLight') },
    { value: 'dark', label: t(lang, 'themeDark') },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.navBar, { backgroundColor: BRAND_BG, paddingTop: insets.top }]}>
        <BrandTopBar title={t(lang, 'settings')} onBack={handleBack} backAriaLabel={t(lang, 'backAria')} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
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

        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.dropoffRow}>
            <Text style={[styles.label, { color: palette.text }]}>{t(lang, 'preferredDropoff')}</Text>
            <Text style={[styles.dropoffValue, { color: palette.textMuted }]}>
              {preferred?.name ? preferred.name : preferred?.label ? preferred.label : t(lang, 'notSet')}
            </Text>
            {preferred ? (
              <Pressable
                onPress={() => setPicking(true)}
                accessibilityRole="button"
                accessibilityLabel={t(lang, 'changeOnMap')}
                style={({ pressed }) => [styles.changeBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.changeBtnText, { color: palette.primary }]}>{t(lang, 'changeOnMap')}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'addNewLocation')}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.addBtnText, { color: palette.primary }]}>{t(lang, 'addNewLocation')}</Text>
          </Pressable>
        </View>

        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Pressable
            onPress={() => router.push('/report-problem')}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'reportProblem')}
            style={({ pressed }) => [styles.reportRow, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.label, { color: palette.text }]}>{t(lang, 'reportProblem')}</Text>
            <Text style={[styles.reportChevron, { color: palette.textMuted }]}>›</Text>
          </Pressable>
        </View>
      </ScrollView>

      <LocationPickerModal
        visible={picking || adding}
        initial={adding ? null : preferred}
        title={t(lang, 'selectPreferredTitle')}
        onConfirm={savePreferred}
        onCancel={() => {
          setPicking(false);
          setAdding(false);
        }}
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
  navBar: {
    paddingBottom: spacing.sm,
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
    fontSize: 15,
    fontWeight: '600',
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
    fontSize: 14,
    fontWeight: '600',
  },
  dropoffRow: {
    gap: spacing.sm,
  },
  dropoffValue: {
    fontSize: 14,
  },
  changeBtn: {
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  changeBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  addBtn: {
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reportChevron: {
    fontSize: 24,
    lineHeight: 24,
  },
});
