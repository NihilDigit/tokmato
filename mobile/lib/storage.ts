/**
 * AsyncStorage adapter for the shared Zustand store.
 *
 * Called once at app boot from `app/_layout.tsx`. Wraps
 * `@react-native-async-storage/async-storage` to satisfy the
 * `SharedStorage` shape from `@tokmato/shared/storage-port`.
 *
 * AsyncStorage is async — the storage port's interface accepts both
 * sync and async backends. Zustand's `createJSONStorage` awaits the
 * returned promises, so persist round-trips survive unchanged.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  setSharedStorage,
  type SharedStorage,
} from "@tokmato/shared/storage-port";

const adapter: SharedStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

export function installStorage() {
  setSharedStorage(adapter);
}
