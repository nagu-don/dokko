import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VendorOrderCard } from '@/components/order';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useVendorCompletedOrders } from '@/hooks/useVendorRequests';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme';

/**
 * Vendor Completed Orders / history (Phase 13). Lists this vendor's completed
 * orders from the SERVER-authoritative GET /api/vendors/requests/completed
 * (paymentStatus === "completed" for this vendor, sorted by updatedAt desc).
 *
 * Every field is the order's own server snapshot — item names/prices/quantities
 * and totals are historical, never rebuilt from the live catalog. This is a
 * read-only screen: no payment or completion actions here.
 *
 * Shared ['vendor','requests','completed'] query; invalidated after a
 * confirmed delivery completion so a freshly completed order appears. Refreshed
 * on mount/focus + pull-to-refresh only (no live polling).
 *
 * Tapping a card opens the read-only completed order detail (/completed/[id]).
 */
export default function VendorCompletedOrdersScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, isError, isRefetching, refetch } = useVendorCompletedOrders();
  const orders = data ?? [];

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  };

  const openOrder = (id: string) => {
    router.push({ pathname: '/completed/[id]', params: { id } });
  };

  let content;

  if (isLoading && orders.length === 0) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorRequestsLoading')}
        </Text>
      </View>
    );
  } else if (isError && orders.length === 0) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorCompletedOrdersErrorTitle')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {t(lang, 'vendorCompletedOrdersErrorHint')}
        </Text>
        <Button title={t(lang, 'retry')} onPress={() => refetch()} />
      </View>
    );
  } else {
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
      >
        {/* Recoverable error banner when a refresh fails but data is preserved */}
        {isError && orders.length > 0 ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'vendorCompletedOrdersErrorHint')}
            </Text>
          </View>
        ) : null}

        {orders.length === 0 ? (
          <View style={styles.centered}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorCompletedOrdersEmptyTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorCompletedOrdersEmptyHint')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {orders.map((order) => (
              <VendorOrderCard
                key={order.id}
                order={order}
                dateLabel="vendorOrderCompletedOn"
                dateIso={order.completedAt}
                onPress={() => openOrder(order.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'backAria')}
          hitSlop={8}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.backGlyph, { color: palette.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: palette.text }]} numberOfLines={1}>
          {t(lang, 'vendorCompletedOrdersTitle')}
        </Text>
        {orders.length > 0 ? (
          <Pressable
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'ordersRefreshAria')}
            hitSlop={8}
            style={({ pressed }) => [styles.refresh, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.refreshText, { color: palette.primary }]}>
              {t(lang, 'vendorRefresh')}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  back: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
  },
  backGlyph: {
    fontSize: 34,
    fontWeight: '400',
    lineHeight: 36,
  },
  topTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  topSpacer: {
    width: spacing.xl + 8,
  },
  refresh: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
    marginRight: -spacing.sm,
  },
  refreshText: {
    fontSize: 14,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
  },
  centered: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
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
  inlineError: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  inlineErrorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: spacing.md,
  },
});
