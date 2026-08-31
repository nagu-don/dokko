import * as SecureStore from 'expo-secure-store';

/**
 * Thin wrapper over expo-secure-store used for sensitive values only
 * (auth tokens, credentials). Never store cart/lang/theme here.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      return value;
    } catch (error) {
      console.warn(`[secureStorage] read failed for key "${key}"`, error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`[secureStorage] write failed for key "${key}"`, error);
      throw error;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn(`[secureStorage] delete failed for key "${key}"`, error);
    }
  },

  /** Reads, parses and returns JSON, or null when missing/corrupt. */
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn(`[secureStorage] JSON parse failed for key "${key}"`, error);
      return null;
    }
  },

  async setJSON(key: string, value: unknown): Promise<void> {
    await this.setItem(key, JSON.stringify(value));
  },
};

/** Shared typed helpers so auth code reads naturally. */
export async function getSecureValue(key: string): Promise<string | null> {
  return secureStorage.getItem(key);
}

export async function setSecureValue(key: string, value: string): Promise<void> {
  return secureStorage.setItem(key, value);
}

export async function deleteSecureValue(key: string): Promise<void> {
  return secureStorage.removeItem(key);
}