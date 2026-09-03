import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { LoadingView } from '@/components/LoadingView';
import { LocationPickerModal } from '@/components/location';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  useUpdateVendorLocation,
  useVendorProfile,
  useVendorRequests,
  useVendorAcceptedOrders,
  useVendorCompletedOrders,
} from '@/hooks/useVendorRequests';
import { t, money, num, iname } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { radius, spacing } from '@/theme';
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
 * (server-filtered). The vendor web app does NOT poll this endpoint, so we
 * refresh on mount/focus and via pull-to-refresh only — no interval.
 * Distance/badges come precomputed from the server; the app never recomputes.
 */
export default function VendorDashboardScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const profileQuery = useVendorProfile();
  const requestsQuery = useVendorRequests();
  const activeOrdersQuery = useVendorAcceptedOrders();
  const completedOrdersQuery = useVendorCompletedOrders();
  const locationMutation = useUpdateVendorLocation();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const profile = profileQuery.data;
  const requests = requestsQuery.data ?? [];
  const activeOrders = activeOrdersQuery.data ?? [];
  const completedOrders = completedOrdersQuery.data ?? [];

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  const handleLocationPick = async (dropoff: { lat: number; lng: number }) => {
    setPickerOpen(false);
    setSaveError(false);
    locationMutation.mutate(
      { lat: dropoff.lat, lng: dropoff.lng },
      {
        onError: () => setSaveError(true),
      }
    );
  };

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
    const location = profile.location;
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        <View style={[styles.statusCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.pillRow}>
            <View style={[styles.readyPill, { backgroundColor: palette.primary }]}>
              <Text style={[styles.readyPillText, { color: palette.primaryText }]}>
                {t(lang, 'vendorReadyPill')}
              </Text>
            </View>
            <Text style={[styles.signedInAs, { color: palette.textMuted }]}>
              {t(lang, 'vendorSignInAs', { name: user?.name ?? profile.name })}
            </Text>
          </View>

          <Row label={t(lang, 'vendorWorkingLocation')}>
            <View style={styles.rowRight}>
              {location?.lat != null && location?.lng != null ? (
                <Text style={[styles.rowValue, { color: palette.text }]}>
                  {num(lang, location.lat.toFixed(5))}, {num(lang, location.lng.toFixed(5))}
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  setSaveError(false);
                  setPickerOpen(true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.changelink, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.changeText, { color: palette.primary }]}>
                  {t(lang, 'vendorChangeLocation')}
                </Text>
              </Pressable>
            </View>
          </Row>

          {saveError || locationMutation.isError ? (
            <Text style={[styles.saveError, { color: palette.danger }]}>
              {t(lang, 'vendorLocationSaveError')}
            </Text>
          ) : null}

          <Row label={t(lang, 'vendorAvailabilityLabel')}>
            <Text style={[styles.note, { color: palette.textMuted }]}>
              {t(lang, 'vendorAvailabilityNote')}
            </Text>
          </Row>
        </View>

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
                  {order.isClosestVendor ? (
                    <View style={[styles.badge, { backgroundColor: palette.primary }]}>
                      <Text style={[styles.badgeText, { color: palette.primaryText }]}>
                        {t(lang, 'vendorClosestBadge')}
                      </Text>
                    </View>
                  ) : null}
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

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            {t(lang, 'vendorOrdersDashboardSection')}
          </Text>
        </View>

        <View style={styles.ordersRow}>
          <Pressable
            onPress={() => router.push('/active')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.orderNavCard,
              { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.orderNavTitle, { color: palette.text }]}>
              {t(lang, 'vendorOrdersDashboardActive')}
            </Text>
            <Text style={[styles.orderNavCount, { color: palette.textMuted }]}>
              {t(lang, 'vendorOrdersDashboardActiveCount', { count: num(lang, activeOrders.length) })}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/completed')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.orderNavCard,
              { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.orderNavTitle, { color: palette.text }]}>
              {t(lang, 'vendorOrdersDashboardCompleted')}
            </Text>
            <Text style={[styles.orderNavCount, { color: palette.textMuted }]}>
              {t(lang, 'vendorOrdersDashboardCompletedCount', { count: num(lang, completedOrders.length) })}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.externalNote, { color: palette.textMuted }]}>
          {t(lang, 'vendorExternalNote')}
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={[styles.topTitle, { color: palette.text }]} numberOfLines={1}>
          {t(lang, 'vendorDashboardTitle')}
        </Text>
        <Pressable
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'signOut')}
          hitSlop={8}
          style={({ pressed }) => [styles.signOut, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.signOutText, { color: palette.danger }]}>{t(lang, 'signOut')}</Text>
        </Pressable>
      </View>
      {content}

      <LocationPickerModal
        visible={pickerOpen}
        initial={profile?.location ?? null}
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

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: palette.textMuted }]}>{label}</Text>
      <View style={styles.rowRight}>{children}</View>
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
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  topTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
  },
  signOut: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginRight: -spacing.sm,
  },
  signOutText: {
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  readyPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  readyPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  signedInAs: {
    fontSize: 12,
    flexShrink: 1,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  changelink: {
    paddingVertical: spacing.xxs,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveError: {
    fontSize: 12,
    lineHeight: 16,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    flexShrink: 1,
    textAlign: 'right',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  sectionCount: {
    fontSize: 13,
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
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
    fontSize: 16,
    fontWeight: '800',
  },
  cardTotal: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardCustomer: {
    fontSize: 13,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
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
    fontSize: 13,
    fontWeight: '600',
  },
  itemQty: {
    fontSize: 12,
    textAlign: 'right',
  },
  moreItems: {
    fontSize: 12,
    fontWeight: '700',
  },
  ordersRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  orderNavCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  orderNavTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  orderNavCount: {
    fontSize: 12,
  },
  externalNote: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
});