import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ItemCard } from '@/components/catalog';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/form';
import { BRAND_BG } from '@/components/BrandTopBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useApprovedItems } from '@/hooks/useApprovedItems';
import { t, num } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { radius, spacing } from '@/theme';
import { cartTotalKg } from '@/utils/cart';
import { catalogErrorMessage } from '@/utils/catalogMessages';
import { buildGroups, searchGroups, MATCH_THRESHOLD } from '@/utils/search';
import type { ItemGroup } from '@/types';

/**
 * Customer home — the real marketplace start.
 *
 * Header → search → approved item catalog (FlatList of collapsible group
 * cards). Search is fully client-side against the cached approved-item
 * dataset (same fuzzy matcher the web apps use); no per-character network
 * requests. Loading / error / empty / no-results are distinct states.
 */
export default function CustomerHomeScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const cartLines = useCartStore((s) => s.lines);
  const cartHydrated = useCartStore((s) => s.hydrated);
  const totalKg = cartTotalKg(cartLines);

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const { data, isLoading, isError, error, refetch } = useApprovedItems();

  const groups = useMemo(() => buildGroups(data ?? []), [data]);

  const visibleGroups = useMemo(
    () => searchGroups(query, groups, MATCH_THRESHOLD),
    [query, groups]
  );

  // No query -> alphabetical (english/nepali locale); query -> relevance order.
  const sortedGroups = useMemo(() => {
    if (query.trim()) return visibleGroups;
    const sorted = [...visibleGroups];
    const displayName = (g: ItemGroup) => (lang === 'np' && g.nepName ? g.nepName : g.name).toLowerCase();
    sorted.sort((a, b) => displayName(a).localeCompare(displayName(b), lang === 'np' ? 'ne' : 'en'));
    return sorted;
  }, [visibleGroups, query, lang]);

  const hasItems = data != null && data.length > 0;
  const isNoResults = hasItems && query.trim().length > 0 && visibleGroups.length === 0;

  // Stable inline renderer so VirtualizedList can re-use rendered group
  // cards without rebuilding them on every parent re-render.
  const renderGroup = useCallback(
    ({ item }: { item: ItemGroup }) => <ItemCard group={item} />,
    []
  );

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.navBar, { backgroundColor: BRAND_BG, paddingTop: insets.top }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandHeading}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <Pressable
            onPress={() => router.push('/cart')}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'openCartAria')}
            hitSlop={8}
            style={({ pressed }) => [styles.navIconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="cart" size={26} color="#FFFFFF" />
            {cartHydrated && totalKg > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{num(lang, totalKg.toFixed(1))}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'settings')}
            hitSlop={8}
            style={({ pressed }) => [styles.navIconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="settings" size={24} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => router.push('/orders')}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'myOrders')}
            hitSlop={8}
            style={({ pressed }) => [styles.ordersLink, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.ordersText}>{t(lang, 'myOrders')}</Text>
          </Pressable>
          <Pressable
            onPress={handleSignOut}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.signOut, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.signOutText}>{t(lang, 'signOut')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.searchRow,
            {
              backgroundColor: palette.surface,
              borderColor: focused ? palette.primary : palette.border,
            },
          ]}
        >
        <TextInput
          style={[styles.searchInput, { color: palette.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder={t(lang, 'searchItemsPlaceholder')}
          placeholderTextColor={palette.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'clearSearchAria')}
            hitSlop={8}
          >
            <Text style={[styles.clearGlyph, { color: palette.textMuted }]}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.content}>
        {isLoading && !data ? (
          <LoadingView label={t(lang, 'loadingCatalog')} />
        ) : isError && !data ? (
          <View style={styles.centered}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'catalogErrorTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {catalogErrorMessage(lang, error)}
            </Text>
            <Button title={t(lang, 'retry')} onPress={() => refetch()} />
          </View>
        ) : isNoResults ? (
          <View style={styles.centered}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'noItemsMatched', { query: query.trim() })}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'tryShorterSearch')}
            </Text>
            <Pressable onPress={() => setQuery('')} accessibilityRole="button">
              <Text style={[styles.link, { color: palette.primary }]}>{t(lang, 'showAllItems')}</Text>
            </Pressable>
          </View>
        ) : hasItems ? (
          <FlatList
            data={sortedGroups}
            keyExtractor={(group) => group.key}
            renderItem={renderGroup}
            ItemSeparatorComponent={Separator}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={12}
            removeClippedSubviews
          />
        ) : (
          <View style={styles.centered}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'catalogEmptyTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'catalogEmptyHint')}
            </Text>
          </View>
        )}
        </View>

        {cartHydrated && totalKg > 0 ? (
          <Button
            title={t(lang, 'proceedWithOrder')}
            onPress={() => router.push('/cart')}
            variant="brand"
          />
        ) : null}
      </View>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navBar: {
    paddingBottom: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  brandHeading: {
    flex: 1,
    alignItems: 'flex-start',
    gap: spacing.xxs,
  },
  logo: {
    width: 40.8,
    height: 40.8,
  },
  navIconBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 20,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: BRAND_BG,
  },
  signOut: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ordersLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  ordersText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  clearGlyph: {
    fontSize: 16,
    paddingLeft: spacing.sm,
  },
  content: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateHint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  link: {
    fontSize: 15,
    fontWeight: '700',
    padding: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.md,
  },
});