import { describe, expect, it } from 'vitest';
import {
  SEEDED_CATEGORIES,
  confirmCategories,
  ensureCategories,
  groupTrayByCategory,
} from '../../src/domain/categories';
import { createState } from '../../src/domain/state';
import { catalog, ingredients } from '../fixtures';

describe('seeded categories', () => {
  it('are the five the first visit adopts', () => {
    expect(SEEDED_CATEGORIES.map((c) => c.id)).toEqual([
      'produce',
      'dairy',
      'pantry',
      'leftovers',
      'meat',
    ]);
  });

  it('survive confirmation unchanged', () => {
    expect(confirmCategories(SEEDED_CATEGORIES)).toEqual(SEEDED_CATEGORIES);
  });
});

describe('confirmCategories', () => {
  it('trims names, drops invalid entries, and keeps the first of a duplicate', () => {
    const chosen = [
      { id: 'produce', name: '  Produce  ' },
      { id: 'produce', name: 'Dup' },
      { id: '', name: 'No id' },
      { id: 'dairy', name: '   ' },
      null,
      'pantry',
      { id: 'pantry', name: 'Pantry' },
    ];
    expect(confirmCategories(chosen)).toEqual([
      { id: 'produce', name: 'Produce' },
      { id: 'pantry', name: 'Pantry' },
    ]);
  });

  it('treats a missing list as no categories', () => {
    expect(confirmCategories(undefined)).toEqual([]);
    expect(confirmCategories(null)).toEqual([]);
  });
});

describe('ensureCategories', () => {
  it('adopts the seeds on a first visit', () => {
    const state = ensureCategories(createState());
    expect(state.categories).toEqual(SEEDED_CATEGORIES);
  });

  it('returns an existing kitchen untouched, by identity', () => {
    const state = createState();
    state.categories = [{ id: 'mine', name: 'Mine' }];
    expect(ensureCategories(state)).toBe(state);
  });

  it('copies the categories rather than sharing them with the seed constant', () => {
    const state = ensureCategories(createState());
    expect(state.categories).not.toBe(SEEDED_CATEGORIES);
    state.categories[0]!.name = 'Changed';
    expect(SEEDED_CATEGORIES[0]!.name).toBe('Produce');
  });
});

describe('groupTrayByCategory', () => {
  it('places every tray ingredient in the user order', () => {
    const groups = groupTrayByCategory(catalog, SEEDED_CATEGORIES);
    expect(groups.map((g) => g.category.id)).toEqual(SEEDED_CATEGORIES.map((c) => c.id));
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(ingredients.length);
    expect(groups.some((g) => g.category.id === '__other')).toBe(false);
  });

  it('skips empty categories', () => {
    const groups = groupTrayByCategory(catalog, [{ id: 'produce', name: 'Produce' }]);
    expect(groups).toHaveLength(2); // produce, then Other
    expect(groups[0]!.items.every((i) => i.categoryId === 'produce')).toBe(true);
  });

  it('puts ingredients from categories the user does not have in a trailing Other', () => {
    const groups = groupTrayByCategory(catalog, [
      { id: 'pantry', name: 'Pantry' },
    ]);
    const other = groups.at(-1)!;
    expect(other.category).toEqual({ id: '__other', name: 'Other' });
    expect(other.items.some((i) => i.id === 'tomato')).toBe(true);
  });
});
