import { describe, expect, it } from 'vitest';
import { createState } from '../src/domain/state';
import { clearStoredKitchen } from '../src/domain/storage';
import type { KitchenState } from '../src/domain/types';
import {
  STORAGE_KEY,
  freshKitchen,
  getStorage,
  loadState,
  readRawState,
  saveState,
} from '../src/store/localStore';
import { catalog } from './fixtures';

function makeStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key]! : null;
    },
    setItem(key: string, value: string) {
      data[key] = String(value);
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}

function kitchen(): KitchenState {
  const state = createState();
  state.categories = [
    { id: 'produce', name: 'Produce' },
    { id: 'dairy', name: 'Dairy' },
  ];
  state.stock = { tomato: 3, egg: 6 };
  state.shoppingList = [{ ingredientId: 'onion', amount: 1, fromRecipeId: null }];
  return state;
}

describe('loadState', () => {
  it('is an empty first use when nothing is stored', () => {
    const storage = makeStorage();
    expect(loadState(catalog, storage)).toEqual(createState());
  });

  it('reads a saved kitchen back', () => {
    const storage = makeStorage();
    const state = kitchen();
    expect(saveState(state, storage)).toBe(true);
    expect(storage.data[STORAGE_KEY]).toBeTypeOf('string');
    expect(loadState(catalog, storage)).toEqual(state);
  });

  it('sanitizes what it reads instead of trusting it', () => {
    const storage = makeStorage({
      [STORAGE_KEY]: JSON.stringify({
        categories: [{ id: 'pantry', name: ' Pantry ' }, null],
        stock: { tomato: '2', egg: 1.5, salt: 99, ghost: 4 },
        shoppingList: [{ ingredientId: 'onion', amount: '2' }, { nope: true }],
      }),
    });
    expect(loadState(catalog, storage)).toEqual({
      categories: [{ id: 'pantry', name: 'Pantry' }],
      stock: { tomato: 2, ghost: 4 }, // unknown kept on load, staples dropped
      shoppingList: [{ ingredientId: 'onion', amount: 2, fromRecipeId: null }],
    });
  });

  it('treats corrupt JSON or a blocked read as first use', () => {
    expect(loadState(catalog, makeStorage({ [STORAGE_KEY]: '{oops' }))).toEqual(createState());
    expect(
      loadState(catalog, {
        getItem() { throw new Error('blocked'); },
        setItem() {},
        removeItem() {},
      }),
    ).toEqual(createState());
  });

  it('runs in memory when storage is unavailable', () => {
    expect(loadState(catalog, null)).toEqual(createState());
    expect(saveState(kitchen(), null)).toBe(false);
  });
});

describe('saveState', () => {
  it('reports a full or blocked store instead of claiming success', () => {
    const state = kitchen();
    expect(
      saveState(state, {
        getItem() { return null; },
        setItem() { throw new Error('quota'); },
        removeItem() {},
      }),
    ).toBe(false);
  });
});

describe('readRawState', () => {
  it('returns the stored text, or null when there is nothing or no storage', () => {
    const storage = makeStorage({ [STORAGE_KEY]: '{"stock":{}}' });
    expect(readRawState(storage)).toBe('{"stock":{}}');
    expect(readRawState(makeStorage())).toBeNull();
    expect(readRawState(null)).toBeNull();
  });

  it('never throws when the read is blocked', () => {
    expect(
      readRawState({
        getItem() { throw new Error('blocked'); },
        setItem() {},
        removeItem() {},
      }),
    ).toBeNull();
  });
});

describe('freshKitchen', () => {
  it('is a first visit: seeds adopted, nothing else', () => {
    const state = freshKitchen();
    expect(state.categories).toHaveLength(5);
    expect(state.stock).toEqual({});
    expect(state.shoppingList).toEqual([]);
  });
});

describe('reset', () => {
  it('clears this app’s key and leaves other apps on the origin alone', () => {
    const storage = makeStorage({ [STORAGE_KEY]: '{}', 'other-app': 'keep' });
    expect(clearStoredKitchen(storage)).toBe(true);
    expect(storage.data).toEqual({ 'other-app': 'keep' });
  });
});

describe('getStorage', () => {
  it('is null in a plain node process', () => {
    expect(getStorage()).toBeNull();
  });
});
