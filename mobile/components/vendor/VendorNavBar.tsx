import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t } from '@/i18n';
import { fs, lh, spacing } from '@/theme';
import type { Palette } from '@/theme';
import { useAuthStore } from '@/stores/authStore';

/**
 * Vendor portal top navigation bar (two-row layout).
 *
 * Row 1: Brand ("Dokko Vendor") — spacer — notices — settings gear — Log out
 * Row 2: Section links (New Request / Accepted Orders / Items Needed)
 *
 * Mirrors the web vendor portal's navbar (vendor/src/components/navbar):
 *  - neutral theme-surface background with a subtle border/shadow
 *  - per-section accent color: New Request → green, Accepted → blue,
 *    Items Needed → yellow
 *  - active link is a tinted pill
 *  - always-on actions: notices (megaphone), settings gear + red Log out
 *    icon on TOP-LEVEL screens only.
 *
 * The Log out icon is confirmation-gated (Alert) and is NOT rendered on
 * detail screens (hideMenu) — those collapse row 1 to back + centered title
 * and stay visually unchanged.
 */
export type VendorSection = 'dashboard' | 'accepted' | 'items' | 'notices';

interface VendorNavBarProps {
  title?: string;
  onBack?: () => void;
  activeSection?: VendorSection;
  menuOverride?: ReactNode;
  hideMenu?: boolean;
  right?: ReactNode;
}

export function VendorNavBar({
  title,
  onBack,
  activeSection = 'dashboard',
  menuOverride,
  hideMenu,
  right,
}: VendorNavBarProps) {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const navigate = (path: Href) => router.replace(path);

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  const confirmSignOut = () => {
    Alert.alert(t(lang, 'vendorSignOutConfirm'), undefined, [
      { text: t(lang, 'cancel'), style: 'cancel' },
      {
        text: t(lang, 'signOut'),
        style: 'destructive',
        onPress: () => void handleSignOut(),
      },
    ]);
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  };

  const accent = accentFor(palette, activeSection);

  const sections: { key: VendorSection; label: string; path: Href }[] = [
    { key: 'dashboard', label: t(lang, 'vendorDashboardTitle'), path: '/dashboard' },
    { key: 'accepted', label: t(lang, 'vendorAcceptedOrdersTitle'), path: '/accepted' as Href },
    { key: 'items', label: t(lang, 'vendorItemsNeededTitle'), path: '/items' as Href },
    { key: 'notices', label: t(lang, 'vendorNoticesTitle'), path: '/notices' as Href },
  ];

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          paddingTop: insets.top,
        },
      ]}
    >
      {/* Row 1: brand / back + title | actions */}
      <View style={styles.topRow}>
        {hideMenu ? (
          <>
            {onBack ? (
              <Pressable
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel={t(lang, 'backAria')}
                hitSlop={8}
                style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.backGlyph, { color: palette.text }]}>‹</Text>
              </Pressable>
            ) : (
              <View style={styles.backSpacer} />
            )}
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {title}
            </Text>
          </>
        ) : (
          <View style={styles.brand}>
            <Text style={[styles.brandText, { color: palette.text }]}>
              Dokko <Text style={{ color: accent.color }}>Vendor</Text>
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {right}
          <Pressable
            onPress={() => router.push('/notices')}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'vendorNoticesTitle')}
            accessibilityState={{ selected: activeSection === 'notices' }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons
              name="megaphone"
              size={22}
              color={activeSection === 'notices' ? accent.color : palette.text}
            />
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'settings')}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="settings" size={22} color={palette.text} />
          </Pressable>
          {!hideMenu ? (
            <Pressable
              onPress={confirmSignOut}
              accessibilityRole="button"
              accessibilityLabel={t(lang, 'signOut')}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name="log-out-outline" size={22} color={palette.danger} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Row 2: section links */}
      {!hideMenu && (
        <View style={styles.menuRow}>
          {menuOverride
            ? menuOverride
            : sections.map((s) => {
                const active = s.key === activeSection;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => navigate(s.path)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.menuItem,
                      active && { backgroundColor: accent.backgroundColor },
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.menuLabel,
                        { color: active ? accent.color : palette.textMuted },
                        active && { fontWeight: '600' },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
        </View>
      )}
    </View>
  );
}

interface Accent {
  color: string;
  backgroundColor: string;
}

function accentFor(palette: Palette, section: VendorSection): Accent {
  switch (section) {
    case 'accepted':
      return { color: palette.accentBlue, backgroundColor: palette.accentBlueBg };
    case 'items':
      return { color: palette.accentYellow, backgroundColor: palette.accentYellowBg };
    case 'notices':
      return { color: palette.accentPurple, backgroundColor: palette.accentPurpleBg };
    case 'dashboard':
    default:
      return { color: palette.accentGreen, backgroundColor: palette.accentGreenBg };
  }
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  back: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
  },
  backGlyph: {
    fontSize: fs(34),
    fontWeight: '400',
    lineHeight: lh(36),
    textAlign: 'center',
  },
  backSpacer: {
    width: spacing.xl + 8,
  },
  title: {
    flex: 1,
    fontSize: fs(17),
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  brand: {
    flex: 1,
  },
  brandText: {
    fontSize: fs(17),
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  menuItem: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: fs(13),
    fontWeight: '500',
    textAlign: 'center',
  },
});
