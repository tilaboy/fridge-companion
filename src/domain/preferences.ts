/* Hard food preferences.
 *
 * Safety rule: a recipe is allowed only when every ingredient is allowed.
 * Ingredient metadata is deliberately fail-closed:
 *   - `dietClass` absent/unknown -> hidden while a diet filter is active.
 *   - `allergens` absent       -> hidden while an allergen filter is active.
 *   - `allergens: []`          -> known to contain none of the listed allergens.
 *
 * Dairy, egg, and fish are also derived from `dietClass`, so a missing
 * checkbox cannot make a known animal ingredient look allergen-free.
 *
 * Time and meal filters follow the same hard-filter rule: a recipe without
 * known time or meal metadata is hidden while that filter is active. All
 * filters run before ranking; they are never score penalties.
 */
import type { Catalog } from './catalog';
import { getIngredient } from './catalog';
import type {
  Allergen,
  Diet,
  DietClass,
  Ingredient,
  MealType,
  Preferences,
  Recipe,
} from './types';

export const ALLERGENS: readonly Allergen[] = [
  'dairy',
  'egg',
  'fish',
  'shellfish',
  'soy',
  'gluten',
  'peanut',
  'tree-nut',
  'sesame',
];

export const DIETS: readonly Diet[] = ['vegetarian', 'vegan', 'pescatarian'];

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Time budgets offered by the UI; the domain accepts any sane minute value. */
export const TIME_BUDGETS: readonly number[] = [20, 30, 45];

/** Guardrail for hand-edited and imported data, not a product limit. */
export const MAX_TIME_MINUTES = 240;

export const DIET_CLASSES: readonly DietClass[] = [
  'plant',
  'dairy',
  'egg',
  'honey',
  'fish',
  'meat',
  'unknown',
];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  dairy: 'Dairy',
  egg: 'Egg',
  fish: 'Fish',
  shellfish: 'Shellfish',
  soy: 'Soy',
  gluten: 'Gluten',
  peanut: 'Peanuts',
  'tree-nut': 'Tree nuts',
  sesame: 'Sesame',
};

export const DIET_LABELS: Record<Diet, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
};

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const DIET_CLASS_LABELS: Record<DietClass, string> = {
  plant: 'Plant-based',
  dairy: 'Dairy',
  egg: 'Egg',
  honey: 'Honey',
  fish: 'Fish',
  meat: 'Meat',
  unknown: 'Not sure',
};

export function createPreferences(): Preferences {
  return { diet: null, allergens: [], maxTimeMinutes: null, meal: null };
}

export function clonePreferences(preferences: Preferences): Preferences {
  return {
    diet: preferences.diet,
    allergens: preferences.allergens.slice(),
    maxTimeMinutes: preferences.maxTimeMinutes ?? null,
    meal: preferences.meal ?? null,
  };
}

export function isAllergen(value: unknown): value is Allergen {
  return typeof value === 'string' && (ALLERGENS as readonly string[]).includes(value);
}

export function isDiet(value: unknown): value is Diet {
  return typeof value === 'string' && (DIETS as readonly string[]).includes(value);
}

export function isMealType(value: unknown): value is MealType {
  return typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value);
}

export function isTimeMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_TIME_MINUTES
  );
}

export function isDietClass(value: unknown): value is DietClass {
  return typeof value === 'string' && (DIET_CLASSES as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Repair a stored/imported preference object. Invalid values mean "off". */
export function sanitizePreferences(raw: unknown): Preferences {
  const record = asRecord(raw);
  if (!record) return createPreferences();
  const diet = isDiet(record.diet) ? record.diet : null;
  const chosen = new Set<Allergen>();
  if (Array.isArray(record.allergens)) {
    for (const value of record.allergens) {
      if (isAllergen(value)) chosen.add(value);
    }
  }
  const rawTime = record.maxTimeMinutes;
  const maxTimeMinutes =
    rawTime === null || rawTime === undefined || rawTime === ''
      ? null
      : isTimeMinutes(Number(rawTime))
        ? Number(rawTime)
        : null;
  return {
    diet,
    allergens: ALLERGENS.filter((allergen) => chosen.has(allergen)),
    maxTimeMinutes,
    meal: isMealType(record.meal) ? record.meal : null,
  };
}

export function hasActivePreferences(preferences: Preferences | undefined): boolean {
  if (!preferences) return false;
  return (
    preferences.diet !== null ||
    preferences.allergens.length > 0 ||
    preferences.maxTimeMinutes != null ||
    preferences.meal != null
  );
}

/** The known diet class, or null when the ingredient has not declared one. */
export function ingredientDietClass(ingredient: Ingredient): DietClass | null {
  const value = ingredient.dietClass;
  if (!isDietClass(value) || value === 'unknown') return null;
  return value;
}

/**
 * The known allergen set, or null when the ingredient's allergen info is
 * unknown. An empty array is a positive declaration of "none of these".
 */
export function ingredientAllergens(ingredient: Ingredient): readonly Allergen[] | null {
  if (ingredient.allergens === undefined) return null;
  const found = new Set<Allergen>();
  for (const allergen of ingredient.allergens) {
    if (isAllergen(allergen)) found.add(allergen);
  }
  const dietClass = ingredientDietClass(ingredient);
  if (dietClass === 'dairy') found.add('dairy');
  if (dietClass === 'egg') found.add('egg');
  if (dietClass === 'fish') found.add('fish');
  return ALLERGENS.filter((allergen) => found.has(allergen));
}

export function dietAllows(diet: Diet, dietClass: DietClass): boolean {
  if (dietClass === 'unknown') return false;
  if (diet === 'vegan') return dietClass === 'plant';
  if (diet === 'vegetarian') return dietClass !== 'meat' && dietClass !== 'fish';
  return dietClass !== 'meat'; // pescatarian
}

/** Known cooking time, or null when the recipe has not declared one. */
export function recipeTimeMinutes(recipe: Recipe): number | null {
  return isTimeMinutes(recipe.timeMinutes) ? recipe.timeMinutes : null;
}

/**
 * Known meal slots, or null when the recipe has not declared them. A valid
 * empty array is a positive declaration of "no slot", not unknown.
 */
export function recipeMealTypes(recipe: Recipe): readonly MealType[] | null {
  if (!Array.isArray(recipe.mealTypes)) return null;
  const chosen = new Set<MealType>();
  for (const value of recipe.mealTypes) {
    if (!isMealType(value)) return null;
    chosen.add(value);
  }
  return MEAL_TYPES.filter((meal) => chosen.has(meal));
}

/** The single gate every recommendation passes through. */
export function recipeFitsPreferences(
  catalog: Catalog,
  recipe: Recipe,
  preferences: Preferences,
): boolean {
  const diet = preferences.diet;
  const avoided = preferences.allergens;
  const maxTimeMinutes = preferences.maxTimeMinutes ?? null;
  const meal = preferences.meal ?? null;
  if (!diet && avoided.length === 0 && maxTimeMinutes === null && meal === null) {
    return true;
  }

  if (maxTimeMinutes !== null) {
    const time = recipeTimeMinutes(recipe);
    if (time === null || time > maxTimeMinutes) return false; // unknown time fails closed
  }

  if (meal !== null) {
    const meals = recipeMealTypes(recipe);
    if (!meals || !meals.includes(meal)) return false; // unknown meal fails closed
  }

  for (const ri of recipe.ingredients) {
    const ingredient = getIngredient(catalog, ri.ingredientId);
    if (!ingredient) return false; // cannot prove it safe

    if (diet) {
      const dietClass = ingredientDietClass(ingredient);
      if (!dietClass || !dietAllows(diet, dietClass)) return false;
    }

    if (avoided.length > 0) {
      const allergens = ingredientAllergens(ingredient);
      if (!allergens) return false; // unknown allergen info fails closed
      if (avoided.some((allergen) => allergens.includes(allergen))) return false;
    }
  }
  return true;
}

export function filterRecipesByPreferences(
  catalog: Catalog,
  recipes: readonly Recipe[],
  preferences: Preferences,
): Recipe[] {
  return recipes.filter((recipe) => recipeFitsPreferences(catalog, recipe, preferences));
}

/** A short, deterministic label for status lines and tests. */
export function describePreferences(preferences: Preferences): string {
  if (!hasActivePreferences(preferences)) return 'No food filters';
  const parts: string[] = [];
  if (preferences.diet) parts.push(DIET_LABELS[preferences.diet]);
  if (preferences.allergens.length > 0) {
    parts.push(
      'avoiding ' +
      preferences.allergens.map((allergen) => ALLERGEN_LABELS[allergen]).join(', '),
    );
  }
  if (preferences.maxTimeMinutes != null) {
    parts.push(preferences.maxTimeMinutes + ' min or less');
  }
  if (preferences.meal != null) parts.push(MEAL_LABELS[preferences.meal]);
  return parts.join(' · ');
}
