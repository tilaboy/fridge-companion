#!/usr/bin/env node
/* Mechanical verification for build slice 4 — the shopping list card and
 * restocking, closing the core loop. Run from the project root:
 *   node verify/slice-4.js
 *
 * Two scenes:
 *   1. Unit: "Got it" adds the recipe's quantity to stock and removes the
 *      item from the list; an emptied list removes the card; the state
 *      survives a reload.
 *   2. End to end: the whole core journey — setup, add, recommend, cook,
 *      generate the list, restock, recommend again — asserting the second
 *      recommendation reflects every change. */
'use strict';

var fs = require('fs');
var path = require('path');

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

console.log('slice 4: shopping list card, restocking, and the closed loop');

var storage = makeStorage();
globalThis.localStorage = storage;
globalThis.FDC_INGREDIENTS = require('../data/ingredients.js');
globalThis.FDC_RECIPES = require('../data/recipes.js');
var app = require('../app.js');
var allRecipes = globalThis.FDC_RECIPES;

function recipe(id) {
  return allRecipes.filter(function (r) { return r.id === id; })[0];
}

function stockOf(pairs) {
  var s = {};
  pairs.forEach(function (p) { s[p[0]] = p[1]; });
  return s;
}

function stateOf(stock, list) {
  return { categories: app.SEEDED_CATEGORIES, stock: stock, shoppingList: list || [] };
}

/* ================================================================== *
 * Scene 1 — restocking
 * ================================================================== */

var scrambled = recipe('scrambled_eggs'); // egg 3, butter 10 (+ salt, a staple)
var withList = stateOf(
  stockOf([['egg', 2]]),
  [
    { ingredientId: 'butter', amount: 10, fromRecipeId: 'scrambled_eggs' },
    { ingredientId: 'cheese', amount: 30, fromRecipeId: 'scrambled_eggs' }
  ]
);

/* --- checking an item off moves it into stock with the recipe's quantity --- */
var afterBuy = app.buyShoppingListItem(withList, 'butter');
check('checking an item off adds the recipe quantity to stock (butter 10)',
  afterBuy.stock.butter === 10, JSON.stringify(afterBuy.stock));
check('checking an item off removes it from the list',
  afterBuy.shoppingList.length === 1 && afterBuy.shoppingList[0].ingredientId === 'cheese');
check('buying combines with stock already there',
  app.buyShoppingListItem(withList, 'butter').stock.butter === 10 &&
  app.buyShoppingListItem(stateOf(stockOf([['butter', 5]]), withList.shoppingList), 'butter').stock.butter === 15);

/* --- an emptied list removes the card --- */
var empty = app.buyShoppingListItem(afterBuy, 'cheese');
check('checking the last item off empties the list (the card goes away)',
  empty.shoppingList.length === 0);
var src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
check('the card is hidden exactly when the list is empty',
  src.indexOf("els.shoppingList.classList.toggle('hidden', state.shoppingList.length === 0)") !== -1);

/* --- buying an unknown item is a harmless no-op --- */
check('buying something not on the list changes nothing',
  JSON.stringify(app.buyShoppingListItem(withList, 'garlic')) === JSON.stringify(withList));

/* --- the commit is pure and persists --- */
check('buyShoppingListItem does not mutate the state it is given',
  withList.shoppingList.length === 2 && !('butter' in withList.stock));
app.saveState(empty);
check('the store is rewritten after restocking',
  JSON.parse(storage.getItem(app.STORAGE_KEY)).stock.butter === 10);
check('the restocked kitchen survives a reload',
  app.loadState().stock.butter === 10 && app.loadState().shoppingList.length === 0);

/* ================================================================== *
 * Scene 2 — the whole core journey, end to end
 * ================================================================== */

/* A fresh browser: scene 1 left data in the same storage, so clear it
 * before walking the journey from first use. */
storage.clear();

/* 1. First use: the door opens with the seeded categories already in place. */
var firstLoad = app.loadState();
check('a fresh browser has nothing saved yet',
  firstLoad.categories.length === 0 && Object.keys(firstLoad.stock).length === 0);
var journey = app.ensureCategories(firstLoad);
check('the door opens with the seeded categories already in place',
  journey.categories.length === 5, String(journey.categories.length));
app.saveState(journey);

/* 2. Fill the fridge: 5 eggs and 10 g butter (scrambled eggs is complete —
 *    its salt is a staple and needs no tracking) and 100 g pasta (short of
 *    tomato pasta's 200 g). */
journey = app.addToStock(journey, 'egg', 5);
journey = app.addToStock(journey, 'butter', 10);
journey = app.addToStock(journey, 'pasta', 100);
app.saveState(journey);

/* 3. My Recipes: the complete recipe is the top pick. */
var picks = app.recommend(journey);
check('the complete recipe is the top pick (scrambled eggs 2/2)',
  picks.length > 0 && picks[0].recipe.id === 'scrambled_eggs' &&
  picks[0].score === 1 && picks[0].total === 2,
  picks.length ? picks[0].recipe.id + ' ' + picks[0].have + '/' + picks[0].total : 'none');

/* 4. Cook this: the stock drops by the recipe amounts. */
journey = app.cookRecipe(journey, scrambled);
app.saveState(journey);
check('after cooking: 2 eggs left, butter gone',
  journey.stock.egg === 2 && !('butter' in journey.stock),
  JSON.stringify(journey.stock));

/* 5. Generate the shopping list from a card further down the picks — the
 *    learner can open any of them, not just the first (soy rice bowl:
 *    cooked rice 250, soy sauce 15; its egg is in stock). */
picks = app.recommend(journey);
check('after cooking, recommendations change (scrambled eggs is gone, pancakes tops)',
  picks.every(function (p) { return p.recipe.id !== 'scrambled_eggs'; }) &&
  picks[0].recipe.id === 'pancakes',
  picks.map(function (p) { return p.recipe.id; }).join(','));
var soy = recipe('soy_rice_bowl');
check('soy rice bowl is among the picks',
  picks.some(function (p) { return p.recipe.id === 'soy_rice_bowl'; }),
  picks.map(function (p) { return p.recipe.id; }).join(','));
journey = app.addToShoppingList(journey, soy);
check('the shopping list holds the missing ingredients (rice 250, soy sauce 15)',
  journey.shoppingList.length === 2 &&
  journey.shoppingList.some(function (i) { return i.ingredientId === 'cooked_rice' && i.amount === 250; }) &&
  journey.shoppingList.some(function (i) { return i.ingredientId === 'soy_sauce' && i.amount === 15; }));
app.saveState(journey);

/* 6. Shop: check both items off. */
journey = app.buyShoppingListItem(journey, 'cooked_rice');
journey = app.buyShoppingListItem(journey, 'soy_sauce');
app.saveState(journey);
check('after shopping: stock holds the bought quantities, the list is empty',
  journey.stock.cooked_rice === 250 && journey.stock.soy_sauce === 15 && journey.shoppingList.length === 0,
  JSON.stringify(journey.stock));

/* 7. My Recipes again: the loop is closed. */
picks = app.recommend(journey);
check('the next My Recipes reflects cooking and shopping (soy rice bowl 3/3)',
  picks.length > 0 && picks[0].recipe.id === 'soy_rice_bowl' && picks[0].score === 1,
  picks.length ? picks[0].recipe.id + ' ' + picks[0].score : 'none');

/* 8. Close and return: storage is read again, exactly as left. */
var returned = app.loadState();
check('the kitchen is exactly as left after the round trip',
  returned.stock.egg === 2 && returned.stock.cooked_rice === 250 &&
  returned.stock.soy_sauce === 15 && returned.shoppingList.length === 0 &&
  JSON.stringify(returned.categories) === JSON.stringify(app.SEEDED_CATEGORIES),
  JSON.stringify(returned.stock));

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failures.length + ' CHECK(S) FAILED');
process.exit(failures.length === 0 ? 0 : 1);
