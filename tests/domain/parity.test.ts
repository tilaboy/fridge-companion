/* Parity between the typed domain and the v1 app it was extracted from.
 *
 * While the browser still runs `app.js`, this suite is the proof that the two
 * implementations have not drifted: every exported pure function is fed the
 * same inputs and must return the same values. It retires when the UI imports
 * the domain directly and `app.js` stops carrying a second copy.
 */
import { describe, expect, it } from 'vitest';
import * as domain from '../../src/domain/index';
import type { Ingredient, KitchenState, Recipe } from '../../src/domain/types';
import { catalog, ingredients, loadLegacy, recipes } from '../fixtures';

const legacy = loadLegacy();

function kitchen(stock: Record<string, number> = {}, shoppingList: KitchenState['shoppingList'] = []): KitchenState {
  const state = domain.createState();
  state.categories = [{ id: 'produce', name: 'Produce' }];
  state.stock = stock;
  state.shoppingList = shoppingList;
  return state;
}

const stocks: Record<string, number>[] = [
  {},
  { tomato: 1 },
  { tomato: 6, egg: 3, onion: 2, pasta: 500 },
  { milk: 1, flour: 1000, salt: 5 }, // staples only
  Object.fromEntries(
    ingredients.filter((i: Ingredient) => !i.staple).map((i: Ingredient) => [i.id, 100]),
  ),
];

const amountInputs = [null, undefined, '', '   ', '3', ' 4 ', '2.5', 'abc', 'Infinity', 0, 7, true, '1e3', '-2'];

describe('parity: constants and state helpers', () => {
  it('agrees on keys and seed data', () => {
    expect(domain.STORAGE_KEY).toBe(legacy.STORAGE_KEY);
    expect(domain.APP_ID).toBe(legacy.APP_ID);
    expect(domain.SCHEMA_VERSION).toBe(legacy.SCHEMA_VERSION);
    expect(domain.LENGTH_BONUS).toBe(legacy.LENGTH_BONUS);
    expect(domain.SEEDED_CATEGORIES).toEqual(legacy.SEEDED_CATEGORIES);
  });

  it('agrees on fresh, cloned, seeded, summarized, and empty states', () => {
    expect(domain.createState()).toEqual(legacy.createState());

    const state = kitchen({ tomato: 2 }, [{ ingredientId: 'onion', amount: 1, fromRecipeId: null }]);
    expect(domain.cloneState(state)).toEqual(legacy.cloneState(state));

    const bare = domain.createState();
    expect(domain.ensureCategories(bare)).toEqual(legacy.ensureCategories(bare));

    expect(domain.summarizeState(state)).toEqual(legacy.summarizeState(state));
    expect(domain.isEmptyKitchen(state)).toBe(legacy.isEmptyKitchen(state));
    expect(domain.isEmptyKitchen(domain.createState())).toBe(legacy.isEmptyKitchen(legacy.createState()));

    expect(domain.addToStock(state, 'tomato', 3)).toEqual(legacy.addToStock(state, 'tomato', 3));
  });

  it('agrees on amount parsing and validation', () => {
    for (const raw of amountInputs) {
      expect(domain.parseAmount(raw), String(raw)).toBe(legacy.parseAmount(raw));
      expect(domain.isValidAmount(raw), String(raw)).toBe(legacy.isValidAmount(raw));
    }
  });

  it('agrees on category confirmation', () => {
    const chosen = [
      { id: 'produce', name: '  Produce  ' },
      { id: 'produce', name: 'Dup' },
      { id: '', name: 'No id' },
      { id: 'dairy', name: '   ' },
      null,
      'pantry',
      { id: 'pantry', name: 'Pantry' },
    ];
    expect(domain.confirmCategories(chosen)).toEqual(legacy.confirmCategories(chosen));
  });

  it('agrees on tray grouping, including the trailing Other', () => {
    const subsets = [
      domain.SEEDED_CATEGORIES,
      [{ id: 'produce', name: 'Produce' }],
      [{ id: 'pantry', name: 'Pantry' }, { id: 'produce', name: 'Produce' }],
      [{ id: 'unknown', name: 'Unknown' }],
    ];
    for (const categories of subsets) {
      expect(
        domain.groupTrayByCategory(catalog, categories),
        JSON.stringify(categories),
      ).toEqual(legacy.groupTrayByCategory(categories as unknown[]));
    }
  });
});

describe('parity: recommendation', () => {
  it('agrees on every recipe and stock scenario', () => {
    for (const stock of stocks) {
      for (const recipe of recipes) {
        expect(
          domain.scoreRecipe(catalog, recipe, stock),
          recipe.id + ' ' + JSON.stringify(stock),
        ).toEqual(legacy.scoreRecipe(recipe, stock));
        expect(
          domain.missingIngredients(catalog, kitchen(stock), recipe),
          recipe.id + ' ' + JSON.stringify(stock),
        ).toEqual(legacy.missingIngredients(kitchen(stock), recipe));
      }
    }
  });

  it('agrees on the length multiplier', () => {
    for (let total = 0; total <= 10; total += 1) {
      expect(domain.lengthMultiplier(total)).toBe(legacy.lengthMultiplier(total));
    }
  });

  it('agrees on ranked picks, including order and ties', () => {
    for (const stock of stocks) {
      const state = kitchen(stock);
      const ours = domain.recommend(catalog, state).map((p) => ({
        id: p.recipe.id,
        have: p.have,
        missing: p.missing,
        total: p.total,
        score: p.score,
        rank: p.rank,
      }));
      const theirs = (legacy.recommend(state) as { recipe: Recipe; have: number; missing: number; total: number; score: number; rank: number }[])
        .map((p) => ({
          id: p.recipe.id,
          have: p.have,
          missing: p.missing,
          total: p.total,
          score: p.score,
          rank: p.rank,
        }));
      expect(ours, JSON.stringify(stock)).toEqual(theirs);
    }
  });
});

describe('parity: commit actions', () => {
  it('agrees on cooking and deductions for every recipe and stock', () => {
    for (const stock of stocks) {
      for (const recipe of recipes) {
        const state = kitchen(stock);
        expect(domain.cookRecipe(catalog, state, recipe), recipe.id).toEqual(legacy.cookRecipe(state, recipe));
        expect(domain.cookDeductions(catalog, state, recipe), recipe.id).toEqual(legacy.cookDeductions(state, recipe));
      }
    }
  });

  it('agrees on shopping-list generation', () => {
    const existing = kitchen({}, [{ ingredientId: 'onion', amount: 99, fromRecipeId: null }]);
    for (const recipe of recipes) {
      expect(domain.addToShoppingList(catalog, kitchen({}), recipe), recipe.id).toEqual(
        legacy.addToShoppingList(kitchen({}), recipe),
      );
      expect(domain.addToShoppingList(catalog, existing, recipe), recipe.id).toEqual(
        legacy.addToShoppingList(existing, recipe),
      );
    }
  });

  it('agrees on buying an item off the list', () => {
    const state = kitchen({ tomato: 1 }, [
      { ingredientId: 'onion', amount: 2, fromRecipeId: 'x' },
      { ingredientId: 'onion', amount: 3, fromRecipeId: 'y' },
    ]);
    for (const id of ['onion', 'tomato', 'ghost']) {
      expect(domain.buyShoppingListItem(state, id), id).toEqual(legacy.buyShoppingListItem(state, id));
    }
  });

  it('agrees on the combining animation spec', () => {
    for (const recipe of recipes) {
      const ids = recipe.ingredients.map((ri) => ri.ingredientId).concat(['ghost', 'tomato']);
      expect(domain.combineAnimationSpec(catalog, recipe, ids), recipe.id).toEqual(
        legacy.combineAnimationSpec(recipe, ids),
      );
    }
  });
});

describe('parity: sanitizing and transfer', () => {
  const payloads: unknown[] = [
    null,
    undefined,
    7,
    'x',
    [],
    { stock: [] },
    { stock: null },
    { categories: [{ id: 'pantry', name: ' Pantry ' }, null, { id: '', name: 'x' }], stock: { tomato: '2', egg: 1.5, onion: -1, salt: 9 }, shoppingList: [] },
    { stock: { ghost: 2 }, shoppingList: [{ ingredientId: 'onion', amount: '4', fromRecipeId: 7 }, null, { ingredientId: 5, amount: 2 }] },
    { stock: { tomato: 1 }, shoppingList: [{ ingredientId: 'onion', amount: 1, fromRecipeId: 'ghost_recipe' }] },
  ];

  it('agrees on sanitizeState with and without knownOnly', () => {
    for (const payload of payloads) {
      for (const knownOnly of [false, true]) {
        expect(
          domain.sanitizeState(catalog, payload, { knownOnly }),
          JSON.stringify(payload),
        ).toEqual(legacy.sanitizeState(payload, { knownOnly }));
      }
    }
  });

  it('agrees byte-for-byte on an export', () => {
    const state = kitchen(
      { tomato: 2, egg: 6 },
      [{ ingredientId: 'onion', amount: 1, fromRecipeId: null }],
    );
    const at = new Date('2026-10-23T12:00:00.000Z');
    expect(domain.buildExport(state, at)).toEqual(legacy.buildExport(state, at));
    expect(domain.exportJson(state, at)).toBe(legacy.exportJson(state, at));
  });

  it('agrees on every import outcome', () => {
    const texts = [
      '{ not json',
      '[]',
      'null',
      '{"hello":"world"}',
      '{"categories":[],"stock":{},"shoppingList":[]}',
      '{"app":"other","schemaVersion":1,"state":{}}',
      '{"app":"fridge-companion","state":{}}',
      '{"app":"fridge-companion","schemaVersion":2,"state":{"stock":{"tomato":1}}}',
      '{"categories":[],"stock":{"tomato":3},"shoppingList":[]}',
      '{"stock":{"tomato":2,"salt":1,"ghost":1},"shoppingList":[]}',
      domain.exportJson(kitchen({ tomato: 2 })),
    ];
    for (const text of texts) {
      expect(domain.parseImportPayload(catalog, text), text).toEqual(legacy.parseImportPayload(text));
    }
  });

  it('agrees on cross-tab reconciliation', () => {
    const raws = [null, undefined, '{oops', 'null', '[]', '{"stock":{"tomato":1}}', JSON.stringify({ categories: [], stock: {}, shoppingList: [] })];
    for (const raw of raws) {
      expect(domain.remoteStateFromRaw(catalog, raw), String(raw)).toEqual(legacy.remoteStateFromRaw(raw));
    }
    const a = kitchen({ tomato: 1 });
    const b = kitchen({ tomato: 1 });
    expect(domain.sameState(a, b)).toBe(legacy.sameState(a, b));
  });

  it('agrees on clearing this app’s storage key', () => {
    for (const present of [true, false]) {
      const make = () => {
        const data: Record<string, string> = { other: 'keep' };
        if (present) data[domain.STORAGE_KEY] = '{}';
        return {
          data,
          storage: {
            removeItem(key: string) { delete data[key]; },
          },
        };
      };
      const ours = make();
      const theirs = make();
      expect(domain.clearStoredKitchen(ours.storage)).toBe(legacy.clearStoredKitchen(theirs.storage));
      expect(ours.data).toEqual(theirs.data);
    }
    expect(domain.clearStoredKitchen(null)).toBe(legacy.clearStoredKitchen(null));
  });
});
