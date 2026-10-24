import { describe, expect, it } from 'vitest';
import {
  APP_ID,
  SCHEMA_VERSION,
  buildExport,
  exportJson,
  parseImportPayload,
  remoteStateFromRaw,
  sameState,
  sanitizeState,
} from '../../src/domain/transfer';
import { clearStoredKitchen, STORAGE_KEY } from '../../src/domain/storage';
import { stockTotals } from '../../src/domain/lots';
import type { KitchenState } from '../../src/domain/types';
import { catalog } from '../fixtures';
import { kitchenWithStock } from '../stock';

function sampleKitchen(): KitchenState {
  const state = kitchenWithStock({ tomato: 2, egg: 6 });
  state.categories = [{ id: 'produce', name: 'Produce' }];
  state.preferences = {
    diet: 'vegan',
    allergens: ['gluten', 'soy'],
    maxTimeMinutes: 20,
    meal: 'dinner',
  };
  state.shoppingList = [{ ingredientId: 'onion', amount: 1, fromRecipeId: null }];
  state.cookHistory = [{
    id: 'cook-sample',
    recipeId: 'scrambled_eggs',
    cookedAt: '2026-10-20T12:00:00.000Z',
    servings: 4,
  }];
  return state;
}

const NOW = new Date('2026-10-23T12:00:00.000Z');

describe('buildExport', () => {
  it('wraps the kitchen in a self-describing, versioned envelope', () => {
    const envelope = buildExport(sampleKitchen(), NOW);
    expect(envelope).toMatchObject({
      app: APP_ID,
      format: 'kitchen',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-10-23T12:00:00.000Z',
      summary: { categories: 1, ingredients: 2, shoppingList: 1 },
    });
    expect(envelope.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(envelope.state.stockLots).toHaveLength(2);
  });

  it('detaches the exported state from the live one', () => {
    const state = sampleKitchen();
    const envelope = buildExport(state);
    envelope.state.stockLots[0]!.amount = 99;
    envelope.state.categories[0]!.name = 'Changed';
    envelope.state.preferences.allergens.push('sesame');
    envelope.state.cookHistory[0]!.servings = 8;
    expect(state.stockLots[0]!.amount).toBe(2);
    expect(state.categories[0]!.name).toBe('Produce');
    expect(state.preferences.allergens).toEqual(['gluten', 'soy']);
    expect(state.cookHistory[0]!.servings).toBe(4);
  });
});

describe('exportJson', () => {
  it('is valid JSON with a trailing newline and v7 lots', () => {
    const text = exportJson(sampleKitchen(), NOW);
    expect(text.endsWith('\n')).toBe(true);
    const state = JSON.parse(text).state;
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stockTotals(state.stockLots)).toEqual({ tomato: 2, egg: 6 });
  });
});

describe('parseImportPayload', () => {
  it('round-trips an export, expiry, preferences, and cook history', () => {
    const state = kitchenWithStock({ tomato: 2, egg: 6 }, {
      expiresAt: { tomato: '2026-10-30' },
    });
    state.preferences = {
      diet: 'vegan',
      allergens: ['soy', 'gluten'],
      maxTimeMinutes: 30,
      meal: 'lunch',
    };
    state.cookHistory = [{
      id: 'cook-round-trip',
      recipeId: 'scrambled_eggs',
      cookedAt: '2026-10-22T12:00:00.000Z',
      servings: 4,
    }];
    const result = parseImportPayload(catalog, exportJson(state, NOW));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.state).toEqual(state);
    expect(result.legacy).toBe(false);
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.state.preferences).toEqual(state.preferences);
    expect(result.state.cookHistory).toEqual(state.cookHistory);
    expect(result.state.stockLots.find((lot) => lot.ingredientId === 'tomato')?.expiresAt)
      .toBe('2026-10-30');
  });

  it('accepts the POC’s bare v1 state and migrates the stock map to lots', () => {
    const raw = JSON.stringify({ categories: [], stock: { tomato: 3 }, shoppingList: [] });
    const result = parseImportPayload(catalog, raw);
    expect(result).toMatchObject({ ok: true, legacy: true, schemaVersion: 0 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stockTotals(result.state.stockLots)).toEqual({ tomato: 3 });
    expect(result.state.stockLots[0]).toMatchObject({ expiresAt: null });
  });

  it('accepts a v1 envelope and migrates it too', () => {
    const raw = JSON.stringify({
      app: APP_ID,
      format: 'kitchen',
      schemaVersion: 1,
      state: { categories: [], stock: { egg: 4 }, shoppingList: [] },
    });
    const result = parseImportPayload(catalog, raw);
    expect(result).toMatchObject({ ok: true, schemaVersion: 1, legacy: false });
    if (!result.ok) throw new Error(result.error);
    expect(stockTotals(result.state.stockLots)).toEqual({ egg: 4 });
  });

  it('refuses invalid JSON, non-objects, foreign apps, newer schemas, and empty kitchens', () => {
    const cases: [string, string][] = [
      ['{ not json', 'not valid JSON'],
      ['[]', 'does not contain a kitchen'],
      ['null', 'does not contain a kitchen'],
      ['{"app":"other","schemaVersion":1,"state":{}}', 'different app'],
      ['{"app":"fridge-companion","state":{}}', 'no readable schema version'],
      [`{"app":"fridge-companion","schemaVersion":${SCHEMA_VERSION + 1},"state":{"stock":{"tomato":1}}}`, 'newer version'],
      ['{"hello":"world"}', 'does not look like'],
      ['{"cookHistory":[{"recipeId":"scrambled_eggs","cookedAt":"2026-10-20T00:00:00.000Z"}]}', 'does not look like'],
      ['{"categories":[],"stock":{},"shoppingList":[]}', 'no kitchen data'],
      ['{"categories":[],"stockLots":[],"shoppingList":[]}', 'no kitchen data'],
    ];
    for (const [text, fragment] of cases) {
      const result = parseImportPayload(catalog, text);
      expect(result.ok, text).toBe(false);
      if (!result.ok) expect(result.error).toContain(fragment);
    }
  });

  it('drops unknown references and staple stock from an import', () => {
    const raw = JSON.stringify({
      categories: [{ id: 'produce', name: 'Produce' }],
      stock: { ghost: 2, salt: 100, tomato: 1, bad: 0 },
      shoppingList: [
        { ingredientId: 'onion', amount: 1, fromRecipeId: 'ghost_recipe' },
        { ingredientId: 'salt', amount: 1 },
        { ingredientId: 'ghost', amount: 1 },
      ],
    });
    const result = parseImportPayload(catalog, raw);
    if (!result.ok) throw new Error(result.error);
    expect(stockTotals(result.state.stockLots)).toEqual({ tomato: 1 });
    // v1 never *generates* staples onto the list, but a hand-edited entry that
    // names a known ingredient survives sanitizing.
    expect(result.state.shoppingList).toEqual([
      { ingredientId: 'onion', amount: 1, fromRecipeId: null },
      { ingredientId: 'salt', amount: 1, fromRecipeId: null },
    ]);
  });
});

describe('sanitizeState', () => {
  it('migrates v1 stock and coerces numeric amounts', () => {
    const clean = sanitizeState(catalog, {
      categories: [{ id: 'pantry', name: ' Pantry ' }],
      stock: { tomato: '2', egg: 1.5, onion: -1, milk: 3 },
      shoppingList: [
        { ingredientId: 'onion', amount: '4', fromRecipeId: 7 },
        null,
        { ingredientId: 5, amount: 2 },
      ],
    }, { now: NOW });
    expect(clean.categories).toEqual([{ id: 'pantry', name: 'Pantry' }]);
    expect(stockTotals(clean.stockLots)).toEqual({ tomato: 2, egg: 1.5 });
    expect(clean.shoppingList).toEqual([
      { ingredientId: 'onion', amount: 4, fromRecipeId: null },
    ]);
  });

  it('gives every migrated lot a deterministic id and the same arrival time', () => {
    const clean = sanitizeState(catalog, {
      stock: { tomato: 2, ghost: 1 },
    }, { now: NOW });
    expect(clean.stockLots).toEqual([
      {
        id: 'migrated-tomato-0',
        ingredientId: 'tomato',
        amount: 2,
        expiresAt: null,
        addedAt: NOW.toISOString(),
      },
      {
        id: 'migrated-ghost-1',
        ingredientId: 'ghost',
        amount: 1,
        expiresAt: null,
        addedAt: NOW.toISOString(),
      },
    ]);
  });

  it('is idempotent: migrating an already-migrated kitchen changes nothing', () => {
    const first = sanitizeState(catalog, {
      categories: [{ id: 'produce', name: 'Produce' }],
      stock: { tomato: 2, egg: 6 },
      shoppingList: [{ ingredientId: 'onion', amount: 1 }],
    }, { now: NOW });
    const second = sanitizeState(catalog, first);
    expect(second).toEqual(first);
  });

  it('keeps valid lots, expiry, and ids; repairs or drops the rest', () => {
    const clean = sanitizeState(catalog, {
      stockLots: [
        {
          id: 'keep',
          ingredientId: 'tomato',
          amount: '2',
          expiresAt: '2026-10-30T12:00:00.000Z',
          addedAt: '2026-10-01T00:00:00.000Z',
        },
        { id: 'keep', ingredientId: 'egg', amount: 3, expiresAt: 'not a date' },
        { ingredientId: 'ghost', amount: 1, expiresAt: '2026-02-31' },
        { ingredientId: 'salt', amount: 1 },
        { ingredientId: 'onion', amount: 0 },
        null,
      ],
    }, { now: NOW });
    expect(clean.stockLots).toEqual([
      {
        id: 'keep',
        ingredientId: 'tomato',
        amount: 2,
        expiresAt: '2026-10-30',
        addedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'lot-egg-1',
        ingredientId: 'egg',
        amount: 3,
        expiresAt: null,
        addedAt: NOW.toISOString(),
      },
      {
        id: 'lot-ghost-2',
        ingredientId: 'ghost',
        amount: 1,
        expiresAt: null,
        addedAt: NOW.toISOString(),
      },
    ]);
  });

  it('keeps unknown references on load but strips them on import', () => {
    const raw = { stockLots: [{ ingredientId: 'ghost', amount: 2 }] };
    expect(stockTotals(sanitizeState(catalog, raw).stockLots)).toEqual({ ghost: 2 });
    expect(sanitizeState(catalog, raw, { knownOnly: true }).stockLots).toEqual([]);
  });

  it('keeps valid food preferences and drops invalid ones', () => {
    const clean = sanitizeState(catalog, {
      preferences: {
        diet: 'vegan',
        allergens: ['soy', 'ghost', 'soy', 'gluten'],
        maxTimeMinutes: 20,
        meal: 'dinner',
      },
    });
    expect(clean.preferences).toEqual({
      diet: 'vegan',
      allergens: ['soy', 'gluten'],
      maxTimeMinutes: 20,
      meal: 'dinner',
    });

    const repaired = sanitizeState(catalog, {
      preferences: { diet: 'keto', allergens: 'soy', maxTimeMinutes: -1, meal: 'brunch' },
    });
    expect(repaired.preferences).toEqual({
      diet: null,
      allergens: [],
      maxTimeMinutes: null,
      meal: null,
    });
  });

  it('loads a schema 4 kitchen with time and meal filters off', () => {
    const clean = sanitizeState(catalog, {
      schemaVersion: 4,
      stockLots: [{ ingredientId: 'tomato', amount: 1 }],
    });
    expect(clean.preferences).toEqual({
      diet: null,
      allergens: [],
      maxTimeMinutes: null,
      meal: null,
    });
  });

  it('keeps schema 4 custom recipes without time or meal metadata as unknown', () => {
    const clean = sanitizeState(catalog, {
      schemaVersion: 4,
      customRecipes: [{
        name: 'Old Recipe',
        ingredients: [{ ingredientId: 'tomato', amount: 1 }],
        steps: ['Cook.'],
      }],
    });
    expect(clean.customRecipes).toHaveLength(1);
    expect(clean.customRecipes[0]!.servings).toBe(2);
    expect(clean.customRecipes[0]!.timeMinutes).toBeUndefined();
    expect(clean.customRecipes[0]!.mealTypes).toBeUndefined();
  });

  it('loads a schema 6 kitchen with an empty cook history', () => {
    const clean = sanitizeState(catalog, {
      schemaVersion: 6,
      stockLots: [{ ingredientId: 'tomato', amount: 1 }],
    }, { now: NOW });
    expect(clean.schemaVersion).toBe(SCHEMA_VERSION);
    expect(clean.cookHistory).toEqual([]);
  });

  it('repairs cook history on import and drops unknown or future events', () => {
    const clean = sanitizeState(catalog, {
      cookHistory: [
        { id: 'a', recipeId: 'scrambled_eggs', cookedAt: '2026-10-22T12:00:00.000Z', servings: 4 },
        { id: 'a', recipeId: 'scrambled_eggs', cookedAt: '2026-10-21T12:00:00.000Z', servings: '2' },
        { id: 'bad-servings', recipeId: 'scrambled_eggs', cookedAt: '2026-10-20T12:00:00.000Z', servings: 99 },
        { recipeId: 'ghost', cookedAt: '2026-10-23T12:00:00.000Z', servings: 2 },
        { recipeId: 'scrambled_eggs', cookedAt: 'not a date', servings: 2 },
        { recipeId: 'scrambled_eggs', cookedAt: '2026-10-26T12:00:00.000Z', servings: 2 },
      ],
    }, { knownOnly: true, now: NOW });
    expect(clean.cookHistory).toEqual([
      { id: 'bad-servings', recipeId: 'scrambled_eggs', cookedAt: '2026-10-20T12:00:00.000Z', servings: 2 },
      { id: 'a-x', recipeId: 'scrambled_eggs', cookedAt: '2026-10-21T12:00:00.000Z', servings: 2 },
      { id: 'a', recipeId: 'scrambled_eggs', cookedAt: '2026-10-22T12:00:00.000Z', servings: 4 },
    ]);
  });

  it('never throws on hostile shapes', () => {
    for (const value of [null, undefined, 7, 'x', [], { stock: [] }, { stock: null }, { stockLots: 'x' }]) {
      expect(() => sanitizeState(catalog, value)).not.toThrow();
    }
  });
});

describe('cross-tab reconciliation', () => {
  it('adopts a stored kitchen, migrating v1 stock and seeding categories', () => {
    const incoming = remoteStateFromRaw(catalog, JSON.stringify({ stock: { tomato: 1 } }));
    expect(incoming && stockTotals(incoming.stockLots)).toEqual({ tomato: 1 });
    expect(incoming?.categories).toHaveLength(5);
  });

  it('treats no stored value as a fresh first visit', () => {
    expect(remoteStateFromRaw(catalog, null)?.categories).toHaveLength(5);
  });

  it('returns null for unreadable storage instead of wiping the kitchen', () => {
    expect(remoteStateFromRaw(catalog, '{oops')).toBeNull();
  });

  it('compares by value', () => {
    expect(sameState(sampleKitchen(), sampleKitchen())).toBe(true);
  });
});

describe('clearStoredKitchen', () => {
  it('clears only this app’s key', () => {
    const data: Record<string, string> = { [STORAGE_KEY]: '{}', other: 'keep' };
    expect(
      clearStoredKitchen({ removeItem: (key) => { delete data[key]; } }),
    ).toBe(true);
    expect(data).toEqual({ other: 'keep' });
  });

  it('reports failure when storage is missing or refuses', () => {
    expect(clearStoredKitchen(null)).toBe(false);
    expect(clearStoredKitchen({ removeItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});
