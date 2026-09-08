import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VendorOrderCard } from '@/components/order';
import { VendorNavBar } from '@/components/vendor';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  useVendorAcceptedOrders,
  useVendorCompletedOrders,
} from '@/hooks/useVendorRequests';
import { t, num } from '@/i18n';
import { fs, lh, radius, spacing } from '@/theme';

/**
 * Vendor Accepted Orders (Phase 13). One screen that merges the two prior
 * lists — active and completed — under the single "Accepted Orders" heading:
 *
 *  - "Active Orders" (top): orders currently assigned to this vendor but not
 *    yet completed, from the SERVER-authoritative
 *    GET /api/vendors/requests/accepted (status=Processing, payment not
 *    completed, sorted by acceptedAt desc).
 *  - "Completed Orders" (bottom): this vendor's completed order history from
 *    GET /api/vendors/requests/completed (paymentStatus === "completed" for
 *    this vendor, sorted by updatedAt desc).
 *
 * Both lists use the shared ['vendor','requests','accepted'] and
 * ['vendor','requests','completed'] queries, so acceptance and completion
 * mutations invalidate them and this screen reflects the server immediately.
 * Refreshed on mount/focus + pull-to-refresh only (no live polling).
 *
 * Tapping an active card opens the accepted-order workflow (/accepted/[id])
 * which owns payment collection and delivery completion; tapping a completed
 * card opens the read-only history detail (/completed/[id]).
 */
export default function VendorAcceptedOrdersScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const activeQuery = useVendorAcceptedOrders();
  const completedQuery = useVendorCompletedOrders();
  const activeOrders = activeQuery.data ?? [];
  const completedOrders = completedQuery.data ?? [];

  const initialLoading =
    (activeQuery.isLoading && activeOrders.length === 0) ||
    (completedQuery.isLoading && completedOrders.length === 0);

  const totalError =
    activeQuery.isError &&
    completedQuery.isError &&
    activeOrders.length === 0 &&
    completedOrders.length === 0;

  const isRefetching = activeQuery.isRefetching || completedQuery.isRefetching;
  const onRefresh = () => {
    void activeQuery.refetch();
    void completedQuery.refetch();
  };

  const openActive = (id: string) => {
    router.push({ pathname: '/accepted/[id]', params: { id } });
  };

  const openCompleted = (id: string) => {
    router.push({ pathname: '/completed/[id]', params: { id } });
  };

  let content;

  if (initialLoading) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorRequestsLoading')}
        </Text>
      </View>
    );
  } else if (totalError) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorActiveOrdersErrorTitle')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {t(lang, 'vendorCompletedOrdersErrorHint')}
        </Text>
        <Button title={t(lang, 'retry')} onPress={onRefresh} />
      </View>
    );
  } else {
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
      >
        {/* Recoverable error banners when a refresh fails but data is preserved */}
        {activeQuery.isError && activeOrders.length > 0 ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'vendorActiveOrdersErrorHint')}
            </Text>
          </View>
        ) : null}
        {completedQuery.isError && completedOrders.length > 0 ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'vendorCompletedOrdersErrorHint')}
            </Text>
          </View>
        ) : null}

        {/* Active orders — top */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            {t(lang, 'vendorActiveOrdersTitle')}
          </Text>
          <Text style={[styles.sectionCount, { color: palette.textMuted }]}>
            {num(lang, activeOrders.length)}
          </Text>
        </View>

        {activeQuery.isLoading ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestsLoading')}
            </Text>
          </View>
        ) : activeQuery.isError ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorActiveOrdersErrorTitle')}
            </Text>
            <Text style={[styles.emptyHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorActiveOrdersErrorHint')}
            </Text>
            <Button title={t(lang, 'retry')} onPress={() => activeQuery.refetch()} />
          </View>
        ) : activeOrders.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorActiveOrdersEmptyTitle')}
            </Text>
            <Text style={[styles.emptyHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorActiveOrdersEmptyHint')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {activeOrders.map((order) => (
              <VendorOrderCard
                key={order.id}
                order={order}
                stageLabel={t(lang, 'vendorOrderActiveStage')}
                dateLabel="vendorOrderAcceptedOn"
                dateIso={order.acceptedAt}
                onPress={() => openActive(order.id)}
              />
            ))}
          </View>
        )}

        {/* Completed orders — bottom */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            {t(lang, 'vendorCompletedOrdersTitle')}
          </Text>
          <Text style={[styles.sectionCount, { color: palette.textMuted }]}>
            {num(lang, completedOrders.length)}
          </Text>
        </View>

        {completedQuery.isLoading ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestsLoading')}
            </Text>
          </View>
        ) : completedQuery.isError ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorCompletedOrdersErrorTitle')}
            </Text>
            <Text style={[styles.emptyHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorCompletedOrdersErrorHint')}
            </Text>
            <Button title={t(lang, 'retry')} onPress={() => completedQuery.refetch()} />
          </View>
        ) : completedOrders.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorCompletedOrdersEmptyTitle')}
            </Text>
            <Text style={[styles.emptyHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorCompletedOrdersEmptyHint')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {completedOrders.map((order) => (
              <VendorOrderCard
                key={order.id}
                order={order}
                dateLabel="vendorOrderCompletedOn"
                dateIso={order.completedAt}
                onPress={() => openCompleted(order.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.screenBlue }]}>
      <VendorNavBar
        title={t(lang, 'vendorAcceptedOrdersTitle')}
        activeSection="accepted"
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
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  stateTitle: {
    fontSize: fs(17),
    fontWeight: '700',
    textAlign: 'center',
  },
  stateHint: {
    fontSize: fs(14),
    lineHeight: lh(20),
    textAlign: 'center',
  },
  inlineError: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  inlineErrorText: {
    fontSize: fs(13),
    lineHeight: lh(18),
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
  list: {
    gap: spacing.md,
  },
});