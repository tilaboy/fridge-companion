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
import { createState } from '../../src/domain/state';
import type { KitchenState } from '../../src/domain/types';
import { catalog } from '../fixtures';

function sampleKitchen(): KitchenState {
  const state = createState();
  state.categories = [{ id: 'produce', name: 'Produce' }];
  state.stock = { tomato: 2, egg: 6 };
  state.shoppingList = [{ ingredientId: 'onion', amount: 1, fromRecipeId: null }];
  return state;
}

describe('buildExport', () => {
  it('wraps the kitchen in a self-describing, versioned envelope', () => {
    const envelope = buildExport(sampleKitchen(), new Date('2026-10-23T12:00:00.000Z'));
    expect(envelope).toMatchObject({
      app: APP_ID,
      format: 'kitchen',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-10-23T12:00:00.000Z',
      summary: { categories: 1, ingredients: 2, shoppingList: 1 },
    });
  });

  it('detaches the exported state from the live one', () => {
    const state = sampleKitchen();
    const envelope = buildExport(state);
    envelope.state.stock.tomato = 99;
    expect(state.stock.tomato).toBe(2);
  });
});

describe('exportJson', () => {
  it('is valid JSON with a trailing newline', () => {
    const text = exportJson(sampleKitchen(), new Date('2026-10-23T12:00:00.000Z'));
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text).state.stock).toEqual({ tomato: 2, egg: 6 });
  });
});

describe('parseImportPayload', () => {
  it('round-trips an export', () => {
    const state = sampleKitchen();
    const result = parseImportPayload(catalog, exportJson(state));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.state).toEqual(state);
    expect(result.legacy).toBe(false);
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('accepts the POC’s bare v1 state and marks it legacy', () => {
    const raw = JSON.stringify({ categories: [], stock: { tomato: 3 }, shoppingList: [] });
    const result = parseImportPayload(catalog, raw);
    expect(result).toMatchObject({ ok: true, legacy: true, schemaVersion: 0 });
    if (result.ok) expect(result.state.stock).toEqual({ tomato: 3 });
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
      ['{"categories":[],"stock":{},"shoppingList":[]}', 'no stock'],
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
    expect(result.state.stock).toEqual({ tomato: 1 });
    // v1 never *generates* staples onto the list, but a hand-edited entry that
    // names a known ingredient survives sanitizing; parity keeps that for now.
    expect(result.state.shoppingList).toEqual([
      { ingredientId: 'onion', amount: 1, fromRecipeId: null },
      { ingredientId: 'salt', amount: 1, fromRecipeId: null },
    ]);
  });
});

describe('sanitizeState', () => {
  it('coerces numeric amounts and drops everything else', () => {
    const clean = sanitizeState(catalog, {
      categories: [{ id: 'pantry', name: ' Pantry ' }],
      stock: { tomato: '2', egg: 1.5, onion: -1, milk: 3 },
      shoppingList: [
        { ingredientId: 'onion', amount: '4', fromRecipeId: 7 },
        null,
        { ingredientId: 5, amount: 2 },
      ],
    });
    expect(clean.categories).toEqual([{ id: 'pantry', name: 'Pantry' }]);
    expect(clean.stock).toEqual({ tomato: 2 });
    expect(clean.shoppingList).toEqual([
      { ingredientId: 'onion', amount: 4, fromRecipeId: null },
    ]);
  });

  it('keeps unknown references on load but strips them on import', () => {
    const raw = { stock: { ghost: 2 }, shoppingList: [] };
    expect(sanitizeState(catalog, raw).stock).toEqual({ ghost: 2 });
    expect(sanitizeState(catalog, raw, { knownOnly: true }).stock).toEqual({});
  });

  it('never throws on hostile shapes', () => {
    for (const value of [null, undefined, 7, 'x', [], { stock: [] }, { stock: null }]) {
      expect(() => sanitizeState(catalog, value)).not.toThrow();
    }
  });
});

describe('cross-tab reconciliation', () => {
  it('adopts a stored kitchen, seeding categories when there are none', () => {
    const incoming = remoteStateFromRaw(catalog, JSON.stringify({ stock: { tomato: 1 } }));
    expect(incoming?.stock).toEqual({ tomato: 1 });
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
