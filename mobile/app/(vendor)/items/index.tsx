import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VendorNavBar } from '@/components/vendor';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useItemsSummary, useHideItems } from '@/hooks/useVendorRequests';
import { t } from '@/i18n';
import { fs, lh, radius, spacing } from '@/theme';
import { unitOf } from '@/utils/itemDisplay';
import type { VendorSummaryItem } from '@/types';

/**
 * Vendor Items Needed — mirrors the web vendor portal's ItemsNeeded page.
 *
 * GET /api/vendors/summary: aggregated items across this vendor's accepted
 * (Processing, payment not completed) orders. Each row: nameEng, nameNep,
 * unitEng, unitNep, quantity, pricePerKg, lineTotal.
 *
 * User checks items → POST /api/vendors/summary/hide-items → those items
 * disappear from the list (hidden on the vendor's profile).
 *
 * No polling: refresh on mount/focus + pull-to-refresh only (matches the
 * active-orders screen pattern; the web portal does 5s polling but mobile
 * avoids background timers — user can pull-to-refresh instead).
 */
export default function VendorItemsNeededScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, isRefetching, refetch } = useItemsSummary();
  const hideMutation = useHideItems();

  const items = data?.items ?? [];
  const grandTotal = data?.grandTotal ?? 0;

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggleItem = (nameEng: string) => {
    setChecked((prev) => ({ ...prev, [nameEng]: !prev[nameEng] }));
  };

  const allChecked = useMemo(() => {
    if (items.length === 0) return false;
    return items.every((r) => checked[r.nameEng]);
  }, [items, checked]);

  const checkAll = () => {
    const next: Record<string, boolean> = {};
    items.forEach((r) => { next[r.nameEng] = true; });
    setChecked(next);
  };

  const uncheckAll = () => setChecked({});

  const handleOk = async () => {
    const selected = Object.keys(checked).filter((k) => checked[k]);
    if (selected.length === 0) {
      Alert.alert(t(lang, 'vendorItemsNoSelection'));
      return;
    }
    try {
      await hideMutation.mutateAsync(selected);
      setChecked({});
      Alert.alert(t(lang, 'vendorItemsOkSuccess'));
    } catch {
      Alert.alert(t(lang, 'vendorItemsOkError'));
    }
  };

  const checkedCount = Object.values(checked).filter(Boolean).length;

  const money = (n: number) => `Rs. ${n.toLocaleString()}`;
  const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  let content: React.ReactNode;

  if (isLoading && items.length === 0) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorRequestsLoading')}
        </Text>
      </View>
    );
  } else if (isError && items.length === 0) {
    content = (
      <View style={styles.centered}>
        <Text style={[styles.stateTitle, { color: palette.text }]}>
          {t(lang, 'vendorItemsNeededErrorTitle')}
        </Text>
        <Text style={[styles.stateHint, { color: palette.textMuted }]}>
          {t(lang, 'vendorItemsNeededErrorHint')}
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
        {isError && items.length > 0 ? (
          <View style={[styles.inlineError, { backgroundColor: palette.surface, borderColor: palette.danger }]}>
            <Text style={[styles.inlineErrorText, { color: palette.danger }]}>
              {t(lang, 'vendorItemsNeededErrorHint')}
            </Text>
          </View>
        ) : null}

        {items.length === 0 ? (
          <View style={styles.centered}>
            <Text style={[styles.stateTitle, { color: palette.text }]}>
              {t(lang, 'vendorItemsNeededEmptyTitle')}
            </Text>
            <Text style={[styles.stateHint, { color: palette.textMuted }]}>
              {t(lang, 'vendorItemsNeededEmptyHint')}
            </Text>
          </View>
        ) : (
          <>
            {/* Header row */}
            <View style={[styles.tableHeader, { borderBottomColor: palette.border }]}>
              {/* Checkbox column */}
              <Pressable
                onPress={allChecked ? uncheckAll : checkAll}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allChecked }}
                hitSlop={8}
                style={styles.checkCol}
              >
                <Ionicons
                  name={allChecked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={palette.text}
                />
              </Pressable>
              <Text style={[styles.colItem, styles.colHeaderText, { color: palette.text }]}>
                {t(lang, 'vendorItemsItemCol')}
              </Text>
              <Text style={[styles.colQty, styles.colHeaderText, { color: palette.text }]}>
                {t(lang, 'vendorItemsQtyCol')}
              </Text>
              <Text style={[styles.colPrice, styles.colHeaderText, { color: palette.text }]}>
                {t(lang, 'vendorItemsPriceCol')}
              </Text>
              <Text style={[styles.colTotal, styles.colHeaderText, { color: palette.text }]}>
                {t(lang, 'vendorItemsTotalCol')}
              </Text>
            </View>

            {/* Data rows */}
            {items.map((row: VendorSummaryItem) => {
              const isActive = !!checked[row.nameEng];
              return (
                <View
                  key={row.nameEng}
                  style={[
                    styles.tableRow,
                    { borderBottomColor: palette.border },
                    isActive && { backgroundColor: palette.accentYellowBg },
                  ]}
                >
                  <Pressable
                    onPress={() => toggleItem(row.nameEng)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isActive }}
                    hitSlop={8}
                    style={styles.checkCol}
                  >
                    <Ionicons
                      name={isActive ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isActive ? palette.accentYellow : palette.text}
                    />
                  </Pressable>
                  <Text style={[styles.colItem, { color: palette.text }]} numberOfLines={1}>
                    {lang === 'np' && row.nameNep ? row.nameNep : row.nameEng}
                  </Text>
                  <Text style={[styles.colQty, { color: palette.text }]}>
                    {num(row.quantity)} {unitOf(lang, row)}
                  </Text>
                  <Text style={[styles.colPrice, { color: palette.text }]}>
                    {money(row.pricePerKg)}
                  </Text>
                  <Text style={[styles.colTotal, { color: palette.text }]}>
                    {money(row.lineTotal)}
                  </Text>
                </View>
              );
            })}

            {/* Grand total */}
            <View style={[styles.tableFooter, { borderTopColor: palette.border }]}>
              <Text style={[styles.footerLabel, { color: palette.text }]}>
                {t(lang, 'vendorItemsGrandTotal')}
              </Text>
              <Text style={[styles.footerAmount, { color: palette.text }]}>
                {money(grandTotal)}
              </Text>
            </View>

            {/* Actions bar */}
            <View style={styles.actionsBar}>
              <Text style={[styles.selectedCount, { color: palette.textMuted }]}>
                {checkedCount > 0
                  ? t(lang, 'vendorItemsSelected').replace('{count}', String(checkedCount))
                  : ''}
              </Text>
              <Button
                title={t(lang, 'vendorItemsOk')}
                onPress={() => void handleOk()}
                disabled={checkedCount === 0 || hideMutation.isPending}
                loading={hideMutation.isPending}
              />
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.screenYellow }]}>
      <VendorNavBar
        title={t(lang, 'vendorItemsNeededTitle')}
        activeSection="items"
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
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  centered: {
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

  // Table
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    marginTop: spacing.xs,
  },
  footerLabel: {
    fontSize: fs(14),
    fontWeight: '700',
  },
  footerAmount: {
    fontSize: fs(15),
    fontWeight: '700',
  },

  // Columns
  checkCol: {
    width: 32,
    alignItems: 'center',
  },
  colItem: {
    flex: 2,
    fontSize: fs(14),
  },
  colQty: {
    flex: 1,
    fontSize: fs(13),
    textAlign: 'right',
  },
  colPrice: {
    flex: 1,
    fontSize: fs(13),
    textAlign: 'right',
  },
  colTotal: {
    flex: 1,
    fontSize: fs(13),
    textAlign: 'right',
    fontWeight: '700',
  },
  colHeaderText: {
    fontSize: fs(12),
    fontWeight: '700',
    opacity: 0.6,
  },

  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  selectedCount: {
    fontSize: fs(13),
    fontWeight: '600',
  },
});
