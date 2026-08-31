import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, FormError, FormTextField } from '@/components/form';
import { LoadingView } from '@/components/LoadingView';
import { LocationPickerModal } from '@/components/location';
import { useApprovedItems } from '@/hooks/useApprovedItems';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMyProfile, useUpdateMyPhone } from '@/hooks/useMyProfile';
import { t, iname, money, num } from '@/i18n';
import { placeOrder } from '@/services/orders';
import { useCartStore } from '@/stores/cartStore';
import {
  cartLinePrice,
  cartLineTotal,
  cartSubtotal,
  cartTotalKg,
  resolveCartLines,
  type ResolvedCartLine,
} from '@/utils/cart';
import { unitOf } from '@/utils/itemDisplay';
import { isValidLocation, loadPreferredDropoff } from '@/utils/location';
import { classifyPlaceOrderError, phoneUpdateErrorMessage } from '@/utils/orderMessages';
import { radius, spacing } from '@/theme';
import type { CreatedOrder, Dropoff, UserProfile } from '@/types';

/**
 * Customer checkout (Phase 6): contact number, drop-off point, order summary
 * and the one-shot POST /api/orders/place call.
 *
 * TRANSACTION SAFETY (matches the verified backend contract):
 *  - The cart is cleared ONLY after a CONFIRMED 201 order response.
 *  - A transport failure (no response / timeout) is "outcome unknown": the
 *    screen shows the uncertain state, keeps the cart, never auto-retries.
 *  - The Place order button is disabled while the request is in flight, so one
 *    tap = at most one request.
 *  - The client sends only `{ items: [{itemId, quantity}], dropoff }` and the
 *    backend re-validates items + re-snapshots prices (totals above are
 *    informational; delivery charges are set by the vendor later).
 *  - A Google placeholder phone (`g` + 9 digits) is replaced via
 *    PATCH /api/users/phone before ordering so the vendor has a real number.
 */
export default function CheckoutScreen() {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lines = useCartStore((s) => s.lines);
  const hydrated = useCartStore((s) => s.hydrated);
  const clearCart = useCartStore((s) => s.clearCart);

  const { data: catalog } = useApprovedItems();
  const myProfile = useMyProfile();
  const updatePhoneMutation = useUpdateMyPhone();

  const byId = useMemo(
    () => new Map((catalog ?? []).map((item) => [item._id, item])),
    [catalog]
  );
  const resolved = useMemo(() => resolveCartLines(lines, byId), [lines, byId]);
  const subtotal = cartSubtotal(lines, byId);

  const userProfile: UserProfile | null =
    myProfile.data && '_id' in myProfile.data ? (myProfile.data as UserProfile) : null;
  const savedPhone = userProfile?.phone ?? '';
  const needsPhone = !savedPhone || /^g\d{9}$/.test(savedPhone);

  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [location, setLocation] = useState<Dropoff | null>(null);
  const [locationError, setLocationError] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<'error' | 'uncertain' | null>(null);
  const [formError, setFormError] = useState('');
  const [uncertainMessage, setUncertainMessage] = useState('');

  const phoneTouched = useRef(false);
  const successRef = useRef(false);

  // Empty cart cannot reach checkout — bounce back to the cart.
  useEffect(() => {
    if (successRef.current) return;
    if (hydrated && lines.length === 0) {
      router.replace('/cart');
    }
  }, [hydrated, lines.length, router]);

  // Preselect the last confirmed drop-off so repeat orders start faster.
  useEffect(() => {
    let alive = true;
    loadPreferredDropoff()
      .then((p) => {
        if (alive && p && !location) setLocation(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the phone field from the profile once, without clobbering typing.
  useEffect(() => {
    if (!userProfile || phoneTouched.current) return;
    const phone = userProfile.phone ?? '';
    setPhoneInput(needsPhone ? '' : phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  const handlePlaceOrder = async () => {
    if (submitting) return;

    setErrorKind(null);
    setFormError('');
    setUncertainMessage('');
    setPhoneError('');
    setLocationError('');

    if (lines.length === 0) {
      setFormError(t(lang, 'errOrderCartEmpty'));
      return;
    }

    const digits = phoneInput.replace(/\D/g, '');
    if (!/^\d{10}$/.test(digits)) {
      const message = t(lang, needsPhone ? 'errContactRequired' : 'errPhoneInvalid');
      setPhoneError(message);
      setFormError(message);
      return;
    }

    const spot = location;
    if (!spot || !isValidLocation(spot)) {
      const message = t(lang, 'errLocationRequired');
      setLocationError(message);
      setFormError(message);
      return;
    }

    setSubmitting(true);
    try {
      // Make sure the vendor-facing number is saved before ordering. A failure
      // here is DEFINITE (the order was never attempted) — no uncertain state.
      if (!savedPhone || /^g\d{9}$/.test(savedPhone) || savedPhone !== digits) {
        try {
          await updatePhoneMutation.mutateAsync(digits);
        } catch (phoneError) {
          setSubmitting(false);
          setErrorKind('error');
          setFormError(phoneUpdateErrorMessage(lang, phoneError));
          return;
        }
      }

      const order: CreatedOrder = await placeOrder({
        items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantityKg })),
        dropoff: { lat: spot.lat, lng: spot.lng, label: spot.label },
      });

      // CONFIRMED success — only now is the cart cleared.
      successRef.current = true;
      clearCart();
      setSubmitting(false);
      router.replace({
        pathname: '/order-success',
        params: { id: order._id, total: order.total !== undefined ? String(order.total) : '' },
      });
    } catch (error) {
      setSubmitting(false);
      const failed = classifyPlaceOrderError(lang, error);
      if (failed.kind === 'uncertain') {
        setErrorKind('uncertain');
        setUncertainMessage(failed.message);
      } else {
        setErrorKind('error');
        setFormError(failed.message);
      }
    }
  };

  const renderLine = ({ item }: { item: ResolvedCartLine }) => {
    const { line, live } = item;
    const displayName = iname(lang, live ?? line);
    const unit = unitOf(lang, live ?? line);
    const price = cartLinePrice(line, live);
    const qty = line.quantityKg;
    return (
      <View style={[styles.lineRow, { borderColor: palette.border }]}>
        <View style={styles.lineMain}>
          <Text style={[styles.lineName, { color: palette.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.lineMeta, { color: palette.textMuted }]}>
            {money(lang, price)}/{unit} · {num(lang, qty.toFixed(1))} {unit}
          </Text>
        </View>
        <Text style={[styles.lineTotal, { color: palette.text }]}>
          {money(lang, cartLineTotal(line, live))}
        </Text>
      </View>
    );
  };

  let content;
  if (!hydrated || (hydrated && lines.length === 0)) {
    content = <LoadingView label={t(lang, 'checkoutLoading')} />;
  } else {
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {errorKind === 'error' ? <FormError message={formError} /> : null}

        {errorKind === 'uncertain' ? (
          <View style={[styles.uncertainCard, { borderColor: palette.danger }]}>
            <Text style={[styles.uncertainTitle, { color: palette.danger }]}>
              {t(lang, 'orderUncertainTitle')}
            </Text>
            <Text style={[styles.uncertainText, { color: palette.text }]}>
              {uncertainMessage}
            </Text>
            <Text style={[styles.uncertainText, { color: palette.textMuted }]}>
              {t(lang, 'keepCartHint')}
            </Text>
            <Button
              variant="secondary"
              title={t(lang, 'checkMyOrders')}
              onPress={() => router.push('/orders?from=uncertain')}
            />
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            {t(lang, 'contactSection')}
          </Text>
          <FormTextField
            label={t(lang, 'contactPhoneLabel')}
            value={phoneInput}
            onChangeText={(value) => {
              phoneTouched.current = true;
              setPhoneInput(value);
              if (phoneError) setPhoneError('');
            }}
            placeholder={t(lang, 'contactPhonePlaceholder')}
            keyboardType="phone-pad"
            maxLength={14}
            error={phoneError}
          />
          <Text style={[styles.fieldHint, { color: palette.textMuted }]}>
            {t(lang, 'contactPhoneHint')}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            {t(lang, 'locationSection')}
          </Text>
          <Pressable
            onPress={() => setPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={
              location
                ? t(lang, 'locationChange')
                : t(lang, 'locationPick')
            }
            style={({ pressed }) => [
              styles.locationRow,
              { borderColor: locationError ? palette.danger : palette.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.locationMain}>
              {location ? (
                <>
                  <Text style={[styles.locationCoords, { color: palette.text }]}>
                    {num(lang, location.lat.toFixed(5))}, {num(lang, location.lng.toFixed(5))}
                  </Text>
                  {location.label ? (
                    <Text style={[styles.locationLabel, { color: palette.textMuted }]} numberOfLines={2}>
                      {location.label}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={[styles.locationEmpty, { color: palette.textMuted }]}>
                  {t(lang, 'locationNotChosen')}
                </Text>
              )}
            </View>
            <Text style={[styles.locationAction, { color: palette.primary }]}>
              {t(lang, location ? 'locationChange' : 'locationPick')}
            </Text>
          </Pressable>
          {locationError ? (
            <Text style={[styles.fieldError, { color: palette.danger }]}>{locationError}</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>
            {t(lang, 'summarySection')}
          </Text>
          {resolved.map((row) => (
            <View key={row.line.itemId}>{renderLine({ item: row })}</View>
          ))}
          <View style={[styles.summaryDivider, { borderColor: palette.border }]} />
          <View style={styles.subtotalRow}>
            <Text style={[styles.subtotalLabel, { color: palette.text }]}>
              {t(lang, 'subtotalLabel')} ({num(lang, cartTotalKg(lines).toFixed(1))} {t(lang, 'unitKg')})
            </Text>
            <Text style={[styles.subtotalValue, { color: palette.text }]}>{money(lang, subtotal)}</Text>
          </View>
          <Text style={[styles.deliveryNote, { color: palette.textMuted }]}>
            {t(lang, 'checkoutNote')}
          </Text>
        </View>

        <Button
          title={submitting ? t(lang, 'orderPlacing') : t(lang, 'placeOrder')}
          onPress={() => void handlePlaceOrder()}
          loading={submitting}
        />
      </ScrollView>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.background, paddingTop: insets.top },
      ]}
    >
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
          {t(lang, 'checkoutTitle')}
        </Text>
        <View style={styles.topSpacer} />
      </View>

      {content}

      <LocationPickerModal
        visible={pickerVisible}
        initial={location}
        onConfirm={(dropoff) => {
          setPickerVisible(false);
          setLocation(dropoff);
          setLocationError('');
        }}
        onCancel={() => setPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  back: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  fieldError: {
    fontSize: 12,
    marginTop: spacing.xxs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  locationMain: {
    flex: 1,
    gap: spacing.xxs,
  },
  locationCoords: {
    fontSize: 16,
    fontWeight: '700',
  },
  locationLabel: {
    fontSize: 13,
  },
  locationEmpty: {
    fontSize: 14,
  },
  locationAction: {
    fontSize: 14,
    fontWeight: '600',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
  },
  lineMain: {
    flex: 1,
    gap: spacing.xxs,
  },
  lineName: {
    fontSize: 14,
    fontWeight: '600',
  },
  lineMeta: {
    fontSize: 12,
  },
  lineTotal: {
    fontSize: 14,
    fontWeight: '800',
  },
  summaryDivider: {
    borderTopWidth: 1,
    marginTop: spacing.xs,
  },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  subtotalLabel: {
    fontSize: 14,
  },
  subtotalValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  deliveryNote: {
    fontSize: 12,
    lineHeight: 16,
  },
  uncertainCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
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
});