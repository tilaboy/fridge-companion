/* Custom ingredients and recipes: validation, id minting, and de-duplication.
 *
 * Built-in data stays in `src/data/`; anything the kitchen adds lives in
 * `KitchenState`. These helpers are the only way in: they normalize names,
 * refuse duplicates (case- and space-insensitive), mint ids that cannot
 * collide with the built-ins, and return a fresh state. Sanitizing uses the
 * same rules, so a hand-edited or imported kitchen cannot smuggle in two
 * "Tomato" rows or a recipe with an unknown ingredient.
 */
import type { Catalog } from './catalog';
import { getIngredient } from './catalog';
import { roundAmount } from './amount';
import {
  ALLERGENS,
  MEAL_TYPES,
  isAllergen,
  isDietClass,
  isMealType,
  isTimeMinutes,
} from './preferences';
import { cloneState } from './state';
import { dimensionOf, isUnit } from './units';
import type {
  Allergen,
  Category,
  DietClass,
  Ingredient,
  IngredientId,
  KitchenState,
  MealType,
  Recipe,
  Unit,
} from './types';

const NAME_MAX = 40;
const RECIPE_NAME_MAX = 60;
const STEP_MAX = 30;
const INGREDIENTS_MAX = 30;

/** Case- and whitespace-insensitive key used for every duplicate check. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function cleanName(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanEmoji(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  // A few code points is plenty for one glyph; this also refuses paragraphs.
  return Array.from(trimmed).slice(0, 8).join('');
}

function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'item'
  );
}

function uniqueId(prefix: string, name: string, taken: ReadonlySet<string>): string {
  const slug = slugify(name);
  let id = prefix + slug;
  let n = 2;
  while (taken.has(id)) {
    id = prefix + slug + '-' + n;
    n += 1;
  }
  return id;
}

/** kg and l are input conveniences, never canonical homes for an ingredient. */
function isCanonicalUnit(value: unknown): value is Unit {
  return isUnit(value) && value !== 'kg' && value !== 'l';
}

function readDensity(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || String(raw).trim() === '') return undefined;
  const value = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > 5) return undefined;
  return value;
}

export interface CustomIngredientInput {
  name: string;
  emoji?: string;
  categoryId: string;
  unit: string;
  densityGPerMl?: number | string | null;
  /** `unknown` is the fail-closed default. */
  dietClass?: string;
  /** Only read when `allergensKnown` is true. */
  allergens?: readonly string[];
  /** False/absent means allergen info is unknown, not "none". */
  allergensKnown?: boolean;
}

export type CustomIngredientResult =
  | { ok: true; state: KitchenState; ingredient: Ingredient }
  | { ok: false; error: string };

/**
 * Add a tray ingredient. The category must be one of this kitchen's
 * categories; density is optional and only meaningful for mass or volume.
 */
export function addCustomIngredient(
  catalog: Catalog,
  state: KitchenState,
  input: CustomIngredientInput,
): CustomIngredientResult {
  const name = cleanName(input.name, NAME_MAX);
  if (name === '') return { ok: false, error: 'Give the ingredient a name.' };
  if (input.name.trim().length > NAME_MAX) {
    return { ok: false, error: 'Keep the name to ' + NAME_MAX + ' characters or fewer.' };
  }

  // Include the state's own customs even if the caller's catalog is stale.
  const allIngredients = catalog.ingredients.concat(state.customIngredients ?? []);
  const duplicate = allIngredients.find(
    (ingredient) => normalizeName(ingredient.name) === normalizeName(name),
  );
  if (duplicate) return { ok: false, error: 'You already have ' + duplicate.name + '.' };

  if (!isCanonicalUnit(input.unit)) {
    return { ok: false, error: 'Pick grams, millilitres, or a count unit.' };
  }
  const unit = input.unit;

  const category = state.categories.find((entry) => entry.id === input.categoryId);
  if (!category) return { ok: false, error: 'Pick one of your categories.' };

  let density: number | undefined;
  const rawDensity = input.densityGPerMl;
  if (rawDensity !== null && rawDensity !== undefined && String(rawDensity).trim() !== '') {
    if (dimensionOf(unit) === 'count') {
      return { ok: false, error: 'Count units cannot have a density.' };
    }
    density = readDensity(rawDensity);
    if (density === undefined) {
      return { ok: false, error: 'Density must be a number between 0 and 5.' };
    }
  }

  let dietClass: DietClass = 'unknown';
  if (input.dietClass !== undefined) {
    if (!isDietClass(input.dietClass)) {
      return { ok: false, error: 'Pick a valid diet classification.' };
    }
    dietClass = input.dietClass;
  }

  let allergens: Allergen[] | undefined;
  if (input.allergensKnown) {
    const chosen = new Set<Allergen>();
    for (const value of input.allergens ?? []) {
      if (!isAllergen(value)) return { ok: false, error: 'Pick allergens from the list.' };
      chosen.add(value);
    }
    allergens = ALLERGENS.filter((allergen) => chosen.has(allergen));
  }

  const taken = new Set(allIngredients.map((ingredient) => ingredient.id));
  const ingredient: Ingredient = {
    id: uniqueId('custom-ingredient-', name, taken),
    name,
    emoji: cleanEmoji(input.emoji, '🥫'),
    categoryId: category.id,
    unit,
    dietClass,
  };
  if (density !== undefined) ingredient.densityGPerMl = density;
  if (allergens !== undefined) ingredient.allergens = allergens;

  const next = cloneState(state);
  next.customIngredients = next.customIngredients.concat([ingredient]);
  return { ok: true, state: next, ingredient };
}

export interface CustomRecipeIngredientInput {
  ingredientId: string;
  amount: number;
}

export interface CustomRecipeInput {
  name: string;
  dishEmoji?: string;
  /** Blank/absent means unknown, so time filters fail closed. */
  timeMinutes?: number | string | null;
  /** Absent/empty means no declared slot, so meal filters hide it. */
  mealTypes?: readonly string[] | null;
  ingredients: readonly CustomRecipeIngredientInput[];
  steps: readonly string[];
}

export type CustomRecipeResult =
  | { ok: true; state: KitchenState; recipe: Recipe }
  | { ok: false; error: string };

function cleanSteps(raw: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((step) => (typeof step === 'string' ? step.trim().slice(0, 500) : ''))
    .filter((step) => step !== '')
    .slice(0, STEP_MAX);
}

/** undefined = not declared, null = invalid, number = valid minutes. */
function readRecipeTime(raw: unknown): number | undefined | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return undefined;
  const value = Number(String(raw).replace(',', '.'));
  return isTimeMinutes(value) ? value : null;
}

/** undefined = not declared, null = invalid, array = valid meal slots. */
function readMealTypes(raw: unknown): MealType[] | undefined | null {
  if (raw === null || raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const chosen = new Set<MealType>();
  for (const value of raw) {
    if (!isMealType(value)) return null;
    chosen.add(value);
  }
  return MEAL_TYPES.filter((meal) => chosen.has(meal));
}

/** Combine repeated ingredient rows instead of storing the same id twice. */
function mergeIngredients(
  catalog: Catalog,
  rows: readonly CustomRecipeIngredientInput[],
): { ingredientId: IngredientId; amount: number }[] | null {
  const merged = new Map<IngredientId, number>();
  for (const row of rows) {
    if (!row || typeof row.ingredientId !== 'string') return null;
    if (!getIngredient(catalog, row.ingredientId)) return null;
    if (!Number.isFinite(row.amount) || roundAmount(row.amount) <= 0) return null;
    merged.set(
      row.ingredientId,
      roundAmount((merged.get(row.ingredientId) ?? 0) + row.amount),
    );
  }
  return Array.from(merged, ([ingredientId, amount]) => ({ ingredientId, amount }));
}

export function addCustomRecipe(
  catalog: Catalog,
  state: KitchenState,
  input: CustomRecipeInput,
): CustomRecipeResult {
  const name = cleanName(input.name, RECIPE_NAME_MAX);
  if (name === '') return { ok: false, error: 'Give the recipe a name.' };
  if (input.name.trim().length > RECIPE_NAME_MAX) {
    return { ok: false, error: 'Keep the recipe name to ' + RECIPE_NAME_MAX + ' characters or fewer.' };
  }

  const allRecipes = catalog.recipes.concat(state.customRecipes ?? []);
  const duplicate = allRecipes.find(
    (recipe) => normalizeName(recipe.name) === normalizeName(name),
  );
  if (duplicate) return { ok: false, error: 'You already have a recipe called ' + duplicate.name + '.' };

  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    return { ok: false, error: 'Add at least one ingredient.' };
  }
  if (input.ingredients.length > INGREDIENTS_MAX) {
    return { ok: false, error: 'Keep recipes to ' + INGREDIENTS_MAX + ' ingredients or fewer.' };
  }
  // Resolve against the state's own customs too, even if the catalog is stale.
  const allIngredients = catalog.ingredients.concat(state.customIngredients ?? []);
  const ingredientCatalog: Catalog = {
    ...catalog,
    ingredients: allIngredients,
    ingredientById: new Map(allIngredients.map((ingredient) => [ingredient.id, ingredient])),
  };
  const ingredients = mergeIngredients(ingredientCatalog, input.ingredients);
  if (!ingredients || ingredients.length === 0) {
    return { ok: false, error: 'Every ingredient needs a known name and a positive amount.' };
  }

  const steps = cleanSteps(input.steps);
  if (steps.length === 0) return { ok: false, error: 'Add at least one step.' };

  const timeMinutes = readRecipeTime(input.timeMinutes);
  if (timeMinutes === null) {
    return { ok: false, error: 'Time must be a whole number of minutes between 1 and 240.' };
  }
  const mealTypes = readMealTypes(input.mealTypes);
  if (mealTypes === null) return { ok: false, error: 'Pick meal types from the list.' };

  const taken = new Set(allRecipes.map((recipe) => recipe.id));
  const recipe: Recipe = {
    id: uniqueId('custom-recipe-', name, taken),
    name,
    dishEmoji: cleanEmoji(input.dishEmoji, '🍽️'),
    ingredients,
    steps,
  };
  if (timeMinutes !== undefined) recipe.timeMinutes = timeMinutes;
  if (mealTypes !== undefined) recipe.mealTypes = mealTypes;

  const next = cloneState(state);
  next.customRecipes = next.customRecipes.concat([recipe]);
  return { ok: true, state: next, recipe };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Rebuild custom ingredients from storage/import, dropping bad duplicates. */
export function sanitizeCustomIngredients(
  catalog: Catalog,
  raw: unknown,
  categories: readonly Category[],
): Ingredient[] {
  if (!Array.isArray(raw)) return [];
  const usedIds = new Set(catalog.ingredients.map((ingredient) => ingredient.id));
  const names = new Set(catalog.ingredients.map((ingredient) => normalizeName(ingredient.name)));
  const out: Ingredient[] = [];

  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = cleanName(record.name, NAME_MAX);
    if (name === '') continue;
    const key = normalizeName(name);
    if (names.has(key)) continue;
    if (!isCanonicalUnit(record.unit)) continue;

    const categoryId =
      typeof record.categoryId === 'string' &&
      categories.some((category) => category.id === record.categoryId)
        ? record.categoryId
        : categories[0]?.id ?? (typeof record.categoryId === 'string' ? record.categoryId : 'pantry');

    let id =
      typeof record.id === 'string' && record.id !== '' && !usedIds.has(record.id)
        ? record.id
        : uniqueId('custom-ingredient-', name, usedIds);

    let density = record.densityGPerMl;
    if (dimensionOf(record.unit) === 'count') density = undefined;

    const ingredient: Ingredient = {
      id,
      name,
      emoji: cleanEmoji(record.emoji, '🥫'),
      categoryId,
      unit: record.unit,
    };
    if (isDietClass(record.dietClass)) ingredient.dietClass = record.dietClass;
    if (Array.isArray(record.allergens)) {
      const chosen = new Set<Allergen>();
      let valid = true;
      for (const value of record.allergens) {
        if (!isAllergen(value)) {
          valid = false;
          break;
        }
        chosen.add(value);
      }
      // A malformed list is unknown, not an accidental "contains none".
      if (valid) ingredient.allergens = ALLERGENS.filter((allergen) => chosen.has(allergen));
    }
    const parsedDensity = readDensity(density);
    if (parsedDensity !== undefined) ingredient.densityGPerMl = parsedDensity;

    usedIds.add(id);
    names.add(key);
    out.push(ingredient);
  }
  return out;
}

/** Rebuild custom recipes from storage/import, dropping broken ones. */
export function sanitizeCustomRecipes(
  catalog: Catalog,
  raw: unknown,
  customIngredients: readonly Ingredient[],
): Recipe[] {
  if (!Array.isArray(raw)) return [];
  const ingredientCatalog: Catalog = {
    ...catalog,
    ingredients: catalog.ingredients.concat(customIngredients),
    ingredientById: new Map(
      catalog.ingredients
        .concat(customIngredients)
        .map((ingredient) => [ingredient.id, ingredient]),
    ),
  };
  const usedIds = new Set(catalog.recipes.map((recipe) => recipe.id));
  const names = new Set(catalog.recipes.map((recipe) => normalizeName(recipe.name)));
  const out: Recipe[] = [];

  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = cleanName(record.name, RECIPE_NAME_MAX);
    if (name === '') continue;
    const key = normalizeName(name);
    if (names.has(key)) continue;

    const rawIngredients = Array.isArray(record.ingredients) ? record.ingredients : [];
    const rows: CustomRecipeIngredientInput[] = [];
    for (const item of rawIngredients) {
      const ingredient = asRecord(item);
      if (!ingredient || typeof ingredient.ingredientId !== 'string') continue;
      rows.push({
        ingredientId: ingredient.ingredientId,
        amount: Number(ingredient.amount),
      });
    }
    const ingredients = mergeIngredients(ingredientCatalog, rows);
    if (!ingredients || ingredients.length === 0) continue;

    const rawSteps = Array.isArray(record.steps)
      ? record.steps.filter((step): step is string => typeof step === 'string')
      : [];
    const steps = cleanSteps(rawSteps);
    if (steps.length === 0) continue;

    const id =
      typeof record.id === 'string' && record.id !== '' && !usedIds.has(record.id)
        ? record.id
        : uniqueId('custom-recipe-', name, usedIds);

    const recipe: Recipe = {
      id,
      name,
      dishEmoji: cleanEmoji(record.dishEmoji, '🍽️'),
      ingredients,
      steps,
    };
    const timeMinutes = readRecipeTime(record.timeMinutes);
    if (timeMinutes !== null && timeMinutes !== undefined) {
      recipe.timeMinutes = timeMinutes;
    }
    const mealTypes = readMealTypes(record.mealTypes);
    if (mealTypes !== null && mealTypes !== undefined) recipe.mealTypes = mealTypes;
    usedIds.add(id);
    names.add(key);
    out.push(recipe);
  }
  return out;
}
