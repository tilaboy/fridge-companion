/* Session undo: a bounded stack of whole-kitchen snapshots.
 *
 * Every commit action replaces the state with a fresh object, so one snapshot
 * is enough to restore the exact prior kitchen — lots, expiry dates, ids,
 * shopping list, categories, cook history. The stack lives in memory only:
 * undo is for the "oops" right after a gesture, not a versioned history that
 * has to sync.
 */
import { cloneState } from './state';
import type { KitchenState } from './types';

export interface UndoEntry {
  /** What happened: "cooking", "restocking". */
  kind: string;
  /** A sentence for the undo bar, e.g. "Cooked Tomato Pasta." */
  message: string;
  state: KitchenState;
}

export const UNDO_LIMIT = 20;

/** Push a snapshot, dropping the oldest when the stack is full. */
export function pushUndo(
  stack: readonly UndoEntry[],
  entry: UndoEntry,
  limit: number = UNDO_LIMIT,
): UndoEntry[] {
  const next = [
    ...stack,
    { kind: entry.kind, message: entry.message, state: cloneState(entry.state) },
  ];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Take the most recent snapshot. Null means there is nothing to undo. */
export function popUndo(
  stack: readonly UndoEntry[],
): { entry: UndoEntry; rest: UndoEntry[] } | null {
  if (stack.length === 0) return null;
  const entry = stack[stack.length - 1]!;
  return {
    entry: { kind: entry.kind, message: entry.message, state: cloneState(entry.state) },
    rest: stack.slice(0, -1),
  };
}
