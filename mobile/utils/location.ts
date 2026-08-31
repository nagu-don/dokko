import AsyncStorage from '@react-native-async-storage/async-storage';
import { ASYNC_PREFERRED_DROPOFF_KEY } from '@/constants';
import type { Dropoff } from '@/types';

/**
 * Location persistence + validation for checkout.
 *
 * The preferred drop-off point is remembered so the next visit can preselect
 * it (mirrors the web app's `dokkoPreferredDropoff` behavior). Everything is
 * best-effort: a corrupt/missing value simply means "no preset".
 */

function parseDropoff(raw: string | null): Dropoff | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Dropoff>;
    if (!isValidLocation(value)) return null;
    return {
      lat: Number(value.lat),
      lng: Number(value.lng),
      label: typeof value.label === 'string' && value.label ? value.label : undefined,
    };
  } catch {
    return null;
  }
}

export async function loadPreferredDropoff(): Promise<Dropoff | null> {
  try {
    return parseDropoff(await AsyncStorage.getItem(ASYNC_PREFERRED_DROPOFF_KEY));
  } catch {
    return null;
  }
}

export async function savePreferredDropoff(dropoff: Dropoff): Promise<void> {
  try {
    await AsyncStorage.setItem(ASYNC_PREFERRED_DROPOFF_KEY, JSON.stringify(dropoff));
  } catch {
    // best-effort — a failed save just means the next checkout starts fresh
  }
}

/** Mirror the backend's drop-off validation (finite, lat<=90, lng<=180). */
export function isValidLocation(loc: Dropoff | Partial<Dropoff> | null | undefined): boolean {
  if (!loc) return false;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}