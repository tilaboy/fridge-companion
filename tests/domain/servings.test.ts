import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERVINGS,
  MAX_SERVINGS,
  MIN_SERVINGS,
  isServings,
  recipeServings,
  scaleAmount,
  scaleRecipe,
} from '../../src/domain/servings';
import type { Recipe } from '../../src/domain/types';

const recipe: Recipe = {
  id: 'omelette',
  name: 'Omelette',
  dishEmoji: '🍳',
  servings: 2,
  timeMinutes: 15,
  mealTypes: ['lunch'],
  ingredients: [
    { ingredientId: 'egg', amount: 2 },
    { ingredientId: 'cheese', amount: 50 },
    { ingredientId: 'salt', amount: 1 },
  ],
  steps: ['Beat the eggs.', 'Cook.'],
};

describe('servings', () => {
  it('accepts whole servings inside the guardrail and rejects the rest', () => {
    expect(isServings(MIN_SERVINGS)).toBe(true);
    expect(isServings(MAX_SERVINGS)).toBe(true);
    expect(isServings(0)).toBe(false);
    expect(isServings(MAX_SERVINGS + 1)).toBe(false);
    expect(isServings(2.5)).toBe(false);
    expect(isServings('2')).toBe(false);
  });

  it('falls back to two servings for legacy and malformed recipes', () => {
    expect(DEFAULT_SERVINGS).toBe(2);
    expect(recipeServings(recipe)).toBe(2);
    expect(recipeServings({ ...recipe, servings: undefined })).toBe(2);
    expect(recipeServings({ ...recipe, servings: 0 })).toBe(2);
  });

  it('scales a recipe to the chosen yield without mutating the base', () => {
    const scaled = scaleRecipe(recipe, 4);
    expect(scaled.servings).toBe(4);
    expect(scaled.ingredients).toEqual([
      { ingredientId: 'egg', amount: 4 },
      { ingredientId: 'cheese', amount: 100 },
      { ingredientId: 'salt', amount: 2 },
    ]);
    expect(scaled.timeMinutes).toBe(15);
    expect(scaled.mealTypes).toEqual(['lunch']);
    expect(scaled.steps).toEqual(['Beat the eggs.', 'Cook.']);

    expect(recipe.servings).toBe(2);
    expect(recipe.ingredients[0]!.amount).toBe(2);
  });

  it('keeps provenance when scaling', () => {
    const sourced: Recipe = {
      ...recipe,
      source: {
        kind: 'original',
        author: 'Test kitchen',
        license: 'MIT',
        url: 'https://example.test/source',
      },
    };
    expect(scaleRecipe(sourced, 4).source).toEqual(sourced.source);
  });

  it('halves amounts and keeps three-decimal rounding', () => {
    expect(scaleRecipe(recipe, 1).ingredients).toEqual([
      { ingredientId: 'egg', amount: 1 },
      { ingredientId: 'cheese', amount: 25 },
      { ingredientId: 'salt', amount: 0.5 },
    ]);
    expect(scaleAmount(1, 1 / 3)).toBe(0.333);
    expect(scaleAmount(0.001, 1 / 12)).toBe(0.001);
  });

  it('scales from the legacy default when a recipe declares no yield', () => {
    const legacy: Recipe = { ...recipe, servings: undefined };
    expect(scaleRecipe(legacy, 4).ingredients[0]!.amount).toBe(4);
    expect(scaleRecipe(legacy, 1).ingredients[0]!.amount).toBe(1);
  });

  it('uses the base yield when asked for an invalid target', () => {
    expect(scaleRecipe(recipe, 0).servings).toBe(2);
    expect(scaleRecipe(recipe, 99).servings).toBe(2);
  });
});
