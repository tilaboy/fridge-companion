/* The storage key and the one destructive operation on it.
 *
 * Kept apart from the pure domain so tests can pass a fake storage object;
 * the browser's localStorage never appears here.
 */

export const STORAGE_KEY = 'fdc-state-v1';

export interface StorageLike {
  removeItem(key: string): void;
}

/** Clears only this app's key. Returns false when storage is unavailable. */
export function clearStoredKitchen(storage: StorageLike | null | undefined): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
