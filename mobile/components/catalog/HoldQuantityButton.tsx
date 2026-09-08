import { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { radius, spacing } from '@/theme';
import { BULK_STEP, STEP } from '@/utils/format';

/** ms — how long a press must be held before the repeat loop kicks in. */
const HOLD_DELAY = 350;
/** First repeat interval (slowest). */
const START_MS = 600;
/** Hard cap ≈ 3 changes per second. */
const MIN_MS = 1000 / 3;
/** Each repeat is 18% faster than the last. */
const DECAY = 0.82;

interface HoldQuantityButtonProps {
  /** Called with the amount to apply (fine step first, then coarse). */
  onStep: (delta: number) => void;
  /** Fine step — 0.1 kg for weights, 1 unit for count-based items. */
  step?: number;
  /** Coarse step used once a full step has accumulated on a hold. */
  bulkStep?: number;
  disabled?: boolean;
  accessibilityLabel: string;
  children: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Quantity stepper button with front-end HoldButton semantics adapted for
 * React Native:
 *   single tap  -> onStep(step)
 *   press-hold  -> repeats onStep(step) accelerating up to ~3/s; once the
 *                  applied amount has reached a full bulkStep during the
 *                  hold, later repeats use onStep(bulkStep).
 */
export function HoldQuantityButton({
  onStep,
  step = STEP,
  bulkStep = BULK_STEP,
  disabled = false,
  accessibilityLabel,
  children,
  style,
}: HoldQuantityButtonProps) {
  const { palette } = useAppTheme();

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delay = useRef(START_MS);
  const accumulated = useRef(0);
  const didHold = useRef(false);

  // refs so the repeat loop sees fresh values without restarting
  const disabledRef = useRef(disabled);
  const onStepRef = useRef(onStep);
  const stepRef = useRef(step);
  const bulkStepRef = useRef(bulkStep);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    bulkStepRef.current = bulkStep;
  }, [bulkStep]);

  const stopRepeat = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (repeatTimer.current) {
      clearTimeout(repeatTimer.current);
      repeatTimer.current = null;
    }
  }, []);

  // clean up if the button unmounts mid-press
  useEffect(() => () => stopRepeat(), [stopRepeat]);

  // recursive setTimeout (not setInterval) so the delay can shrink each tick
  const tick = useCallback(() => {
    if (disabledRef.current) {
      stopRepeat();
      return;
    }
    // once a full bulk step has been applied during this hold, ramp up
    const delta = accumulated.current >= bulkStepRef.current ? bulkStepRef.current : stepRef.current;
    accumulated.current += delta;
    onStepRef.current(delta);
    delay.current = Math.max(MIN_MS, delay.current * DECAY);
    repeatTimer.current = setTimeout(tick, delay.current);
  }, [stopRepeat]);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    didHold.current = false;
    delay.current = START_MS;
    accumulated.current = 0;
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      tick();
    }, HOLD_DELAY);
  }, [disabled, tick]);

  const handlePressOut = useCallback(() => {
    stopRepeat();
  }, [stopRepeat]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    // the press was a hold — the repeat loop already applied the changes
    if (didHold.current) {
      didHold.current = false;
      return;
    }
    onStepRef.current(stepRef.current);
  }, [disabled]);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        { borderColor: palette.border },
        disabled && styles.buttonDisabled,
        style,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: disabled ? palette.textMuted : palette.text }]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderWidth: 1.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.96 }],
  },
});