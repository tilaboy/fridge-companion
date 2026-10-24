import { describe, expect, it } from 'vitest';
import {
  addToShoppingList,
  addToStock,
  buyShoppingListItem,
  cookRecipe,
  missingIngredients,
  recommend,
  ensureCategories,
  scaleRecipe,
  toCanonical,
} from '../src/domain/index';
import { createState } from '../src/domain/state';
import { stockTotals } from '../src/domain/lots';
import { loadState, saveState } from '../src/store/localStore';
import { catalog } from './fixtures';

function recipe(id: string) {
  const found = catalog.recipeById.get(id);
  if (!found) throw new Error('missing recipe ' + id);
  return found;
}

function makeStorage() {
  const data: Record<string, string> = {};
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key]! : null;
    },
    setItem(key: string, value: string) {
      data[key] = String(value);
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}

describe('the core loop', () => {
  it('goes from an empty browser to a cooked meal and a restocked fridge', () => {
    const storage = makeStorage();

    // 1. First use: nothing stored, the door adopts the seeded categories.
    expect(loadState(catalog, storage)).toEqual(createState());
    let state = ensureCategories(loadState(catalog, storage));
    expect(state.categories).toHaveLength(5);
    expect(saveState(state, storage)).toBe(true);

    // 2. Fill the fridge: scrambled eggs is complete (salt is a staple);
    //    the pasta is short of tomato pasta's call.
    state = addToStock(state, 'egg', 5);
    state = addToStock(state, 'butter', 10);
    state = addToStock(state, 'pasta', 100);
    expect(saveState(state, storage)).toBe(true);
    expect(stockTotals(loadState(catalog, storage).stockLots)).toEqual({ egg: 5, butter: 10, pasta: 100 });

    // 3. My Recipes: the complete recipe leads.
    let picks = recommend(catalog, state);
    expect(picks[0]!.recipe.id).toBe('scrambled_eggs');
    expect(picks[0]).toMatchObject({ have: 2, total: 2, score: 1 });

    // 4. Cook it: the amounts leave, zeroes disappear.
    state = cookRecipe(catalog, state, recipe('scrambled_eggs'));
    expect(stockTotals(state.stockLots)).toEqual({ egg: 2, pasta: 100 });
    expect(saveState(state, storage)).toBe(true);
    expect(stockTotals(loadState(catalog, storage).stockLots)).toEqual({ egg: 2, pasta: 100 });

    // 5. The picks move on, and another card can be shopped for.
    picks = recommend(catalog, state);
    expect(picks.every((p) => p.recipe.id !== 'scrambled_eggs')).toBe(true);
    expect(picks.some((p) => p.recipe.id === 'soy_rice_bowl')).toBe(true);
    state = addToShoppingList(catalog, state, recipe('soy_rice_bowl'));
    expect(state.shoppingList).toEqual(
      expect.arrayContaining([
        { ingredientId: 'cooked_rice', amount: 250, fromRecipeId: 'soy_rice_bowl' },
        { ingredientId: 'soy_sauce', amount: 15, fromRecipeId: 'soy_rice_bowl' },
      ]),
    );
    expect(state.shoppingList).toHaveLength(2);

    // 6. Shop: both items join the stock and leave the list.
    state = buyShoppingListItem(state, 'cooked_rice');
    state = buyShoppingListItem(state, 'soy_sauce');
    expect(stockTotals(state.stockLots).cooked_rice).toBe(250);
    expect(stockTotals(state.stockLots).soy_sauce).toBe(15);
    expect(state.shoppingList).toEqual([]);
    expect(saveState(state, storage)).toBe(true);
    expect(loadState(catalog, storage).shoppingList).toEqual([]);

    // 7. The loop closes: the shopped-for recipe is now complete.
    picks = recommend(catalog, state);
    const soy = picks.find((p) => p.recipe.id === 'soy_rice_bowl');
    expect(soy).toMatchObject({ have: 3, total: 3, score: 1 });
  });

  it('lets half a kilo satisfy a recipe that asks for grams', () => {
    const beef = catalog.ingredientById.get('beef')!;
    const canonical = toCanonical(beef, 0.5, 'kg');
    expect(canonical).toBe(500);

    let state = addToStock(createState(), 'beef', canonical!);
    const bolognese = recipe('beef_bolognese');
    expect(missingIngredients(catalog, state, bolognese).map((m) => m.ingredientId))
      .not.toContain('beef');

    state = cookRecipe(catalog, state, bolognese);
    expect(stockTotals(state.stockLots).beef).toBe(250);
  });

  it('scales the same cook-and-shop path from the recipe base', () => {
    let state = addToStock(createState(), 'egg', 6);
    state = addToStock(state, 'butter', 30);
    const doubled = scaleRecipe(recipe('scrambled_eggs'), 4);
    expect(missingIngredients(catalog, state, doubled)).toEqual([]);
    state = cookRecipe(catalog, state, doubled);
    expect(stockTotals(state.stockLots)).toEqual({ butter: 10 });

    state = addToStock(state, 'pasta', 100);
    const pastaForFour = scaleRecipe(recipe('tomato_pasta'), 4);
    const missing = missingIngredients(catalog, state, pastaForFour);
    expect(missing).toEqual([
      { ingredientId: 'pasta', amount: 400 },
      { ingredientId: 'tomato', amount: 4 },
      { ingredientId: 'garlic', amount: 4 },
      { ingredientId: 'olive_oil', amount: 30 },
    ]);
    state = addToShoppingList(catalog, state, pastaForFour);
    expect(state.shoppingList).toEqual([
      { ingredientId: 'pasta', amount: 400, fromRecipeId: 'tomato_pasta' },
      { ingredientId: 'tomato', amount: 4, fromRecipeId: 'tomato_pasta' },
      { ingredientId: 'garlic', amount: 4, fromRecipeId: 'tomato_pasta' },
      { ingredientId: 'olive_oil', amount: 30, fromRecipeId: 'tomato_pasta' },
    ]);
  });

  it('recommends nothing from a truly empty fridge', () => {
    expect(recommend(catalog, createState())).toEqual([]);
  });

  it('never mutates the state handed to a commit action', () => {
    const before = createState();
    before.stockLots = [
      { id: 'a', ingredientId: 'egg', amount: 5, expiresAt: null, addedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', ingredientId: 'butter', amount: 10, expiresAt: null, addedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const snapshot = JSON.stringify(before);
    cookRecipe(catalog, before, recipe('scrambled_eggs'));
    addToShoppingList(catalog, before, recipe('soy_rice_bowl'));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
