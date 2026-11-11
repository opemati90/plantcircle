import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Non-sensitive key/value storage (onboarding answers, dev fixture state). */
export const appStorage = {
  get: (key: string) => AsyncStorage.getItem(key),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value),
  remove: (key: string) => AsyncStorage.removeItem(key),
};

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Keychain / Keystore values have a small size limit, so long values are split. */
const CHUNK_SIZE = 1800;

/**
 * Stores a long string across several entries of a size-limited store.
 * `<key>` holds the chunk count; `<key>.<n>` hold the pieces.
 */
export function chunked(store: KeyValueStore): KeyValueStore {
  const countOf = async (key: string) => Number((await store.getItem(key)) ?? 0);
  const removeChunks = async (key: string, count: number) => {
    for (let index = 0; index < count; index += 1) await store.removeItem(`${key}.${index}`);
  };
  return {
    async getItem(key) {
      const count = await countOf(key);
      if (!count) return null;
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await store.getItem(`${key}.${index}`);
        // A missing piece means a write was interrupted: treat the value as absent.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const previous = await countOf(key);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let index = 0; index < count; index += 1) {
        await store.setItem(
          `${key}.${index}`,
          value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
        );
      }
      await store.setItem(key, String(count));
      if (previous > count) {
        for (let index = count; index < previous; index += 1) {
          await store.removeItem(`${key}.${index}`);
        }
      }
    },
    async removeItem(key) {
      await removeChunks(key, await countOf(key));
      await store.removeItem(key);
    },
  };
}

// SecureStore keys may only contain alphanumerics, ".", "-" and "_".
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * Where the auth session lives: the iOS Keychain / Android Keystore.
 * The web build is for development only and falls back to browser storage.
 */
export const sessionStorage: KeyValueStore =
  Platform.OS === 'web'
    ? AsyncStorage
    : chunked({
        getItem: (key) => SecureStore.getItemAsync(safeKey(key)),
        setItem: (key, value) => SecureStore.setItemAsync(safeKey(key), value),
        removeItem: (key) => SecureStore.deleteItemAsync(safeKey(key)),
      });
