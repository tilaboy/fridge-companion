import { describe, expect, it } from 'vitest';
import { createCatalog } from '../../src/domain/catalog';
import { cookRecipe } from '../../src/domain/cook';
import { stockTotals } from '../../src/domain/lots';
import { missingIngredients, recommend, scoreRecipe } from '../../src/domain/recommend';
import { effectiveStapleIds, isStapleFor, setStaple } from '../../src/domain/staples';
import { exportJson, parseImportPayload, sameState, sanitizeState } from '../../src/domain/transfer';
import type { Ingredient, Recipe } from '../../src/domain/types';
import { kitchenWithStock } from '../stock';

const tray: Ingredient[] = [
  { id: 'tomato', name: 'Tomato', emoji: 'T', categoryId: 'produce', unit: 'pcs' },
  { id: 'egg', name: 'Egg', emoji: 'E', categoryId: 'dairy', unit: 'pcs' },
  { id: 'salt', name: 'Salt', emoji: 'S', categoryId: 'pantry', unit: 'g', staple: true },
  { id: 'milk', name: 'Milk', emoji: 'M', categoryId: 'dairy', unit: 'ml', staple: true },
];

const recipe: Recipe = {
  id: 'salt-and-tomato',
  name: 'Salt and Tomato',
  dishEmoji: 'T',
  ingredients: [
    { ingredientId: 'tomato', amount: 2 },
    { ingredientId: 'salt', amount: 1 },
  ],
  steps: [],
};

const catalog = createCatalog(tray, [recipe]);

describe('staple defaults and overrides', () => {
  it('uses the tray defaults until the kitchen says otherwise', () => {
    const state = kitchenWithStock({});
    expect(isStapleFor(catalog, state, 'salt')).toBe(true);
    expect(isStapleFor(catalog, state, 'milk')).toBe(true);
    expect(isStapleFor(catalog, state, 'tomato')).toBe(false);
    expect(effectiveStapleIds(catalog, state)).toEqual(new Set(['salt', 'milk']));
  });

  it('unmarks a built-in staple without touching other defaults', () => {
    const state = setStaple(catalog, kitchenWithStock({}), 'salt', false);
    expect(isStapleFor(catalog, state, 'salt')).toBe(false);
    expect(isStapleFor(catalog, state, 'milk')).toBe(true);
    expect(state.stapleOverrides).toEqual({ salt: false });
  });

  it('marks any known ingredient as a staple, idempotently', () => {
    let state = setStaple(catalog, kitchenWithStock({}), 'tomato', true);
    state = setStaple(catalog, state, 'tomato', true);
    expect(isStapleFor(catalog, state, 'tomato')).toBe(true);
    expect(state.stapleOverrides).toEqual({ tomato: true });
  });

  it('ignores unknown ingredients and does not mutate the old state', () => {
    const before = kitchenWithStock({});
    const state = setStaple(catalog, before, 'ghost', true);
    expect(state).toBe(before);

    const next = setStaple(catalog, before, 'tomato', true);
    expect(next).not.toBe(before);
    expect(isStapleFor(catalog, before, 'tomato')).toBe(false);
  });
});

describe('marking a staple keeps the invariant true', () => {
  it('drops stock lots and shopping-list entries for the new staple', () => {
    const before = kitchenWithStock({ tomato: 2, egg: 1 });
    before.shoppingList = [{ ingredientId: 'tomato', amount: 2, fromRecipeId: recipe.id }];
    const next = setStaple(catalog, before, 'tomato', true);
    expect(stockTotals(next.stockLots)).toEqual({ egg: 1 });
    expect(next.shoppingList).toEqual([]);
    expect(stockTotals(before.stockLots)).toEqual({ tomato: 2, egg: 1 });
  });

  it('leaves stock alone when a staple is unmarked', () => {
    const next = setStaple(catalog, kitchenWithStock({}), 'salt', false);
    expect(next.stockLots).toEqual([]);
  });
});

describe('scoring and cooking honor the kitchen choice', () => {
  it('counts an unmarked built-in staple as a real ingredient', () => {
    const state = setStaple(catalog, kitchenWithStock({ tomato: 2 }), 'salt', false);
    const score = scoreRecipe(catalog, recipe, stockTotals(state.stockLots), effectiveStapleIds(catalog, state));
    expect(score.total).toBe(2);
    expect(score.have).toBe(1);
    expect(missingIngredients(catalog, state, recipe)).toEqual([
      { ingredientId: 'salt', amount: 1 },
    ]);
  });

  it('ignores a user-marked staple in recommendations and cooking', () => {
    // Build the inconsistency directly: marking a staple through setStaple
    // would have dropped these lots, which is the invariant under test above.
    const state = kitchenWithStock({ tomato: 2, egg: 1 });
    state.stapleOverrides.tomato = true;
    const score = scoreRecipe(catalog, recipe, stockTotals(state.stockLots), effectiveStapleIds(catalog, state));
    expect(score.total).toBe(0);
    expect(score.score).toBe(0);
    expect(missingIngredients(catalog, state, recipe)).toEqual([]);
    expect(recommend(catalog, state)).toEqual([]);

    const next = cookRecipe(catalog, state, recipe);
    expect(stockTotals(next.stockLots)).toEqual({ tomato: 2, egg: 1 });
  });

  it('deducts a built-in staple once the kitchen unmarks it', () => {
    const state = setStaple(catalog, kitchenWithStock({ tomato: 3, salt: 5 }), 'salt', false);
    const next = cookRecipe(catalog, state, recipe);
    expect(stockTotals(next.stockLots)).toEqual({ tomato: 1, salt: 4 });
  });
});

describe('storage and import keep staple choices', () => {
  it('sanitizes a boolean-only override map', () => {
    const clean = sanitizeState(catalog, {
      stock: { tomato: 2 },
      stapleOverrides: { salt: false, tomato: 'yes', ghost: true },
    });
    expect(clean.stapleOverrides).toEqual({ salt: false, ghost: true });
  });

  it('keeps stock for a built-in staple the kitchen unmarked', () => {
    const clean = sanitizeState(catalog, {
      stock: { salt: 10, tomato: 2 },
      stapleOverrides: { salt: false },
    });
    expect(stockTotals(clean.stockLots)).toEqual({ salt: 10, tomato: 2 });
  });

  it('drops stock for an ingredient the kitchen marked as a staple', () => {
    const clean = sanitizeState(catalog, {
      stock: { tomato: 2, egg: 1 },
      stapleOverrides: { tomato: true },
    });
    expect(stockTotals(clean.stockLots)).toEqual({ egg: 1 });
  });

  it('treats the same overrides in a different key order as the same state', () => {
    const a = kitchenWithStock({});
    const b = kitchenWithStock({});
    a.stapleOverrides = { milk: false, salt: true };
    b.stapleOverrides = { salt: true, milk: false };
    expect(sameState(a, b)).toBe(true);
  });

  it('round-trips through export and import, dropping unknown ids on import', () => {
    const state = setStaple(catalog, kitchenWithStock({ tomato: 2 }), 'salt', false);
    state.stapleOverrides.ghost = true;
    const result = parseImportPayload(catalog, exportJson(state));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.stapleOverrides).toEqual({ salt: false });
  });
});
