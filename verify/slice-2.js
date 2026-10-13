#!/usr/bin/env node
/* Mechanical verification for build slice 2 — My Recipes recommends from
 * what you actually have. Run from the project root:  node verify/slice-2.js
 *
 * Drives the real recommendation engine (app.js) against the real built-in
 * data, with fixture stocks, and checks the matching rule the spec
 * committed to: score = have ÷ need, tie-break by fewest missing,
 * amount-level check, top 2-3, empty result for the empty state. */
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
check('the collection is a couple dozen recipes', recipeIds.length >= 20 && recipeIds.length <= 30,
  String(recipeIds.length));
check('every recipe has steps', allRecipes.every(function (r) { return r.steps.length >= 3; }));

function stockOf(pairs) {
  var s = {};
  pairs.forEach(function (p) { s[p[0]] = p[1]; });
  return s;
}

/* --- a full kitchen: every recipe fits, at most 3 cards, stable order --- */
var full = stockOf(tray.map(function (i) { return [i.id, 999]; }));
var fullState = { categories: app.SEEDED_CATEGORIES, stock: full, shoppingList: [] };
var picks = app.recommend(fullState);
check('a full kitchen shows at most 3 cards', picks.length === 3, String(picks.length));
check('a full kitchen shows perfect fits', picks.every(function (p) { return p.score === 1; }));
var idsInOrder = picks.map(function (p) { return p.recipe.id; });
check('equal fits fall back to a stable id order',
  JSON.stringify(idsInOrder) === JSON.stringify(idsInOrder.slice().sort()),
  idsInOrder.join(','));

/* --- a partial kitchen: the best fit is the top pick --- */
var partial = { categories: app.SEEDED_CATEGORIES, stock: stockOf([['egg', 3], ['salt', 2]]), shoppingList: [] };
picks = app.recommend(partial);
check('a partial kitchen still recommends', picks.length > 0);
check('the top pick is the best fit (scrambled eggs: 2/3)',
  picks[0].recipe.id === 'scrambled_eggs' && picks[0].have === 2 && picks[0].missing === 1,
  picks.length ? picks[0].recipe.id + ' ' + picks[0].have + '/' + picks[0].total : 'none');

/* --- the amount-level check: needing 2 with 1 in stock counts as missing --- */
var shortTomato = stockOf([['pasta', 200], ['tomato', 1], ['garlic', 2], ['olive_oil', 15], ['salt', 2]]);
var scored = app.scoreRecipe(allRecipes.filter(function (r) { return r.id === 'tomato_pasta'; })[0], shortTomato);
check('a short amount counts as missing (need 2 tomatoes, have 1)',
  scored.have === 4 && scored.missing === 1 && Math.abs(scored.score - 0.8) < 1e-9,
  JSON.stringify(scored));

var shortPasta = { categories: app.SEEDED_CATEGORIES, stock: stockOf([['pasta', 100]]), shoppingList: [] };
check('100 g of pasta fits no recipe (every one needs 200 g)',
  app.recommend(shortPasta).length === 0);

/* --- the tie-break: equal score, fewest missing first --- */
/* soy_rice_bowl scores 1/3 (missing 2) and one_pan_potato_bake scores 2/6
 * (missing 4) — equal 0.333, so fewest-missing must decide. */
var tieStock = { categories: app.SEEDED_CATEGORIES, stock: stockOf([['potato', 2], ['carrot', 1], ['egg', 2]]), shoppingList: [] };
picks = app.recommend(tieStock);
var tieIds = picks.map(function (p) { return p.recipe.id; });
check('equal scores tie-break by fewest missing (soy rice bowl 1/3 before one-pan bake 2/6)',
  tieIds.indexOf('soy_rice_bowl') !== -1 && tieIds.indexOf('one_pan_potato_bake') !== -1 &&
  tieIds.indexOf('soy_rice_bowl') < tieIds.indexOf('one_pan_potato_bake'),
  tieIds.join(','));

/* --- the empty state: an empty fridge recommends nothing --- */
var empty = { categories: app.SEEDED_CATEGORIES, stock: {}, shoppingList: [] };
check('an empty fridge recommends nothing (empty state)', app.recommend(empty).length === 0);

/* --- recommend never mutates the state it is given --- */
var before = JSON.stringify(partial.stock);
app.recommend(partial);
check('recommend does not mutate the stock', JSON.stringify(partial.stock) === before);

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failures.length + ' CHECK(S) FAILED');
process.exit(failures.length === 0 ? 0 : 1);
