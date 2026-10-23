/* Commit actions: cook, shop, and the data the combining animation flies.
 *
 * All pure. "Cook this" deducts what the kitchen actually holds — the full
 * recipe amount when there is enough, otherwise whatever is left, never below
 * zero. Staples are never deducted or shopped for.
 */
import type { Catalog } from './catalog';
import { getIngredient, isStaple } from './catalog';
import { cloneState } from './state';
import { missingIngredients } from './recommend';
import type {
  CombineAnimationSpec,
  Deduction,
  Ingredient,
  KitchenState,
  Recipe,
} from './types';

export function cookRecipe(catalog: Catalog, state: KitchenState, recipe: Recipe): KitchenState {
  const next = cloneState(state);
  for (const ri of recipe.ingredients) {
    if (isStaple(catalog, ri.ingredientId)) continue;
    const held = next.stock[ri.ingredientId] ?? 0;
    if (held <= 0) continue; // missing: untouched
    const left = held - ri.amount;
    if (left <= 0) delete next.stock[ri.ingredientId];
    else next.stock[ri.ingredientId] = left;
  }
  return next;
}

/** What one "Cook this" removes, and what remains, for the UI to animate. */
export function cookDeductions(
  catalog: Catalog,
  state: KitchenState,
  recipe: Recipe,
): Deduction[] {
  const out: Deduction[] = [];
  for (const ri of recipe.ingredients) {
    if (isStaple(catalog, ri.ingredientId)) continue;
    const held = state.stock[ri.ingredientId] ?? 0;
    if (held <= 0) continue; // missing: never removed
    const removed = Math.min(held, ri.amount);
    out.push({
      ingredientId: ri.ingredientId,
      removed,
      before: held,
      after: held - removed,
    });
  }
  return out;
}

/**
 * The missing ingredients, each with the recipe's quantity. An ingredient
 * already on the list is not duplicated — the first recipe's quantity stands.
 */
export function addToShoppingList(
  catalog: Catalog,
  state: KitchenState,
  recipe: Recipe,
): KitchenState {
  const next = cloneState(state);
  const listed = new Set(next.shoppingList.map((item) => item.ingredientId));
  for (const missing of missingIngredients(catalog, state, recipe)) {
    if (listed.has(missing.ingredientId)) continue;
    listed.add(missing.ingredientId);
    next.shoppingList.push({
      ingredientId: missing.ingredientId,
      amount: missing.amount,
      fromRecipeId: recipe.id,
    });
  }
  return next;
}

/** "Got it": the item joins stock, combining with what is there, and leaves the list. */
export function buyShoppingListItem(state: KitchenState, ingredientId: string): KitchenState {
  const next = cloneState(state);
  const index = next.shoppingList.findIndex((item) => item.ingredientId === ingredientId);
  if (index !== -1) {
    const [bought] = next.shoppingList.splice(index, 1);
    if (bought) {
      next.stock[ingredientId] = (next.stock[ingredientId] ?? 0) + bought.amount;
    }
  }
  return next;
}

/** Resolve the committed ingredient tiles, de-duplicated, in tray order. */
export function combineAnimationSpec(
  catalog: Catalog,
  recipe: Recipe,
  ingredientIds: readonly string[] | null | undefined,
): CombineAnimationSpec {
  const seen = new Set<string>();
  const flying: Ingredient[] = [];
  for (const id of ingredientIds ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    const ingredient = getIngredient(catalog, id);
    if (ingredient) flying.push(ingredient);
  }
  return { dishEmoji: recipe.dishEmoji, flying };
}
