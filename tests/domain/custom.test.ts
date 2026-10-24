import { describe, expect, it } from 'vitest';
import { createCatalog } from '../../src/domain/catalog';
import {
  addCustomIngredient,
  addCustomRecipe,
  normalizeName,
  sanitizeCustomIngredients,
  sanitizeCustomRecipes,
  type CustomRecipeInput,
} from '../../src/domain/custom';
import { createPreferences } from '../../src/domain/preferences';
import { addToStock, setPreferences } from '../../src/domain/state';
import { stockTotals } from '../../src/domain/lots';
import { recommend } from '../../src/domain/recommend';
import { exportJson, parseImportPayload } from '../../src/domain/transfer';
import type { Category, Ingredient, KitchenState, Recipe } from '../../src/domain/types';
import { kitchenWithStock } from '../stock';

const tray: Ingredient[] = [
  { id: 'tomato', name: 'Tomato', emoji: '🍅', categoryId: 'produce', unit: 'pcs' },
  { id: 'salt', name: 'Salt', emoji: '🧂', categoryId: 'pantry', unit: 'g', staple: true },
  { id: 'milk', name: 'Milk', emoji: '🥛', categoryId: 'dairy', unit: 'ml', staple: true },
];

const builtInRecipe: Recipe = {
  id: 'tomato-soup',
  name: 'Tomato Soup',
  dishEmoji: '🍲',
  ingredients: [{ ingredientId: 'tomato', amount: 2 }],
  steps: ['Simmer.'],
};

const catalog = createCatalog(tray, [builtInRecipe]);

const categories: Category[] = [
  { id: 'produce', name: 'Produce' },
  { id: 'pantry', name: 'Pantry' },
];

function kitchen(): KitchenState {
  const state = kitchenWithStock({});
  state.categories = categories.map((category) => ({ ...category }));
  return state;
}

function addedIngredient(state: KitchenState, name: string) {
  const result = addCustomIngredient(catalog, state, {
    name,
    categoryId: 'produce',
    unit: 'pcs',
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('addCustomIngredient', () => {
  it('adds a normalized ingredient with an id that cannot collide', () => {
    const state = kitchen();
    const result = addCustomIngredient(catalog, state, {
      name: '  Shiitake   mushrooms ',
      emoji: '🍄',
      categoryId: 'produce',
      unit: 'g',
      densityGPerMl: '0.4',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.ingredient).toMatchObject({
      id: 'custom-ingredient-shiitake-mushrooms',
      name: 'Shiitake mushrooms',
      emoji: '🍄',
      categoryId: 'produce',
      unit: 'g',
      densityGPerMl: 0.4,
    });
    expect(result.state.customIngredients).toEqual([result.ingredient]);
    expect(state.customIngredients).toEqual([]);
  });

  it('refuses duplicate names against built-ins and against the state', () => {
    const builtIn = addCustomIngredient(catalog, kitchen(), {
      name: '  TOMATO ',
      categoryId: 'produce',
      unit: 'pcs',
    });
    expect(builtIn.ok).toBe(false);

    const first = addedIngredient(kitchen(), 'Okra');
    const staleCatalog = addCustomIngredient(catalog, first.state, {
      name: 'okra',
      categoryId: 'produce',
      unit: 'pcs',
    });
    expect(staleCatalog.ok).toBe(false);
    if (!staleCatalog.ok) expect(staleCatalog.error).toContain('already have Okra');
  });

  it('normalizes names for comparison without changing the display name', () => {
    expect(normalizeName('  Café   Noir ')).toBe('café noir');
    const first = addedIngredient(kitchen(), 'Café');
    const second = addedIngredient(first.state, 'Cafe');
    expect(first.ingredient.id).toBe('custom-ingredient-cafe');
    expect(second.ingredient.id).toBe('custom-ingredient-cafe-2');
    expect(second.state.customIngredients).toHaveLength(2);
  });

  it('rejects empty names, unknown categories, and unsafe units', () => {
    const cases = [
      [{ name: '  ', categoryId: 'produce', unit: 'pcs' }, 'name'],
      [{ name: 'x'.repeat(41), categoryId: 'produce', unit: 'pcs' }, 'name'],
      [{ name: 'Okra', categoryId: 'ghost', unit: 'pcs' }, 'categor'],
      [{ name: 'Okra', categoryId: 'produce', unit: 'kg' }, 'Pick'],
      [{ name: 'Okra', categoryId: 'produce', unit: 'cups' }, 'Pick'],
    ] as const;
    for (const [input, fragment] of cases) {
      const result = addCustomIngredient(catalog, kitchen(), input);
      expect(result.ok, JSON.stringify(input)).toBe(false);
      if (!result.ok) expect(result.error.toLowerCase()).toContain(fragment.toLowerCase());
    }
  });

  it('accepts density only for mass/volume, with a bounded value', () => {
    const count = addCustomIngredient(catalog, kitchen(), {
      name: 'Okra', categoryId: 'produce', unit: 'pcs', densityGPerMl: 1,
    });
    expect(count.ok).toBe(false);

    for (const density of ['0', '-1', '9', 'nope']) {
      const result = addCustomIngredient(catalog, kitchen(), {
        name: 'Okra', categoryId: 'produce', unit: 'g', densityGPerMl: density,
      });
      expect(result.ok, density).toBe(false);
    }

    const blank = addCustomIngredient(catalog, kitchen(), {
      name: 'Okra', categoryId: 'produce', unit: 'g', densityGPerMl: '',
    });
    if (!blank.ok) throw new Error(blank.error);
    expect(blank.ingredient.densityGPerMl).toBeUndefined();
  });

  it('stores declared safety metadata, and defaults to unknown', () => {
    const declared = addCustomIngredient(catalog, kitchen(), {
      name: 'Shrimp',
      categoryId: 'produce',
      unit: 'g',
      dietClass: 'fish',
      allergensKnown: true,
      allergens: ['shellfish', 'fish', 'shellfish'],
    });
    if (!declared.ok) throw new Error(declared.error);
    expect(declared.ingredient.dietClass).toBe('fish');
    expect(declared.ingredient.allergens).toEqual(['fish', 'shellfish']);

    const none = addCustomIngredient(catalog, kitchen(), {
      name: 'Tofu',
      categoryId: 'produce',
      unit: 'g',
      dietClass: 'plant',
      allergensKnown: true,
      allergens: [],
    });
    if (!none.ok) throw new Error(none.error);
    expect(none.ingredient.allergens).toEqual([]);

    const unknown = addedIngredient(kitchen(), 'Mystery');
    expect(unknown.ingredient.dietClass).toBe('unknown');
    expect(unknown.ingredient.allergens).toBeUndefined();

    const ignored = addCustomIngredient(catalog, kitchen(), {
      name: 'Ignored List',
      categoryId: 'produce',
      unit: 'g',
      dietClass: 'plant',
      allergensKnown: false,
      allergens: ['soy'],
    });
    if (!ignored.ok) throw new Error(ignored.error);
    expect(ignored.ingredient.allergens).toBeUndefined();
  });

  it('rejects an unknown diet class or an invalid allergen', () => {
    const diet = addCustomIngredient(catalog, kitchen(), {
      name: 'Okra', categoryId: 'produce', unit: 'pcs', dietClass: 'keto',
    });
    expect(diet.ok).toBe(false);
    if (!diet.ok) expect(diet.error).toContain('diet');

    const allergen = addCustomIngredient(catalog, kitchen(), {
      name: 'Okra',
      categoryId: 'produce',
      unit: 'pcs',
      dietClass: 'plant',
      allergensKnown: true,
      allergens: ['gluten', 'ghost'],
    });
    expect(allergen.ok).toBe(false);
    if (!allergen.ok) expect(allergen.error).toContain('allergen');
  });
});

describe('sanitizeCustomIngredients', () => {
  it('drops duplicates, repairs ids, and keeps valid rows', () => {
    const clean = sanitizeCustomIngredients(
      catalog,
      [
        { id: 'custom-ingredient-okra', name: 'Okra', categoryId: 'produce', unit: 'pcs' },
        { id: 'custom-ingredient-okra', name: 'Okra Two', categoryId: 'produce', unit: 'pcs' },
        { name: 'tomato', categoryId: 'produce', unit: 'pcs' },
        { name: 'Salt', categoryId: 'pantry', unit: 'g' },
        { name: 'Bad Unit', categoryId: 'produce', unit: 'kg' },
        { name: 'Count Density', categoryId: 'produce', unit: 'pcs', densityGPerMl: 1 },
        { name: 'Weird Density', categoryId: 'produce', unit: 'g', densityGPerMl: 99 },
        { name: '', categoryId: 'produce', unit: 'pcs' },
        null,
      ],
      categories,
    );

    expect(clean.map((ingredient) => ingredient.name)).toEqual([
      'Okra',
      'Okra Two',
      'Count Density',
      'Weird Density',
    ]);
    expect(clean[1]!.id).toBe('custom-ingredient-okra-two');
    expect(clean[0]!.id).toBe('custom-ingredient-okra');
    expect(clean[2]!.densityGPerMl).toBeUndefined();
    expect(clean[3]!.densityGPerMl).toBeUndefined();
    expect(clean[2]!.categoryId).toBe('produce');
  });

  it('falls back to the first category and a default emoji', () => {
    const [clean] = sanitizeCustomIngredients(
      catalog,
      [{ name: 'Okra', categoryId: 'missing', unit: 'pcs' }],
      categories,
    );
    expect(clean).toMatchObject({
      name: 'Okra',
      categoryId: 'produce',
      emoji: '🥫',
    });
  });

  it('repairs valid safety metadata and fails closed on malformed metadata', () => {
    const clean = sanitizeCustomIngredients(
      catalog,
      [
        {
          name: 'Shrimp',
          categoryId: 'produce',
          unit: 'g',
          dietClass: 'fish',
          allergens: ['shellfish', 'shellfish'],
        },
        {
          name: 'Tofu',
          categoryId: 'produce',
          unit: 'g',
          dietClass: 'plant',
          allergens: [],
        },
        {
          name: 'Legacy',
          categoryId: 'produce',
          unit: 'pcs',
        },
        {
          name: 'Bad Allergens',
          categoryId: 'produce',
          unit: 'g',
          dietClass: 'plant',
          allergens: ['soy', 'not-real'],
        },
        {
          name: 'Bad Diet',
          categoryId: 'produce',
          unit: 'g',
          dietClass: 'alien',
          allergens: ['soy'],
        },
      ],
      categories,
    );
    expect(clean.map((ingredient) => ingredient.name)).toEqual([
      'Shrimp', 'Tofu', 'Legacy', 'Bad Allergens', 'Bad Diet',
    ]);
    expect(clean[0]).toMatchObject({ dietClass: 'fish', allergens: ['shellfish'] });
    expect(clean[1]).toMatchObject({ dietClass: 'plant', allergens: [] });
    expect(clean[2]!.dietClass).toBeUndefined();
    expect(clean[2]!.allergens).toBeUndefined();
    expect(clean[3]!.dietClass).toBe('plant');
    expect(clean[3]!.allergens).toBeUndefined();
    expect(clean[4]!.dietClass).toBeUndefined();
    expect(clean[4]!.allergens).toEqual(['soy']);
  });
});

describe('storing custom ingredients', () => {
  it('keeps custom stock through export and import', () => {
    const added = addedIngredient(kitchen(), 'Okra');
    let state = addToStock(added.state, added.ingredient.id, 250);
    state.shoppingList = [{ ingredientId: added.ingredient.id, amount: 100, fromRecipeId: null }];

    const result = parseImportPayload(catalog, exportJson(state));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.customIngredients).toEqual([added.ingredient]);
    expect(stockTotals(result.state.stockLots)[added.ingredient.id]).toBe(250);
    expect(result.state.shoppingList[0]!.ingredientId).toBe(added.ingredient.id);
  });

  it('round-trips declared safety metadata', () => {
    const added = addCustomIngredient(catalog, kitchen(), {
      name: 'Shrimp',
      categoryId: 'produce',
      unit: 'g',
      dietClass: 'fish',
      allergensKnown: true,
      allergens: ['shellfish'],
    });
    if (!added.ok) throw new Error(added.error);

    const result = parseImportPayload(catalog, exportJson(added.state));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.customIngredients[0]).toMatchObject({
      name: 'Shrimp',
      dietClass: 'fish',
      allergens: ['shellfish'],
    });
  });
});

describe('addCustomRecipe', () => {
  it('adds a recipe, merging repeated ingredients and trimming steps', () => {
    const result = addCustomRecipe(catalog, kitchen(), {
      name: '  My   Soup ',
      ingredients: [
        { ingredientId: 'tomato', amount: 1 },
        { ingredientId: 'tomato', amount: 2 },
        { ingredientId: 'salt', amount: 1 },
      ],
      steps: ['  Boil  ', '', 'Serve.'],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.recipe).toMatchObject({
      id: 'custom-recipe-my-soup',
      name: 'My Soup',
      dishEmoji: '🍽️',
      servings: 2,
      ingredients: [
        { ingredientId: 'tomato', amount: 3 },
        { ingredientId: 'salt', amount: 1 },
      ],
      steps: ['Boil', 'Serve.'],
    });
    expect(result.state.customRecipes).toEqual([result.recipe]);
  });

  it('stores declared time and meal metadata, normalized and deduplicated', () => {
    const result = addCustomRecipe(catalog, kitchen(), {
      name: 'Quick Lunch',
      timeMinutes: '15',
      mealTypes: ['lunch', 'lunch', 'dinner'],
      ingredients: [{ ingredientId: 'tomato', amount: 1 }],
      steps: ['Cook.'],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.recipe.timeMinutes).toBe(15);
    expect(result.recipe.mealTypes).toEqual(['lunch', 'dinner']);
  });

  it('stores the declared servings, defaulting to two when blank', () => {
    const declared = addCustomRecipe(catalog, kitchen(), {
      name: 'Family Pot',
      servings: '4',
      ingredients: [{ ingredientId: 'tomato', amount: 4 }],
      steps: ['Cook.'],
    });
    if (!declared.ok) throw new Error(declared.error);
    expect(declared.recipe.servings).toBe(4);

    const blank = addCustomRecipe(catalog, kitchen(), {
      name: 'Default Pot',
      ingredients: [{ ingredientId: 'tomato', amount: 2 }],
      steps: ['Cook.'],
    });
    if (!blank.ok) throw new Error(blank.error);
    expect(blank.recipe.servings).toBe(2);
  });

  it('rejects servings outside the whole-number guardrail', () => {
    for (const servings of ['0', '13', '2.5', 'soon']) {
      const result = addCustomRecipe(catalog, kitchen(), {
        name: 'Bad Servings',
        servings,
        ingredients: [{ ingredientId: 'tomato', amount: 1 }],
        steps: ['Cook.'],
      });
      expect(result.ok, servings).toBe(false);
      if (!result.ok) expect(result.error.toLowerCase()).toContain('servings');
    }
  });

  it('rejects invalid time and meal metadata', () => {
    const cases = [
      [{ timeMinutes: '0' }, 'Time'],
      [{ timeMinutes: 'soon' }, 'Time'],
      [{ timeMinutes: 241 }, 'Time'],
      [{ mealTypes: ['brunch'] }, 'meal'],
      [{ mealTypes: 'lunch' }, 'meal'],
    ] as const;
    for (const [extra, fragment] of cases) {
      const input = {
        name: 'Bad Metadata',
        ingredients: [{ ingredientId: 'tomato', amount: 1 }],
        steps: ['Cook.'],
        ...extra,
      } as CustomRecipeInput;
      const result = addCustomRecipe(catalog, kitchen(), input);
      expect(result.ok, JSON.stringify(extra)).toBe(false);
      if (!result.ok) expect(result.error.toLowerCase()).toContain(fragment.toLowerCase());
    }
  });

  it('leaves undeclared time and meal metadata unknown', () => {
    const result = addCustomRecipe(catalog, kitchen(), {
      name: 'Mystery Dinner',
      ingredients: [{ ingredientId: 'tomato', amount: 1 }],
      steps: ['Cook.'],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.recipe.timeMinutes).toBeUndefined();
    expect(result.recipe.mealTypes).toBeUndefined();
    expect(result.recipe.servings).toBe(2);
  });

  it('refuses duplicate names and broken ingredients or steps', () => {
    const builtIn = addCustomRecipe(catalog, kitchen(), {
      name: 'tomato soup', ingredients: [{ ingredientId: 'tomato', amount: 1 }], steps: ['x'],
    });
    expect(builtIn.ok).toBe(false);

    const cases = [
      [{ name: 'No Ingredients', ingredients: [], steps: ['x'] }, 'ingredient'],
      [{ name: 'Ghost', ingredients: [{ ingredientId: 'ghost', amount: 1 }], steps: ['x'] }, 'known'],
      [{ name: 'Zero', ingredients: [{ ingredientId: 'tomato', amount: 0 }], steps: ['x'] }, 'positive'],
      [{ name: 'No Steps', ingredients: [{ ingredientId: 'tomato', amount: 1 }], steps: [] }, 'step'],
    ] as const;
    for (const [input, fragment] of cases) {
      const result = addCustomRecipe(catalog, kitchen(), input);
      expect(result.ok, JSON.stringify(input)).toBe(false);
      if (!result.ok) expect(result.error.toLowerCase()).toContain(fragment.toLowerCase());
    }
  });

  it('refuses a duplicate against a custom recipe already in the state', () => {
    const first = addCustomRecipe(catalog, kitchen(), {
      name: 'My Soup', ingredients: [{ ingredientId: 'tomato', amount: 1 }], steps: ['x'],
    });
    if (!first.ok) throw new Error(first.error);
    const again = addCustomRecipe(catalog, first.state, {
      name: 'my soup', ingredients: [{ ingredientId: 'tomato', amount: 1 }], steps: ['x'],
    });
    expect(again.ok).toBe(false);
  });
});

describe('sanitizeCustomRecipes', () => {
  it('keeps valid recipes, sums duplicates, and drops broken ones', () => {
    const clean = sanitizeCustomRecipes(
      catalog,
      [
        {
          id: 'custom-recipe-ok',
          name: 'Okra Stew',
          ingredients: [
            { ingredientId: 'tomato', amount: 1 },
            { ingredientId: 'tomato', amount: 1 },
          ],
          steps: ['Cook.'],
        },
        { name: 'Broken', ingredients: [{ ingredientId: 'ghost', amount: 1 }], steps: ['x'] },
        { name: 'No Steps', ingredients: [{ ingredientId: 'tomato', amount: 1 }], steps: [] },
        { name: 'okra stew', ingredients: [{ ingredientId: 'tomato', amount: 1 }], steps: ['x'] },
        {
          id: 'tomato-soup',
          name: 'Same Id as Built-in',
          ingredients: [{ ingredientId: 'tomato', amount: 1 }],
          steps: ['x'],
        },
      ],
      [],
    );
    expect(clean).toHaveLength(2);
    expect(clean[0]).toMatchObject({
      id: 'custom-recipe-ok',
      name: 'Okra Stew',
      servings: 2,
      ingredients: [{ ingredientId: 'tomato', amount: 2 }],
      steps: ['Cook.'],
    });
    expect(clean[1]!.id).toBe('custom-recipe-same-id-as-built-in');
  });

  it('does not let an imported custom recipe claim built-in provenance', () => {
    const clean = sanitizeCustomRecipes(
      catalog,
      [{
        name: 'Borrowed Soup',
        source: {
          kind: 'original',
          author: 'Fridge Door Companion contributors',
          license: 'MIT',
        },
        ingredients: [{ ingredientId: 'tomato', amount: 1 }],
        steps: ['Cook.'],
      }],
      [],
    );
    expect(clean).toHaveLength(1);
    expect(clean[0]!.source).toBeUndefined();
  });

  it('keeps valid time and meal metadata, and treats malformed metadata as unknown', () => {
    const clean = sanitizeCustomRecipes(
      catalog,
      [
        {
          name: 'Quick Dinner',
          servings: 4,
          timeMinutes: '15',
          mealTypes: ['dinner', 'dinner'],
          ingredients: [{ ingredientId: 'tomato', amount: 1 }],
          steps: ['Cook.'],
        },
        {
          name: 'Bad Time',
          servings: '0',
          timeMinutes: 0,
          mealTypes: ['lunch'],
          ingredients: [{ ingredientId: 'tomato', amount: 1 }],
          steps: ['Cook.'],
        },
        {
          name: 'Bad Meal',
          servings: 3,
          timeMinutes: 10,
          mealTypes: ['brunch'],
          ingredients: [{ ingredientId: 'tomato', amount: 1 }],
          steps: ['Cook.'],
        },
        {
          name: 'Legacy Recipe',
          ingredients: [{ ingredientId: 'tomato', amount: 1 }],
          steps: ['Cook.'],
        },
      ],
      [],
    );
    expect(clean[0]).toMatchObject({ servings: 4, timeMinutes: 15, mealTypes: ['dinner'] });
    expect(clean[1]!.servings).toBe(2);
    expect(clean[1]!.timeMinutes).toBeUndefined();
    expect(clean[1]!.mealTypes).toEqual(['lunch']);
    expect(clean[2]!.servings).toBe(3);
    expect(clean[2]!.timeMinutes).toBe(10);
    expect(clean[2]!.mealTypes).toBeUndefined();
    expect(clean[3]!.servings).toBe(2);
    expect(clean[3]!.timeMinutes).toBeUndefined();
    expect(clean[3]!.mealTypes).toBeUndefined();
  });

  it('round-trips recipe servings, time, and meal metadata', () => {
    const recipe = addCustomRecipe(catalog, kitchen(), {
      name: 'Quick Dinner',
      servings: 4,
      timeMinutes: 15,
      mealTypes: ['dinner'],
      ingredients: [{ ingredientId: 'tomato', amount: 1 }],
      steps: ['Cook.'],
    });
    if (!recipe.ok) throw new Error(recipe.error);

    const result = parseImportPayload(catalog, exportJson(recipe.state));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.customRecipes[0]).toMatchObject({
      name: 'Quick Dinner',
      servings: 4,
      timeMinutes: 15,
      mealTypes: ['dinner'],
    });
  });

  it('resolves custom ingredients and survives export/import', () => {
    const added = addedIngredient(kitchen(), 'Okra');
    const recipe = addCustomRecipe(catalog, added.state, {
      name: 'Okra Stew',
      ingredients: [{ ingredientId: added.ingredient.id, amount: 3 }],
      steps: ['Cook.'],
    });
    if (!recipe.ok) throw new Error(recipe.error);

    const result = parseImportPayload(catalog, exportJson(recipe.state));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.customIngredients).toEqual([added.ingredient]);
    expect(result.state.customRecipes).toEqual([recipe.recipe]);
  });
});

describe('a merged catalog uses custom recipes', () => {
  it('recommends a custom recipe from custom stock', () => {
    const added = addedIngredient(kitchen(), 'Okra');
    const recipe = addCustomRecipe(catalog, added.state, {
      name: 'Okra Solo',
      ingredients: [{ ingredientId: added.ingredient.id, amount: 2 }],
      steps: ['Cook.'],
    });
    if (!recipe.ok) throw new Error(recipe.error);

    const merged = createCatalog(
      tray.concat(recipe.state.customIngredients),
      [builtInRecipe].concat(recipe.state.customRecipes),
    );
    const stocked = addToStock(recipe.state, added.ingredient.id, 2);
    const picks = recommend(merged, stocked);
    expect(picks.map((pick) => pick.recipe.id)).toContain('custom-recipe-okra-solo');
  });

  it('filters custom recipes by their custom ingredient metadata', () => {
    const added = addCustomIngredient(catalog, kitchen(), {
      name: 'Shrimp',
      categoryId: 'produce',
      unit: 'g',
      dietClass: 'fish',
      allergensKnown: true,
      allergens: ['shellfish'],
    });
    if (!added.ok) throw new Error(added.error);

    const recipe = addCustomRecipe(catalog, added.state, {
      name: 'Shrimp Bowl',
      ingredients: [{ ingredientId: added.ingredient.id, amount: 2 }],
      steps: ['Cook.'],
    });
    if (!recipe.ok) throw new Error(recipe.error);

    const merged = createCatalog(
      tray.concat(recipe.state.customIngredients),
      [builtInRecipe].concat(recipe.state.customRecipes),
    );
    const stocked = addToStock(recipe.state, added.ingredient.id, 2);
    const shellfishFree = setPreferences(stocked, {
      ...createPreferences(),
      allergens: ['shellfish'],
    });
    expect(recommend(merged, shellfishFree).map((pick) => pick.recipe.id))
      .not.toContain('custom-recipe-shrimp-bowl');
    expect(recommend(merged, stocked).map((pick) => pick.recipe.id))
      .toContain('custom-recipe-shrimp-bowl');
  });

  it('filters custom recipes by time and meal, failing closed when metadata is missing', () => {
    const recipe = addCustomRecipe(catalog, kitchen(), {
      name: 'Quick Lunch',
      timeMinutes: 15,
      mealTypes: ['lunch'],
      ingredients: [{ ingredientId: 'tomato', amount: 1 }],
      steps: ['Cook.'],
    });
    if (!recipe.ok) throw new Error(recipe.error);

    const legacy = addCustomRecipe(catalog, recipe.state, {
      name: 'Legacy Lunch',
      ingredients: [{ ingredientId: 'tomato', amount: 1 }],
      steps: ['Cook.'],
    });
    if (!legacy.ok) throw new Error(legacy.error);

    const merged = createCatalog(
      tray,
      [builtInRecipe].concat(legacy.state.customRecipes),
    );
    const stocked = addToStock(legacy.state, 'tomato', 2);
    const quickLunch = setPreferences(stocked, {
      ...createPreferences(),
      maxTimeMinutes: 20,
      meal: 'lunch',
    });
    const dinner = setPreferences(stocked, {
      ...createPreferences(),
      maxTimeMinutes: 20,
      meal: 'dinner',
    });
    const tighter = setPreferences(stocked, {
      ...createPreferences(),
      maxTimeMinutes: 10,
      meal: 'lunch',
    });

    const quickPicks = recommend(merged, quickLunch).map((pick) => pick.recipe.id);
    expect(quickPicks).toContain('custom-recipe-quick-lunch');
    expect(quickPicks).not.toContain('custom-recipe-legacy-lunch');
    expect(recommend(merged, dinner).map((pick) => pick.recipe.id))
      .not.toContain('custom-recipe-quick-lunch');
    expect(recommend(merged, tighter).map((pick) => pick.recipe.id))
      .not.toContain('custom-recipe-quick-lunch');
  });

  it('hides legacy custom ingredients with unknown safety metadata under a filter', () => {
    const added = addedIngredient(kitchen(), 'Okra');
    const recipe = addCustomRecipe(catalog, added.state, {
      name: 'Okra Solo',
      ingredients: [{ ingredientId: added.ingredient.id, amount: 2 }],
      steps: ['Cook.'],
    });
    if (!recipe.ok) throw new Error(recipe.error);

    const merged = createCatalog(
      tray.concat(recipe.state.customIngredients),
      [builtInRecipe].concat(recipe.state.customRecipes),
    );
    const stocked = addToStock(recipe.state, added.ingredient.id, 2);
    const vegan = setPreferences(stocked, { ...createPreferences(), diet: 'vegan' });
    expect(recommend(merged, vegan).map((pick) => pick.recipe.id))
      .not.toContain('custom-recipe-okra-solo');
  });
});
