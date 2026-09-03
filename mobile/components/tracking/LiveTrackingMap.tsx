import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { Marker } from 'react-native-maps';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useOrderVendorLocation } from '@/hooks/useOrderVendorLocation';
import { t, num } from '@/i18n';
import { radius, spacing } from '@/theme';
import type { OrderRead } from '@/types';

/**
 * Customer live-tracking map for a Processing order (Phase 14C).
 *
 * Reads the server-authoritative vendor location via useOrderVendorLocation
 * (GET /api/orders/:orderId/vendor-location), which polls only while the
 * order is Processing + assigned and stops at terminal states.
 *
 * FRESHNESS (required by mobileref §21): the UI NEVER labels a position as
 * "live" based on local reasoning. It only renders the marker position the
 * server returned, and shows "updated X ago" from the SERVER-provided
 * `lastUpdatedAt`. When no fresh position has been reported yet (location
 * null), it shows a waiting state instead of a bogus marker. A stale-looking
 * read is still shown but never claimed to be live.
 *
 * Two markers:
 *  - dropoff (the delivery target, from the order's own dropoff field)
 *  - vendor (the courier's last reported live position)
 */
export function LiveTrackingMap({ order }: { order: OrderRead }) {
  const { palette, lang } = useAppTheme();
  const { data: tracking, isError } = useOrderVendorLocation(order);

  const canTrack = tracking?.tracking === true;

  const dropoff = order.dropoff;

  const region = useMemo<Region | null>(() => {
    if (!canTrack) return null;
    const loc = tracking?.location;
    const points: { lat: number; lng: number }[] = [];
    if (loc) points.push({ lat: loc.lat, lng: loc.lng });
    if (dropoff && Number.isFinite(dropoff.lat) && Number.isFinite(dropoff.lng)) {
      points.push({ lat: dropoff.lat as number, lng: dropoff.lng as number });
    }
    if (points.length === 0) return null;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latitude = (minLat + maxLat) / 2;
    const longitude = (minLng + maxLng) / 2;
    const latitudeDelta = Math.max((maxLat - minLat) * 1.6, 0.02);
    const longitudeDelta = Math.max((maxLng - minLng) * 1.6, 0.02);
    return { latitude, longitude, latitudeDelta, longitudeDelta };
  }, [canTrack, tracking, dropoff]);

  const freshness = useMemo(() => {
    const ts = tracking?.location?.lastUpdatedAt;
    if (!ts) return null;
    const updated = new Date(ts).getTime();
    if (!Number.isFinite(updated)) return null;
    const seconds = Math.max(0, Math.floor((Date.now() - updated) / 1000));
    if (seconds < 60) return { seconds, kind: 'now' as const };
    const minutes = Math.floor(seconds / 60);
    return { minutes, kind: 'ago' as const };
  }, [tracking]);

  const renderFreshness = () => {
    if (!freshness) return null;
    if (freshness.kind === 'now') {
      return (
        <View style={[styles.freshnessBadge, { backgroundColor: palette.primary }]}>
          <Text style={[styles.freshnessText, { color: palette.primaryText }]}>
            {t(lang, 'trackingJustUpdated')}
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.freshnessBadge, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.freshnessText, { color: palette.textMuted }]}>
          {t(lang, 'trackingUpdatedAgo', { minutes: num(lang, freshness.minutes) })}
        </Text>
      </View>
    );
  };

  // Not tracking (order not Processing / no assigned vendor / terminal).
  if (!canTrack) {
    return null;
  }

  // Tracking, but no fresh position has been reported yet.
  if (!tracking?.location || !region) {
    return (
      <View style={[styles.waitingCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {isError ? (
          <Text style={[styles.waitingText, { color: palette.text }]}>
            {t(lang, 'trackingUnavailable')}
          </Text>
        ) : (
          <Text style={[styles.waitingText, { color: palette.text }]}>
            {t(lang, 'trackingWaitingVendor')}
          </Text>
        )}
      </View>
    );
  }

  const vendorLoc = tracking.location;

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t(lang, 'trackingTitle')}
        </Text>
        {renderFreshness()}
      </View>

      <MapView
        style={styles.map}
        initialRegion={region}
        region={region}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {dropoff && Number.isFinite(dropoff.lat) && Number.isFinite(dropoff.lng) ? (
          <Marker
            coordinate={{ latitude: dropoff.lat as number, longitude: dropoff.lng as number }}
            title={t(lang, 'trackingDropoffMarker')}
            pinColor={palette.danger}
          />
        ) : null}
        <Marker
          coordinate={{ latitude: vendorLoc.lat, longitude: vendorLoc.lng }}
          title={tracking?.vendor?.name || t(lang, 'trackingVendorMarker')}
          pinColor={palette.primary}
        />
      </MapView>

      <Text style={[styles.footnote, { color: palette.textMuted }]}>
        {t(lang, 'trackingLiveNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  freshnessBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  freshnessText: {
    fontSize: 11,
    fontWeight: '600',
  },
  map: {
    height: 220,
    borderRadius: radius.md,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
  },
  waitingCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  waitingText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
