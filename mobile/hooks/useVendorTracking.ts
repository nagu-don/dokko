import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { updateVendorLiveLocation } from '@/services/vendors';
import { isApiError } from '@/services/api';

/**
 * Foreground-only live-location reporting hook for the vendor's
 * accepted-order screen (Phase 14C).
 *
 * SECURITY / lifecycle:
 *  - Runs ONLY while `active` is true (the vendor is delivering a Processing
 *    order). It stops the moment the order leaves Processing (Delivered /
 *    Cancelled) or the screen unmounts — NO background GPS ever.
 *  - Foreground permission is requested once (expo-location
 *    getCurrentPositionAsync — same API as the LocationPickerModal).
 *  - Each tick gets the current GPS position and reports it via
 *    PATCH /api/vendors/live-location. The backend owns auth (self-only),
 *    lifecycle (it also gates on an active Processing order) and a server
 *    timestamp. The server rate-guard (429) is treated as a silent back-off,
 *    not a hard error — the next tick simply resumes.
 *  - A report is intentionally BEST-EFFORT: a failed single report (permission
 *    loss, network blip) never surfaces as a user error and never retries
 *    aggressively; the next scheduled tick will try again. This avoids
 *    hammering the API.
 *
 * Returns a lightweight status the accepted screen may surface (e.g. a
 * "sharing your live location" hint):
 *  - 'idle'   → not currently tracking (inactive / stopped)
 *  - 'active' → tracking is on and the last report was sent
 *  - 'preparing' → permission/startup in progress
 *  - 'unavailable' → live location reporting cannot run (permission denied)
 */
export type VendorTrackingStatus =
  | 'idle'
  | 'preparing'
  | 'active'
  | 'unavailable';

export const VENDOR_TRACK_INTERVAL_MS = 10000;

export function useVendorLiveLocation(active: boolean): VendorTrackingStatus {
  const [status, setStatus] = useState<VendorTrackingStatus>('idle');
  const activeRef = useRef(active);
  const startedRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    // Not active → nothing to report and nothing to prepare.
    if (!active) {
      startedRef.current = false;
      setStatus('idle');
      return;
    }

    // Avoid starting the loop twice under fast React state flips.
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let permissionGranted = false;

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const reportOnce = async () => {
      if (!permissionGranted || !activeRef.current || cancelled) return;
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled || !activeRef.current) return;
        const { latitude, longitude } = position.coords;
        await updateVendorLiveLocation({ lat: latitude, lng: longitude });
        if (!cancelled) setStatus('active');
      } catch (error) {
        // 429 (server rate-guard) and any network/transport error are silent:
        // the next tick retries. A hard report failure never blocks delivery.
        // eslint-disable-next-line no-empty
        if (isApiError(error) && (error as { status?: number }).status === 429) {
          // rate-guarded — back off until next tick
        }
      }
    };

    const start = async () => {
      try {
        const servicesOn = await Location.hasServicesEnabledAsync();
        if (!servicesOn) {
          setStatus('unavailable');
          return;
        }
        let permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (permission.status !== 'granted' || cancelled) {
          setStatus('unavailable');
          return;
        }
        permissionGranted = true;
        setStatus('preparing');
        await reportOnce();
        intervalId = setInterval(() => {
          void reportOnce();
        }, VENDOR_TRACK_INTERVAL_MS);
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    };

    void start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active]);

  return status;
}
