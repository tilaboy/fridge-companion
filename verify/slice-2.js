#!/usr/bin/env node
/* Mechanical verification for build slice 2 — My Recipes recommends from
 * what you actually have. Run from the project root:  node verify/slice-2.js
 *
 * Drives the real recommendation engine (app.js) against the real built-in
 * data, with fixture stocks, and checks the matching rule: score = have ÷
 * need, ranked with the learner's length bias (fit × (1 + 0.1 × tracked
 * ingredients)) and tie-broken by fewest missing, then id — plus the
 * amount-level check, top 2-3, the empty result for the empty state, and the
 * staple rule: milk, flour, salt, and sugar are assumed on hand, so they
 * count on neither side of the score. */
'use strict';

function makeStorage() {
  var data = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; },
    clear: function () { data = {}; }
  };
}

var failures = [];
function check(label, ok, detail) {
  if (ok) {
    console.log('  ok   ' + label);
  } else {
    failures.push(label);
    console.log('  FAIL ' + label + (detail ? ' (' + detail + ')' : ''));
  }
}

console.log('slice 2: My Recipes recommends from what you actually have');

var storage = makeStorage();
globalThis.localStorage = storage;
globalThis.FDC_INGREDIENTS = require('../data/ingredients.js');
globalThis.FDC_RECIPES = require('../data/recipes.js');
var app = require('../app.js');
var tray = globalThis.FDC_INGREDIENTS;
var allRecipes = globalThis.FDC_RECIPES;

/* --- data integrity: the tray covers the recipes and nothing else --- */
var trayIds = {};
tray.forEach(function (i) { trayIds[i.id] = true; });

var usedIds = {};
var allRecipeIngredientsExist = allRecipes.every(function (r) {
  return r.ingredients.every(function (ri) {
    usedIds[ri.ingredientId] = true;
    return !!trayIds[ri.ingredientId];
  });
});
check('every recipe ingredient exists in the tray', allRecipeIngredientsExist);
check('every tray ingredient is used by at least one recipe',
  tray.every(function (i) { return usedIds[i.id]; }),
  tray.filter(function (i) { return !usedIds[i.id]; }).map(function (i) { return i.id; }).join(','));

var recipeIds = allRecipes.map(function (r) { return r.id; });
check('recipe ids are unique', new Set(recipeIds).size === recipeIds.length);
check('the collection is three dozen-ish recipes', recipeIds.length >= 30 && recipeIds.length <= 40,
  String(recipeIds.length));
check('every recipe has steps', allRecipes.every(function (r) { return r.steps.length >= 3; }));

/* --- the meat and fish collection --- */
var meats = ['chicken', 'beef', 'bacon', 'ham', 'sausage', 'salmon', 'tuna'];
check('every meat and fish ingredient is in the tray',
  meats.every(function (id) { return trayIds[id]; }));
var meatRecipes = allRecipes.filter(function (r) {
  return r.ingredients.some(function (ri) { return meats.indexOf(ri.ingredientId) !== -1; });
});
check('the collection has a real meat and fish spread', meatRecipes.length >= 9, String(meatRecipes.length));
check('meat and fish ingredients are never staples',
  meats.every(function (id) { return !app.isStaple(id); }));

function stockOf(pairs) {
  var s = {};
  pairs.forEach(function (p) { s[p[0]] = p[1]; });
  return s;
}

/* --- a full kitchen: every recipe fits, at most 3 cards --- */
var full = stockOf(tray.filter(function (i) { return !app.isStaple(i.id); })
  .map(function (i) { return [i.id, 999]; }));
var fullState = { categories: app.SEEDED_CATEGORIES, stock: full, shoppingList: [] };
var picks = app.recommend(fullState);
check('a full kitchen shows at most 3 cards', picks.length === 3, String(picks.length));
check('a full kitchen shows perfect fits', picks.every(function (p) { return p.score === 1; }));
check('a full kitchen leads with the longest recipe (beef bolognese, 6 ingredients)',
  picks[0].recipe.id === 'beef_bolognese' && picks[0].total === 6 &&
  picks.map(function (p) { return p.total; }).join(',') === '6,5,5',
  picks.map(function (p) { return p.recipe.id + ':' + p.total; }).join(', '));
check('complete recipes of equal length fall back to a stable id order',
  picks[1].recipe.id === 'chicken_soup' && picks[2].recipe.id === 'chicken_stir_fry',
  picks.map(function (p) { return p.recipe.id; }).join(','));

/* --- staples never count: this is the rule that changed the engine --- */
var scrambled = allRecipes.filter(function (r) { return r.id === 'scrambled_eggs'; })[0];
var stapleScored = app.scoreRecipe(scrambled, stockOf([['egg', 5], ['butter', 10]]));
check('a recipe calling for salt scores only its tracked ingredients (egg, butter -> 2/2)',
  stapleScored.total === 2 && stapleScored.have === 2 && stapleScored.score === 1,
  JSON.stringify(stapleScored));
check('staples are never reported as missing',
  app.missingIngredients({ stock: stockOf([['egg', 3]]) }, scrambled)
    .map(function (m) { return m.ingredientId; }).join(',') === 'butter',
  JSON.stringify(app.missingIngredients({ stock: stockOf([['egg', 3]]) }, scrambled)));

/* --- a partial kitchen: the best fit is the top pick --- */
var partial = { categories: app.SEEDED_CATEGORIES, stock: stockOf([['egg', 5], ['butter', 10], ['pasta', 100]]), shoppingList: [] };
picks = app.recommend(partial);
check('a partial kitchen still recommends', picks.length > 0);
check('the top pick is the best fit (scrambled eggs, complete)',
  picks[0].recipe.id === 'scrambled_eggs' && picks[0].have === 2 && picks[0].missing === 0,
  picks.length ? picks[0].recipe.id + ' ' + picks[0].have + '/' + picks[0].total : 'none');

/* --- the amount-level check: needing 2 with 1 in stock counts as missing --- */
var shortTomato = stockOf([['pasta', 200], ['tomato', 1], ['garlic', 2], ['olive_oil', 15]]);
var scored = app.scoreRecipe(allRecipes.filter(function (r) { return r.id === 'tomato_pasta'; })[0], shortTomato);
check('a short amount counts as missing (need 2 tomatoes, have 1)',
  scored.have === 3 && scored.missing === 1 && Math.abs(scored.score - 0.75) < 1e-9,
  JSON.stringify(scored));

var shortPasta = { categories: app.SEEDED_CATEGORIES, stock: stockOf([['pasta', 100]]), shoppingList: [] };
check('100 g of pasta fits no recipe (every one needs 200 g)',
  app.recommend(shortPasta).length === 0);

/* --- the length bias: the learner asked for longer recipes to be favoured,
 *     because a short recipe is far easier to complete and otherwise always
 *     wins. rank = fit × (1 + 0.1 × tracked ingredients). --- */
check('the length weight is the agreed one (3 ingredients ×1.3, 5 ×1.5)',
  app.LENGTH_BONUS === 0.1 &&
  Math.abs(app.lengthMultiplier(3) - 1.3) < 1e-9 &&
  Math.abs(app.lengthMultiplier(5) - 1.5) < 1e-9,
  String(app.lengthMultiplier(3)));

/* Two recipes at the same fit ratio now rank by length: soy rice bowl and beef
 * bolognese are both 1/3, and bolognese (6 ingredients, ×1.6) comes first. */
var tieStock = { categories: app.SEEDED_CATEGORIES, stock: stockOf([['egg', 2], ['beef', 250], ['tomato', 3]]), shoppingList: [] };
picks = app.recommend(tieStock);
var tieIds = picks.map(function (p) { return p.recipe.id; });
check('an equal fit ratio prefers the longer recipe (bolognese 2/6 before soy rice bowl 1/3)',
  tieIds.indexOf('beef_bolognese') !== -1 && tieIds.indexOf('soy_rice_bowl') !== -1 &&
  tieIds.indexOf('beef_bolognese') < tieIds.indexOf('soy_rice_bowl'),
  tieIds.join(','));

/* The consequence the learner accepted: a nearly-complete long recipe now
 * outranks a complete short one. */
var mixed = stockOf([['egg', 5], ['butter', 10], ['beef', 250], ['tomato', 3],
  ['onion', 1], ['garlic', 3], ['pasta', 200]]);
picks = app.recommend({ categories: app.SEEDED_CATEGORIES, stock: mixed, shoppingList: [] });
check('a nearly-complete long recipe outranks a complete short one (bolognese 5/6 before scrambled eggs 2/2)',
  picks[0].recipe.id === 'beef_bolognese' && picks[0].have === 5 && picks[0].missing === 1 &&
  picks.some(function (p) { return p.recipe.id === 'scrambled_eggs'; }),
  picks.map(function (p) { return p.recipe.id + ' ' + p.have + '/' + p.total; }).join(', '));

/* The remaining tie-break (fewest missing) still decides equal ranks. It is
 * now unreachable with the built-in data, so it is exercised with a
 * synthetic pair: 4 ingredients complete and 10 ingredients at 7 both rank
 * 1.4, and the complete one must come first. */
var tieList = [
  { id: 'aaa_short', name: 'Short', dishEmoji: '1', steps: ['a', 'b', 'c'],
    ingredients: ['egg', 'butter', 'bread', 'cheese'].map(function (id) {
      return { ingredientId: id, amount: 1 };
    }) },
  { id: 'zzz_long', name: 'Long', dishEmoji: '2', steps: ['a', 'b', 'c'],
    ingredients: ['chicken', 'beef', 'bacon', 'ham', 'sausage', 'salmon', 'tuna',
      'tomato', 'onion', 'garlic'].map(function (id) {
      return { ingredientId: id, amount: 1 };
    }) }
];
var tieKitchen = stockOf(['egg', 'butter', 'bread', 'cheese', 'chicken', 'beef', 'bacon',
  'ham', 'sausage', 'salmon', 'tuna'].map(function (id) { return [id, 1]; }));
var tiePicks = app.recommend({ categories: app.SEEDED_CATEGORIES, stock: tieKitchen, shoppingList: [] }, tieList);
check('equal ranks still tie-break by fewest missing (4/4 before 7/10)',
  tiePicks.length === 2 && tiePicks[0].recipe.id === 'aaa_short' &&
  Math.abs(tiePicks[1].rank - tiePicks[0].rank) < 1e-9,
  tiePicks.map(function (p) { return p.recipe.id + ' ' + p.have + '/' + p.total + ' ' + p.rank; }).join(', '));

/* --- the empty state: an empty fridge recommends nothing --- */
var empty = { categories: app.SEEDED_CATEGORIES, stock: {}, shoppingList: [] };
check('an empty fridge recommends nothing (empty state)', app.recommend(empty).length === 0);

/* --- recommend never mutates the state it is given --- */
var before = JSON.stringify(partial.stock);
app.recommend(partial);
check('recommend does not mutate the stock', JSON.stringify(partial.stock) === before);

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failures.length + ' CHECK(S) FAILED');
process.exit(failures.length === 0 ? 0 : 1);
