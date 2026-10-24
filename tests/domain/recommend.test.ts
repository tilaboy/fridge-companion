import { describe, expect, it } from 'vitest';
import { createCatalog } from '../../src/domain/catalog';
import {
  COOK_RECENT_MULTIPLIER,
  COOK_WEEK_MULTIPLIER,
} from '../../src/domain/cookHistory';
import { stockTotals } from '../../src/domain/lots';
import {
  EXPIRED_EXPIRY_PENALTY,
  LENGTH_BONUS,
  SOON_EXPIRY_BOOST,
  expiryMultiplier,
  expiryWeightFor,
  lengthMultiplier,
  missingIngredients,
  recommend,
  scoreRecipe,
} from '../../src/domain/recommend';
import type { CookEvent, Ingredient, KitchenState, Recipe } from '../../src/domain/types';
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

const expiryTray: Ingredient[] = [
  { id: 'spinach', name: 'Spinach', emoji: 'S', categoryId: 'produce', unit: 'bunch' },
  { id: 'rice', name: 'Rice', emoji: 'R', categoryId: 'pantry', unit: 'g' },
  { id: 'tomato', name: 'Tomato', emoji: 'T', categoryId: 'produce', unit: 'pcs' },
];

const expiryBook: Recipe[] = [
  {
    id: 'spinach-dish',
    name: 'Spinach Dish',
    dishEmoji: 'S',
    ingredients: [{ ingredientId: 'spinach', amount: 1 }],
    steps: [],
  },
  {
    id: 'rice-dish',
    name: 'Rice Dish',
    dishEmoji: 'R',
    ingredients: [{ ingredientId: 'rice', amount: 1 }],
    steps: [],
  },
  {
    id: 'pair-dish',
    name: 'Pair Dish',
    dishEmoji: 'P',
    ingredients: [
      { ingredientId: 'spinach', amount: 1 },
      { ingredientId: 'rice', amount: 1 },
    ],
    steps: [],
  },
  {
    id: 'needs-more-spinach',
    name: 'Needs More Spinach',
    dishEmoji: 'N',
    ingredients: [
      { ingredientId: 'spinach', amount: 2 },
      { ingredientId: 'rice', amount: 1 },
    ],
    steps: [],
  },
  {
    id: 'three-dish',
    name: 'Three Dish',
    dishEmoji: 'T',
    ingredients: [
      { ingredientId: 'spinach', amount: 1 },
      { ingredientId: 'rice', amount: 1 },
      { ingredientId: 'tomato', amount: 1 },
    ],
    steps: [],
  },
];

const expiryCatalog = createCatalog(expiryTray, expiryBook);
const expiryNow = new Date('2026-10-23T12:00:00');

const kitchen = (stock: Record<string, number>): KitchenState => kitchenWithStock(stock);

function cooked(recipeId: string, cookedAt: string): CookEvent {
  return {
    id: 'cook-' + recipeId + '-' + cookedAt,
    recipeId,
    cookedAt,
    servings: 2,
  };
}

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

describe('expiry weighting', () => {
  it('maps freshness statuses to stable multipliers', () => {
    expect(expiryMultiplier('none')).toBe(1);
    expect(expiryMultiplier('later')).toBe(1);
    expect(expiryMultiplier('soon')).toBe(SOON_EXPIRY_BOOST);
    expect(expiryMultiplier('expired')).toBe(EXPIRED_EXPIRY_PENALTY);
  });

  it('lifts a recipe that can use up a soon-expiring ingredient', () => {
    const state = kitchenWithStock(
      { spinach: 1, rice: 1 },
      { expiresAt: { spinach: '2026-10-24' } },
    );
    const picks = recommend(
      expiryCatalog,
      state,
      [expiryBook[0]!, expiryBook[1]!],
      expiryNow,
    );
    expect(picks.map((pick) => pick.recipe.id)).toEqual(['spinach-dish', 'rice-dish']);
    const pick = picks[0]!;
    expect(pick.expiry).toEqual({
      ingredientId: 'spinach',
      expiresAt: '2026-10-24',
      status: 'soon',
      multiplier: SOON_EXPIRY_BOOST,
    });
    expect(pick.rank).toBeCloseTo(lengthMultiplier(1) * SOON_EXPIRY_BOOST);
    expect(pick.explanation).toMatch(/^Use Spinach \u2014 use by /);
  });

  it('damps a recipe carrying expired stock and warns on the card', () => {
    const state = kitchenWithStock(
      { spinach: 1, rice: 1 },
      { expiresAt: { spinach: '2026-10-22' } },
    );
    const picks = recommend(
      expiryCatalog,
      state,
      [expiryBook[0]!, expiryBook[1]!],
      expiryNow,
    );
    expect(picks.map((pick) => pick.recipe.id)).toEqual(['rice-dish', 'spinach-dish']);
    const pick = picks[1]!;
    expect(pick.expiry).toMatchObject({
      ingredientId: 'spinach',
      expiresAt: '2026-10-22',
      status: 'expired',
      multiplier: EXPIRED_EXPIRY_PENALTY,
    });
    expect(pick.rank).toBeCloseTo(lengthMultiplier(1) * EXPIRED_EXPIRY_PENALTY);
    expect(pick.explanation).toBe('Spinach is past its date.');
  });

  it('leaves undated and later stock at the unweighted rank', () => {
    const undated = recommend(
      expiryCatalog,
      kitchenWithStock({ spinach: 1 }),
      [expiryBook[0]!],
      expiryNow,
    )[0]!;
    expect(undated.expiry).toEqual({
      ingredientId: null,
      expiresAt: null,
      status: 'none',
      multiplier: 1,
    });
    expect(undated.rank).toBeCloseTo(lengthMultiplier(1));

    const laterState = kitchenWithStock(
      { spinach: 1 },
      { expiresAt: { spinach: '2026-11-30' } },
    );
    const later = recommend(expiryCatalog, laterState, [expiryBook[0]!], expiryNow)[0]!;
    expect(later.expiry).toMatchObject({
      ingredientId: 'spinach',
      expiresAt: '2026-11-30',
      status: 'later',
      multiplier: 1,
    });
    expect(later.rank).toBeCloseTo(lengthMultiplier(1));
  });

  it('uses the earliest date and ignores an expiring ingredient the recipe cannot finish', () => {
    const state = kitchenWithStock(
      { spinach: 1, rice: 1 },
      { expiresAt: { spinach: '2026-10-25', rice: '2026-10-24' } },
    );
    const signal = expiryWeightFor(
      expiryBook[2]!,
      stockTotals(state.stockLots),
      state.stockLots,
      expiryCatalog.stapleIds,
      expiryNow,
    );
    expect(signal).toMatchObject({
      ingredientId: 'rice',
      expiresAt: '2026-10-24',
      status: 'soon',
    });

    const short = recommend(expiryCatalog, state, [expiryBook[3]!], expiryNow)[0]!;
    expect(short.expiry).toEqual({
      ingredientId: null,
      expiresAt: null,
      status: 'none',
      multiplier: 1,
    });
    expect(short.rank).toBeCloseTo(0.5 * lengthMultiplier(2));
    expect(short.explanation).toBe('Just one ingredient short.');
  });

  it('falls back to a one-line fit explanation when no date drives the pick', () => {
    const complete = recommend(
      expiryCatalog,
      kitchenWithStock({ spinach: 1 }),
      [expiryBook[0]!],
      expiryNow,
    )[0]!;
    expect(complete.explanation).toBe('You already have everything.');

    const oneShort = recommend(
      expiryCatalog,
      kitchenWithStock({ spinach: 1, rice: 1 }),
      [expiryBook[4]!],
      expiryNow,
    )[0]!;
    expect(oneShort.explanation).toBe('Just one ingredient short.');

    const twoShort = recommend(
      expiryCatalog,
      kitchenWithStock({ spinach: 1 }),
      [expiryBook[4]!],
      expiryNow,
    )[0]!;
    expect(twoShort.explanation).toBe('Closest match \u2014 2 short.');
  });
});

describe('repetition avoidance', () => {
  const now = new Date('2026-10-24T12:00:00.000Z');

  it('damps a recent repeat below an equal alternative without changing its honest score', () => {
    const state = kitchen({ egg: 2, cheese: 50, tomato: 1 });
    state.cookHistory = [cooked('omelette', '2026-10-23T12:00:00.000Z')];

    const picks = recommend(catalog, state, [book[0]!, book[1]!], now);
    expect(picks.map((pick) => pick.recipe.id)).toEqual(['salad', 'omelette']);

    const repeat = picks[1]!;
    expect(repeat.score).toBe(1);
    expect(repeat.cook).toMatchObject({
      lastCookedAt: '2026-10-23T12:00:00.000Z',
      multiplier: COOK_RECENT_MULTIPLIER,
    });
    expect(repeat.cook?.daysSince).toBeCloseTo(1);
    expect(repeat.rank).toBeCloseTo(lengthMultiplier(2) * COOK_RECENT_MULTIPLIER);
    expect(repeat.explanation).toBe('Cooked yesterday.');
  });

  it('uses only the latest cook and lets a fortnight-old cook stop mattering', () => {
    const state = kitchen({ egg: 2, cheese: 50 });
    state.cookHistory = [
      cooked('omelette', '2026-10-04T12:00:00.000Z'),
      cooked('omelette', '2026-10-21T12:00:00.000Z'),
    ];
    const recent = recommend(catalog, state, [book[0]!], now)[0]!;
    expect(recent.cook?.multiplier).toBe(COOK_WEEK_MULTIPLIER);

    state.cookHistory = [cooked('omelette', '2026-10-04T12:00:00.000Z')];
    const old = recommend(catalog, state, [book[0]!], now)[0]!;
    expect(old.cook).toBeUndefined();
    expect(old.rank).toBeCloseTo(lengthMultiplier(2));
    expect(old.explanation).toBe('You already have everything.');
  });

  it('never hides a recent repeat when it is the only useful recipe', () => {
    const state = kitchen({ egg: 2, cheese: 50 });
    state.cookHistory = [cooked('omelette', '2026-10-24T11:00:00.000Z')];
    const picks = recommend(catalog, state, [book[0]!], now);
    expect(picks.map((pick) => pick.recipe.id)).toEqual(['omelette']);
    expect(picks[0]!.explanation).toBe('Cooked today.');
  });

  it('keeps expiry as the first explanation when both nudges apply', () => {
    const state = kitchenWithStock(
      { spinach: 1, rice: 1 },
      { expiresAt: { spinach: '2026-10-24' } },
    );
    state.cookHistory = [cooked('spinach-dish', '2026-10-20T12:00:00')];
    const pick = recommend(expiryCatalog, state, [expiryBook[0]!], expiryNow)[0]!;
    expect(pick.cook).toMatchObject({ multiplier: COOK_WEEK_MULTIPLIER });
    expect(pick.explanation).toMatch(/^Use Spinach \u2014 use by /);
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
