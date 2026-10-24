/* Commit actions: cook, shop, and the data the combining animation flies.
 *
 * All pure. "Cook this" deducts what the kitchen actually holds — the full
 * recipe amount when there is enough, otherwise whatever is left, never below
 * zero — taking the soonest-expiring batch first. Staples are never deducted
 * or shopped for. A successful cook also appends a bounded cook event so
 * recommendations can avoid repeating the same dish too soon.
 */
import type { Catalog } from './catalog';
import { getIngredient } from './catalog';
import { appendCookEvent, nextCookEventId } from './cookHistory';
import { addLot, sortedLotsFor, stockTotals, totalAmount } from './lots';
import { recipeServings } from './servings';
import { cloneState } from './state';
import { isStapleFor } from './staples';
import { missingIngredients } from './recommend';
import type {
  CombineAnimationSpec,
  Deduction,
  Ingredient,
  KitchenState,
  Recipe,
} from './types';

/** Remove `amount` from an ingredient, soonest-expiring lots first. */
function deductLots(state: KitchenState, ingredientId: string, amount: number): void {
  let remaining = amount;
  for (const lot of sortedLotsFor(state.stockLots, ingredientId)) {
    if (remaining <= 0) break;
    const taken = Math.min(lot.amount, remaining);
    const live = state.stockLots.find((entry) => entry.id === lot.id);
    if (!live) continue;
    live.amount -= taken;
    remaining -= taken;
  }
  state.stockLots = state.stockLots.filter((lot) => lot.amount > 0);
}

export function cookRecipe(
  catalog: Catalog,
  state: KitchenState,
  recipe: Recipe,
  now: Date = new Date(),
): KitchenState {
  const next = cloneState(state);
  for (const ri of recipe.ingredients) {
    if (isStapleFor(catalog, state, ri.ingredientId)) continue;
    const held = totalAmount(next.stockLots, ri.ingredientId);
    if (held <= 0) continue; // missing: untouched
    deductLots(next, ri.ingredientId, ri.amount);
  }

  const cookedAt = now.toISOString();
  next.cookHistory = appendCookEvent(next.cookHistory, {
    id: nextCookEventId(next.cookHistory, recipe.id, cookedAt),
    recipeId: recipe.id,
    cookedAt,
    servings: recipeServings(recipe),
  });
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
    if (isStapleFor(catalog, state, ri.ingredientId)) continue;
    const held = totalAmount(state.stockLots, ri.ingredientId);
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

/** "Got it": a fresh batch joins stock and the item leaves the list. */
export function buyShoppingListItem(state: KitchenState, ingredientId: string): KitchenState {
  const next = cloneState(state);
  const index = next.shoppingList.findIndex((item) => item.ingredientId === ingredientId);
  if (index !== -1) {
    const [bought] = next.shoppingList.splice(index, 1);
    if (bought) {
      next.stockLots = addLot(next.stockLots, ingredientId, bought.amount);
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

/** Exposed for the UI: totals without reaching for the old stock map. */
export function heldTotals(state: KitchenState) {
  return stockTotals(state.stockLots);
}
