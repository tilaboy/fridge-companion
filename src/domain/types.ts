/* The kitchen's data model, as plain data.
 *
 * Everything here is structural: no classes, no methods, no DOM. The same
 * values survive JSON round-trips unchanged, which is what makes export,
 * import, and cross-tab sync trustworthy.
 */

export type IngredientId = string;
export type RecipeId = string;
export type CategoryId = string;

/** A unit the app can read and convert. Canonical units are g, ml, and the
 * count units; kg/l are accepted at the edge and stored as their base. */
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pcs' | 'cloves' | 'slices' | 'bunch';

/** The common allergens this app can filter on. */
export type Allergen =
  | 'dairy'
  | 'egg'
  | 'fish'
  | 'shellfish'
  | 'soy'
  | 'gluten'
  | 'peanut'
  | 'tree-nut'
  | 'sesame';

/** Diets are hard constraints, not ranking preferences. */
export type Diet = 'vegetarian' | 'vegan' | 'pescatarian';

/** Coarse meal slots. A recipe may fit more than one. */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * One coarse food class per ingredient. It is enough to decide the supported
 * diets without pretending to be a nutrition database. `unknown` is a
 * deliberate fail-closed value: recipes using it are hidden while a diet
 * filter is active.
 */
export type DietClass = 'plant' | 'dairy' | 'egg' | 'honey' | 'fish' | 'meat' | 'unknown';

/** A built-in tray ingredient. Staples are assumed always on hand. */
export interface Ingredient {
  id: IngredientId;
  name: string;
  emoji: string;
  categoryId: CategoryId;
  /** The canonical unit: every lot and recipe amount is stored in this. */
  unit: Unit;
  /** Grams per millilitre, when mass and volume are interchangeable. */
  densityGPerMl?: number;
  staple?: boolean;
  /**
   * Diet class. Absent or `unknown` means the app must not guess; recipes
   * using this ingredient are hidden while a diet filter is active.
   */
  dietClass?: DietClass;
  /**
   * Known allergens. `undefined` means unknown (hidden while any allergen
   * filter is active); an empty array means "none of the listed allergens".
   * Dairy/egg/fish are also derived from `dietClass`, so a missing checkbox
   * cannot make a known animal ingredient look safe.
   */
  allergens?: Allergen[];
}

export interface RecipeIngredient {
  ingredientId: IngredientId;
  amount: number;
}

/** How a built-in recipe entered the collection. */
export type RecipeSourceKind = 'original' | 'public-domain' | 'licensed';

/**
 * Provenance and licensing for a built-in recipe.
 *
 * Custom recipes are authored by the kitchen itself, so they leave this absent;
 * import sanitization deliberately ignores any `source` field on a custom
 * recipe rather than letting an imported file claim someone else's provenance.
 */
export interface RecipeSource {
  kind: RecipeSourceKind;
  author: string;
  /** SPDX identifier or a short, human-readable license name. */
  license: string;
  /** Where the source text or license can be found, when there is one. */
  url?: string;
}

export interface Recipe {
  id: RecipeId;
  name: string;
  dishEmoji: string;
  /**
   * Base yield in servings. Absent means the legacy default (2), so recipes
   * imported from schema 5 and earlier still scale from a sensible amount.
   */
  servings?: number;
  /**
   * Total cooking time in minutes. Absent means unknown: the recipe is hidden
   * while a time-budget filter is active.
   */
  timeMinutes?: number;
  /**
   * Meal slots this recipe suits. Absent means unknown: the recipe is hidden
   * while a meal filter is active. An empty array means "no declared slot".
   */
  mealTypes?: MealType[];
  /**
   * Recorded provenance for a built-in recipe. Absent means the kitchen wrote
   * it itself, or that it arrived from an older/imported source with no
   * provenance. Provenance never affects filtering or ranking.
   */
  source?: RecipeSource;
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

/** One successful "Cook this" commit, kept for repetition avoidance. */
export interface CookEvent {
  id: string;
  recipeId: RecipeId;
  /** ISO timestamp. */
  cookedAt: string;
  /** The yield that was cooked, after any scaling in the recipe view. */
  servings: number;
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

export interface Preferences {
  /** One hard diet constraint; null means no diet filter. */
  diet: Diet | null;
  /** Every selected allergen is a hard exclusion. */
  allergens: Allergen[];
  /** Maximum total cooking time in minutes; null means no time filter. */
  maxTimeMinutes: number | null;
  /** One meal slot; null means no meal filter. */
  meal: MealType | null;
}

export interface KitchenState {
  /** The payload version. v1 carried a bare `stock` map instead of lots. */
  schemaVersion: number;
  categories: Category[];
  /** Hard food-safety and diet filters chosen by this kitchen. */
  preferences: Preferences;
  /** Tray ingredients the kitchen added itself. Sanitized and de-duplicated. */
  customIngredients: Ingredient[];
  /** Recipes the kitchen added itself. References resolve against the tray. */
  customRecipes: Recipe[];
  stockLots: StockLot[];
  shoppingList: ShoppingItem[];
  /**
   * Successful cooks, oldest first and capped. Used only to de-prioritize
   * repetition; it is never a hard filter and never hides a recipe.
   */
  cookHistory: CookEvent[];
  /**
   * Per-kitchen staple choices, layered over the tray defaults.
   *
   * Absent (or unmentioned) means "use the ingredient's built-in default".
   * `true` marks a normally tracked ingredient as assumed on hand; `false`
   * turns a built-in staple back into something to track. Stored with the
   * kitchen so export, import, and cross-tab sync carry it.
   */
  stapleOverrides: Record<IngredientId, boolean>;
}

/** The counts the data panel and import confirmation show. */
export interface StateSummary {
  categories: number;
  ingredients: number;
  shoppingList: number;
}

/** The freshness signal considered when ranking a recommendation. */
export interface ExpirySignal {
  /** The ingredient whose date drove the weight, or null when no date applies. */
  ingredientId: IngredientId | null;
  expiresAt: string | null;
  status: ExpiryStatus;
  /** 1 when freshness does not affect the order; >1 soon, <1 expired. */
  multiplier: number;
}

/** The repetition signal considered when ranking a recommendation. */
export interface CookSignal {
  lastCookedAt: string;
  /** Whole or fractional days since the latest cook. */
  daysSince: number;
  /** 1 when the cook is too old to matter; <1 while it is recent. */
  multiplier: number;
}

export interface ScoredRecipe {
  recipe: Recipe;
  have: number;
  missing: number;
  total: number;
  score: number;
  /** fit × length bias × freshness × recency; only present on ranked picks. */
  rank?: number;
  /** The freshness signal behind the rank; only present on ranked picks. */
  expiry?: ExpirySignal;
  /** The repetition signal behind the rank; only present when recent. */
  cook?: CookSignal;
  /** One deterministic line explaining the card's place in the list. */
  explanation?: string;
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
