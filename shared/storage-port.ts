/**
 * Platform-agnostic storage port for the shared store.
 *
 * Web (default): wraps `localStorage` synchronously, falls back to a noop
 * during SSR/prerender so module load never throws.
 * RN: `mobile/` calls `setSharedStorage(asyncStorage)` at app boot to inject
 * `@react-native-async-storage/async-storage`.
 *
 * The interface accepts both sync and async backends — zustand's
 * `createJSONStorage` awaits returned promises transparently.
 */

export type SharedStorage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => unknown | Promise<unknown>;
  removeItem: (key: string) => unknown | Promise<unknown>;
};

const noopStorage: SharedStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

let injected: SharedStorage | null = null;

export function setSharedStorage(storage: SharedStorage) {
  injected = storage;
}

export function getSharedStorage(): SharedStorage {
  if (injected) return injected;
  if (typeof globalThis !== "undefined") {
    const ls = (globalThis as { localStorage?: SharedStorage }).localStorage;
    if (ls) return ls;
  }
  return noopStorage;
}

/**
 * Sync per-key flag accessors used by the v8 upgrade dance and the welcome
 * gate. On web these are localStorage round-trips; on RN they fall through to
 * AsyncStorage which is async — fire-and-forget is acceptable for these
 * one-time migration markers (worst case: a same-tick read after a write
 * misses, but the post-hydrate effect re-checks on the next render).
 */
export function readFlag(key: string): string | null {
  const result = getSharedStorage().getItem(key);
  if (typeof result === "string" || result === null) return result;
  return null;
}

export function writeFlag(key: string, value: string): void {
  void getSharedStorage().setItem(key, value);
}

export function clearFlag(key: string): void {
  void getSharedStorage().removeItem(key);
}
