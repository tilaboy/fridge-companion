import { describe, expect, it } from 'vitest';
import {
  COOK_FORTNIGHT_DAYS,
  COOK_FORTNIGHT_MULTIPLIER,
  COOK_HISTORY_LIMIT,
  COOK_RECENT_DAYS,
  COOK_RECENT_MULTIPLIER,
  COOK_WEEK_DAYS,
  COOK_WEEK_MULTIPLIER,
  appendCookEvent,
  cookRecencyLabel,
  nextCookEventId,
  recencyMultiplier,
  recentCookSignal,
  sanitizeCookHistory,
} from '../../src/domain/cookHistory';
import type { CookEvent } from '../../src/domain/types';
import { catalog } from '../fixtures';

const NOW = new Date('2026-10-24T12:00:00.000Z');

function event(
  recipeId: string,
  cookedAt: string,
  overrides: Partial<CookEvent> = {},
): CookEvent {
  return {
    id: 'cook-' + recipeId + '-' + cookedAt,
    recipeId,
    cookedAt,
    servings: 2,
    ...overrides,
  };
}

describe('recency weighting', () => {
  it('uses two explainable windows and then gets out of the way', () => {
    expect(COOK_RECENT_DAYS).toBe(2);
    expect(COOK_WEEK_DAYS).toBe(7);
    expect(COOK_FORTNIGHT_DAYS).toBe(14);
    expect(recencyMultiplier(0)).toBe(COOK_RECENT_MULTIPLIER);
    expect(recencyMultiplier(1.99)).toBe(COOK_RECENT_MULTIPLIER);
    expect(recencyMultiplier(2)).toBe(COOK_WEEK_MULTIPLIER);
    expect(recencyMultiplier(6.99)).toBe(COOK_WEEK_MULTIPLIER);
    expect(recencyMultiplier(7)).toBe(COOK_FORTNIGHT_MULTIPLIER);
    expect(recencyMultiplier(13.99)).toBe(COOK_FORTNIGHT_MULTIPLIER);
    expect(recencyMultiplier(14)).toBe(1);
  });

  it('uses only the latest cook for a recipe', () => {
    const history = [
      event('scrambled_eggs', '2026-10-23T00:00:00.000Z'),
      event('scrambled_eggs', '2026-10-10T00:00:00.000Z'),
    ];
    const signal = recentCookSignal(history, 'scrambled_eggs', NOW);
    expect(signal).toMatchObject({
      lastCookedAt: '2026-10-23T00:00:00.000Z',
      multiplier: COOK_RECENT_MULTIPLIER,
    });
    expect(signal?.daysSince).toBeCloseTo(1.5);
  });

  it('returns nothing when the latest cook is old or the recipe never appears', () => {
    expect(recentCookSignal([], 'scrambled_eggs', NOW)).toBeNull();
    expect(
      recentCookSignal([event('scrambled_eggs', '2026-10-01T00:00:00.000Z')], 'scrambled_eggs', NOW),
    ).toBeNull();
    expect(
      recentCookSignal([event('tomato_pasta', '2026-10-23T00:00:00.000Z')], 'scrambled_eggs', NOW),
    ).toBeNull();
  });

  it('labels the latest cook in kitchen language', () => {
    expect(cookRecencyLabel(0.4)).toBe('Cooked today.');
    expect(cookRecencyLabel(1.2)).toBe('Cooked yesterday.');
    expect(cookRecencyLabel(3.9)).toBe('Cooked 3 days ago.');
  });
});

describe('cook event storage', () => {
  it('appends without mutating and drops the oldest beyond the cap', () => {
    const history = Array.from({ length: COOK_HISTORY_LIMIT }, (_, i) =>
      event('scrambled_eggs', '2026-09-' + String(i + 1).padStart(2, '0') + 'T00:00:00.000Z', {
        id: 'old-' + i,
      }),
    );
    const newest = event('tomato_pasta', '2026-10-24T00:00:00.000Z', { id: 'new' });
    const next = appendCookEvent(history, newest);
    expect(next).toHaveLength(COOK_HISTORY_LIMIT);
    expect(next[0]!.id).toBe('old-1');
    expect(next[next.length - 1]).toEqual(newest);
    expect(history[0]!.id).toBe('old-0');
  });

  it('keeps ids unique when two cooks share a millisecond', () => {
    const cookedAt = '2026-10-24T12:00:00.000Z';
    const first = nextCookEventId([], 'scrambled_eggs', cookedAt);
    const second = nextCookEventId([event('scrambled_eggs', cookedAt, { id: first })], 'scrambled_eggs', cookedAt);
    expect(second).not.toBe(first);
    expect(second.startsWith(first + '-')).toBe(true);
  });
});

describe('cook history repair', () => {
  it('drops junk and unknown recipes on import, repairs ids, and defaults servings', () => {
    const clean = sanitizeCookHistory(catalog, [
      { id: 'keep', recipeId: 'scrambled_eggs', cookedAt: '2026-10-23T12:00:00.000Z', servings: 4 },
      { id: 'keep', recipeId: 'scrambled_eggs', cookedAt: '2026-10-22T12:00:00.000Z', servings: '2' },
      { recipeId: 'scrambled_eggs', cookedAt: '2026-10-21T12:00:00.000Z', servings: 99 },
      { recipeId: 'ghost', cookedAt: '2026-10-23T12:00:00.000Z', servings: 2 },
      { recipeId: 'scrambled_eggs', cookedAt: 'not a date', servings: 2 },
      { recipeId: 'scrambled_eggs', cookedAt: '2026-10-26T12:00:00.000Z', servings: 2 },
      null,
    ], { knownOnly: true, now: NOW });

    expect(clean).toHaveLength(3);
    expect(clean.map((entry) => [entry.cookedAt, entry.servings])).toEqual([
      ['2026-10-21T12:00:00.000Z', 2],
      ['2026-10-22T12:00:00.000Z', 2],
      ['2026-10-23T12:00:00.000Z', 4],
    ]);
    expect(clean[0]!.id.startsWith('cook-scrambled_eggs-')).toBe(true);
    expect(clean[1]!.id).toBe('keep-x');
    expect(clean[2]!.id).toBe('keep');
  });

  it('keeps unknown recipe references on local load but strips them on import', () => {
    const raw = [
      { recipeId: 'ghost', cookedAt: '2026-10-23T12:00:00.000Z', servings: 2 },
    ];
    expect(sanitizeCookHistory(catalog, raw, { now: NOW })).toHaveLength(1);
    expect(sanitizeCookHistory(catalog, raw, { knownOnly: true, now: NOW })).toEqual([]);
  });

  it('sorts oldest first and keeps the newest capped window', () => {
    const raw = Array.from({ length: COOK_HISTORY_LIMIT + 5 }, (_, i) => ({
      id: 'event-' + i,
      recipeId: 'scrambled_eggs',
      cookedAt: new Date(Date.parse('2026-09-01T00:00:00.000Z') + i * 60 * 60 * 1000).toISOString(),
      servings: 2,
    }));
    const clean = sanitizeCookHistory(catalog, raw, { now: NOW });
    expect(clean).toHaveLength(COOK_HISTORY_LIMIT);
    expect(clean[0]!.id).toBe('event-5');
    expect(clean[clean.length - 1]!.id).toBe('event-' + (COOK_HISTORY_LIMIT + 4));
  });
});
