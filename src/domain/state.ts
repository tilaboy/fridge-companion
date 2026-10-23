/* Kitchen state: creation, copying, and the small edits that are pure data.
 *
 * Nothing here mutates its input. Every function that returns a state returns
 * a fresh object, so callers can hand the old one to the UI or a previous
 * undo step without worrying about aliasing.
 */
import type { Category, KitchenState, ShoppingItem, StateSummary, Stock } from './types';

export function createState(): KitchenState {
  return { categories: [], stock: {}, shoppingList: [] };
}

export function cloneState(state: KitchenState): KitchenState {
  return {
    categories: state.categories.map((category) => ({ id: category.id, name: category.name })),
    stock: Object.assign({}, state.stock),
    shoppingList: state.shoppingList.map(
      (item): ShoppingItem => ({
        ingredientId: item.ingredientId,
        amount: item.amount,
        fromRecipeId: item.fromRecipeId ?? null,
      }),
    ),
  };
}

/** Re-adding an ingredient combines amounts: 2 eggs + 3 eggs = 5. */
export function addToStock(
  state: KitchenState,
  ingredientId: string,
  amount: number,
): KitchenState {
  const next = cloneState(state);
  next.stock[ingredientId] = (next.stock[ingredientId] ?? 0) + amount;
  return next;
}

export function isEmptyKitchen(state: KitchenState): boolean {
  return (
    state.categories.length === 0 &&
    Object.keys(state.stock).length === 0 &&
    state.shoppingList.length === 0
  );
}

export function summarizeState(state: KitchenState): StateSummary {
  return {
    categories: state.categories.length,
    ingredients: Object.keys(state.stock).length,
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
