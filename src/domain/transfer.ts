/* Export, import, and the two reconciliation helpers.
 *
 * Import is the one place stale or hostile data enters on purpose. It accepts
 * our versioned envelope and a bare v1 state (what the POC wrote to
 * `fdc-state-v1`), refuses everything else, and runs whatever survives through
 * sanitizeState so no import can produce a shape the rest of the app does not
 * expect.
 */
import type { Catalog } from './catalog';
import { getIngredient, getRecipe, isStaple } from './catalog';
import { isValidAmount } from './amount';
import { confirmCategories, ensureCategories } from './categories';
import {
  cloneState,
  createState,
  isEmptyKitchen,
  summarizeState,
} from './state';
import type {
  ExportEnvelope,
  ImportResult,
  KitchenState,
  ShoppingItem,
} from './types';

export const APP_ID = 'fridge-companion';
export const SCHEMA_VERSION = 1;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Drop everything that does not match the data model. `knownOnly` is for
 * imported files, where a reference to an ingredient or recipe this build does
 * not have is junk rather than something to keep.
 */
export function sanitizeState(
  catalog: Catalog,
  parsed: unknown,
  options: { knownOnly?: boolean } = {},
): KitchenState {
  const knownOnly = Boolean(options.knownOnly);
  const fresh = createState();
  const record = asRecord(parsed);
  if (!record) return fresh;

  if (Array.isArray(record.categories)) {
    fresh.categories = confirmCategories(record.categories);
  }

  const stock = asRecord(record.stock);
  if (stock) {
    for (const id of Object.keys(stock)) {
      const n = Number(stock[id]);
      // Staples are no longer tracked, so drop any left behind by an
      // earlier version of the app.
      if (!isValidAmount(n) || isStaple(catalog, id)) continue;
      if (knownOnly && !getIngredient(catalog, id)) continue;
      fresh.stock[id] = n;
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

  const envelope = hasOwn(record, 'state') || record.app === APP_ID || hasOwn(record, 'schemaVersion');
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
export function remoteStateFromRaw(catalog: Catalog, raw: string | null | undefined): KitchenState | null {
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
