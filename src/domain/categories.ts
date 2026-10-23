/* Categories: the seeded five, the confirmation gate, and tray grouping.
 *
 * A first visit adopts the seeded categories and opens straight onto the
 * fridge door — no setup screen in front of the app. Categories are edited
 * later, in the tray panel's disclosure.
 */
import type { Catalog } from './catalog';
import { cloneState } from './state';
import type { Category, CategoryGroup, Ingredient, KitchenState } from './types';

export const SEEDED_CATEGORIES: readonly Category[] = [
  { id: 'produce', name: 'Produce' },
  { id: 'dairy', name: 'Dairy' },
  { id: 'pantry', name: 'Pantry' },
  { id: 'leftovers', name: 'Leftovers' },
  { id: 'meat', name: 'Meat & Fish' },
];

export function validCategory(c: unknown): c is Category {
  if (!c || typeof c !== 'object') return false;
  const category = c as { id?: unknown; name?: unknown };
  return (
    typeof category.id === 'string' &&
    category.id !== '' &&
    typeof category.name === 'string' &&
    category.name.trim() !== ''
  );
}

/** Valid, unique, trimmed — in the order the user chose them. */
export function confirmCategories(chosen: readonly unknown[] | null | undefined): Category[] {
  const seen = new Set<string>();
  const categories: Category[] = [];
  for (const candidate of chosen ?? []) {
    if (!validCategory(candidate) || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    categories.push({ id: candidate.id, name: candidate.name.trim() });
  }
  return categories;
}

/** A state that already has categories is returned untouched. */
export function ensureCategories(state: KitchenState): KitchenState {
  if (state.categories.length > 0) return state;
  const next = cloneState(state);
  next.categories = confirmCategories(SEEDED_CATEGORIES);
  return next;
}

/**
 * Group the built-in tray by the user's categories, in the user's order.
 * Categories with no tray ingredients are skipped. An ingredient whose
 * category the user does not have lands in a trailing "Other" group rather
 * than silently disappearing.
 */
export function groupTrayByCategory(
  catalog: Catalog,
  categories: readonly Category[] | null | undefined,
): CategoryGroup[] {
  const byId: Record<string, Ingredient[]> = {};
  for (const category of categories ?? []) byId[category.id] = [];

  const loose: Ingredient[] = [];
  for (const ingredient of catalog.ingredients) {
    const bucket = byId[ingredient.categoryId];
    if (bucket) bucket.push(ingredient);
    else loose.push(ingredient);
  }

  const groups: CategoryGroup[] = (categories ?? [])
    .map((category) => ({ category, items: byId[category.id] ?? [] }))
    .filter((group) => group.items.length > 0);

  if (loose.length > 0) {
    groups.push({ category: { id: '__other', name: 'Other' }, items: loose });
  }
  return groups;
}
