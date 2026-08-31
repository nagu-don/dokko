import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderCard } from '@/components/order';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMyOrders } from '@/hooks/useMyOrders';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme';
import { orderBucket } from '@/utils/orderModel';

/**
 * Customer order history — the read-only, server-authoritative list from
 * GET /api/orders/my. Active orders (searching/pending/processing/
 * assigned-not-delivered) are shown first so an order needing attention is
 * easy to spot; completed / failed / cancelled are grouped under "Past".
 *
 * Server state lives in TanStack Query (['orders','mine']) and polls only
 * while any order is non-terminal (see hooks/useMyOrders). Pull-to-refresh
 * and the Refresh button reuse that same query's refetch — one source of truth.
 *
 * When reached from checkout's "uncertain" outcome (`?from=uncertain`), an
 * explanatory banner explains the order may or may not exist and advises
 * against re-placing it (no blind resubmit, no duplicate-order risk).
 */
export default function OrderHistoryScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const uncertain = params.from === 'uncertain';

  const { data, isLoading, isError, isRefetching, refetch } = useMyOrders();

  const active = useMemo(() => (data ?? []).filter((o) => orderBucket(o) === 'active'), [data]);
  // Completed / failed / cancelled grouped under "past", newest first (API sorts desc).
  const past = useMemo(() => (data ?? []).filter((o) => orderBucket(o) !== 'active'), [data]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  const openOrder = (id: string) => {
    router.push({ pathname: '/orders/[id]', params: { id } });
  };

  let content;
  if (isLoading && !data) {
    content = <LoadingView label={t(lang, 'ordersLoading')} />;
  } else if (isError && !data) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'ordersErrorTitle')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {t(lang, 'ordersErrorHint')}
        </Text>
        <Button title={t(lang, 'retry')} onPress={() => refetch()} />
      </View>
    );
  } else {
    const hasOrders = (data ?? []).length > 0;
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
        {/* Recoverable error banner when a refresh fails but we still have data */}
        {isError && data ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'ordersErrorHint')}
            </Text>
          </View>
        ) : null}

        {uncertain && hasOrders ? (
          <View style={[styles.uncertainCard, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.uncertainTitle, { color: palette.danger }]}>
              {t(lang, 'uncertainRecoveryTitle')}
            </Text>
            <Text style={[styles.uncertainText, { color: palette.text }]}>
              {t(lang, 'uncertainRecoveryHint')}
            </Text>
          </View>
        ) : null}

        {!hasOrders ? (
          <View style={styles.centered}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'ordersEmptyTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'ordersEmptyHint')}
            </Text>
          </View>
        ) : (
          <>
            <Section
              title={active.length ? t(lang, 'activeOrders') : undefined}
              orders={active}
              palette={palette}
              openOrder={openOrder}
            />
            <Section
              title={active.length && past.length ? t(lang, 'pastOrders') : undefined}
              orders={past}
              palette={palette}
              openOrder={openOrder}
            />
          </>
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
          {t(lang, 'myOrders')}
        </Text>
        {data && data.length > 0 ? (
          <Pressable
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'ordersRefreshAria')}
            hitSlop={8}
            style={({ pressed }) => [styles.refresh, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.refreshText, { color: palette.primary }]}>{t(lang, 'ordersRefresh')}</Text>
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>
      {content}
    </View>
  );
}

function Section({
  title,
  orders,
  palette,
  openOrder,
}: {
  title: string | undefined;
  orders: import('@/types').OrderRead[];
  palette: import('@/theme').Palette;
  openOrder: (id: string) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>{title}</Text>
      ) : null}
      <View style={styles.list}>
        {orders.map((o) => (
          <OrderCard key={o._id} order={o} onPress={() => openOrder(o._id)} />
        ))}
      </View>
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
  uncertainCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  uncertainTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  uncertainText: {
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  list: {
    gap: spacing.md,
  },
});
