import { describe, expect, it } from 'vitest';
import { acceptedUnits, dimensionOf, formatAmount, isUnit, toCanonical } from '../../src/domain/units';
import type { Ingredient } from '../../src/domain/types';

const beef: Ingredient = {
  id: 'beef', name: 'Beef', emoji: 'B', categoryId: 'meat', unit: 'g',
};
const butter: Ingredient = {
  id: 'butter', name: 'Butter', emoji: 'B', categoryId: 'dairy', unit: 'g',
  densityGPerMl: 0.911,
};
const milk: Ingredient = {
  id: 'milk', name: 'Milk', emoji: 'M', categoryId: 'dairy', unit: 'ml',
  densityGPerMl: 1.03,
};
const tomato: Ingredient = {
  id: 'tomato', name: 'Tomato', emoji: 'T', categoryId: 'produce', unit: 'pcs',
};
const garlic: Ingredient = {
  id: 'garlic', name: 'Garlic', emoji: 'G', categoryId: 'produce', unit: 'cloves',
};

describe('units', () => {
  it('knows the kitchen units and their dimensions', () => {
    expect(isUnit('kg')).toBe(true);
    expect(isUnit('cups')).toBe(false);
    expect(dimensionOf('g')).toBe('mass');
    expect(dimensionOf('l')).toBe('volume');
    expect(dimensionOf('cloves')).toBe('count');
    expect(dimensionOf('cups')).toBeNull();
  });

  it('offers only units that can become the canonical one', () => {
    expect(acceptedUnits(beef)).toEqual(['g', 'kg']);
    expect(acceptedUnits(milk)).toEqual(['ml', 'l', 'g', 'kg']);
    expect(acceptedUnits(butter)).toEqual(['g', 'kg', 'ml', 'l']);
    expect(acceptedUnits(tomato)).toEqual(['pcs']);
    expect(acceptedUnits(garlic)).toEqual(['cloves']);
  });
});

describe('toCanonical', () => {
  it('converts within a dimension', () => {
    expect(toCanonical(beef, 0.5, 'kg')).toBe(500);
    expect(toCanonical(beef, 200, 'g')).toBe(200);
    expect(toCanonical(milk, 1, 'l')).toBe(1000);
    expect(toCanonical(tomato, 1.5, 'pcs')).toBe(1.5);
    expect(toCanonical(garlic, 2, 'cloves')).toBe(2);
  });

  it('converts mass and volume only when density is known', () => {
    expect(toCanonical(butter, 100, 'ml')).toBe(91.1);
    expect(toCanonical(milk, 1, 'kg')).toBe(970.874);
    expect(toCanonical(beef, 1, 'l')).toBeNull();
    expect(toCanonical(milk, 1, 'pcs')).toBeNull();
  });

  it('never converts between different count units', () => {
    expect(toCanonical(garlic, 2, 'pcs')).toBeNull();
    expect(toCanonical(tomato, 2, 'cloves')).toBeNull();
    expect(toCanonical(tomato, 0.5, 'kg')).toBeNull();
  });

  it('refuses zero, negatives, and unknown units', () => {
    expect(toCanonical(beef, 0, 'kg')).toBeNull();
    expect(toCanonical(beef, -1, 'kg')).toBeNull();
    expect(toCanonical(beef, 2, 'cups' as never)).toBeNull();
  });
});

describe('formatAmount', () => {
  it('promotes large grams and millilitres to kg and l', () => {
    expect(formatAmount(beef, 1500)).toBe('1.5 kg');
    expect(formatAmount(beef, 1000)).toBe('1 kg');
    expect(formatAmount(beef, 500)).toBe('500 g');
    expect(formatAmount(milk, 1200)).toBe('1.2 l');
    expect(formatAmount(milk, 250)).toBe('250 ml');
  });

  it('keeps counts and fractions readable', () => {
    expect(formatAmount(tomato, 2)).toBe('2 pcs');
    expect(formatAmount(tomato, 0.5)).toBe('0.5 pcs');
    expect(formatAmount(garlic, 3)).toBe('3 cloves');
    expect(formatAmount(butter, 91.1)).toBe('91.1 g');
  });
});
