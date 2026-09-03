import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VendorOrderCard } from '@/components/order';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useVendorAcceptedOrders } from '@/hooks/useVendorRequests';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme';

/**
 * Vendor Active Orders (Phase 13). Lists the orders currently assigned to this
 * vendor but not yet completed, from the SERVER-authoritative
 * GET /api/vendors/requests/accepted (status=Processing, payment not
 * completed, sorted by acceptedAt desc).
 *
 * Uses the shared ['vendor','requests','accepted'] query — the SAME source the
 * accepted-order screen reads — so acceptance and completion mutations
 * invalidate it and this list reflects the server immediately. Refreshed on
 * mount/focus + pull-to-refresh only (no live polling).
 *
 * Tapping a card opens the accepted-order workflow (/accepted/[id]) which owns
 * payment collection and delivery completion — nothing here is duplicated.
 */
export default function VendorActiveOrdersScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, isError, isRefetching, refetch } = useVendorAcceptedOrders();
  const orders = data ?? [];

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  };

  const openOrder = (id: string) => {
    router.push({ pathname: '/accepted/[id]', params: { id } });
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
          {t(lang, 'vendorActiveOrdersErrorTitle')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {t(lang, 'vendorActiveOrdersErrorHint')}
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
              {t(lang, 'vendorActiveOrdersErrorHint')}
            </Text>
          </View>
        ) : null}

        {orders.length === 0 ? (
          <View style={styles.centered}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorActiveOrdersEmptyTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorActiveOrdersEmptyHint')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {orders.map((order) => (
              <VendorOrderCard
                key={order.id}
                order={order}
                stageLabel={t(lang, 'vendorOrderActiveStage')}
                dateLabel="vendorOrderAcceptedOn"
                dateIso={order.acceptedAt}
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
          {t(lang, 'vendorActiveOrdersTitle')}
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
