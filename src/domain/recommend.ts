/* The recommendation engine.
 *
 * Score: the share of a recipe's tracked ingredients the kitchen holds in
 * sufficient amount. Amounts matter, so needing 200 g with 100 g in stock
 * counts as missing. Staples are excluded from both sides — they are assumed
 * on hand and already paid for.
 *
 * Rank adds two deliberate nudges to the honest score: the existing length
 * bias, and freshness. A complete recipe that can use up an ingredient
 * expiring within three days gets a lift; one carrying already-expired stock
 * is damped and says so on its card. Partial recipes get no freshness nudge:
 * the kitchen cannot actually use the ingredient until the missing items
 * arrive. Expired lots still count as held in this slice (cook and shop
 * semantics are unchanged), so the warning is the guardrail rather than a
 * silent disappearance.
 */
import { getIngredient } from './catalog';
import type { Catalog } from './catalog';
import {
  expiryLabel,
  expiryStatus,
  soonestExpiry,
  stockTotals,
  totalAmount,
} from './lots';
import { createPreferences, filterRecipesByPreferences } from './preferences';
import { effectiveStapleIds, isStapleFor } from './staples';
import type {
  ExpirySignal,
  ExpiryStatus,
  IngredientId,
  KitchenState,
  Recipe,
  ScoredRecipe,
  Stock,
  StockLot,
} from './types';

export function scoreRecipe(
  catalog: Catalog,
  recipe: Recipe,
  stock: Stock,
  stapleIds: ReadonlySet<IngredientId> = catalog.stapleIds,
): ScoredRecipe {
  let have = 0;
  let total = 0;
  for (const ri of recipe.ingredients) {
    if (stapleIds.has(ri.ingredientId)) continue;
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
 * Ranking weight = fit × (1 + LENGTH_BONUS × tracked ingredients) × freshness.
 * `score` itself stays the honest fit ratio the cards display — only the
 * order changes. A nearly-complete long recipe can knowingly outrank a
 * complete short one.
 */
export const LENGTH_BONUS = 0.1;

export function lengthMultiplier(total: number): number {
  return 1 + LENGTH_BONUS * total;
}

/**
 * Freshness weights. They are deliberately moderate: fit and the length bias
 * still lead, while a soon-expiring ingredient breaks a close call and an
 * expired one makes room for a fresher alternative.
 */
export const SOON_EXPIRY_BOOST = 1.2;
export const EXPIRED_EXPIRY_PENALTY = 0.8;

export function expiryMultiplier(status: ExpiryStatus): number {
  if (status === 'soon') return SOON_EXPIRY_BOOST;
  if (status === 'expired') return EXPIRED_EXPIRY_PENALTY;
  return 1;
}

/**
 * The earliest expiry among the recipe's tracked ingredients that are held in
 * sufficient amount. Callers decide whether the recipe is complete enough for
 * freshness to affect the rank. Ties keep the recipe's ingredient order for
 * stability.
 */
export function expiryWeightFor(
  recipe: Recipe,
  stock: Stock,
  lots: readonly StockLot[],
  stapleIds: ReadonlySet<IngredientId> = new Set(),
  now: Date = new Date(),
): ExpirySignal {
  let ingredientId: IngredientId | null = null;
  let expiresAt: string | null = null;
  for (const ri of recipe.ingredients) {
    if (stapleIds.has(ri.ingredientId)) continue;
    if ((stock[ri.ingredientId] ?? 0) < ri.amount) continue;
    const candidate = soonestExpiry(lots, ri.ingredientId);
    if (!candidate) continue;
    if (expiresAt === null || candidate < expiresAt) {
      ingredientId = ri.ingredientId;
      expiresAt = candidate;
    }
  }
  const status = expiryStatus(expiresAt, now);
  return {
    ingredientId,
    expiresAt,
    status,
    multiplier: expiryMultiplier(status),
  };
}

function noExpirySignal(): ExpirySignal {
  return { ingredientId: null, expiresAt: null, status: 'none', multiplier: 1 };
}

/** A deterministic one-liner for the card: freshness first, then fit. */
export function explainRecommendation(
  catalog: Catalog,
  scored: ScoredRecipe,
  now: Date = new Date(),
): string {
  const expiry = scored.expiry;
  if (expiry?.ingredientId && expiry.expiresAt) {
    const ingredient = getIngredient(catalog, expiry.ingredientId);
    const name = ingredient ? ingredient.name : expiry.ingredientId;
    if (expiry.status === 'soon') {
      return 'Use ' + name + ' \u2014 ' + expiryLabel(expiry.expiresAt, now) + '.';
    }
    if (expiry.status === 'expired') {
      return name + ' is past its date.';
    }
  }
  if (scored.missing === 0) return 'You already have everything.';
  if (scored.missing === 1) return 'Just one ingredient short.';
  return 'Closest match \u2014 ' + scored.missing + ' short.';
}

/**
 * Hard diet/allergen filters run first, so a conflicting recipe is never
 * scored or shown. Then only recipes with at least one ingredient in hand are
 * candidates; the top three come back, tie-broken by fewest missing, then by
 * id for stability.
 */
export function recommend(
  catalog: Catalog,
  state: KitchenState,
  recipeList: readonly Recipe[] = catalog.recipes,
  now: Date = new Date(),
): ScoredRecipe[] {
  const totals = stockTotals(state.stockLots);
  const staples = effectiveStapleIds(catalog, state);
  const preferences = state.preferences ?? createPreferences();
  return filterRecipesByPreferences(catalog, recipeList, preferences)
    .map((recipe) => {
      const scored = scoreRecipe(catalog, recipe, totals, staples);
      // A partial recipe cannot use up its expiring food yet, so freshness
      // only adjusts the order once every tracked ingredient is in hand.
      scored.expiry =
        scored.missing === 0
          ? expiryWeightFor(recipe, totals, state.stockLots, staples, now)
          : noExpirySignal();
      scored.rank = scored.score * lengthMultiplier(scored.total) * scored.expiry.multiplier;
      scored.explanation = explainRecommendation(catalog, scored, now);
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
        !isStapleFor(catalog, state, ri.ingredientId) &&
        totalAmount(state.stockLots, ri.ingredientId) < ri.amount,
    )
    .map((ri) => ({ ingredientId: ri.ingredientId, amount: ri.amount }));
}
