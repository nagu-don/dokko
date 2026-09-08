import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VendorNavBar } from '@/components/vendor';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useVendorNotices } from '@/hooks/useVendorRequests';
import { t } from '@/i18n';
import { fs, lh, radius, spacing } from '@/theme';
import { formatOrderDate } from '@/utils/date';
import type { VendorNotice } from '@/types';

/**
 * Vendor Notices. Admin-posted broadcasts for all vendors, from
 * GET /api/vendors/notices (sort createdAt desc, limit 100).
 *
 * Notice content is DATA, not UI strings: each notice carries bilingual
 * title/body (titleEn/titleNp/bodyEn/bodyNp) and is rendered in the active
 * language with a fallback to the other language — it is never run through
 * `t()`. Mirrors the vendor web portal Notices page (vendor/src/pages/Notices).
 *
 * Read-only, refreshed on mount/focus + pull-to-refresh (no polling).
 */
export default function VendorNoticesScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();

  const noticesQuery = useVendorNotices();
  const notices = noticesQuery.data ?? [];

  const initialLoading = noticesQuery.isLoading && notices.length === 0;
  const totalError = noticesQuery.isError && notices.length === 0;
  const isRefetching = noticesQuery.isRefetching;
  const onRefresh = () => {
    void noticesQuery.refetch();
  };

  const titleOf = (notice: VendorNotice) =>
    lang === 'np' && notice.titleNp ? notice.titleNp : notice.titleEn || notice.titleNp;
  const bodyOf = (notice: VendorNotice) =>
    lang === 'np' && notice.bodyNp ? notice.bodyNp : notice.bodyEn || notice.bodyNp;

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
          {t(lang, 'vendorLoadFailedNotices')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {t(lang, 'vendorLoadFailedNoticesHint')}
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
        {noticesQuery.isError && notices.length > 0 ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'vendorLoadFailedNoticesHint')}
            </Text>
          </View>
        ) : null}

        {notices.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorNoNoticesTitle')}
            </Text>
            <Text style={[styles.emptyHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorNoNoticesHint')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {notices.map((notice) => (
              <View
                key={notice.id}
                style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Text style={[styles.cardTitle, { color: palette.text }]}>
                  {titleOf(notice)}
                </Text>
                {bodyOf(notice) ? (
                  <Text style={[styles.cardBody, { color: palette.textMuted }]}>
                    {bodyOf(notice)}
                  </Text>
                ) : null}
                {notice.createdAt ? (
                  <Text style={[styles.cardDate, { color: palette.textMuted }]}>
                    {t(lang, 'vendorNoticePostedOn', { date: formatOrderDate(lang, notice.createdAt) })}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.screenPurple }]}>
      <VendorNavBar
        title={t(lang, 'vendorNoticesTitle')}
        activeSection="notices"
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
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyHint: {
    fontSize: fs(13),
    lineHeight: lh(18),
    textAlign: 'center',
  },
  list: {
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: fs(16),
    fontWeight: '700',
    lineHeight: lh(22),
  },
  cardBody: {
    fontSize: fs(14),
    lineHeight: lh(20),
  },
  cardDate: {
    fontSize: fs(12),
    lineHeight: lh(16),
    marginTop: spacing.xxs,
  },
});