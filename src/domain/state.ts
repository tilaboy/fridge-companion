/* Kitchen state: creation, copying, and the small edits that are pure data.
 *
 * Nothing here mutates its input. Every function that returns a state returns
 * a fresh object, so callers can hand the old one to the UI or a previous
 * undo step without worrying about aliasing.
 */
import { addLot } from './lots';
import { clonePreferences, createPreferences } from './preferences';
import type {
  Category,
  Ingredient,
  KitchenState,
  Preferences,
  Recipe,
  ShoppingItem,
  StateSummary,
  Stock,
  StockLot,
} from './types';

function cloneIngredient(ingredient: Ingredient): Ingredient {
  const copy: Ingredient = {
    id: ingredient.id,
    name: ingredient.name,
    emoji: ingredient.emoji,
    categoryId: ingredient.categoryId,
    unit: ingredient.unit,
  };
  if (ingredient.densityGPerMl !== undefined) copy.densityGPerMl = ingredient.densityGPerMl;
  if (ingredient.staple !== undefined) copy.staple = ingredient.staple;
  if (ingredient.dietClass !== undefined) copy.dietClass = ingredient.dietClass;
  if (ingredient.allergens !== undefined) copy.allergens = ingredient.allergens.slice();
  return copy;
}

function cloneRecipe(recipe: Recipe): Recipe {
  return {
    id: recipe.id,
    name: recipe.name,
    dishEmoji: recipe.dishEmoji,
    ingredients: recipe.ingredients.map((ri) => ({ ingredientId: ri.ingredientId, amount: ri.amount })),
    steps: recipe.steps.slice(),
  };
}

export function createState(): KitchenState {
  return {
    schemaVersion: 4,
    categories: [],
    preferences: createPreferences(),
    customIngredients: [],
    customRecipes: [],
    stockLots: [],
    shoppingList: [],
    stapleOverrides: {},
  };
}

export function cloneState(state: KitchenState): KitchenState {
  return {
    schemaVersion: state.schemaVersion,
    categories: state.categories.map((category) => ({ id: category.id, name: category.name })),
    preferences: clonePreferences(state.preferences ?? createPreferences()),
    customIngredients: (state.customIngredients ?? []).map(cloneIngredient),
    customRecipes: (state.customRecipes ?? []).map(cloneRecipe),
    stockLots: state.stockLots.map(
      (lot): StockLot => ({
        id: lot.id,
        ingredientId: lot.ingredientId,
        amount: lot.amount,
        expiresAt: lot.expiresAt,
        addedAt: lot.addedAt,
      }),
    ),
    shoppingList: state.shoppingList.map(
      (item): ShoppingItem => ({
        ingredientId: item.ingredientId,
        amount: item.amount,
        fromRecipeId: item.fromRecipeId ?? null,
      }),
    ),
    // Defensive `?? {}`: hand-built or pre-override states still clone.
    stapleOverrides: Object.assign({}, state.stapleOverrides ?? {}),
  };
}

export function setPreferences(
  state: KitchenState,
  preferences: Preferences,
): KitchenState {
  const next = cloneState(state);
  next.preferences = clonePreferences(preferences);
  return next;
}

/** Re-adding an ingredient adds a batch: 2 eggs now + 3 eggs later = 5. */
export function addToStock(
  state: KitchenState,
  ingredientId: string,
  amount: number,
  expiresAt: string | null = null,
  now: Date = new Date(),
): KitchenState {
  const next = cloneState(state);
  next.stockLots = addLot(next.stockLots, ingredientId, amount, expiresAt, now);
  return next;
}

export function isEmptyKitchen(state: KitchenState): boolean {
  return (
    state.categories.length === 0 &&
    state.stockLots.length === 0 &&
    state.shoppingList.length === 0
  );
}

export function summarizeState(state: KitchenState): StateSummary {
  return {
    categories: state.categories.length,
    ingredients: new Set(state.stockLots.map((lot) => lot.ingredientId)).size,
    shoppingList: state.shoppingList.length,
  };
}

/** Defensive copy for callers that build a stock map by hand. */
export function cloneStock(stock: Stock): Stock {
  return Object.assign({}, stock);
}

/** Defensive copy for callers that build a category list by hand. */
export function cloneCategories(categories: readonly Category[]): Category[] {
  return categories.map((category) => ({ id: category.id, name: category.name }));
}
