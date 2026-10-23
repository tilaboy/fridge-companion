/* The built-in tray and recipe book, indexed once.
 *
 * Functions take a Catalog rather than reaching for module globals, so tests
 * can build a two-ingredient world and the app can build the real one.
 */
import type { Ingredient, IngredientId, Recipe, RecipeId } from './types';

export interface Catalog {
  ingredients: readonly Ingredient[];
  recipes: readonly Recipe[];
  ingredientById: ReadonlyMap<IngredientId, Ingredient>;
  recipeById: ReadonlyMap<RecipeId, Recipe>;
  /** Derived from the tray data, which stays the single source of truth. */
  stapleIds: ReadonlySet<IngredientId>;
}

export function createCatalog(
  ingredients: readonly Ingredient[],
  recipes: readonly Recipe[] = [],
): Catalog {
  const ingredientById = new Map<IngredientId, Ingredient>();
  const stapleIds = new Set<IngredientId>();
  for (const ingredient of ingredients) {
    ingredientById.set(ingredient.id, ingredient);
    if (ingredient.staple) stapleIds.add(ingredient.id);
  }
  return {
    ingredients,
    recipes,
    ingredientById,
    recipeById: new Map(recipes.map((recipe) => [recipe.id, recipe])),
    stapleIds,
  };
}

export function getIngredient(catalog: Catalog, id: IngredientId): Ingredient | null {
  return catalog.ingredientById.get(id) ?? null;
}

export function getRecipe(catalog: Catalog, id: RecipeId): Recipe | null {
  return catalog.recipeById.get(id) ?? null;
}

export function isStaple(catalog: Catalog, id: IngredientId): boolean {
  return catalog.stapleIds.has(id);
}
