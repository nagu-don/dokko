import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ItemCard } from '@/components/catalog';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/form';
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

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: palette.text }]}>{t(lang, 'homeBrowseTitle')}</Text>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>{t(lang, 'tagline')}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/cart')}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'openCartAria')}
          hitSlop={8}
          style={({ pressed }) => [styles.cartBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={[styles.cartIconBox, { borderColor: palette.border }]}>
            <View style={[styles.cartHandle, { borderColor: palette.textMuted }]} />
            <View style={[styles.cartBasket, { backgroundColor: palette.textMuted }]} />
          </View>
          {cartHydrated && totalKg > 0 ? (
            <View style={[styles.cartBadge, { backgroundColor: palette.primary }]}>
              <Text style={[styles.cartBadgeText, { color: palette.primaryText }]}>
                {num(lang, totalKg.toFixed(1))}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => router.push('/orders')}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'myOrders')}
          hitSlop={8}
          style={({ pressed }) => [styles.ordersLink, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.ordersText, { color: palette.primary }]}>{t(lang, 'myOrders')}</Text>
        </Pressable>
        <Pressable
          onPress={handleSignOut}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.signOut, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.signOutText, { color: palette.danger }]}>{t(lang, 'signOut')}</Text>
        </Pressable>
      </View>

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
            renderItem={({ item }) => <ItemCard group={item} />}
            ItemSeparatorComponent={Separator}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
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
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heading: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  signOut: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
  },
  ordersLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  ordersText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cartBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  cartIconBox: {
    width: 30,
    height: 26,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  cartHandle: {
    position: 'absolute',
    top: 3,
    left: 5,
    width: 18,
    height: 8,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  cartBasket: {
    width: 18,
    height: 12,
    borderRadius: 2,
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -5,
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontSize: 11,
    fontWeight: '800',
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