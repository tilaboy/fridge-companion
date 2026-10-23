/* Stock lots: the fridge holds batches, not one number per ingredient.
 *
 * A lot remembers how much went in, when, and (optionally) when it should be
 * used by. Totals are always derived, never stored, so there is one source of
 * truth and cooking can take the soonest-expiring batch first.
 */
import type { ExpiryStatus, IngredientId, Stock, StockLot } from './types';

/** A date-only stamp in local time, matching what `<input type="date">` emits. */
export function todayStamp(now: Date = new Date()): string {
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

/**
 * Accept the two shapes a date reaches us in: the date input's `YYYY-MM-DD`
 * and a full ISO timestamp (hand-edited files, older exports). Anything else
 * is "unknown", never a half-parsed date.
 */
export function normalizeExpiry(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(text);
  if (!match) return null;
  const date = match[1]!;
  // Reject 2026-02-31, which Date happily rolls over.
  const parsed = new Date(date + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return null;
  if (todayStamp(parsed) !== date) return null;
  return date;
}

export function expiryStatus(expiresAt: string | null, now: Date = new Date()): ExpiryStatus {
  if (!expiresAt) return 'none';
  const today = todayStamp(now);
  if (expiresAt < today) return 'expired';
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 3);
  if (expiresAt <= todayStamp(soon)) return 'soon';
  return 'later';
}

export function newLotId(): string {
  return 'lot-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** Append a batch. Callers that need a deterministic id can pass one. */
export function addLot(
  lots: readonly StockLot[],
  ingredientId: IngredientId,
  amount: number,
  expiresAt: string | null = null,
  now: Date = new Date(),
  id: string = newLotId(),
): StockLot[] {
  return [
    ...lots,
    {
      id,
      ingredientId,
      amount,
      expiresAt: normalizeExpiry(expiresAt),
      addedAt: now.toISOString(),
    },
  ];
}

export function totalAmount(lots: readonly StockLot[], ingredientId: IngredientId): number {
  let total = 0;
  for (const lot of lots) {
    if (lot.ingredientId === ingredientId) total += lot.amount;
  }
  return total;
}

/** All held amounts, for the engine and the render functions. */
export function stockTotals(lots: readonly StockLot[]): Stock {
  const totals: Stock = {};
  for (const lot of lots) {
    totals[lot.ingredientId] = (totals[lot.ingredientId] ?? 0) + lot.amount;
  }
  return totals;
}

/** Oldest expiry first; lots with no expiry go last; ties use arrival order. */
export function sortLots(lots: readonly StockLot[]): StockLot[] {
  return [...lots].sort((a, b) => {
    const aExpiry = a.expiresAt ?? '9999-12-31';
    const bExpiry = b.expiresAt ?? '9999-12-31';
    if (aExpiry !== bExpiry) return aExpiry < bExpiry ? -1 : 1;
    if (a.addedAt !== b.addedAt) return a.addedAt < b.addedAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

export function sortedLotsFor(lots: readonly StockLot[], ingredientId: IngredientId): StockLot[] {
  return sortLots(lots.filter((lot) => lot.ingredientId === ingredientId));
}

/** The first date this ingredient should be used by, if any. */
export function soonestExpiry(lots: readonly StockLot[], ingredientId: IngredientId): string | null {
  let soonest: string | null = null;
  for (const lot of lots) {
    if (lot.ingredientId !== ingredientId || !lot.expiresAt) continue;
    if (soonest === null || lot.expiresAt < soonest) soonest = lot.expiresAt;
  }
  return soonest;
}

/** A soft, human label for the fridge. The exact date stays in the title. */
export function expiryLabel(expiresAt: string | null, now: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const status = expiryStatus(expiresAt, now);
  if (status === 'expired') return 'expired';
  const month = new Date(expiresAt + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return status === 'soon' ? 'use by ' + month : month;
}
