/* The browser's side of storage: one versioned key, read defensively.
 *
 * The domain owns the shape; this module owns the boundary. Every function
 * takes an optional storage so tests can pass a fake, and every failure is
 * reported rather than swallowed: a save that returns false is what raises the
 * persistent banner in the UI.
 */
import type { Catalog } from '../domain/catalog';
import { ensureCategories } from '../domain/categories';
import { createState } from '../domain/state';
import { clearStoredKitchen, STORAGE_KEY } from '../domain/storage';
import { sanitizeState } from '../domain/transfer';
import type { KitchenState } from '../domain/types';

export { STORAGE_KEY, clearStoredKitchen };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage, or null when the browser blocks it (private mode, policy). */
export function getStorage(): StorageLike | null {
  // The app is window-only; this also keeps Node's experimental
  // localStorage global from being touched by tests.
  if (typeof window === 'undefined') return null;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // Access itself can throw; the app then runs in memory.
  }
  return null;
}

/** Unreadable or corrupt storage means first use again, never a crash. */
export function loadState(catalog: Catalog, storage = getStorage()): KitchenState {
  if (!storage) return createState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createState();
    return sanitizeState(catalog, JSON.parse(raw));
  } catch {
    return createState();
  }
}

/** True when the write landed. False is the signal for the storage banner. */
export function saveState(state: KitchenState, storage = getStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** The raw stored kitchen, for a tab that was told another tab changed it. */
export function readRawState(storage = getStorage()): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** A cleared browser is a first visit: seeded categories, no stock. */
export function freshKitchen(): KitchenState {
  return ensureCategories(createState());
}
