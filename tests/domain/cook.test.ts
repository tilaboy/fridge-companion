import { describe, expect, it } from 'vitest';
import { createCatalog } from '../../src/domain/catalog';
import {
  addToShoppingList,
  buyShoppingListItem,
  combineAnimationSpec,
  cookDeductions,
  cookRecipe,
} from '../../src/domain/cook';
import { createState } from '../../src/domain/state';
import type { Ingredient, KitchenState, Recipe } from '../../src/domain/types';

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
  ingredients: [
    { ingredientId: 'egg', amount: 2 },
    { ingredientId: 'cheese', amount: 50 },
    { ingredientId: 'salt', amount: 1 },
  ],
  steps: [],
};

const catalog = createCatalog(tray, [recipe]);

function kitchen(stock: Record<string, number>): KitchenState {
  const state = createState();
  state.stock = stock;
  return state;
}

describe('cookRecipe', () => {
  it('takes the full amount when there is enough', () => {
    const next = cookRecipe(catalog, kitchen({ egg: 5, cheese: 100 }), recipe);
    expect(next.stock).toEqual({ egg: 3, cheese: 50 });
  });

  it('takes what is left when there is not enough, and drops the empty key', () => {
    const next = cookRecipe(catalog, kitchen({ egg: 1, cheese: 20 }), recipe);
    expect(next.stock).toEqual({});
  });

  it('never deducts staples or ingredients that are missing', () => {
    const next = cookRecipe(catalog, kitchen({ milk: 2 }), recipe);
    expect(next.stock).toEqual({ milk: 2 });
  });

  it('does not mutate the state it was given', () => {
    const before = kitchen({ egg: 5, cheese: 100 });
    cookRecipe(catalog, before, recipe);
    expect(before.stock).toEqual({ egg: 5, cheese: 100 });
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
});

describe('addToShoppingList', () => {
  it('adds only the shortfalls, with the recipe quantity', () => {
    const next = addToShoppingList(catalog, kitchen({ egg: 1 }), recipe);
    expect(next.shoppingList).toEqual([
      { ingredientId: 'egg', amount: 2, fromRecipeId: 'omelette' },
      { ingredientId: 'cheese', amount: 50, fromRecipeId: 'omelette' },
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
    expect(next.stock.egg).toBe(8);
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
