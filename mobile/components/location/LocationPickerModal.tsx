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
import MapView, { type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/form';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t, num } from '@/i18n';
import { radius, spacing } from '@/theme';
import { savePreferredDropoff } from '@/utils/location';
import type { Dropoff } from '@/types';

/**
 * Full-screen drop-off picker.
 *
 * Mirrors the web LocationPicker's core interaction: a fixed crosshair/pin at
 * the CENTRE of the map — the user moves the map underneath it and confirms,
 * so the chosen spot is always the current map centre. This avoids the Google
 * marker/AddressPicker ceremony entirely and keeps the payload identical to
 * the web (`{ lat, lng, label? }`).
 *
 * Permissions are handled explicitly: undetermined -> system prompt; denied ->
 * localized message (map still usable for manual picking); services off ->
 * "enable location" message; does not auto-retry. Confirming persists the
 * spot as the next checkout's preferred drop-off point.
 */

const KT_ZOOM_DELTA = 0.08;
const GPS_ZOOM_DELTA = 0.008;

function regionFrom(lat: number, lng: number, delta: number = GPS_ZOOM_DELTA): Region {
  return { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta };
}

const KATHMANDU: Region = regionFrom(27.7172, 85.324, KT_ZOOM_DELTA);

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
  persistOnConfirm = true,
}: LocationPickerModalProps) {
  const { palette, lang } = useAppTheme();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView>(null);
  const initialRef = useRef<Dropoff | null>(null);

  const [region, setRegion] = useState<Region>(KATHMANDU);
  const [note, setNote] = useState('');
  const [gpsNote, setGpsNote] = useState('');
  const [locating, setLocating] = useState(false);
  const [userLocVisible, setUserLocVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    initialRef.current = initial ?? null;
    setNote(initial?.label ?? '');
    setGpsNote('');
    setUserLocVisible(false);
    setRegion(initial ? regionFrom(initial.lat, initial.lng, GPS_ZOOM_DELTA) : KATHMANDU);
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
      mapRef.current?.animateToRegion(target, 400);
      setUserLocVisible(true);
      setGpsNote('');
    } catch {
      setGpsNote(t(lang, 'locationFetchFailed'));
    } finally {
      setLocating(false);
    }
  };

  const confirm = () => {
    const dropoff: Dropoff = {
      lat: Number(region.latitude.toFixed(6)),
      lng: Number(region.longitude.toFixed(6)),
      label: note.trim() ? note.trim() : undefined,
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
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            region={region}
            onRegionChangeComplete={setRegion}
            showsUserLocation={userLocVisible}
            showsMyLocationButton={false}
            showsCompass={false}
          />
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
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '400',
  },
  topHeader: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
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
    fontSize: 13,
    lineHeight: 18,
  },
  panel: {
    borderTopWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  coords: {
    fontSize: 15,
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
    fontSize: 14,
    fontWeight: '600',
  },
  noteField: {
    gap: spacing.xxs,
  },
  noteLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});