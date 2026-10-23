/* Test fixtures for the lot model: small kitchens built from amount maps. */
import type { KitchenState, StockLot } from '../src/domain/types';
import { createState } from '../src/domain/state';

export const TEST_ADDED_AT = '2026-01-01T00:00:00.000Z';

export function lotsFor(
  stock: Record<string, number>,
  options: { expiresAt?: Record<string, string>; addedAt?: string } = {},
): StockLot[] {
  return Object.entries(stock).map(([ingredientId, amount], index) => ({
    id: `test-${ingredientId}-${index}`,
    ingredientId,
    amount,
    expiresAt: options.expiresAt?.[ingredientId] ?? null,
    addedAt: options.addedAt ?? TEST_ADDED_AT,
  }));
}

export function kitchenWithStock(
  stock: Record<string, number>,
  options: { expiresAt?: Record<string, string>; addedAt?: string } = {},
): KitchenState {
  const state = createState();
  state.stockLots = lotsFor(stock, options);
  return state;
}
