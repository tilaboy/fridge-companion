/* Export, import, sanitizing, migration, and the reconciliation helpers.
 *
 * Import is the one place stale or hostile data enters on purpose. It accepts
 * our versioned envelope, a v1 envelope, and a bare v1 state (what the POC
 * wrote to `fdc-state-v1`), refuses everything else, and runs whatever survives
 * through `sanitizeState`. That function is also the migration: a v1 `stock`
 * map becomes a list of lots, and running it on an already-v2 kitchen is a
 * no-op apart from sanitizing.
 */
import type { Catalog } from './catalog';
import { getIngredient, getRecipe } from './catalog';
import { isValidAmount } from './amount';
import { confirmCategories, ensureCategories } from './categories';
import { sanitizeCustomIngredients, sanitizeCustomRecipes } from './custom';
import { normalizeExpiry } from './lots';
import { sanitizePreferences } from './preferences';
import { effectiveStapleIds } from './staples';
import { cloneState, createState, isEmptyKitchen, summarizeState } from './state';
import type {
  ExportEnvelope,
  ImportResult,
  Ingredient,
  KitchenState,
  Recipe,
  ShoppingItem,
  StockLot,
} from './types';

export const APP_ID = 'fridge-companion';
export const SCHEMA_VERSION = 5;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** v1's `{ ingredientId: amount }` becomes one lot per ingredient. */
function migrateStock(
  catalog: Catalog,
  stock: Record<string, unknown>,
  knownOnly: boolean,
  now: Date,
  staples: ReadonlySet<string>,
): StockLot[] {
  const lots: StockLot[] = [];
  const addedAt = now.toISOString();
  let index = 0;
  for (const ingredientId of Object.keys(stock)) {
    const amount = Number(stock[ingredientId]);
    // Staples were never tracked; drop any left by an earlier version.
    if (!isValidAmount(amount) || staples.has(ingredientId)) continue;
    if (knownOnly && !getIngredient(catalog, ingredientId)) continue;
    lots.push({
      id: 'migrated-' + ingredientId + '-' + index++,
      ingredientId,
      amount,
      expiresAt: null,
      addedAt,
    });
  }
  return lots;
}

/** Boolean-only overrides; unknown ids matter only to imports. */
function sanitizeStapleOverrides(
  catalog: Catalog,
  raw: unknown,
  knownOnly: boolean,
): Record<string, boolean> {
  const record = asRecord(raw);
  const out: Record<string, boolean> = {};
  if (!record) return out;
  for (const id of Object.keys(record)) {
    if (typeof record[id] !== 'boolean') continue;
    if (knownOnly && !getIngredient(catalog, id)) continue;
    out[id] = record[id];
  }
  return out;
}

function sanitizeLots(
  catalog: Catalog,
  list: readonly unknown[],
  knownOnly: boolean,
  now: Date,
  staples: ReadonlySet<string>,
): StockLot[] {
  const lots: StockLot[] = [];
  const ids = new Set<string>();
  let index = 0;
  for (const raw of list) {
    const entry = asRecord(raw);
    if (!entry || typeof entry.ingredientId !== 'string') continue;
    const amount = Number(entry.amount);
    if (!isValidAmount(amount) || staples.has(entry.ingredientId)) continue;
    if (knownOnly && !getIngredient(catalog, entry.ingredientId)) continue;

    let id =
      typeof entry.id === 'string' && entry.id !== '' && !ids.has(entry.id)
        ? entry.id
        : 'lot-' + entry.ingredientId + '-' + index;
    while (ids.has(id)) id += '-x';
    ids.add(id);

    const expiresAt = normalizeExpiry(entry.expiresAt);
    const addedAt =
      typeof entry.addedAt === 'string' && !Number.isNaN(Date.parse(entry.addedAt))
        ? entry.addedAt
        : now.toISOString();

    lots.push({ id, ingredientId: entry.ingredientId, amount, expiresAt, addedAt });
    index += 1;
  }
  return lots;
}

function mergeCatalog(
  catalog: Catalog,
  customIngredients: readonly Ingredient[],
  customRecipes: readonly Recipe[],
): Catalog {
  const ingredients = catalog.ingredients.concat(customIngredients);
  const recipes = catalog.recipes.concat(customRecipes);
  return {
    ingredients,
    recipes,
    ingredientById: new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    recipeById: new Map(recipes.map((recipe) => [recipe.id, recipe])),
    stapleIds: catalog.stapleIds,
  };
}

/**
 * Drop everything that does not match the data model, migrating v1 stock on
 * the way. `knownOnly` is for imported files, where a reference to an
 * ingredient or recipe this build does not have is junk rather than something
 * to keep.
 */
export function sanitizeState(
  catalog: Catalog,
  parsed: unknown,
  options: { knownOnly?: boolean; now?: Date } = {},
): KitchenState {
  const knownOnly = Boolean(options.knownOnly);
  const now = options.now ?? new Date();
  const fresh = createState();
  const record = asRecord(parsed);
  if (!record) return fresh;

  if (Array.isArray(record.categories)) {
    fresh.categories = confirmCategories(record.categories);
  }

  // Read staple choices before stock: a built-in staple the user unmarked
  // must keep its lots, while one they marked must lose them.
  fresh.stapleOverrides = sanitizeStapleOverrides(catalog, record.stapleOverrides, knownOnly);
  fresh.preferences = sanitizePreferences(record.preferences);

  // Custom definitions come before stock and recipes: lots, shopping refs,
  // and recipe ingredients all resolve against the merged tray.
  fresh.customIngredients = sanitizeCustomIngredients(
    catalog,
    record.customIngredients,
    fresh.categories,
  );
  fresh.customRecipes = sanitizeCustomRecipes(
    catalog,
    record.customRecipes,
    fresh.customIngredients,
  );
  const mergedCatalog = mergeCatalog(catalog, fresh.customIngredients, fresh.customRecipes);
  const staples = effectiveStapleIds(mergedCatalog, fresh);

  if (Array.isArray(record.stockLots)) {
    fresh.stockLots = sanitizeLots(mergedCatalog, record.stockLots, knownOnly, now, staples);
  } else {
    const legacyStock = asRecord(record.stock);
    if (legacyStock) {
      fresh.stockLots = migrateStock(mergedCatalog, legacyStock, knownOnly, now, staples);
    }
  }

  if (Array.isArray(record.shoppingList)) {
    fresh.shoppingList = record.shoppingList
      .filter((item): item is Record<string, unknown> => {
        const entry = asRecord(item);
        return (
          !!entry &&
          typeof entry.ingredientId === 'string' &&
          isValidAmount(Number(entry.amount)) &&
          (!knownOnly || !!getIngredient(mergedCatalog, entry.ingredientId))
        );
      })
      .map((item): ShoppingItem => {
        let fromRecipeId = typeof item.fromRecipeId === 'string' ? item.fromRecipeId : null;
        if (knownOnly && fromRecipeId && !getRecipe(mergedCatalog, fromRecipeId)) {
          fromRecipeId = null;
        }
        return {
          ingredientId: item.ingredientId as string,
          amount: Number(item.amount),
          fromRecipeId,
        };
      });
  }

  return fresh;
}

export function buildExport(state: KitchenState, now?: Date): ExportEnvelope {
  const at = now instanceof Date ? now : new Date();
  return {
    app: APP_ID,
    format: 'kitchen',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: at.toISOString(),
    summary: summarizeState(state),
    state: cloneState(state),
  };
}

export function exportJson(state: KitchenState, now?: Date): string {
  return JSON.stringify(buildExport(state, now), null, 2) + '\n';
}

function looksLikeKitchen(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  return (
    Array.isArray(record.categories) ||
    !!asRecord(record.preferences) ||
    Array.isArray(record.customIngredients) ||
    Array.isArray(record.customRecipes) ||
    Array.isArray(record.stockLots) ||
    !!asRecord(record.stock) ||
    Array.isArray(record.shoppingList)
  );
}

export function parseImportPayload(catalog: Catalog, text: unknown): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const record = asRecord(parsed);
  if (!record) {
    return { ok: false, error: 'That file does not contain a kitchen.' };
  }

  const envelope = hasOwn(record, 'state') || record.app === APP_ID;
  let raw: unknown = record;
  let version = 0;

  if (envelope) {
    if (record.app !== undefined && record.app !== APP_ID) {
      return { ok: false, error: 'That file belongs to a different app.' };
    }
    version = Number(record.schemaVersion);
    if (!Number.isFinite(version) || version < 1) {
      return { ok: false, error: 'That file has no readable schema version.' };
    }
    if (version > SCHEMA_VERSION) {
      return {
        ok: false,
        error: 'That file was made by a newer version of the app. Update before importing it.',
      };
    }
    raw = record.state;
  }

  if (!looksLikeKitchen(raw)) {
    return {
      ok: false,
      error: 'That file does not look like a Fridge Door Companion kitchen.',
    };
  }

  const clean = sanitizeState(catalog, raw, { knownOnly: true });
  if (isEmptyKitchen(clean)) {
    return {
      ok: false,
      error: 'That file has no stock, categories, or shopping list to import.',
    };
  }
  return {
    ok: true,
    state: clean,
    schemaVersion: version,
    legacy: !envelope,
    summary: summarizeState(clean),
  };
}

/**
 * Cross-tab adoption: re-read the stored kitchen rather than trusting a
 * BroadcastChannel payload. Null means "unreadable", which the caller reports
 * instead of replacing the local kitchen with nothing.
 */
export function remoteStateFromRaw(
  catalog: Catalog,
  raw: string | null | undefined,
): KitchenState | null {
  if (raw === null || raw === undefined) return ensureCategories(createState());
  try {
    return ensureCategories(sanitizeState(catalog, JSON.parse(String(raw))));
  } catch {
    return null;
  }
}

export function sameState(a: KitchenState, b: KitchenState): boolean {
  if (a === b) return true;
  // Override maps are unordered, so compare their keys in a stable order.
  const overrides = (state: KitchenState) => {
    const source = state.stapleOverrides ?? {};
    const sorted: Record<string, boolean> = {};
    for (const id of Object.keys(source).sort()) sorted[id] = source[id]!;
    return { ...state, stapleOverrides: sorted };
  };
  return JSON.stringify(overrides(a)) === JSON.stringify(overrides(b));
}
