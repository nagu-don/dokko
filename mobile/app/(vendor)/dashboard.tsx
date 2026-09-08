import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { LoadingView } from '@/components/LoadingView';
import { useAppTheme } from '@/hooks/useAppTheme';
import { VendorNavBar } from '@/components/vendor';
import { useVendorProfile, useVendorRequests } from '@/hooks/useVendorRequests';
import { t, money, num, iname } from '@/i18n';
import { fs, lh, radius, spacing } from '@/theme';
import { isVendorReady, vendorDistanceLabel } from '@/utils/vendorModel';

/**
 * Vendor dashboard (Phase 9).
 *
 * Readiness gate: a vendor must set a working location (hasSetLocation) before
 * the backend surfaces them in any request list — that is the ONLY vendor-side
 * eligibility switch the API exposes. Until then this screen redirects to the
 * onboarding flow. `isAvailable` is not readable/writable by vendors (see
 * vendorService.ts), so availability is shown as a documented server note, not
 * a local switch.
 *
 * The incoming request list is read from GET /api/vendors/requests/new
 * (server-filtered). It is refreshed only on user action — pull-to-refresh or
 * the Refresh button on the detail screen — never polled or auto-refetched.
 * Distance/badges come precomputed from the server; the app never recomputes.
 */
export default function VendorDashboardScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const profileQuery = useVendorProfile();
  const requestsQuery = useVendorRequests();

  const profile = profileQuery.data;
  const requests = requestsQuery.data ?? [];

  const refreshing = profileQuery.isRefetching || requestsQuery.isRefetching;
  const onRefresh = () => {
    void profileQuery.refetch();
    void requestsQuery.refetch();
  };

  let content;

  if (profileQuery.isLoading && !profile) {
    content = <LoadingView label={t(lang, 'foundationReady')} />;
  } else if (!profile) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>{t(lang, 'vendorProfileError')}</Text>
        <Button title={t(lang, 'vendorRefresh')} onPress={() => profileQuery.refetch()} />
      </View>
    );
  } else if (!isVendorReady(profile)) {
    content = <Redirect href="/onboarding" />;
  } else {
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            {t(lang, 'vendorRequestsSection')}
          </Text>
          <Text style={[styles.sectionCount, { color: palette.textMuted }]}>
            {t(lang, 'vendorRequestsCount', { count: num(lang, requests.length) })}
          </Text>
        </View>

        {requestsQuery.isLoading && requests.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestsLoading')}
            </Text>
          </View>
        ) : requestsQuery.isError && requests.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>{t(lang, 'vendorRequestsError')}</Text>
            <Text style={[styles.emptyHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestsErrorHint')}
            </Text>
            <Button title={t(lang, 'vendorRefresh')} onPress={() => requestsQuery.refetch()} />
          </View>
        ) : requests.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>{t(lang, 'vendorNoRequests')}</Text>
            <Text style={[styles.emptyHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorNoRequestsHint')}
            </Text>
          </View>
        ) : (
          <>
            {requests.map((order) => (
              <Pressable
                key={order.id}
                onPress={() =>
                  router.push({ pathname: '/requests/[id]', params: { id: order.id } })
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.requestCard,
                  { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.cardCode, { color: palette.text }]}>{num(lang, order.code)}</Text>
                  <Text style={[styles.cardTotal, { color: palette.text }]}>
                    {money(lang, order.subtotal)}
                  </Text>
                </View>

                <Text style={[styles.cardCustomer, { color: palette.textMuted }]}>
                  {order.customer.name} · {num(lang, order.customer.phone)}
                </Text>

                <View style={styles.badges}>
                  {typeof order.distanceKm === 'number' && (
                    <View style={[styles.badge, { backgroundColor: palette.primary }]}>
                      <Text style={[styles.badgeText, { color: palette.primaryText }]}>
                        {vendorDistanceLabel(lang, order.distanceKm)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.itemLines}>
                  {order.items.slice(0, 4).map((row, i) => (
                    <View key={i} style={styles.itemLine}>
                      <Text style={[styles.itemName, { color: palette.text }]} numberOfLines={1}>
                        {num(lang, row.quantity)} × {iname(lang, row)}
                      </Text>
                      <Text style={[styles.itemQty, { color: palette.textMuted }]}>
                        {money(lang, row.priceAtOrder)}/{t(lang, 'unitKg')}
                      </Text>
                    </View>
                  ))}
                  {order.items.length > 4 ? (
                    <Text style={[styles.moreItems, { color: palette.textMuted }]}>
                      +{num(lang, order.items.length - 4)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.screenGreen }]}>
      <VendorNavBar
        title={t(lang, 'vendorDashboardTitle')}
        activeSection="dashboard"
      />
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  stateTitle: {
    fontSize: fs(17),
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: fs(17),
    fontWeight: '800',
  },
  sectionCount: {
    fontSize: fs(13),
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fs(14),
  },
  emptyHint: {
    fontSize: fs(13),
    lineHeight: lh(18),
    textAlign: 'center',
  },
  requestCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardCode: {
    fontSize: fs(16),
    fontWeight: '800',
  },
  cardTotal: {
    fontSize: fs(16),
    fontWeight: '800',
  },
  cardCustomer: {
    fontSize: fs(13),
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: fs(12),
    fontWeight: '700',
  },
  itemLines: {
    gap: spacing.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  itemLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  itemName: {
    flex: 1,
    fontSize: fs(13),
    fontWeight: '600',
  },
  itemQty: {
    fontSize: fs(12),
    textAlign: 'right',
  },
  moreItems: {
    fontSize: fs(12),
    fontWeight: '700',
  },
});