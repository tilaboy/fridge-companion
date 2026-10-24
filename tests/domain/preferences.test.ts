import { describe, expect, it } from 'vitest';
import { createCatalog } from '../../src/domain/catalog';
import {
  ALLERGENS,
  describePreferences,
  dietAllows,
  filterRecipesByPreferences,
  hasActivePreferences,
  ingredientAllergens,
  ingredientDietClass,
  recipeFitsPreferences,
  sanitizePreferences,
} from '../../src/domain/preferences';
import { recommend } from '../../src/domain/recommend';
import { setPreferences } from '../../src/domain/state';
import type { Ingredient, Preferences, Recipe } from '../../src/domain/types';
import { kitchenWithStock } from '../stock';

const tray: Ingredient[] = [
  { id: 'tomato', name: 'Tomato', emoji: 'T', categoryId: 'produce', unit: 'pcs', dietClass: 'plant', allergens: [] },
  { id: 'milk', name: 'Milk', emoji: 'M', categoryId: 'dairy', unit: 'ml', dietClass: 'dairy', allergens: ['dairy'] },
  { id: 'egg', name: 'Egg', emoji: 'E', categoryId: 'dairy', unit: 'pcs', dietClass: 'egg', allergens: ['egg'] },
  { id: 'honey', name: 'Honey', emoji: 'H', categoryId: 'pantry', unit: 'g', dietClass: 'honey', allergens: [] },
  { id: 'fish', name: 'Fish', emoji: 'F', categoryId: 'meat', unit: 'g', dietClass: 'fish', allergens: ['fish'] },
  { id: 'meat', name: 'Meat', emoji: 'B', categoryId: 'meat', unit: 'g', dietClass: 'meat', allergens: [] },
  { id: 'shrimp', name: 'Shrimp', emoji: 'S', categoryId: 'meat', unit: 'g', dietClass: 'fish', allergens: ['shellfish', 'fish'] },
  { id: 'dairy-no-tag', name: 'Cream', emoji: 'C', categoryId: 'dairy', unit: 'ml', dietClass: 'dairy', allergens: [] },
  { id: 'unknown', name: 'Mystery', emoji: '?', categoryId: 'pantry', unit: 'g' },
  { id: 'known', name: 'Known plant', emoji: 'K', categoryId: 'produce', unit: 'pcs', dietClass: 'plant', allergens: [] },
];

function recipe(id: string, ingredientId: string): Recipe {
  return {
    id,
    name: id,
    dishEmoji: 'R',
    ingredients: [{ ingredientId, amount: 1 }],
    steps: ['Cook.'],
  };
}

const book: Recipe[] = [
  recipe('salad', 'tomato'),
  recipe('dairy', 'milk'),
  recipe('egg', 'egg'),
  recipe('honey', 'honey'),
  recipe('fish', 'fish'),
  recipe('meat', 'meat'),
  recipe('shrimp', 'shrimp'),
  recipe('dairy-no-tag', 'dairy-no-tag'),
  recipe('unknown', 'unknown'),
  recipe('known', 'known'),
  recipe('missing', 'ghost'),
];

const catalog = createCatalog(tray, book);

function withMeta(
  id: string,
  timeMinutes: number | undefined,
  mealTypes: Recipe['mealTypes'],
): Recipe {
  const base = recipe(id, 'tomato');
  if (timeMinutes !== undefined) base.timeMinutes = timeMinutes;
  if (mealTypes !== undefined) base.mealTypes = mealTypes;
  return base;
}

const timedBook: Recipe[] = [
  withMeta('quick', 15, ['breakfast', 'lunch']),
  withMeta('exact', 20, ['dinner']),
  withMeta('slow', 45, ['dinner']),
  withMeta('unknown-time', undefined, ['lunch']),
  withMeta('unknown-meal', 10, undefined),
  withMeta('empty-meals', 5, []),
  withMeta('snack', 5, ['snack']),
];
const timedCatalog = createCatalog(tray, timedBook);
const timedAllowed = (preferences: Preferences) =>
  timedBook
    .filter((entry) => recipeFitsPreferences(timedCatalog, entry, preferences))
    .map((entry) => entry.id);

const prefs = (
  diet: Preferences['diet'] = null,
  allergens: Preferences['allergens'] = [],
  maxTimeMinutes: Preferences['maxTimeMinutes'] = null,
  meal: Preferences['meal'] = null,
): Preferences => ({
  diet,
  allergens,
  maxTimeMinutes,
  meal,
});

const allowed = (preferences: Preferences) =>
  book.filter((entry) => recipeFitsPreferences(catalog, entry, preferences)).map((entry) => entry.id);

describe('ingredient safety metadata', () => {
  it('treats missing diet/allergen info as unknown, and an empty list as known-none', () => {
    const mystery = tray.find((ingredient) => ingredient.id === 'unknown')!;
    const known = tray.find((ingredient) => ingredient.id === 'known')!;
    expect(ingredientDietClass(mystery)).toBeNull();
    expect(ingredientAllergens(mystery)).toBeNull();
    expect(ingredientDietClass(known)).toBe('plant');
    expect(ingredientAllergens(known)).toEqual([]);
  });

  it('derives dairy, egg, and fish allergens from the diet class', () => {
    const cream = tray.find((ingredient) => ingredient.id === 'dairy-no-tag')!;
    expect(ingredientAllergens(cream)).toEqual(['dairy']);
    expect(ingredientAllergens(tray.find((ingredient) => ingredient.id === 'egg')!)).toEqual(['egg']);
    expect(ingredientAllergens(tray.find((ingredient) => ingredient.id === 'fish')!)).toEqual(['fish']);
  });
});

describe('diet rules', () => {
  it('is explicit about each supported diet', () => {
    expect(dietAllows('vegan', 'plant')).toBe(true);
    for (const dietClass of ['dairy', 'egg', 'honey', 'fish', 'meat', 'unknown'] as const) {
      expect(dietAllows('vegan', dietClass), dietClass).toBe(false);
    }
    expect(dietAllows('vegetarian', 'dairy')).toBe(true);
    expect(dietAllows('vegetarian', 'egg')).toBe(true);
    expect(dietAllows('vegetarian', 'honey')).toBe(true);
    expect(dietAllows('vegetarian', 'fish')).toBe(false);
    expect(dietAllows('pescatarian', 'fish')).toBe(true);
    expect(dietAllows('pescatarian', 'meat')).toBe(false);
  });

  it('filters every recipe through its ingredients', () => {
    expect(allowed(prefs('vegan'))).toEqual(['salad', 'known']);
    expect(allowed(prefs('vegetarian'))).toEqual(['salad', 'dairy', 'egg', 'honey', 'dairy-no-tag', 'known']);
    expect(allowed(prefs('pescatarian'))).toEqual([
      'salad', 'dairy', 'egg', 'honey', 'fish', 'shrimp', 'dairy-no-tag', 'known',
    ]);
  });

  it('fails closed when an ingredient has no diet class', () => {
    expect(allowed(prefs('vegan'))).not.toContain('unknown');
    expect(allowed(prefs())).toContain('unknown');
  });
});

describe('allergen rules', () => {
  it('never lets a tagged allergen through', () => {
    expect(allowed(prefs(null, ['shellfish']))).not.toContain('shrimp');
    expect(allowed(prefs(null, ['shellfish']))).toContain('salad');
    expect(allowed(prefs(null, ['dairy']))).not.toContain('dairy');
    expect(allowed(prefs(null, ['dairy']))).not.toContain('dairy-no-tag'); // derived
    expect(allowed(prefs(null, ['fish']))).not.toContain('fish');
    expect(allowed(prefs(null, ['fish']))).not.toContain('shrimp');
  });

  it('hides recipes whose allergen info is unknown, but not when filters are off', () => {
    expect(allowed(prefs(null, ['sesame']))).not.toContain('unknown');
    expect(allowed(prefs(null, ['sesame']))).toContain('known');
    expect(allowed(prefs())).toContain('unknown');
  });

  it('keeps a known-none ingredient when only a diet filter is active', () => {
    expect(allowed(prefs('vegan'))).toContain('known');
  });

  it('hides recipes with unknown or missing ingredient references under a filter', () => {
    expect(allowed(prefs(null, ['gluten']))).not.toContain('missing');
    expect(allowed(prefs('vegan'))).not.toContain('missing');
  });
});

describe('time and meal rules', () => {
  it('keeps recipes at or under the time budget', () => {
    expect(timedAllowed(prefs(null, [], 20))).toEqual([
      'quick', 'exact', 'unknown-meal', 'empty-meals', 'snack',
    ]);
    expect(timedAllowed(prefs(null, [], 5))).toEqual(['empty-meals', 'snack']);
  });

  it('fails closed when a recipe has no known cooking time', () => {
    expect(timedAllowed(prefs())).toContain('unknown-time');
    expect(timedAllowed(prefs(null, [], 45))).not.toContain('unknown-time');
    expect(timedAllowed(prefs(null, [], 20))).not.toContain('unknown-time');
  });

  it('matches a selected meal only when the recipe declares it', () => {
    expect(timedAllowed(prefs(null, [], null, 'lunch'))).toEqual([
      'quick', 'unknown-time',
    ]);
    expect(timedAllowed(prefs(null, [], null, 'dinner'))).toEqual(['exact', 'slow']);
    expect(timedAllowed(prefs(null, [], null, 'snack'))).toEqual(['snack']);
  });

  it('fails closed when meal metadata is missing or empty', () => {
    expect(timedAllowed(prefs(null, [], null, 'lunch'))).not.toContain('unknown-meal');
    expect(timedAllowed(prefs(null, [], null, 'lunch'))).not.toContain('empty-meals');
  });

  it('combines time and meal filters before ranking', () => {
    expect(timedAllowed(prefs(null, [], 20, 'lunch'))).toEqual(['quick']);
    expect(timedAllowed(prefs(null, [], 20, 'dinner'))).toEqual(['exact']);
  });

  it('does not hide unknown metadata when both filters are off', () => {
    expect(timedAllowed(prefs())).toEqual(timedBook.map((entry) => entry.id));
  });
});

describe('preference sanitizing and summaries', () => {
  it('keeps valid choices, drops junk, deduplicates, and orders deterministically', () => {
    expect(sanitizePreferences({
      diet: 'vegan',
      allergens: ['soy', 'soy', 'nope', 'gluten', 7],
      maxTimeMinutes: '20',
      meal: 'lunch',
    })).toEqual(prefs('vegan', ['soy', 'gluten'], 20, 'lunch'));
    expect(sanitizePreferences({
      diet: 'keto',
      allergens: 'soy',
      maxTimeMinutes: -5,
      meal: 'brunch',
    })).toEqual(prefs());
    expect(sanitizePreferences(null)).toEqual(prefs());
  });

  it('describes the active hard filters', () => {
    expect(hasActivePreferences(prefs())).toBe(false);
    expect(hasActivePreferences(prefs('vegan', ['gluten']))).toBe(true);
    expect(hasActivePreferences(prefs(null, [], 20))).toBe(true);
    expect(hasActivePreferences(prefs(null, [], null, 'dinner'))).toBe(true);
    expect(describePreferences(prefs())).toBe('No food filters');
    expect(describePreferences(prefs('vegan', ['gluten', 'soy'])))
      .toBe('Vegan · avoiding Gluten, Soy');
    expect(describePreferences(prefs('vegan', ['gluten'], 20, 'dinner')))
      .toBe('Vegan · avoiding Gluten · 20 min or less · Dinner');
  });

  it('exposes the canonical allergen list used by the UI', () => {
    expect(ALLERGENS[0]).toBe('dairy');
    expect(ALLERGENS).toContain('shellfish');
  });
});

describe('filterRecipesByPreferences', () => {
  it('is the same gate used by recommend', () => {
    const filtered = filterRecipesByPreferences(catalog, book, prefs('vegan'));
    expect(filtered.map((entry) => entry.id)).toEqual(['salad', 'known']);
  });

  it('removes conflicting picks before ranking', () => {
    const state = setPreferences(
      kitchenWithStock({ tomato: 1, milk: 1, egg: 1 }),
      prefs('vegan'),
    );
    const picks = recommend(catalog, state);
    expect(picks.map((pick) => pick.recipe.id)).toEqual(['salad']);
  });
});
