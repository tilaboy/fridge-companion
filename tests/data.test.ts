import { describe, expect, it } from 'vitest';
import { SEEDED_CATEGORIES } from '../src/domain/categories';
import { ingredients, recipes } from './fixtures';

describe('built-in tray', () => {
  it('has unique ids and a known category for every ingredient', () => {
    const ids = ingredients.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set(SEEDED_CATEGORIES.map((c) => c.id));
    for (const ingredient of ingredients) {
      expect(categories.has(ingredient.categoryId), ingredient.id).toBe(true);
    }
  });

  it('declares the four staples and never a meat or fish one', () => {
    const staples = ingredients.filter((i) => i.staple).map((i) => i.id).sort();
    expect(staples).toEqual(['flour', 'milk', 'salt', 'sugar']);
    for (const ingredient of ingredients) {
      if (ingredient.categoryId === 'meat') expect(ingredient.staple, ingredient.id).toBeFalsy();
    }
  });

  it('is used by at least one recipe, staples included', () => {
    const used = new Set(recipes.flatMap((r) => r.ingredients.map((ri) => ri.ingredientId)));
    for (const ingredient of ingredients) {
      expect(used.has(ingredient.id), ingredient.id).toBe(true);
    }
  });
});

describe('built-in recipes', () => {
  it('are three dozen-ish, with unique ids and real steps', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(30);
    expect(recipes.length).toBeLessThanOrEqual(40);
    const ids = recipes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const recipe of recipes) {
      expect(recipe.steps.length, recipe.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('only call for ingredients in the tray, with positive whole amounts', () => {
    const known = new Set(ingredients.map((i) => i.id));
    for (const recipe of recipes) {
      expect(recipe.ingredients.length, recipe.id).toBeGreaterThan(0);
      for (const ri of recipe.ingredients) {
        expect(known.has(ri.ingredientId), `${recipe.id} -> ${ri.ingredientId}`).toBe(true);
        expect(Number.isInteger(ri.amount) && ri.amount > 0, `${recipe.id} -> ${ri.amount}`).toBe(true);
      }
    }
  });

  it('has a real meat and fish spread', () => {
    const meatIds = new Set(
      ingredients.filter((i) => i.categoryId === 'meat').map((i) => i.id),
    );
    const meatRecipes = recipes.filter((r) =>
      r.ingredients.some((ri) => meatIds.has(ri.ingredientId)),
    );
    expect(meatRecipes.length).toBeGreaterThanOrEqual(9);
  });
});
