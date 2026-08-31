import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small namespaced wrapper over AsyncStorage for NON-sensitive app data
 * (cart, locale, theme, preferred dropoff). It matches the semantics of the
 * zip storage (AsyncStorage) so screens never touch AsyncStorage directly.
 */
export const localStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.warn(`[localStorage] read failed for key "${key}"`, error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error(`[localStorage] write failed for key "${key}"`, error);
      throw error;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn(`[localStorage] delete failed for key "${key}"`, error);
    }
  },

  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn(`[localStorage] JSON parse failed for key "${key}"`, error);
      return null;
    }
  },

  async setJSON(key: string, value: unknown): Promise<void> {
    await this.setItem(key, JSON.stringify(value));
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.warn('[localStorage] clear failed', error);
    }
  },
};

/** Zustand-persist-compatible storage adapter (createJSONStorage expects this). */
export const asyncStorageSyncAdapter = AsyncStorage;