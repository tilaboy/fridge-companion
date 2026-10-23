/* The kitchen's data model, as plain data.
 *
 * Everything here is structural: no classes, no methods, no DOM. The same
 * values survive JSON round-trips unchanged, which is what makes export,
 * import, and cross-tab sync trustworthy.
 */

export type IngredientId = string;
export type RecipeId = string;
export type CategoryId = string;

/** A built-in tray ingredient. Staples are assumed always on hand. */
export interface Ingredient {
  id: IngredientId;
  name: string;
  emoji: string;
  categoryId: CategoryId;
  unit: string;
  staple?: boolean;
}

export interface RecipeIngredient {
  ingredientId: IngredientId;
  amount: number;
}

export interface Recipe {
  id: RecipeId;
  name: string;
  dishEmoji: string;
  ingredients: RecipeIngredient[];
  steps: string[];
}

export interface Category {
  id: CategoryId;
  name: string;
}

export interface ShoppingItem {
  ingredientId: IngredientId;
  amount: number;
  fromRecipeId: RecipeId | null;
}

/** Held amount per ingredient. Absent means zero. Derived from lots. */
export type Stock = Record<IngredientId, number>;

/**
 * One batch of an ingredient in the fridge.
 *
 * Amounts are in the ingredient's own unit for now. `expiresAt` is a date
 * (`YYYY-MM-DD`) or null when nothing is known; `addedAt` is a full timestamp
 * so the oldest batch is used first when expiry ties.
 */
export interface StockLot {
  id: string;
  ingredientId: IngredientId;
  amount: number;
  expiresAt: string | null;
  addedAt: string;
}

export type ExpiryStatus = 'none' | 'later' | 'soon' | 'expired';

export interface KitchenState {
  /** The payload version. v1 carried a bare `stock` map instead of lots. */
  schemaVersion: number;
  categories: Category[];
  stockLots: StockLot[];
  shoppingList: ShoppingItem[];
}

/** The counts the data panel and import confirmation show. */
export interface StateSummary {
  categories: number;
  ingredients: number;
  shoppingList: number;
}

export interface ScoredRecipe {
  recipe: Recipe;
  have: number;
  missing: number;
  total: number;
  score: number;
  /** fit × length bias; only present on ranked recommendations. */
  rank?: number;
}

export interface CategoryGroup {
  category: Category;
  items: Ingredient[];
}

export interface Deduction {
  ingredientId: IngredientId;
  removed: number;
  before: number;
  after: number;
}

export interface CombineAnimationSpec {
  dishEmoji: string;
  flying: Ingredient[];
}

/** The versioned wrapper written by export and read by import. */
export interface ExportEnvelope {
  app: string;
  format: 'kitchen';
  schemaVersion: number;
  exportedAt: string;
  summary: StateSummary;
  state: KitchenState;
}

export type ImportResult =
  | {
      ok: true;
      state: KitchenState;
      schemaVersion: number;
      legacy: boolean;
      summary: StateSummary;
    }
  | { ok: false; error: string };
