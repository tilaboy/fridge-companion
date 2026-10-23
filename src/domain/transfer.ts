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
import { getIngredient, getRecipe, isStaple } from './catalog';
import { isValidAmount } from './amount';
import { confirmCategories, ensureCategories } from './categories';
import { normalizeExpiry } from './lots';
import { cloneState, createState, isEmptyKitchen, summarizeState } from './state';
import type {
  ExportEnvelope,
  ImportResult,
  KitchenState,
  ShoppingItem,
  StockLot,
} from './types';

export const APP_ID = 'fridge-companion';
export const SCHEMA_VERSION = 2;

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
): StockLot[] {
  const lots: StockLot[] = [];
  const addedAt = now.toISOString();
  let index = 0;
  for (const ingredientId of Object.keys(stock)) {
    const amount = Number(stock[ingredientId]);
    // Staples were never tracked; drop any left by an earlier version.
    if (!isValidAmount(amount) || isStaple(catalog, ingredientId)) continue;
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

function sanitizeLots(
  catalog: Catalog,
  list: readonly unknown[],
  knownOnly: boolean,
  now: Date,
): StockLot[] {
  const lots: StockLot[] = [];
  const ids = new Set<string>();
  let index = 0;
  for (const raw of list) {
    const entry = asRecord(raw);
    if (!entry || typeof entry.ingredientId !== 'string') continue;
    const amount = Number(entry.amount);
    if (!isValidAmount(amount) || isStaple(catalog, entry.ingredientId)) continue;
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

  if (Array.isArray(record.stockLots)) {
    fresh.stockLots = sanitizeLots(catalog, record.stockLots, knownOnly, now);
  } else {
    const legacyStock = asRecord(record.stock);
    if (legacyStock) {
      fresh.stockLots = migrateStock(catalog, legacyStock, knownOnly, now);
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
          (!knownOnly || !!getIngredient(catalog, entry.ingredientId))
        );
      })
      .map((item): ShoppingItem => {
        let fromRecipeId = typeof item.fromRecipeId === 'string' ? item.fromRecipeId : null;
        if (knownOnly && fromRecipeId && !getRecipe(catalog, fromRecipeId)) {
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
  return JSON.stringify(a) === JSON.stringify(b);
}
