import { describe, expect, it } from 'vitest';
import {
  addLot,
  expiryLabel,
  expiryStatus,
  normalizeExpiry,
  soonestExpiry,
  sortLots,
  stockTotals,
  todayStamp,
  totalAmount,
} from '../../src/domain/lots';
import type { StockLot } from '../../src/domain/types';

const NOW = new Date('2026-10-23T15:30:00');

function lot(partial: Partial<StockLot> & Pick<StockLot, 'id' | 'ingredientId' | 'amount'>): StockLot {
  return {
    expiresAt: null,
    addedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

describe('dates', () => {
  it('formats the local date the way the date input does', () => {
    expect(todayStamp(NOW)).toBe('2026-10-23');
  });

  it('accepts date-only and full ISO, and rejects impossible dates', () => {
    expect(normalizeExpiry('2026-10-30')).toBe('2026-10-30');
    expect(normalizeExpiry('2026-10-30T12:00:00.000Z')).toBe('2026-10-30');
    expect(normalizeExpiry(' 2026-10-30 ')).toBe('2026-10-30');
    expect(normalizeExpiry('2026-02-31')).toBeNull();
    expect(normalizeExpiry('30/10/2026')).toBeNull();
    expect(normalizeExpiry(null)).toBeNull();
  });

  it('classifies expiry relative to today', () => {
    expect(expiryStatus(null, NOW)).toBe('none');
    expect(expiryStatus('2026-10-22', NOW)).toBe('expired');
    expect(expiryStatus('2026-10-23', NOW)).toBe('soon');
    expect(expiryStatus('2026-10-26', NOW)).toBe('soon');
    expect(expiryStatus('2026-10-27', NOW)).toBe('later');
  });

  it('labels the badge without inventing a date when there is none', () => {
    expect(expiryLabel(null, NOW)).toBeNull();
    expect(expiryLabel('2026-10-22', NOW)).toBe('expired');
    expect(expiryLabel('2026-10-24', NOW)).toMatch(/^use by /);
    expect(expiryLabel('2026-12-01', NOW)).not.toMatch(/^use by /);
  });
});

describe('adding and totalling lots', () => {
  it('appends a batch with a normalized expiry and a timestamp', () => {
    const lots = addLot([], 'tomato', 3, '2026-10-30', NOW, 'lot-a');
    expect(lots).toEqual([
      {
        id: 'lot-a',
        ingredientId: 'tomato',
        amount: 3,
        expiresAt: '2026-10-30',
        addedAt: NOW.toISOString(),
      },
    ]);
  });

  it('keeps the supplied array untouched', () => {
    const before: StockLot[] = [];
    addLot(before, 'tomato', 3, null, NOW, 'lot-a');
    expect(before).toEqual([]);
  });

  it('sums batches per ingredient and ignores the rest', () => {
    const lots = [
      lot({ id: 'a', ingredientId: 'tomato', amount: 2 }),
      lot({ id: 'b', ingredientId: 'egg', amount: 6 }),
      lot({ id: 'c', ingredientId: 'tomato', amount: 3 }),
    ];
    expect(totalAmount(lots, 'tomato')).toBe(5);
    expect(totalAmount(lots, 'ghost')).toBe(0);
    expect(stockTotals(lots)).toEqual({ tomato: 5, egg: 6 });
  });
});

describe('using the oldest date first', () => {
  const lots = [
    lot({ id: 'no-date-old', ingredientId: 'tomato', amount: 1, addedAt: '2026-09-01T00:00:00.000Z' }),
    lot({ id: 'late', ingredientId: 'tomato', amount: 1, expiresAt: '2026-11-30' }),
    lot({ id: 'no-date-new', ingredientId: 'tomato', amount: 1, addedAt: '2026-10-01T00:00:00.000Z' }),
    lot({ id: 'soon', ingredientId: 'tomato', amount: 1, expiresAt: '2026-10-24' }),
    lot({ id: 'egg', ingredientId: 'egg', amount: 1, expiresAt: '2026-10-20' }),
  ];

  it('sorts dated lots first, earliest first, undated last by arrival', () => {
    expect(sortLots(lots.filter((l) => l.ingredientId === 'tomato')).map((l) => l.id)).toEqual([
      'soon',
      'late',
      'no-date-old',
      'no-date-new',
    ]);
  });

  it('reports the earliest date held for an ingredient', () => {
    expect(soonestExpiry(lots, 'tomato')).toBe('2026-10-24');
    expect(soonestExpiry(lots, 'egg')).toBe('2026-10-20');
    expect(soonestExpiry(lots, 'ghost')).toBeNull();
  });
});
