import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t, num } from '@/i18n';
import { useCartStore } from '@/stores/cartStore';
import { radius, spacing } from '@/theme';
import { qtyDisplay } from '@/utils/format';
import { isKgUnit, qtySteps, toSelectedItem, unitOf } from '@/utils/itemDisplay';
import type { Item } from '@/types';
import { HoldQuantityButton } from './HoldQuantityButton';

export interface QuantityStepperProps {
  /** The catalog variant this stepper controls. */
  variant: Item;
  /** Variant label shown in accessibility labels (localized). */
  name: string;
  /** Current line quantity in the item's own unit (0 = not in cart). */
  quantity: number;
}

/**
 * `[−] qty [+]` stepper for a single catalog variant, centered in the item
 * row. `−`/`+` are HoldQuantityButtons (tap = fine step: 0.1 kg or 1 unit;
 * hold = accelerated). Tapping the quantity opens a numeric keyboard so a
 * customer can type an exact amount; empty/invalid commits remove the line,
 * like the web.
 */
export const QuantityStepper = memo(function QuantityStepper({
  variant,
  name,
  quantity,
}: QuantityStepperProps) {
  const { palette, lang } = useAppTheme();
  const itemId = variant._id;
  // addToCart both creates a new line and bumps an existing one, so the `+`
  // button can feed it every tick regardless of cart state.
  const addToCart = useCartStore((s) => s.addToCart);
  const decreaseQuantity = useCartStore((s) => s.decreaseQuantity);
  const setQuantity = useCartStore((s) => s.setQuantity);

  const isKg = isKgUnit(variant);
  const steps = qtySteps(variant);
  const unit = unitOf(lang, variant);

  const selectedInput = useMemo(
    () => ({ ...toSelectedItem(variant), image: variant.image }),
    [variant]
  );

  const inCart = quantity > 0;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const beginEdit = useCallback(() => {
    setDraft(inCart ? String(quantity) : '');
    setEditing(true);
  }, [inCart, quantity]);

  // kg allows at most one decimal place; count units are whole numbers
  const changeDraft = useCallback((raw: string) => {
    const ok = isKg ? /^\d*\.?\d?$/ : /^\d*$/;
    if (raw === '' || ok.test(raw)) setDraft(raw);
  }, [isKg]);

  // push the typed value into the cart, then drop the edit mode
  const commitEdit = useCallback(() => {
    setEditing(false);
    setQuantity(itemId, draft === '' ? 0 : draft);
  }, [draft, itemId, setQuantity]);

  return (
    <View style={styles.stepper}>
      <HoldQuantityButton
        onStep={(amount) => decreaseQuantity(itemId, amount)}
        step={steps.fine}
        bulkStep={steps.coarse}
        disabled={!inCart}
        accessibilityLabel={t(lang, 'decreaseAria', { name })}
      >
        −
      </HoldQuantityButton>

      {editing ? (
        <TextInput
          style={[
            styles.input,
            { color: palette.text, borderColor: palette.primary, backgroundColor: palette.background },
          ]}
          value={draft}
          onChangeText={changeDraft}
          onSubmitEditing={commitEdit}
          onBlur={commitEdit}
          keyboardType={isKg ? 'decimal-pad' : 'number-pad'}
          autoFocus
          selectTextOnFocus
          maxLength={5}
          accessibilityLabel={t(lang, 'quantityInputAria', { name, unit })}
        />
      ) : (
        <Pressable
          onPress={beginEdit}
          accessibilityRole="button"
          accessibilityLabel={t(lang, 'quantityInputAria', { name, unit })}
          style={({ pressed }) => [
            styles.qtyValue,
            { borderColor: palette.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.qtyText, { color: palette.text }]}>
            {inCart ? num(lang, qtyDisplay(quantity, isKg)) : isKg ? '0.0' : '0'}
          </Text>
          <Text style={[styles.qtyUnit, { color: palette.textMuted }]}>{unit}</Text>
        </Pressable>
      )}

      <HoldQuantityButton
        onStep={(amount) => addToCart(selectedInput, amount)}
        step={steps.fine}
        bulkStep={steps.coarse}
        accessibilityLabel={t(lang, 'increaseAria', { name })}
      >
        +
      </HoldQuantityButton>
    </View>
  );
});

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyValue: {
    minWidth: 54,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    gap: spacing.xxs,
  },
  qtyText: {
    fontSize: 15,
    fontWeight: '800',
  },
  qtyUnit: {
    fontSize: 11,
  },
  input: {
    minWidth: 60,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});