/* Shared fixtures: the real built-in data, and the v1 app loaded as a
 * CommonJS module for parity checks.
 *
 * The package is deliberately not `"type": "module"`: `app.js`, the data
 * files, and the `verify/` harnesses are classic scripts, and the harnesses
 * `require()` them. TypeScript sources are ESM and are only ever loaded
 * through Vitest/Vite, which does not care about the package type.
 */
import { createRequire } from 'node:module';
import { createCatalog } from '../src/domain/catalog';
import type { Ingredient, Recipe } from '../src/domain/types';

const require = createRequire(import.meta.url);

export const ingredients = require('../data/ingredients.js') as Ingredient[];
export const recipes = require('../data/recipes.js') as Recipe[];
export const catalog = createCatalog(ingredients, recipes);

/** The subset of `app.js`'s exported API the parity suite touches. */
export interface LegacyApi {
  STORAGE_KEY: string;
  APP_ID: string;
  SCHEMA_VERSION: number;
  SEEDED_CATEGORIES: unknown[];
  createState(): unknown;
  cloneState(state: unknown): unknown;
  parseAmount(raw: unknown): number | null;
  isValidAmount(n: unknown): boolean;
  addToStock(state: unknown, id: string, amount: number): unknown;
  confirmCategories(chosen: unknown[]): unknown;
  ensureCategories(state: unknown): unknown;
  groupTrayByCategory(categories: unknown[]): unknown;
  getIngredient(id: string): unknown;
  isStaple(id: string): boolean;
  summarizeState(state: unknown): unknown;
  isEmptyKitchen(state: unknown): boolean;
  buildExport(state: unknown, now?: Date): unknown;
  exportJson(state: unknown, now?: Date): string;
  parseImportPayload(text: string): unknown;
  remoteStateFromRaw(raw: string | null | undefined): unknown;
  sameState(a: unknown, b: unknown): boolean;
  sanitizeState(parsed: unknown, options?: { knownOnly?: boolean }): unknown;
  scoreRecipe(recipe: unknown, stock: unknown): unknown;
  LENGTH_BONUS: number;
  lengthMultiplier(total: number): number;
  recommend(state: unknown, list?: unknown[]): unknown;
  missingIngredients(state: unknown, recipe: unknown): unknown;
  cookRecipe(state: unknown, recipe: unknown): unknown;
  cookDeductions(state: unknown, recipe: unknown): unknown;
  addToShoppingList(state: unknown, recipe: unknown): unknown;
  buyShoppingListItem(state: unknown, id: string): unknown;
  combineAnimationSpec(recipe: unknown, ids: string[]): unknown;
  clearStoredKitchen(storage: { removeItem(key: string): void } | null): boolean;
}

let cached: LegacyApi | null = null;

export function loadLegacy(): LegacyApi {
  if (cached) return cached;
  (globalThis as Record<string, unknown>).FDC_INGREDIENTS = ingredients;
  (globalThis as Record<string, unknown>).FDC_RECIPES = recipes;
  cached = require('../app.js') as LegacyApi;
  return cached;
}
