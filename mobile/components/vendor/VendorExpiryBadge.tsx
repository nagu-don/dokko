import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t } from '@/i18n';
import { fs, spacing } from '@/theme';
import {
  vendorPrioritySecondsLeft,
  VENDOR_EXPIRY_URGENT_SECONDS,
} from '@/utils/vendorModel';

/**
 * Per-card / per-detail live countdown of a new request's priority-stage
 * expiry (parity with the web badge, NewRequests.jsx).
 *
 * The tick is a LOCAL 1s re-render only — it never refetches, polls, or
 * locally expires the request. The server stays the sole authority on whether
 * a request is still acceptable. Renders nothing when `expiresAt` is null
 * (final stage, e.g. SEARCHING_CLOSEST) or the window has already passed.
 * The timer is always cleared on unmount (clearInterval paired 1:1 with
 * setInterval — no leaks).
 */
export function VendorExpiryBadge({
  expiresAt,
}: {
  expiresAt: string | null | undefined;
}) {
  const { palette, lang } = useAppTheme();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const secondsLeft = vendorPrioritySecondsLeft(expiresAt, now);
  if (secondsLeft === null) return null;

  const urgent = secondsLeft < VENDOR_EXPIRY_URGENT_SECONDS;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: urgent ? palette.danger : palette.primary },
      ]}
    >
      <Text style={[styles.badgeText, { color: palette.primaryText }]}>
        {t(lang, 'vendorRequestExpiresIn', { s: secondsLeft })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: fs(12),
    fontWeight: '700',
  },
});