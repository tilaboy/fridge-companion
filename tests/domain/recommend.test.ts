import { describe, expect, it } from 'vitest';
import { createCatalog } from '../../src/domain/catalog';
import {
  LENGTH_BONUS,
  lengthMultiplier,
  missingIngredients,
  recommend,
  scoreRecipe,
} from '../../src/domain/recommend';
import type { Ingredient, KitchenState, Recipe } from '../../src/domain/types';
import { kitchenWithStock } from '../stock';

const tray: Ingredient[] = [
  { id: 'egg', name: 'Egg', emoji: 'E', categoryId: 'dairy', unit: 'pcs' },
  { id: 'tomato', name: 'Tomato', emoji: 'T', categoryId: 'produce', unit: 'pcs' },
  { id: 'cheese', name: 'Cheese', emoji: 'C', categoryId: 'dairy', unit: 'g' },
  { id: 'salt', name: 'Salt', emoji: 'S', categoryId: 'pantry', unit: 'g', staple: true },
];

const book: Recipe[] = [
  {
    id: 'omelette',
    name: 'Omelette',
    dishEmoji: 'O',
    ingredients: [
      { ingredientId: 'egg', amount: 2 },
      { ingredientId: 'cheese', amount: 50 },
    ],
    steps: [],
  },
  {
    id: 'salad',
    name: 'Salad',
    dishEmoji: 'S',
    ingredients: [
      { ingredientId: 'tomato', amount: 1 },
      { ingredientId: 'salt', amount: 1 },
    ],
    steps: [],
  },
  {
    id: 'sauce',
    name: 'Sauce',
    dishEmoji: 'X',
    ingredients: [{ ingredientId: 'tomato', amount: 6 }],
    steps: [],
  },
];

const catalog = createCatalog(tray, book);

const kitchen = (stock: Record<string, number>): KitchenState => kitchenWithStock(stock);

describe('scoreRecipe', () => {
  it('counts an ingredient only when the amount is sufficient', () => {
    const scored = scoreRecipe(catalog, book[0]!, { egg: 1, cheese: 60 });
    expect(scored).toMatchObject({ have: 1, missing: 1, total: 2, score: 0.5 });
  });

  it('ignores staples on both sides', () => {
    const scored = scoreRecipe(catalog, book[1]!, { tomato: 1 });
    expect(scored).toMatchObject({ have: 1, missing: 0, total: 1, score: 1 });
  });

  it('refuses to divide by zero for an all-staple recipe', () => {
    const onlySalt: Recipe = {
      id: 'salt',
      name: 'Salt',
      dishEmoji: 'S',
      ingredients: [{ ingredientId: 'salt', amount: 1 }],
      steps: [],
    };
    expect(scoreRecipe(catalog, onlySalt, {}).score).toBe(0);
  });
});

describe('length bias', () => {
  it('is ten percent per tracked ingredient', () => {
    expect(LENGTH_BONUS).toBe(0.1);
    expect(lengthMultiplier(0)).toBe(1);
    expect(lengthMultiplier(3)).toBeCloseTo(1.3);
    expect(lengthMultiplier(5)).toBeCloseTo(1.5);
  });
});

describe('recommend', () => {
  it('offers only recipes with something in hand, ranked by fit x length', () => {
    const picks = recommend(catalog, kitchen({ egg: 2, cheese: 50, tomato: 1 }));
    expect(picks.map((p) => p.recipe.id)).toEqual(['omelette', 'salad']);
    expect(picks[0]!.rank).toBeCloseTo(1 * 1.2);
    expect(picks[1]!.rank).toBeCloseTo(1 * 1.1);
  });

  it('caps the list at three', () => {
    const many = Array.from({ length: 8 }, (_, i): Recipe => ({
      id: 'r' + i,
      name: 'R' + i,
      dishEmoji: 'R',
      ingredients: [{ ingredientId: 'tomato', amount: 1 }],
      steps: [],
    }));
    const wide = createCatalog(tray, many);
    expect(recommend(wide, kitchen({ tomato: 1 }))).toHaveLength(3);
  });

  it('tie-breaks by fewest missing, then id', () => {
    const picks = recommend(catalog, kitchen({ tomato: 6, egg: 0 }), [
      book[2]!, // sauce: 1/1, total 1 -> 1.1
      book[1]!, // salad: 1/1, total 1 -> 1.1 (salt is a staple)
    ]);
    expect(picks.map((p) => p.recipe.id)).toEqual(['salad', 'sauce']);
  });
});

describe('missingIngredients', () => {
  it('lists shortfalls by the amount-level rule and never staples', () => {
    expect(missingIngredients(catalog, kitchen({ egg: 1, cheese: 50 }), book[0]!)).toEqual([
      { ingredientId: 'egg', amount: 2 },
    ]);
    expect(missingIngredients(catalog, kitchen({}), book[1]!)).toEqual([
      { ingredientId: 'tomato', amount: 1 },
    ]);
  });
});
