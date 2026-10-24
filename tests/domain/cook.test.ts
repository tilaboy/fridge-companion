import { describe, expect, it } from 'vitest';
import { createCatalog } from '../../src/domain/catalog';
import {
  addToShoppingList,
  buyShoppingListItem,
  combineAnimationSpec,
  cookDeductions,
  cookRecipe,
} from '../../src/domain/cook';
import { stockTotals } from '../../src/domain/lots';
import { scaleRecipe } from '../../src/domain/servings';
import type { Ingredient, KitchenState, Recipe } from '../../src/domain/types';
import { kitchenWithStock } from '../stock';

const tray: Ingredient[] = [
  { id: 'egg', name: 'Egg', emoji: '🥚', categoryId: 'dairy', unit: 'pcs' },
  { id: 'cheese', name: 'Cheese', emoji: '🧀', categoryId: 'dairy', unit: 'g' },
  { id: 'tomato', name: 'Tomato', emoji: '🍅', categoryId: 'produce', unit: 'pcs' },
  { id: 'salt', name: 'Salt', emoji: '🧂', categoryId: 'pantry', unit: 'g', staple: true },
];

const recipe: Recipe = {
  id: 'omelette',
  name: 'Omelette',
  dishEmoji: '🍳',
  servings: 2,
  ingredients: [
    { ingredientId: 'egg', amount: 2 },
    { ingredientId: 'cheese', amount: 50 },
    { ingredientId: 'salt', amount: 1 },
  ],
  steps: [],
};

const catalog = createCatalog(tray, [recipe]);

const kitchen = (stock: Record<string, number>): KitchenState => kitchenWithStock(stock);

describe('cookRecipe', () => {
  it('takes the full amount when there is enough', () => {
    const next = cookRecipe(catalog, kitchen({ egg: 5, cheese: 100 }), recipe);
    expect(stockTotals(next.stockLots)).toEqual({ egg: 3, cheese: 50 });
  });

  it('takes what is left when there is not enough, and drops the empty key', () => {
    const next = cookRecipe(catalog, kitchen({ egg: 1, cheese: 20 }), recipe);
    expect(stockTotals(next.stockLots)).toEqual({});
  });

  it('scales deductions to the chosen servings', () => {
    const next = cookRecipe(catalog, kitchen({ egg: 5, cheese: 100 }), scaleRecipe(recipe, 4));
    expect(stockTotals(next.stockLots)).toEqual({ egg: 1 });
  });

  it('never deducts staples or ingredients that are missing', () => {
    const next = cookRecipe(catalog, kitchen({ milk: 2 }), recipe);
    expect(stockTotals(next.stockLots)).toEqual({ milk: 2 });
  });

  it('eats the soonest-expiring batch first, keeping later ones whole', () => {
    const state = kitchen({});
    state.stockLots = [
      { id: 'egg-late', ingredientId: 'egg', amount: 4, expiresAt: null, addedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'egg-soon', ingredientId: 'egg', amount: 1, expiresAt: '2026-10-24', addedAt: '2026-01-03T00:00:00.000Z' },
      { id: 'cheese-late', ingredientId: 'cheese', amount: 60, expiresAt: '2026-12-01', addedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'cheese-soon', ingredientId: 'cheese', amount: 40, expiresAt: '2026-10-24', addedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const next = cookRecipe(catalog, state, recipe);
    expect(next.stockLots).toEqual([
      { id: 'egg-late', ingredientId: 'egg', amount: 3, expiresAt: null, addedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'cheese-late', ingredientId: 'cheese', amount: 50, expiresAt: '2026-12-01', addedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('records a cook event with the chosen yield and timestamp', () => {
    const now = new Date('2026-10-24T12:00:00.000Z');
    const next = cookRecipe(catalog, kitchen({ egg: 5, cheese: 100 }), scaleRecipe(recipe, 4), now);
    expect(next.cookHistory).toEqual([
      {
        id: 'cook-omelette-' + now.getTime(),
        recipeId: 'omelette',
        cookedAt: now.toISOString(),
        servings: 4,
      },
    ]);
  });

  it('does not mutate the state or its history', () => {
    const before = kitchen({ egg: 5, cheese: 100 });
    cookRecipe(catalog, before, recipe);
    expect(stockTotals(before.stockLots)).toEqual({ egg: 5, cheese: 100 });
    expect(before.cookHistory).toEqual([]);
  });
});

describe('cookDeductions', () => {
  it('reports removed and remaining amounts for what was actually held', () => {
    expect(cookDeductions(catalog, kitchen({ egg: 1, cheese: 80 }), recipe)).toEqual([
      { ingredientId: 'egg', removed: 1, before: 1, after: 0 },
      { ingredientId: 'cheese', removed: 50, before: 80, after: 30 },
    ]);
  });

  it('is empty when nothing tracked is held', () => {
    expect(cookDeductions(catalog, kitchen({ salt: 99 }), recipe)).toEqual([]);
  });

  it('reports the scaled amounts actually removed', () => {
    expect(cookDeductions(catalog, kitchen({ egg: 3, cheese: 80 }), scaleRecipe(recipe, 4))).toEqual([
      { ingredientId: 'egg', removed: 3, before: 3, after: 0 },
      { ingredientId: 'cheese', removed: 80, before: 80, after: 0 },
    ]);
  });
});

describe('addToShoppingList', () => {
  it('adds only the shortfalls, with the recipe quantity', () => {
    const next = addToShoppingList(catalog, kitchen({ egg: 1 }), recipe);
    expect(next.shoppingList).toEqual([
      { ingredientId: 'egg', amount: 2, fromRecipeId: 'omelette' },
      { ingredientId: 'cheese', amount: 50, fromRecipeId: 'omelette' },
    ]);
  });

  it('lists the scaled quantities for the chosen servings', () => {
    const next = addToShoppingList(catalog, kitchen({}), scaleRecipe(recipe, 4));
    expect(next.shoppingList).toEqual([
      { ingredientId: 'egg', amount: 4, fromRecipeId: 'omelette' },
      { ingredientId: 'cheese', amount: 100, fromRecipeId: 'omelette' },
    ]);
  });

  it('does not duplicate an ingredient already listed', () => {
    const state = kitchen({});
    state.shoppingList = [{ ingredientId: 'egg', amount: 12, fromRecipeId: null }];
    const next = addToShoppingList(catalog, state, recipe);
    expect(next.shoppingList).toEqual([
      { ingredientId: 'egg', amount: 12, fromRecipeId: null },
      { ingredientId: 'cheese', amount: 50, fromRecipeId: 'omelette' },
    ]);
  });

  it('never lists staples', () => {
    const next = addToShoppingList(catalog, kitchen({}), recipe);
    expect(next.shoppingList.some((item) => item.ingredientId === 'salt')).toBe(false);
  });
});

describe('buyShoppingListItem', () => {
  it('combines with stock and removes exactly the first matching item', () => {
    const state = kitchen({ egg: 2 });
    state.shoppingList = [
      { ingredientId: 'egg', amount: 6, fromRecipeId: 'a' },
      { ingredientId: 'egg', amount: 100, fromRecipeId: 'b' },
    ];
    const next = buyShoppingListItem(state, 'egg');
    expect(stockTotals(next.stockLots).egg).toBe(8);
    expect(next.shoppingList).toEqual([
      { ingredientId: 'egg', amount: 100, fromRecipeId: 'b' },
    ]);
  });

  it('changes nothing when the item is not listed', () => {
    const state = kitchen({ egg: 2 });
    expect(buyShoppingListItem(state, 'cheese')).toEqual(state);
  });
});

describe('combineAnimationSpec', () => {
  it('de-duplicates and drops ids the tray does not know', () => {
    const spec = combineAnimationSpec(catalog, recipe, ['egg', 'egg', 'ghost', 'cheese']);
    expect(spec.dishEmoji).toBe('🍳');
    expect(spec.flying.map((i) => i.id)).toEqual(['egg', 'cheese']);
  });

  it('keeps the tray’s own emoji with each flying ingredient', () => {
    expect(combineAnimationSpec(catalog, recipe, ['tomato']).flying[0]!.emoji).toBe('🍅');
  });
});
