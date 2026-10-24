/* Built-in ingredient tray.
 *
 * `categoryId` matches the seeded category ids in the domain, so the fridge
 * door can group the tray by whatever the user kept at first use.
 *
 * `staple: true` marks an ingredient the app assumes is always in the kitchen
 * (salt, sugar, flour, milk). Staples are never tracked in stock, never shown
 * in the tray, never counted in the "you have X/Y" score, and never sent to
 * the shopping list — but recipes may still call for them, and the recipe view
 * lists them as assumed. They stay here so recipes keep a single source for
 * names, emoji, and units.
 *
 * `dietClass` and `allergens` are safety metadata. Recipes derive their
 * eligibility from every ingredient, so these tags must stay conservative:
 * an empty allergen list means "none of the listed allergens", while a missing
 * field means unknown and fails closed under a filter. Dairy, egg, and fish
 * are also derived from `dietClass` even if a tag is omitted here.
 */
import type { Ingredient } from '../domain/types';

export const ingredients: Ingredient[] = [
    // Produce
    { id: 'tomato',      name: 'Tomato',      emoji: '\uD83C\uDF45', categoryId: 'produce',   unit: 'pcs', dietClass: 'plant', allergens: [] },
    { id: 'onion',       name: 'Onion',       emoji: '\uD83E\uDDC5', categoryId: 'produce',   unit: 'pcs', dietClass: 'plant', allergens: [] },
    { id: 'garlic',      name: 'Garlic',      emoji: '\uD83E\uDDC4', categoryId: 'produce',   unit: 'cloves', dietClass: 'plant', allergens: [] },
    { id: 'potato',      name: 'Potato',      emoji: '\uD83E\uDD54', categoryId: 'produce',   unit: 'pcs', dietClass: 'plant', allergens: [] },
    { id: 'carrot',      name: 'Carrot',      emoji: '\uD83E\uDD55', categoryId: 'produce',   unit: 'pcs', dietClass: 'plant', allergens: [] },
    { id: 'broccoli',    name: 'Broccoli',    emoji: '\uD83E\uDD66', categoryId: 'produce',   unit: 'pcs', dietClass: 'plant', allergens: [] },
    { id: 'spinach',     name: 'Spinach',     emoji: '\uD83E\uDD6C', categoryId: 'produce',   unit: 'bunch', dietClass: 'plant', allergens: [] },
    { id: 'mushroom',    name: 'Mushroom',    emoji: '\uD83C\uDF44', categoryId: 'produce',   unit: 'g', dietClass: 'plant', allergens: [] },
    { id: 'bell_pepper', name: 'Bell Pepper', emoji: '\uD83E\uDED1', categoryId: 'produce',   unit: 'pcs', dietClass: 'plant', allergens: [] },
    { id: 'lemon',       name: 'Lemon',       emoji: '\uD83C\uDF4B', categoryId: 'produce',   unit: 'pcs', dietClass: 'plant', allergens: [] },

    // Dairy
    { id: 'egg',         name: 'Egg',         emoji: '\uD83E\uDD5A', categoryId: 'dairy',     unit: 'pcs', dietClass: 'egg', allergens: ['egg'] },
    { id: 'milk',        name: 'Milk',        emoji: '\uD83E\uDD5B', categoryId: 'dairy',     unit: 'ml', densityGPerMl: 1.03, staple: true, dietClass: 'dairy', allergens: ['dairy'] },
    { id: 'butter',      name: 'Butter',      emoji: '\uD83E\uDDC8', categoryId: 'dairy',     unit: 'g', densityGPerMl: 0.911, dietClass: 'dairy', allergens: ['dairy'] },
    { id: 'cheese',      name: 'Cheese',      emoji: '\uD83E\uDDC0', categoryId: 'dairy',     unit: 'g', dietClass: 'dairy', allergens: ['dairy'] },

    // Pantry
    { id: 'flour',       name: 'Flour',       emoji: '\uD83C\uDF3E', categoryId: 'pantry',    unit: 'g', densityGPerMl: 0.53, staple: true, dietClass: 'plant', allergens: ['gluten'] },
    { id: 'rice',        name: 'Rice',        emoji: '\uD83C\uDF5A', categoryId: 'pantry',    unit: 'g', densityGPerMl: 0.85, dietClass: 'plant', allergens: [] },
    { id: 'pasta',       name: 'Pasta',       emoji: '\uD83C\uDF5D', categoryId: 'pantry',    unit: 'g', dietClass: 'plant', allergens: ['gluten'] },
    { id: 'bread',       name: 'Bread',       emoji: '\uD83C\uDF5E', categoryId: 'pantry',    unit: 'slices', dietClass: 'plant', allergens: ['gluten'] },
    { id: 'olive_oil',   name: 'Olive Oil',   emoji: '\uD83E\uDED2', categoryId: 'pantry',    unit: 'ml', densityGPerMl: 0.91, dietClass: 'plant', allergens: [] },
    { id: 'soy_sauce',   name: 'Soy Sauce',   emoji: '\uD83C\uDF76', categoryId: 'pantry',    unit: 'ml', densityGPerMl: 1.15, dietClass: 'plant', allergens: ['soy', 'gluten'] },
    { id: 'salt',        name: 'Salt',        emoji: '\uD83E\uDDC2', categoryId: 'pantry',    unit: 'g', staple: true, dietClass: 'plant', allergens: [] },
    { id: 'sugar',       name: 'Sugar',       emoji: '\uD83C\uDF6C', categoryId: 'pantry',    unit: 'g', densityGPerMl: 0.85, staple: true, dietClass: 'plant', allergens: [] },
    { id: 'honey',       name: 'Honey',       emoji: '\uD83C\uDF6F', categoryId: 'pantry',    unit: 'g', densityGPerMl: 1.42, dietClass: 'honey', allergens: [] },

    // Leftovers
    { id: 'cooked_rice', name: 'Cooked Rice', emoji: '\uD83C\uDF5B', categoryId: 'leftovers', unit: 'g', dietClass: 'plant', allergens: [] },
    { id: 'cooked_pasta',name: 'Cooked Pasta',emoji: '\uD83C\uDF72', categoryId: 'leftovers', unit: 'g', dietClass: 'plant', allergens: ['gluten'] },

    // Meat & Fish
    { id: 'chicken',     name: 'Chicken',     emoji: '\uD83C\uDF57', categoryId: 'meat',      unit: 'g', dietClass: 'meat', allergens: [] },
    { id: 'beef',        name: 'Beef',        emoji: '\uD83E\uDD69', categoryId: 'meat',      unit: 'g', dietClass: 'meat', allergens: [] },
    { id: 'bacon',       name: 'Bacon',       emoji: '\uD83E\uDD53', categoryId: 'meat',      unit: 'g', dietClass: 'meat', allergens: [] },
    { id: 'ham',         name: 'Ham',         emoji: '\uD83C\uDF56', categoryId: 'meat',      unit: 'g', dietClass: 'meat', allergens: [] },
    { id: 'sausage',     name: 'Sausage',     emoji: '\uD83C\uDF2D', categoryId: 'meat',      unit: 'pcs', dietClass: 'meat', allergens: ['gluten'] },
    { id: 'salmon',      name: 'Salmon',      emoji: '\uD83D\uDC1F', categoryId: 'meat',      unit: 'g', dietClass: 'fish', allergens: ['fish'] },
    { id: 'tuna',        name: 'Tuna',        emoji: '\uD83D\uDC20', categoryId: 'meat',      unit: 'g', dietClass: 'fish', allergens: ['fish'] }
  ];
