import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t, money } from '@/i18n';
import { radius, spacing } from '@/theme';

/**
 * Order confirmation shown ONLY after a confirmed 201 response from
 * POST /api/orders/place. The order id comes straight from the backend
 * response — nothing is invented client-side. No payment, no tracking here;
 * those are explicitly deferred (shown as a note).
 */
export default function OrderSuccessScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, total } = useLocalSearchParams<{ id?: string; total?: string }>();

  const orderId = typeof id === 'string' ? id : '';
  const numericTotal = total && total !== '' ? Number(total) : Number.NaN;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.background, paddingTop: insets.top + spacing.xl },
      ]}
    >
      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: palette.primary }]}>
          <Text style={styles.badgeGlyph}>✓</Text>
        </View>
        <Text style={[styles.title, { color: palette.text }]}>{t(lang, 'orderSuccessTitle')}</Text>
        <Text style={[styles.message, { color: palette.textMuted }]}>
          {t(lang, 'orderSuccessMessage')}
        </Text>

        {orderId ? (
          <View style={[styles.detailCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: palette.textMuted }]}>
                {t(lang, 'orderIdLabel')}
              </Text>
              <Text style={[styles.detailValue, { color: palette.text }]} numberOfLines={2}>
                {orderId}
              </Text>
            </View>
            {Number.isFinite(numericTotal) ? (
              <View style={[styles.detailRow, styles.detailRowBorder, { borderColor: palette.border }]}>
                <Text style={[styles.detailLabel, { color: palette.textMuted }]}>
                  {t(lang, 'orderTotalLabel')}
                </Text>
                <Text style={[styles.detailValue, { color: palette.text }]}>
                  {money(lang, numericTotal)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={[styles.note, { color: palette.textMuted }]}>
          {t(lang, 'orderTrackingNote')}
        </Text>

        <Button
          title={t(lang, 'viewOrder')}
          onPress={() => orderId && router.push({ pathname: '/orders/[id]', params: { id: orderId } })}
        />
        <Button
          variant="secondary"
          title={t(lang, 'backToHome')}
          onPress={() => router.replace('/home')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGlyph: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 42,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  detailCard: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  detailRowBorder: {
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});