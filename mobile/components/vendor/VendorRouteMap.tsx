import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getVendorRoute } from '@/services/vendors';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useVendorProfile } from '@/hooks/useVendorRequests';
import { t, num } from '@/i18n';
import { fs, lh, spacing } from '@/theme';
import type { VendorRequestDropoff } from '@/types';

/**
 * Live turn-by-turn style route map for an accepted order (vendor portal).
 *
 * Mirrors the vendor web app's RouteMap (vendor/src/components/map/RouteMap.jsx):
 *  - vendor = the vendor's CURRENT device GPS position (falls back to the
 *    saved working location, then Kathmandu when neither is available)
*  - the vendor position is tracked continuously with expo-location's
  *    watchPositionAsync while the modal is open — the marker redraws whenever
  *    the GPS fix moves, so it always reflects the live location
  *  - an ORANGE arrow (circle + up-pointing triangle, matching the web
  *    RouteMap) rotates to the vendor's heading (direction of travel). Heading
  *    comes from the device compass (watchHeadingAsync) when available — the
  *    web portal's deviceorientation source — falling back to the GPS course /
  *    movement bearing while the vendor is moving.
*  - destination = the customer's drop-off point, marked with a GREEN pin
  *  - the navigation follows the path of least distance: the backend relays
  *    the route request to its server-side OSRM instances (which try several
  *    public hosts in fallback order and pick the shortest alternative) — the
  *    app never sends coordinates to a third-party host directly. That optimal
  *    route is highlighted in SOLID ORANGE on the map (with a white casing for
  *    contrast). The route is re-requested from the current GPS position
  *    whenever the vendor has moved far enough (so the route line and the
  *    distance/ETA summary stay current while delivering). The straight-line
  *    placeholder is only used when routing fails on the very first draw — it
  *    is never drawn over an existing route.
 *  - the camera follows the moving vendor; panning the map pauses following
 *    and a "re-center" button resumes it
 *
 * Rendered with MapLibre React Native against the same OpenStreetMap raster
 * provider the rest of the app uses — no Google Maps, no API key.
 */

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
};

const KATHMANDU = { lat: 27.7172, lng: 85.324 };

const VENDOR_COLOR = '#e8590c';
const DROPOFF_COLOR = '#16a34a';
const ROUTE_COLOR = '#f96004';

const METERS_PER_DEG_LAT = 111_320;
/** Minimum travel (m) before the arrow's bearing is recomputed from GPS course. */
const HEADING_MIN_MOVE_M = 4;
/** Minimum travel (m) before the camera re-centers on the vendor. */
const FOLLOW_MIN_MOVE_M = 12;
/** Minimum travel (m) from the last route origin before a new route is fetched. */
const REROUTE_MIN_MOVE_M = 25;
/** Cooldown (ms) between consecutive route requests while moving. */
const REROUTE_THROTTLE_MS = 2000;

type StartKind = 'gps' | 'saved' | 'fallback';

interface LatLng {
  lat: number;
  lng: number;
}

interface VendorRouteMapProps {
  visible: boolean;
  code: string;
  dropoff: VendorRequestDropoff;
  onClose: () => void;
}

/** Haversine bearing (degrees CW from north) between two {lat,lng} points. */
function bearingFrom(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(b.lng - a.lng);
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Approximate straight-line distance in meters between two points. */
function moveMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
  const dx =
    (b.lng - a.lng) * METERS_PER_DEG_LAT * Math.cos(toRad((a.lat + b.lat) / 2));
  return Math.sqrt(dx * dx + dy * dy);
}

export function VendorRouteMap({
  visible,
  code,
  dropoff,
  onClose,
}: VendorRouteMapProps) {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const profileQuery = useVendorProfile();

  const [status, setStatus] = useState<'loading' | 'ready' | 'routeless'>('loading');
  const [start, setStart] = useState<LatLng | null>(null);
  const [startKind, setStartKind] = useState<StartKind>('gps');
  const [heading, setHeading] = useState<number | null>(null);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [summary, setSummary] = useState<{ distanceKm: number; minutes: number } | null>(null);
  const [followMode, setFollowMode] = useState(true);

  // Latest profile location so the GPS failure path can fall back to the
  // vendor's saved working location even if the query resolves later.
  const profileRef = useRef(profileQuery.data);
  useEffect(() => {
    profileRef.current = profileQuery.data;
  }, [profileQuery.data]);

  // Mirrors `start` so callbacks outside render can re-center on the vendor.
  const startRef = useRef<LatLng | null>(null);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const followRef = useRef(true);

  /** Animate the camera to fit the given origin + the dropoff. */
  const fitToCurrent = useCallback(
    (from: LatLng) => {
      if (!visible) return;
      const west = Math.min(from.lng, dropoff.lng);
      const east = Math.max(from.lng, dropoff.lng);
      const south = Math.min(from.lat, dropoff.lat);
      const north = Math.max(from.lat, dropoff.lat);
      cameraRef.current?.fitBounds(
        [west, south, east, north],
        {
          padding: { top: 60, right: 60, bottom: 60, left: 60 },
          duration: 700,
          easing: 'ease',
        }
      );
    },
    [visible, dropoff.lat, dropoff.lng]
  );

  const handleRecenter = () => {
    followRef.current = true;
    setFollowMode(true);
    if (startRef.current) fitToCurrent(startRef.current);
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let watchSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;
    let rerouteTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFix: LatLng | null = null;
    let compassActive = false;
    let hasRoute = false;
    const lastRouteOriginRef: { current: LatLng | null } = { current: null };

    const destination: [number, number] = [dropoff.lng, dropoff.lat];

    const scheduleReroute = (from: LatLng) => {
      if (cancelled) return;
      lastRouteOriginRef.current = from;
      if (rerouteTimer) clearTimeout(rerouteTimer);
      rerouteTimer = setTimeout(() => {
        rerouteTimer = null;
        void fetchRoute(from);
      }, REROUTE_THROTTLE_MS);
    };

    const fetchRoute = async (from: LatLng) => {
      // Ask the backend for the route: it relays to its server-side OSRM
      // instances in fallback order and returns the shortest alternative, so a
      // single throttled/blocked host can't break routing (and the app never
      // sends coordinates to a third-party host directly).
      try {
        const route = await getVendorRoute(from, {
          lat: dropoff.lat,
          lng: dropoff.lng,
        });
        const coords = route.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) {
          throw new Error('No route');
        }
        if (cancelled) return;
        lastRouteOriginRef.current = from;
        hasRoute = true;
        setRoute(coords);
        setSummary({
          distanceKm: Math.round((route.distance / 1000) * 10) / 10,
          minutes: Math.max(1, Math.round(route.duration / 60)),
        });
        setStatus('ready');
        return;
      } catch {
        // Backend routing unavailable (all providers failed / network) — fall
        // through to the straight-line placeholder below.
      }

      if (cancelled) return;
      lastRouteOriginRef.current = from;
      // A previously drawn route is NEVER replaced by the straight line — only
      // an initial fetch with nothing on screen yet falls back to it.
      if (!hasRoute) {
        const straightMeters = moveMeters(from, {
          lat: dropoff.lat,
          lng: dropoff.lng,
        });
        setRoute([[from.lng, from.lat], destination]);
        setSummary({
          distanceKm: Math.round((straightMeters / 1000) * 10) / 10,
          minutes: Math.max(1, Math.round((straightMeters / 1000) * 2)),
        });
        setStatus('routeless');
      }
    };

    // Called on every live GPS fix (initial + watchPositionAsync updates).
    const applyFix = (
      coord: LatLng,
      gpsHeading: number | null,
      movedMeters: number
    ) => {
      setStart(coord);
      setStartKind('gps');

      // Arrow direction of travel. When the compass is active (the web
      // portal's primary source) it owns the heading; otherwise use the GPS
      // course, falling back to the bearing of the movement that just happened.
      if (!compassActive) {
        if (gpsHeading != null && Number.isFinite(gpsHeading)) {
          setHeading(((gpsHeading % 360) + 360) % 360);
        } else if (lastFix && movedMeters >= HEADING_MIN_MOVE_M) {
          setHeading(bearingFrom(lastFix, coord));
        }
      }

      // Re-route along the path of least distance once the vendor moved far
      // enough from the last-requested origin (throttled so we do not hammer
      // the routing server).
      const origin = lastRouteOriginRef.current;
      if (!origin || moveMeters(origin, coord) >= REROUTE_MIN_MOVE_M) {
        scheduleReroute(coord);
      }

      // Follow the vendor by re-fitting the camera on meaningful movement.
      if (followRef.current && movedMeters >= FOLLOW_MIN_MOVE_M) {
        fitToCurrent(coord);
      }
      lastFix = coord;
    };

    const startWatching = async (): Promise<boolean> => {
      try {
        watchSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 3,
            timeInterval: 10000,
          },
          (position) => {
            if (cancelled) return;
            const { latitude, longitude, heading: course } = position.coords;
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
            const coord = { lat: latitude, lng: longitude };
            const moved = lastFix ? moveMeters(lastFix, coord) : 0;
            applyFix(coord, course, moved);
          },
          () => {
            // GPS stream failed (e.g. permission revoked mid-view) — keep the
            // last known position on screen.
          }
        );
        return watchSub != null;
      } catch {
        return false;
      }
    };

    // Device compass heading — the web portal's deviceorientation source.
    // Feeds the arrow continuously even when the vendor is standing still.
    const startHeading = async (): Promise<boolean> => {
      try {
        headingSub = await Location.watchHeadingAsync(
          (heading) => {
            if (cancelled) return;
            compassActive = true;
            // trueHeading needs location permission (may be -1); fall back to
            // the magnetic heading otherwise.
            const deg =
              heading.trueHeading != null && heading.trueHeading >= 0
                ? heading.trueHeading
                : heading.magHeading;
            if (Number.isFinite(deg)) {
              setHeading(((deg % 360) + 360) % 360);
            }
          },
          () => {
            // Compass unavailable — GPS course / movement bearing still drives
            // the arrow.
          }
        );
        return headingSub != null;
      } catch {
        return false;
      }
    };

    const resolveStart = async (): Promise<{
      coord: LatLng;
      kind: StartKind;
      course: number | null;
    }> => {
      try {
        const servicesOn = await Location.hasServicesEnabledAsync();
        if (servicesOn) {
          let permission = await Location.getForegroundPermissionsAsync();
          if (permission.status !== 'granted') {
            permission = await Location.requestForegroundPermissionsAsync();
          }
          if (permission.status === 'granted') {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            const { latitude, longitude, heading: course } = position.coords;
            return {
              coord: { lat: latitude, lng: longitude },
              kind: 'gps',
              course,
            };
          }
        }
      } catch {
        // GPS unavailable or denied — fall back to the saved working location.
      }

      const saved = profileRef.current?.location;
      if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lng)) {
        return { coord: { lat: saved.lat, lng: saved.lng }, kind: 'saved', course: null };
      }
      return { coord: KATHMANDU, kind: 'fallback', course: null };
    };

    (async () => {
      const resolved = await resolveStart();
      if (cancelled) return;
      const initial = resolved.coord;
      lastFix = initial;
      lastRouteOriginRef.current = initial;
      startRef.current = initial;
      setStart(initial);
      setStartKind(resolved.kind);

      // Point the arrow at the destination while stationary.
      const initialCourse =
        resolved.course ??
        bearingFrom(initial, { lat: dropoff.lat, lng: dropoff.lng });
      setHeading(initialCourse);
      fitToCurrent(initial);

      // Continuously track the GPS position and update the map as it changes.
      if (resolved.kind === 'gps') {
        const watching = await startWatching();
        if (!watching) {
          // Watch failed — still show the static GPS start point + route.
        }
      }

      // Compass heading (independent of GPS) keeps the arrow live at all times.
      await startHeading();

      if (cancelled) return;
      void fetchRoute(initial);
    })();

    return () => {
      cancelled = true;
      if (watchSub) watchSub.remove();
      if (headingSub) headingSub.remove();
      if (rerouteTimer) clearTimeout(rerouteTimer);
      followRef.current = true;
      lastFix = null;
      setFollowMode(true);
      setHeading(null);
      setStart(null);
      setRoute([]);
      setSummary(null);
      setStatus('loading');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const routeGeoJSON = useMemo<GeoJSON.Feature | null>(() => {
    if (route.length === 0) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: route },
    };
  }, [route]);

  // If no GPS course has been reported, fall back to the bearing towards the
  // drop-off so the arrow always indicates the direction of travel.
  const arrowDeg = heading ?? (start ? bearingFrom(start, dropoff) : 0);

  const startLabel = start
    ? `${startKind === 'gps' ? t(lang, 'navFromGps') : t(lang, 'navFromSaved')} (${num(lang, start.lat.toFixed(5))}, ${num(lang, start.lng.toFixed(5))})`
    : '…';

  const dropoffLabel =
    dropoff.label ||
    `${num(lang, dropoff.lat.toFixed(5))}, ${num(lang, dropoff.lng.toFixed(5))}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.screen,
          { backgroundColor: palette.background, paddingTop: insets.top },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'cancel')}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.closeText, { color: palette.text }]}>×</Text>
          </Pressable>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {t(lang, 'vendorNavTitle', { code })}
          </Text>
          <View style={styles.topEnd} />
        </View>

        <View style={styles.mapWrap}>
          <Map
            style={StyleSheet.absoluteFill}
            mapStyle={MAP_STYLE}
            scaleBar={false}
            compass={false}
            touchRotate={false}
            touchPitch={false}
            onRegionWillChange={(event) => {
              // A user gesture overrides auto-follow; the recenter button
              // resumes following.
              if (event.nativeEvent.userInteraction) {
                followRef.current = false;
                setFollowMode(false);
              }
            }}
          >
            <Camera
              ref={cameraRef}
              initialViewState={{ center: [dropoff.lng, dropoff.lat], zoom: 14 }}
            />
            {routeGeoJSON ? (
              <GeoJSONSource id="vendor-nav-route" data={routeGeoJSON}>
                {status === 'ready' ? (
                  <Layer
                    id="vendor-nav-route-casing"
                    type="line"
                    source="vendor-nav-route"
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    paint={{
                      'line-color': '#FFFFFF',
                      'line-width': 12,
                      'line-opacity': 0.85,
                    }}
                  />
                ) : null}
                <Layer
                  id="vendor-nav-route-line"
                  type="line"
                  source="vendor-nav-route"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{
                    'line-color': ROUTE_COLOR,
                    'line-width': status === 'ready' ? 7 : 4,
                    'line-opacity': 1,
                  }}
                />
              </GeoJSONSource>
            ) : null}

            {start ? (
              <Marker lngLat={[start.lng, start.lat]} anchor="center">
                <View
                  style={[
                    styles.arrowWrap,
                    { transform: [{ rotate: `${arrowDeg}deg` }] },
                  ]}
                >
                  <View
                    style={[
                      styles.arrowTriangle,
                      { borderBottomColor: VENDOR_COLOR },
                    ]}
                  />
                </View>
              </Marker>
            ) : null}

            <Marker lngLat={[dropoff.lng, dropoff.lat]} anchor="center">
              <View style={styles.pinWrap}>
                <Ionicons name="location" size={42} color={DROPOFF_COLOR} />
              </View>
            </Marker>
          </Map>

          {summary ? (
            <View pointerEvents="none" style={styles.distanceBadgeWrap}>
              <View style={styles.distanceBadge}>
                <Text style={styles.distanceBadgeText}>
                  {t(lang, 'navDistanceToDropoff', { km: summary.distanceKm })}
                </Text>
              </View>
            </View>
          ) : null}

          {startKind === 'gps' && !followMode ? (
            <Pressable
              onPress={handleRecenter}
              accessibilityRole="button"
              accessibilityLabel={t(lang, 'navRecenter')}
              style={({ pressed }) => [
                styles.recenterBtn,
                { backgroundColor: palette.primary, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Ionicons name="locate" size={22} color={palette.primaryText} />
            </Pressable>
          ) : null}

          {status === 'loading' ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.infoPanel,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={styles.infoRow}>
            <View style={[styles.dot, { backgroundColor: VENDOR_COLOR }]} />
            <Text style={[styles.infoText, { color: palette.textMuted }]} numberOfLines={2}>
              {startLabel}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <View style={[styles.dot, { backgroundColor: DROPOFF_COLOR }]} />
            <Text style={[styles.infoText, { color: palette.textMuted }]} numberOfLines={2}>
              {dropoffLabel}
            </Text>
          </View>
          {summary ? (
            <Text style={[styles.summaryText, { color: palette.primary }]}>
              {t(lang, 'navDistanceEta', {
                km: summary.distanceKm,
                min: summary.minutes,
              })}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
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
    gap: spacing.xs,
  },
  closeBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  closeText: {
    fontSize: fs(30),
    lineHeight: lh(32),
    fontWeight: '400',
  },
  title: {
    flex: 1,
    fontSize: fs(17),
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  topEnd: {
    width: 30,
  },
  mapWrap: {
    flex: 1,
    position: 'relative',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  arrowWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: VENDOR_COLOR,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  arrowTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    transform: [{ translateY: -2 }],
  },
  pinWrap: {
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recenterBtn: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  distanceBadgeWrap: {
    position: 'absolute',
    top: spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  distanceBadge: {
    backgroundColor: '#f96004',
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  distanceBadgeText: {
    color: '#FFFFFF',
    fontSize: fs(14),
    fontWeight: '800',
  },
  infoPanel: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  infoText: {
    flex: 1,
    fontSize: fs(13),
    lineHeight: lh(18),
  },
  summaryText: {
    fontSize: fs(14),
    fontWeight: '700',
  },
});