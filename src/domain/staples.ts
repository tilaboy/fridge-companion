/* Per-kitchen staples: which ingredients are assumed always on hand.
 *
 * The tray data carries sensible defaults (salt, sugar, flour, milk). A
 * kitchen may disagree, so every answer layers the user's overrides over
 * those defaults. Staples are excluded from stock, scoring, cooking, and the
 * shopping list; turning one on therefore also clears any lots and list
 * entries for it, keeping the invariant true rather than merely displayed.
 */
import type { Catalog } from './catalog';
import { getIngredient } from './catalog';
import { cloneState } from './state';
import type { IngredientId, KitchenState } from './types';

/** The built-in defaults with this kitchen's overrides applied. */
export function effectiveStapleIds(
  catalog: Catalog,
  state: KitchenState,
): Set<IngredientId> {
  const ids = new Set(catalog.stapleIds);
  for (const [id, staple] of Object.entries(state.stapleOverrides ?? {})) {
    if (staple) ids.add(id);
    else ids.delete(id);
  }
  return ids;
}

export function isStapleFor(
  catalog: Catalog,
  state: KitchenState,
  id: IngredientId,
): boolean {
  const overrides = state.stapleOverrides ?? {};
  if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id]!;
  return catalog.stapleIds.has(id);
}

/**
 * Mark or unmark an ingredient as a staple. Marking one drops its lots and
 * shopping-list entries, because the kitchen now assumes it is always there;
 * undo restores them. Unknown ids are a no-op.
 */
export function setStaple(
  catalog: Catalog,
  state: KitchenState,
  id: IngredientId,
  staple: boolean,
): KitchenState {
  if (!getIngredient(catalog, id)) return state;

  const next = cloneState(state);
  const builtIn = catalog.stapleIds.has(id);
  if (staple === builtIn) delete next.stapleOverrides[id];
  else next.stapleOverrides[id] = staple;

  if (staple) {
    next.stockLots = next.stockLots.filter((lot) => lot.ingredientId !== id);
    next.shoppingList = next.shoppingList.filter((item) => item.ingredientId !== id);
  }
  return next;
}
