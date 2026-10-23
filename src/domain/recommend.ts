/* The recommendation engine.
 *
 * Score: the share of a recipe's tracked ingredients the kitchen holds in
 * sufficient amount. Amounts matter, so needing 200 g with 100 g in stock
 * counts as missing. Staples are excluded from both sides — they are assumed
 * on hand and already paid for.
 */
import type { Catalog } from './catalog';
import { isStaple } from './catalog';
import type { KitchenState, Recipe, ScoredRecipe, Stock } from './types';

export function scoreRecipe(catalog: Catalog, recipe: Recipe, stock: Stock): ScoredRecipe {
  let have = 0;
  let total = 0;
  for (const ri of recipe.ingredients) {
    if (isStaple(catalog, ri.ingredientId)) continue;
    total += 1;
    if ((stock[ri.ingredientId] ?? 0) >= ri.amount) have += 1;
  }
  return {
    recipe,
    have,
    missing: total - have,
    total,
    score: total === 0 ? 0 : have / total,
  };
}

/**
 * Ranking weight = fit × (1 + LENGTH_BONUS × tracked ingredients).
 * `score` itself stays the honest fit ratio the cards display — only the
 * order changes. A nearly-complete long recipe can knowingly outrank a
 * complete short one.
 */
export const LENGTH_BONUS = 0.1;

export function lengthMultiplier(total: number): number {
  return 1 + LENGTH_BONUS * total;
}

/**
 * Only recipes with at least one ingredient in hand are candidates; the top
 * three come back, tie-broken by fewest missing, then by id for stability.
 */
export function recommend(
  catalog: Catalog,
  state: KitchenState,
  recipeList: readonly Recipe[] = catalog.recipes,
): ScoredRecipe[] {
  return recipeList
    .map((recipe) => {
      const scored = scoreRecipe(catalog, recipe, state.stock);
      scored.rank = scored.score * lengthMultiplier(scored.total);
      return scored;
    })
    .filter((scored) => scored.have > 0)
    .sort((a, b) => {
      if (b.rank !== a.rank) return (b.rank ?? 0) - (a.rank ?? 0);
      if (a.missing !== b.missing) return a.missing - b.missing;
      return a.recipe.id < b.recipe.id ? -1 : 1;
    })
    .slice(0, 3);
}

/** Missing = held in less than the required amount. Staples are never missing. */
export function missingIngredients(
  catalog: Catalog,
  state: KitchenState,
  recipe: Recipe,
): { ingredientId: string; amount: number }[] {
  return recipe.ingredients
    .filter(
      (ri) =>
        !isStaple(catalog, ri.ingredientId) &&
        (state.stock[ri.ingredientId] ?? 0) < ri.amount,
    )
    .map((ri) => ({ ingredientId: ri.ingredientId, amount: ri.amount }));
}
