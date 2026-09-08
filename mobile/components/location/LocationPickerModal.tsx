import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Map,
  Camera,
  UserLocation,
  type MapRef,
  type CameraRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t, num } from '@/i18n';
import { fs, lh, radius, spacing } from '@/theme';
import { savePreferredDropoff } from '@/utils/location';
import type { Dropoff } from '@/types';

/**
 * Full-screen drop-off picker.
 *
 * Mirrors the web LocationPicker's core interaction: a fixed crosshair/pin at
 * the CENTRE of the map — the user moves the map underneath it and confirms,
 * so the chosen spot is always the current map centre. This avoids the marker
 * ceremony entirely and keeps the payload identical to the web
 * (`{ lat, lng, label? }`).
 *
 * Rendered with MapLibre React Native against the same OpenStreetMap raster
 * provider the web picker uses (`tile.openstreetmap.org`, © OpenStreetMap
 * contributors) — no Google Maps, no API key.
 *
 * Permissions are handled explicitly: undetermined -> system prompt; denied ->
 * localized message (map still usable for manual picking); services off ->
 * "enable location" message; does not auto-retry. Confirming persists the
 * spot as the next checkout's preferred drop-off point.
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

const KT_ZOOM_DELTA = 0.08;
const GPS_ZOOM_DELTA = 0.008;

/**
 * MapLibre frames the viewport by a z-level (zoom), not a lat/lng delta.
 * Apprximate delta -> zoom so the Kathmandu (0.08 -> ~12.1, matching the web
 * default of 12) and GPS (0.008 -> ~15.5, matching the web locate of 16)
 * framings stay faithful to the previous react-native-maps behaviour.
 */
function deltaToZoom(delta: number): number {
  return Math.log2(360 / delta);
}

interface PickerRegion {
  latitude: number;
  longitude: number;
  zoom: number;
}

function regionFrom(lat: number, lng: number, delta: number = GPS_ZOOM_DELTA): PickerRegion {
  return { latitude: lat, longitude: lng, zoom: deltaToZoom(delta) };
}

const KATHMANDU: PickerRegion = regionFrom(27.7172, 85.324, KT_ZOOM_DELTA);

interface LocationPickerModalProps {
  visible: boolean;
  /** Preselect (e.g. the previously confirmed spot), or null for GPS/Kathmandu. */
  initial?: Dropoff | null;
  onConfirm: (dropoff: Dropoff) => void;
  onCancel: () => void;
  /** Override the header title (defaults to the checkout picker copy). */
  title?: string;
  /** Override the one-line hint under the title. */
  hint?: string;
  /** Hide the "note for the vendor" input (vendor working-location mode). */
  showNote?: boolean;
  /** Hide the "save a name for this location" input (vendor working-location mode). */
  showName?: boolean;
  /** Skip persisting the spot as the customer's preferred drop-off point. */
  persistOnConfirm?: boolean;
}

export function LocationPickerModal({
  visible,
  initial,
  onConfirm,
  onCancel,
  title,
  hint,
  showNote = true,
  showName = true,
  persistOnConfirm = true,
}: LocationPickerModalProps) {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const initialRef = useRef<Dropoff | null>(null);

  const [region, setRegion] = useState<PickerRegion>(KATHMANDU);
  const [note, setNote] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [gpsNote, setGpsNote] = useState('');
  const [locating, setLocating] = useState(false);
  const [userLocVisible, setUserLocVisible] = useState(false);

  const moveTo = (target: PickerRegion, animated: boolean) => {
    if (animated) {
      cameraRef.current?.easeTo({
        center: [target.longitude, target.latitude],
        zoom: target.zoom,
        duration: 400,
      });
    } else {
      cameraRef.current?.jumpTo({
        center: [target.longitude, target.latitude],
        zoom: target.zoom,
      });
    }
  };

  useEffect(() => {
    if (!visible) return;
    initialRef.current = initial ?? null;
    // Name and note are stored separately — pre-fill each from its own value
    // so the vendor-note never echoes the saved location name.
    setPlaceName(initial?.name ?? '');
    setNote(initial?.label ?? '');
    setGpsNote('');
    setUserLocVisible(false);

    const target = initial
      ? regionFrom(initial.lat, initial.lng, GPS_ZOOM_DELTA)
      : KATHMANDU;
    setRegion(target);
    moveTo(target, false);

    // Like the web picker, offer the device GPS when there is no preset.
    if (!initial) {
      void requestAndLocate();
    }
    // Only re-run when the modal itself opens; `initial` is captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const requestAndLocate = async () => {
    setLocating(true);
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        setGpsNote(t(lang, 'locationServicesOff'));
        return;
      }

      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== 'granted') {
        setGpsNote(t(lang, 'locationDenied'));
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = position.coords;
      const target = regionFrom(latitude, longitude, GPS_ZOOM_DELTA);
      setRegion(target);
      moveTo(target, true);
      setUserLocVisible(true);
      setGpsNote('');
    } catch {
      setGpsNote(t(lang, 'locationFetchFailed'));
    } finally {
      setLocating(false);
    }
  };

  const confirm = () => {
    // The vendor note is the `label` that travels with the order; the friendly
    // name is kept locally and shown only in the customer's own settings.
    const vendorNote = note.trim() || undefined;
    const savedName = placeName.trim() || undefined;
    const dropoff: Dropoff = {
      lat: Number(region.latitude.toFixed(6)),
      lng: Number(region.longitude.toFixed(6)),
      label: vendorNote,
      name: savedName,
    };
    if (persistOnConfirm) {
      void savePreferredDropoff(dropoff);
    }
    onConfirm(dropoff);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View
        style={[
          styles.screen,
          { backgroundColor: palette.background, paddingTop: insets.top },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'cancel')}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.closeText, { color: palette.text }]}>×</Text>
          </Pressable>
          <View style={styles.topHeader}>
            <Text style={[styles.title, { color: palette.text }]}>
              {title ?? t(lang, 'pickLocationTitle')}
            </Text>
            <Text style={[styles.hint, { color: palette.textMuted }]}>
              {hint ?? t(lang, 'moveMapHint')}
            </Text>
          </View>
        </View>

        <View style={styles.mapWrap}>
          <Map
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            mapStyle={MAP_STYLE}
            onRegionDidChange={(event) => {
              const next = event.nativeEvent;
              const [lng, lat] = next.center;
              setRegion((prev) => ({
                latitude: lat,
                longitude: lng,
                zoom: next.zoom ?? prev.zoom,
              }));
            }}
            scaleBar={false}
            compass={false}
            touchRotate={false}
            touchPitch={false}
          >
            <Camera ref={cameraRef} initialViewState={{ center: [region.longitude, region.latitude], zoom: region.zoom }} />
            {userLocVisible ? <UserLocation /> : null}
          </Map>
          <View pointerEvents="none" style={styles.pin}>
            <View style={[styles.pinDot, { backgroundColor: palette.primary }]} />
          </View>
        </View>

        {locating ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={palette.primary} />
            <Text style={[styles.statusText, { color: palette.textMuted }]}>
              {t(lang, 'gettingLocation')}
            </Text>
          </View>
        ) : gpsNote ? (
          <View style={[styles.statusRow, { borderColor: palette.border }]}>
            <Text style={[styles.statusText, { color: palette.textMuted, flex: 1 }]}>{gpsNote}</Text>
          </View>
        ) : null}

        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.coords, { color: palette.text }]}>
            {num(lang, region.latitude.toFixed(5))},{' '}
            {num(lang, region.longitude.toFixed(5))}
          </Text>

          <Pressable
            onPress={() => void requestAndLocate()}
            disabled={locating}
            accessibilityRole="button"
            accessibilityLabel={t(lang, 'locateMe')}
            style={({ pressed }) => [
              styles.locateBtn,
              { borderColor: palette.primary, opacity: pressed || locating ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.locateText, { color: palette.primary }]}>◎ {t(lang, 'locateMe')}</Text>
          </Pressable>

          {showName ? (
            <View style={styles.noteField}>
              <Text style={[styles.noteLabel, { color: palette.textMuted }]}>
                {t(lang, 'locationNameLabel')}
              </Text>
              <TextInput
                value={placeName}
                onChangeText={setPlaceName}
                placeholder={t(lang, 'locationNamePlaceholder')}
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.noteInput,
                  { backgroundColor: palette.background, color: palette.text, borderColor: palette.border },
                ]}
              />
            </View>
          ) : null}

          {showNote ? (
            <View style={styles.noteField}>
              <Text style={[styles.noteLabel, { color: palette.textMuted }]}>
                {t(lang, 'locationNoteLabel')}
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t(lang, 'locationNotePlaceholder')}
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.noteInput,
                  { backgroundColor: palette.background, color: palette.text, borderColor: palette.border },
                ]}
              />
            </View>
          ) : null}

          <View style={styles.footer}>
            <Button variant="secondary" title={t(lang, 'cancel')} onPress={onCancel} />
            <Button title={t(lang, 'confirmLocation')} onPress={confirm} />
          </View>
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
    alignItems: 'flex-start',
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
  topHeader: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontSize: fs(17),
    fontWeight: '700',
  },
  hint: {
    fontSize: fs(13),
    lineHeight: lh(18),
  },
  mapWrap: {
    flex: 1,
    position: 'relative',
  },
  pin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -14,
    marginLeft: -14,
  },
  pinDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  statusText: {
    fontSize: fs(13),
    lineHeight: lh(18),
  },
  panel: {
    borderTopWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  coords: {
    fontSize: fs(15),
    fontWeight: '600',
    textAlign: 'center',
  },
  locateBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  locateText: {
    fontSize: fs(14),
    fontWeight: '600',
    textAlign: 'center',
  },
  noteField: {
    gap: spacing.xxs,
  },
  noteLabel: {
    fontSize: fs(13),
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fs(15),
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});