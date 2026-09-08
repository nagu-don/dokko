import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { VendorNavBar } from '@/components/vendor';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAcceptRequest, useVendorRequest } from '@/hooks/useVendorRequests';
import { t, tMsg, money, num, iname } from '@/i18n';
import { fs, lh, radius, spacing } from '@/theme';
import { formatOrderDate } from '@/utils/date';
import { unitOf } from '@/utils/itemDisplay';
import {
  vendorDistanceLabel,
  vendorOrderStatusLabel,
  vendorPriorityStageLabel,
} from '@/utils/vendorModel';

/**
 * Vendor request details (Phase 10). Resolved from the SAME shared
 * ['vendor','requests','new'] query as the dashboard so the request is never
 * fetched twice and refreshing on one screen refreshes both.
 *
 * Accept flow (server-authoritative, concurrency-safe):
 *  - Tap Accept → PATCH /api/vendors/requests/accept/:id (no body)
 *  - Backend atomically claims the order (vendor:null guard in findOneAndUpdate)
 *  - Returns presentOrder with priorityStage=ASSIGNED, status=Processing
 *  - On success: navigate to accepted/[id] with the order data
 *  - On 409: "This request has already been taken" (another vendor won)
 *  - On timeout/network failure: show "outcome uncertain" — do NOT retry
 *
 * Rejection does not exist as a backend endpoint. Orders time out via the
 * priority scheduler. The vendor simply ignores unwanted requests.
 */
export default function VendorRequestDetailScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const requestId = typeof id === 'string' ? id : '';

  const { data: request, isLoading, isError, isRefetching, refetch } = useVendorRequest(requestId);
  const acceptMutation = useAcceptRequest();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  };

  const handleAccept = () => {
    if (!requestId) return;
    acceptMutation.mutate(requestId, {
      onSuccess: (order) => {
        router.replace({
          pathname: '/accepted/[id]',
          params: { id: order.id, orderJson: JSON.stringify(order) },
        });
      },
      onError: () => {
        // Error is displayed via acceptMutation.error below.
        // The request list will be refetched on return to dashboard.
      },
    });
  };

  const acceptError = acceptMutation.error as
    | { status?: number; message?: string; kind?: 'network' | 'timeout' | 'http' | 'unknown' }
    | undefined;
  const is409 = acceptError?.status === 409;
  // Transport-level failure (no server response) → outcome UNKNOWN, never auto-retry.
  const isUncertain =
    acceptMutation.isError && !is409 && (acceptError?.kind === 'network' || acceptError?.kind === 'timeout');

  let content;

  if (isLoading && !request) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>{t(lang, 'vendorRequestsLoading')}</Text>
      </View>
    );
  } else if (!request) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>{t(lang, 'vendorRequestPast')}</Text>
        {isError ? (
          <Text style={[styles.stateHint, { color: palette.textMuted }]}>
            {t(lang, 'vendorRequestsErrorHint')}
          </Text>
        ) : null}
        <Button title={t(lang, 'vendorGoToDashboard')} onPress={() => router.replace('/dashboard')} />
      </View>
    );
  } else {
    const placed = request.createdAt ?? '';
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl + 70 }]}
      >
        {isError ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'vendorRequestsErrorHint')}
            </Text>
          </View>
        ) : null}

        <View style={[styles.headerCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.codeRow}>
            <Text style={[styles.code, { color: palette.text }]}>{num(lang, request.code)}</Text>
            <View style={[styles.pill, { backgroundColor: palette.primary }]}>
              <Text style={[styles.pillText, { color: palette.primaryText }]}>
                {vendorOrderStatusLabel(lang, request.status)}
              </Text>
            </View>
          </View>

          {placed ? (
            <Text style={[styles.date, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestPlaced')}: {formatOrderDate(lang, placed)}
            </Text>
          ) : null}

          <View style={styles.badges}>
            {typeof request.distanceKm === 'number' ? (
              <View style={[styles.badge, { backgroundColor: palette.primary }]}>
                <Text style={[styles.badgeText, { color: palette.primaryText }]}>
                  {vendorDistanceLabel(lang, request.distanceKm)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.stage}>
            <Text style={[styles.stageLabel, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestStage')}
            </Text>
            <Text style={[styles.stageValue, { color: palette.primary }]}>
              {vendorPriorityStageLabel(lang, request.priorityStage)}
            </Text>
          </View>
        </View>

        <Section title={t(lang, 'vendorRequestCustomer')} palette={palette}>
          <Text style={[styles.customerLine, { color: palette.text }]}>{request.customer.name}</Text>
          {request.customer.phone ? (
            <Text style={[styles.meta, { color: palette.textMuted }]}>
              {t(lang, 'vendorRequestPhone')}: {num(lang, request.customer.phone)}
            </Text>
          ) : null}
        </Section>

        <Section title={t(lang, 'itemSection')} palette={palette}>
          {request.items.map((row, idx) => (
            <View key={idx} style={styles.lineRow}>
              <View style={styles.lineMain}>
                <Text style={[styles.lineName, { color: palette.text }]}>{iname(lang, row)}</Text>
                <Text style={[styles.lineMeta, { color: palette.textMuted }]}>
                  {num(lang, row.quantity)} {unitOf(lang, row)} × {money(lang, row.priceAtOrder)}/
                  {unitOf(lang, row)}
                </Text>
              </View>
              <Text style={[styles.lineAmount, { color: palette.text }]}>
                {money(lang, row.quantity * row.priceAtOrder)}
              </Text>
            </View>
          ))}
          <View style={[styles.divider, { borderColor: palette.border }]} />
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'vendorRequestSubtotal')}
            value={money(lang, request.subtotal)}
          />
          {request.deliveryCharge != null ? (
            <AmountRow
              lang={lang}
              palette={palette}
              label={t(lang, 'vendorRequestDelivery')}
              value={money(lang, request.deliveryCharge)}
            />
          ) : null}
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'vendorRequestAdditional')}
            value={money(lang, request.additionalCharges)}
          />
          <AmountRow
            lang={lang}
            palette={palette}
            label={t(lang, 'vendorRequestTotal')}
            value={money(lang, request.total)}
            strong
          />
        </Section>

        <Button
          variant="secondary"
          title={isRefetching ? t(lang, 'vendorRequestsLoading') : t(lang, 'vendorRefresh')}
          onPress={() => refetch()}
          loading={isRefetching}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <VendorNavBar
        title={t(lang, 'vendorRequestDetailTitle')}
        onBack={handleBack}
        hideMenu
      />
      {content}

      {/* Accept / Error feedback — fixed at bottom */}
      {request && (
        <View style={[styles.bottomBar, { backgroundColor: palette.background, borderTopColor: palette.border }]}>
          {/* Error banners */}
          {acceptMutation.isError ? (
            <View style={[styles.errorBanner, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
              <Text style={[styles.errorBannerText, { color: palette.danger }]}>
                {is409
                  ? t(lang, 'vendorAcceptTaken')
                  : isUncertain
                    ? t(lang, 'vendorAcceptUncertain')
                    : tMsg(lang, acceptError?.message) || t(lang, 'vendorAcceptError')}
              </Text>
              {isUncertain ? (
                <Pressable
                  onPress={() =>
                    router.replace({
                      pathname: '/accepted/[id]',
                      params: { id: requestId },
                    })
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.recoverLink,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[styles.recoverLinkText, { color: palette.primary }]}>
                    {t(lang, 'vendorAcceptCheckAccepted')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Accept button */}
          <Button
            title={acceptMutation.isPending ? t(lang, 'vendorAccepting') : t(lang, 'vendorAccept')}
            onPress={handleAccept}
            loading={acceptMutation.isPending}
            disabled={acceptMutation.isPending}
          />
        </View>
      )}
    </View>
  );
}

function Section({
  title,
  palette,
  children,
}: {
  title: string;
  palette: import('@/theme').Palette;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function AmountRow({
  lang,
  palette,
  label,
  value,
  strong,
}: {
  lang: Parameters<typeof money>[0];
  palette: import('@/theme').Palette;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text
        style={[styles.amountValue, { color: palette.text, fontWeight: strong ? '800' : '700' }]}
      >
        {value}
      </Text>
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
  headerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  code: {
    fontSize: fs(18),
    fontWeight: '800',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: fs(12),
    fontWeight: '700',
  },
  date: {
    fontSize: fs(12),
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
  stage: {
    gap: spacing.xxs,
  },
  stageLabel: {
    fontSize: fs(12),
  },
  stageValue: {
    fontSize: fs(15),
    fontWeight: '700',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    fontSize: fs(12),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  cardBody: {
    gap: spacing.sm,
  },
  customerLine: {
    fontSize: fs(15),
    fontWeight: '700',
  },
  meta: {
    fontSize: fs(13),
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  lineMain: {
    flex: 1,
    gap: spacing.xxs,
  },
  lineName: {
    fontSize: fs(14),
    fontWeight: '600',
  },
  lineMeta: {
    fontSize: fs(12),
  },
  lineAmount: {
    fontSize: fs(14),
    fontWeight: '700',
  },
  divider: {
    borderTopWidth: 1,
    marginVertical: spacing.xs,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountLabel: {
    fontSize: fs(13),
  },
  amountValue: {
    fontSize: fs(14),
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  errorBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  errorBannerText: {
    fontSize: fs(13),
    lineHeight: lh(18),
    textAlign: 'center',
  },
  recoverLink: {
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  recoverLinkText: {
    fontSize: fs(14),
    fontWeight: '700',
  },
});
