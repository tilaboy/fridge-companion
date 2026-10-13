/* Built-in ingredient tray (spec > Components > Built-in data files).
 *
 * The tray covers exactly the built-in recipe collection (data/recipes.js) —
 * the POC's fixed-ingredient decision. `categoryId` matches the seeded
 * category ids in app.js, so the fridge door can group the tray by whatever
 * the user confirmed at first use.
 *
 * Loaded as a plain script before app.js; in node (verification harnesses)
 * the same file is require()d. */
(function (root) {
  'use strict';

  var ingredients = [
    // Produce
    { id: 'tomato',      name: 'Tomato',      emoji: '\uD83C\uDF45', categoryId: 'produce',   unit: 'pcs' },
    { id: 'onion',       name: 'Onion',       emoji: '\uD83E\uDDC5', categoryId: 'produce',   unit: 'pcs' },
    { id: 'garlic',      name: 'Garlic',      emoji: '\uD83E\uDDC4', categoryId: 'produce',   unit: 'cloves' },
    { id: 'potato',      name: 'Potato',      emoji: '\uD83E\uDD54', categoryId: 'produce',   unit: 'pcs' },
    { id: 'carrot',      name: 'Carrot',      emoji: '\uD83E\uDD55', categoryId: 'produce',   unit: 'pcs' },
    { id: 'broccoli',    name: 'Broccoli',    emoji: '\uD83E\uDD66', categoryId: 'produce',   unit: 'pcs' },
    { id: 'spinach',     name: 'Spinach',     emoji: '\uD83E\uDD6C', categoryId: 'produce',   unit: 'bunch' },
    { id: 'mushroom',    name: 'Mushroom',    emoji: '\uD83C\uDF44', categoryId: 'produce',   unit: 'g' },
    { id: 'bell_pepper', name: 'Bell Pepper', emoji: '\uD83E\uDED1', categoryId: 'produce',   unit: 'pcs' },
    { id: 'lemon',       name: 'Lemon',       emoji: '\uD83C\uDF4B', categoryId: 'produce',   unit: 'pcs' },

    // Dairy
    { id: 'egg',         name: 'Egg',         emoji: '\uD83E\uDD5A', categoryId: 'dairy',     unit: 'pcs' },
    { id: 'milk',        name: 'Milk',        emoji: '\uD83E\uDD5B', categoryId: 'dairy',     unit: 'ml' },
    { id: 'butter',      name: 'Butter',      emoji: '\uD83E\uDDC8', categoryId: 'dairy',     unit: 'g' },
    { id: 'cheese',      name: 'Cheese',      emoji: '\uD83E\uDDC0', categoryId: 'dairy',     unit: 'g' },

    // Pantry
    { id: 'flour',       name: 'Flour',       emoji: '\uD83C\uDF3E', categoryId: 'pantry',    unit: 'g' },
    { id: 'rice',        name: 'Rice',        emoji: '\uD83C\uDF5A', categoryId: 'pantry',    unit: 'g' },
    { id: 'pasta',       name: 'Pasta',       emoji: '\uD83C\uDF5D', categoryId: 'pantry',    unit: 'g' },
    { id: 'bread',       name: 'Bread',       emoji: '\uD83C\uDF5E', categoryId: 'pantry',    unit: 'slices' },
    { id: 'olive_oil',   name: 'Olive Oil',   emoji: '\uD83E\uDED2', categoryId: 'pantry',    unit: 'ml' },
    { id: 'soy_sauce',   name: 'Soy Sauce',   emoji: '\uD83C\uDF76', categoryId: 'pantry',    unit: 'ml' },
    { id: 'salt',        name: 'Salt',        emoji: '\uD83E\uDDC2', categoryId: 'pantry',    unit: 'g' },
    { id: 'sugar',       name: 'Sugar',       emoji: '\uD83C\uDF6C', categoryId: 'pantry',    unit: 'g' },
    { id: 'honey',       name: 'Honey',       emoji: '\uD83C\uDF6F', categoryId: 'pantry',    unit: 'g' },

    // Leftovers
    { id: 'cooked_rice', name: 'Cooked Rice', emoji: '\uD83C\uDF5B', categoryId: 'leftovers', unit: 'g' },
    { id: 'cooked_pasta',name: 'Cooked Pasta',emoji: '\uD83C\uDF72', categoryId: 'leftovers', unit: 'g' }
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ingredients;
  } else {
    root.FDC_INGREDIENTS = ingredients;
  }
})(typeof window !== 'undefined' ? window : globalThis);
