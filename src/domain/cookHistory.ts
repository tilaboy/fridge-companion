/* Persisted cook history and the repetition nudge built on it.
 *
 * A cook event is recorded only by a successful "Cook this" commit. Ranking
 * uses the latest event for a recipe: a recent repeat is de-prioritized so a
 * close alternative can win, but it is never hidden. If it is the only useful
 * option, it still appears and the card says when it was last cooked.
 *
 * The history is intentionally small and bounded. It is not analytics, and it
 * never leaves the kitchen except through the user's own export.
 */
import type { Catalog } from './catalog';
import { getRecipe } from './catalog';
import { DEFAULT_SERVINGS, isServings } from './servings';
import type { CookEvent, CookSignal, RecipeId } from './types';

/** Newest 50 cooks: enough for variety without growing the export forever. */
export const COOK_HISTORY_LIMIT = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Windows and weights are deliberately explainable, not a hidden model. */
export const COOK_RECENT_DAYS = 2;
export const COOK_WEEK_DAYS = 7;
export const COOK_FORTNIGHT_DAYS = 14;
export const COOK_RECENT_MULTIPLIER = 0.5;
export const COOK_WEEK_MULTIPLIER = 0.8;
export const COOK_FORTNIGHT_MULTIPLIER = 0.95;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** The rank weight for a cook this many days ago. 1 means no effect. */
export function recencyMultiplier(daysSince: number): number {
  if (daysSince < COOK_RECENT_DAYS) return COOK_RECENT_MULTIPLIER;
  if (daysSince < COOK_WEEK_DAYS) return COOK_WEEK_MULTIPLIER;
  if (daysSince < COOK_FORTNIGHT_DAYS) return COOK_FORTNIGHT_MULTIPLIER;
  return 1;
}

/** A stable id for a new event; a same-millisecond repeat gets a suffix. */
export function nextCookEventId(
  history: readonly CookEvent[],
  recipeId: RecipeId,
  cookedAt: string,
): string {
  const base = 'cook-' + recipeId + '-' + Date.parse(cookedAt);
  const taken = new Set(history.map((event) => event.id));
  let id = base;
  let suffix = 2;
  while (taken.has(id)) {
    id = base + '-' + suffix;
    suffix += 1;
  }
  return id;
}

/** Append a cook and drop the oldest events beyond the cap. */
export function appendCookEvent(
  history: readonly CookEvent[],
  event: CookEvent,
  limit: number = COOK_HISTORY_LIMIT,
): CookEvent[] {
  const next = [...history, { ...event }];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** The latest cook for one recipe, or null when it is too old to matter. */
export function recentCookSignal(
  history: readonly CookEvent[],
  recipeId: RecipeId,
  now: Date = new Date(),
): CookSignal | null {
  let latest = -Infinity;
  let lastCookedAt = '';
  for (const event of history) {
    if (event.recipeId !== recipeId) continue;
    const time = Date.parse(event.cookedAt);
    if (!Number.isFinite(time) || time <= latest) continue;
    latest = time;
    lastCookedAt = event.cookedAt;
  }
  if (latest === -Infinity) return null;

  const daysSince = Math.max(0, (now.getTime() - latest) / DAY_MS);
  const multiplier = recencyMultiplier(daysSince);
  if (multiplier >= 1) return null;
  return { lastCookedAt, daysSince, multiplier };
}

/** A one-line, human answer to "why is this repeat here?" */
export function cookRecencyLabel(daysSince: number): string {
  if (daysSince < 1) return 'Cooked today.';
  if (daysSince < 2) return 'Cooked yesterday.';
  return 'Cooked ' + Math.floor(daysSince) + ' days ago.';
}

/**
 * Import/load repair. Invalid events are dropped; malformed servings fall
 * back to the legacy default rather than making the event unreadable. Future
 * timestamps beyond a day are treated as junk, so a bad clock or a hostile
 * file cannot suppress a recipe for years.
 */
export function sanitizeCookHistory(
  catalog: Catalog,
  raw: unknown,
  options: { knownOnly?: boolean; now?: Date } = {},
): CookEvent[] {
  if (!Array.isArray(raw)) return [];
  const knownOnly = Boolean(options.knownOnly);
  const now = options.now ?? new Date();
  const futureLimit = now.getTime() + DAY_MS;
  const events: CookEvent[] = [];
  const ids = new Set<string>();

  for (const item of raw) {
    const entry = asRecord(item);
    if (!entry || typeof entry.recipeId !== 'string' || entry.recipeId === '') continue;
    if (knownOnly && !getRecipe(catalog, entry.recipeId)) continue;

    const time = typeof entry.cookedAt === 'string' ? Date.parse(entry.cookedAt) : NaN;
    if (!Number.isFinite(time) || time > futureLimit) continue;

    const rawServings = entry.servings;
    const servings =
      (typeof rawServings === 'number' || typeof rawServings === 'string') &&
      isServings(Number(rawServings))
        ? Number(rawServings)
        : DEFAULT_SERVINGS;

    let id =
      typeof entry.id === 'string' && entry.id !== ''
        ? entry.id
        : 'cook-' + entry.recipeId + '-' + time;
    while (ids.has(id)) id += '-x';
    ids.add(id);

    events.push({
      id,
      recipeId: entry.recipeId,
      cookedAt: new Date(time).toISOString(),
      servings,
    });
  }

  events.sort((a, b) => (a.cookedAt < b.cookedAt ? -1 : a.cookedAt > b.cookedAt ? 1 : 0));
  return events.slice(-COOK_HISTORY_LIMIT);
}
