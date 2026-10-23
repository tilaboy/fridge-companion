/* Units: one canonical amount per ingredient, friendly units at the edge.
 *
 * Lots and recipe amounts are stored in the ingredient's canonical unit. The
 * prompt may speak kilograms, litres, or millilitres; conversion happens once,
 * on the way in, so scoring and cooking only ever compare numbers in the same
 * unit. Mass and volume are interchangeable only when the ingredient declares
 * a density — guessing one would be worse than refusing.
 */
import { roundAmount } from './amount';
import type { Ingredient, Unit } from './types';

export type Dimension = 'mass' | 'volume' | 'count';

interface UnitDef {
  dimension: Dimension;
  /** How many base units (g, ml, or one) this unit is. */
  toBase: number;
}

const UNITS: Record<Unit, UnitDef> = {
  g: { dimension: 'mass', toBase: 1 },
  kg: { dimension: 'mass', toBase: 1000 },
  ml: { dimension: 'volume', toBase: 1 },
  l: { dimension: 'volume', toBase: 1000 },
  pcs: { dimension: 'count', toBase: 1 },
  cloves: { dimension: 'count', toBase: 1 },
  slices: { dimension: 'count', toBase: 1 },
  bunch: { dimension: 'count', toBase: 1 },
};

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UNITS, value);
}

export function dimensionOf(unit: string): Dimension | null {
  return isUnit(unit) ? UNITS[unit].dimension : null;
}

/**
 * The units the prompt may offer for this ingredient. Counts never convert
 * (a clove is not a slice); mass and volume cross only with a density.
 */
export function acceptedUnits(ingredient: Ingredient): Unit[] {
  const canonical = ingredient.unit;
  const def = UNITS[canonical];
  if (!def) return [];
  if (def.dimension === 'count') return [canonical];
  const same: Unit[] =
    def.dimension === 'mass' ? [canonical, 'kg'] : [canonical, 'l'];
  if (!ingredient.densityGPerMl || ingredient.densityGPerMl <= 0) return same;
  return def.dimension === 'mass'
    ? [canonical, 'kg', 'ml', 'l']
    : [canonical, 'l', 'g', 'kg'];
}

/**
 * Convert a typed amount into the ingredient's canonical unit, or null when
 * the units do not describe the same thing (or density is unknown).
 */
export function toCanonical(
  ingredient: Ingredient,
  amount: number,
  unit: Unit,
): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const from = UNITS[unit];
  const to = UNITS[ingredient.unit];
  if (!from || !to) return null;

  if (from.dimension === 'count' || to.dimension === 'count') {
    return unit === ingredient.unit ? roundAmount(amount) : null;
  }

  if (from.dimension === to.dimension) {
    return roundAmount((amount * from.toBase) / to.toBase);
  }

  const density = ingredient.densityGPerMl;
  if (!density || density <= 0) return null;

  // Normalize through grams: mass is already grams, volume becomes grams.
  const grams = from.dimension === 'mass' ? amount * from.toBase : amount * from.toBase * density;
  if (to.dimension === 'mass') return roundAmount(grams / to.toBase);
  return roundAmount(grams / density / to.toBase);
}

/** A short, human amount in whatever unit reads best. */
export function formatAmount(ingredient: Ingredient, amount: number): string {
  const canonical = ingredient.unit;
  const def = UNITS[canonical];
  if (!def) return formatNumber(amount) + ' ' + canonical;
  if (def.dimension === 'mass' && amount >= 1000) {
    return formatNumber(amount / 1000) + ' kg';
  }
  if (def.dimension === 'volume' && amount >= 1000) {
    return formatNumber(amount / 1000) + ' l';
  }
  return formatNumber(amount) + ' ' + canonical;
}

export function formatNumber(n: number): string {
  return String(roundAmount(n));
}
