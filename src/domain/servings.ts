/* Servings scaling.
 *
 * A recipe's ingredient amounts are written for its base `servings`. Scaling
 * is pure: the caller gets a cloned recipe with every amount multiplied, then
 * hands that clone to the existing cook, shopping, and missing-ingredient
 * functions. There is still one deduction path, not a second scaled one.
 *
 * Legacy recipes (schema 5 and earlier) had no servings. They scale from
 * DEFAULT_SERVINGS, so an old kitchen keeps working and a recipe written for
 * two still reads as two.
 */
import { roundAmount } from './amount';
import type { Recipe } from './types';

export const DEFAULT_SERVINGS = 2;

/** Guardrails for the UI and hand-edited/imported data, not a product limit. */
export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 12;

export function isServings(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_SERVINGS &&
    value <= MAX_SERVINGS
  );
}

/** The recipe's declared base yield, or the legacy default when unknown. */
export function recipeServings(recipe: Recipe): number {
  return isServings(recipe.servings) ? recipe.servings : DEFAULT_SERVINGS;
}

/**
 * Scale one ingredient amount. Three decimal places matches the rest of the
 * app; the floor keeps a very small hand-entered amount from rounding to zero
 * when a recipe is scaled down.
 */
export function scaleAmount(amount: number, factor: number): number {
  return Math.max(0.001, roundAmount(amount * factor));
}

/**
 * A cloned recipe for `servings`, with ingredient amounts scaled and the new
 * yield recorded. The input is never mutated. An invalid target falls back to
 * the recipe's own base yield.
 */
export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  const base = recipeServings(recipe);
  const target = isServings(servings) ? servings : base;
  const factor = target / base;
  const scaled: Recipe = {
    id: recipe.id,
    name: recipe.name,
    dishEmoji: recipe.dishEmoji,
    servings: target,
    ingredients: recipe.ingredients.map((ri) => ({
      ingredientId: ri.ingredientId,
      amount: scaleAmount(ri.amount, factor),
    })),
    steps: recipe.steps.slice(),
  };
  if (recipe.timeMinutes !== undefined) scaled.timeMinutes = recipe.timeMinutes;
  if (recipe.mealTypes !== undefined) scaled.mealTypes = recipe.mealTypes.slice();
  return scaled;
}
