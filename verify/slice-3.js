#!/usr/bin/env node
/* Mechanical verification for build slice 3 — recipe card view, cook-this
 * commit, combining animation. Run from the project root:  node verify/slice-3.js
 *
 * Drives the real commit logic (app.js) against the real built-in recipes
 * with a localStorage stub, and checks the effects the spec committed to:
 * "Cook this" deducts only what you have, "Generate the shopping list"
 * sends the missing ingredients with the recipe's quantities, the store is
 * rewritten in both cases, and the animation is a single CSS keyframe
 * sequence invoked once per commit. */
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

console.log('slice 3: recipe card view, cook-this commit, combining animation');

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

function stateOf(stock) {
  return { categories: app.SEEDED_CATEGORIES, stock: stock, shoppingList: [] };
}

/* scrambled eggs needs egg 3, butter 10 (+ salt, a staple that is never
 * tracked and never deducted) */
var scrambled = recipe('scrambled_eggs');

/* --- "Cook this" deducts exactly the recipe amount from what you have --- */
var kitchen = stateOf(stockOf([['egg', 5], ['butter', 10]]));
var snapshot = JSON.stringify(kitchen.stock);
var after = app.cookRecipe(kitchen, scrambled);
check('cook deducts each have-ingredient by the recipe amount (5 eggs - 3 = 2)',
  after.stock.egg === 2, JSON.stringify(after.stock));
check('an amount reaching 0 drops off the fridge display (butter)',
  !('butter' in after.stock), JSON.stringify(after.stock));
check('cook never takes stock below zero',
  Object.keys(after.stock).every(function (id) { return after.stock[id] > 0; }));

/* --- staples are never consumed --- */
var withStaple = app.cookRecipe(stateOf(stockOf([['egg', 3], ['salt', 99]])), scrambled);
check('cooking never deducts a staple (salt stays put)',
  withStaple.stock.salt === 99 && !('egg' in withStaple.stock), JSON.stringify(withStaple.stock));

/* --- a short amount is deducted down to whatever is left --- */
var short = stateOf(stockOf([['egg', 5], ['butter', 4]]));
after = app.cookRecipe(short, scrambled);
check('a short amount is deducted to zero and removed (4 butter < 10)',
  after.stock.egg === 2 && !('butter' in after.stock), JSON.stringify(after.stock));

/* --- missing ingredients are untouched --- */
var noButter = stateOf(stockOf([['egg', 3]]));
after = app.cookRecipe(noButter, scrambled);
check('missing ingredients are untouched by cooking',
  !('butter' in after.stock) && !('egg' in after.stock), JSON.stringify(after.stock));
check('cooking with an empty fridge changes nothing',
  JSON.stringify(app.cookRecipe(stateOf({}), scrambled).stock) === '{}');

/* --- the commit is pure and rewrites the store --- */
check('cookRecipe does not mutate the state it is given',
  JSON.stringify(kitchen.stock) === snapshot);
var cooked = app.cookRecipe(kitchen, scrambled);
app.saveState(cooked);
var persisted = JSON.parse(storage.getItem(app.STORAGE_KEY));
check('the store is rewritten after cooking',
  persisted.stock.egg === 2 && !('butter' in persisted.stock));

/* --- "Generate the shopping list" sends the missing ingredients --- */
var forList = stateOf(stockOf([['egg', 3]])); // butter 10 missing; salt is a staple
var listed = app.addToShoppingList(forList, scrambled);
check('the missing ingredients appear with the recipe quantities',
  listed.shoppingList.length === 1 &&
  listed.shoppingList.some(function (i) {
    return i.ingredientId === 'butter' && i.amount === 10 && i.fromRecipeId === 'scrambled_eggs';
  }),
  JSON.stringify(listed.shoppingList));
check('staples are never sent to the shopping list',
  listed.shoppingList.every(function (i) { return !app.isStaple(i.ingredientId); }));
check('have-ingredients are not sent to the shopping list',
  listed.shoppingList.every(function (i) { return i.ingredientId !== 'egg'; }));
check('a partial amount still counts as missing (need 200 g, have 100 g)',
  app.addToShoppingList(stateOf(stockOf([['pasta', 100]])), recipe('tomato_pasta'))
    .shoppingList.length === 4,
  JSON.stringify(app.addToShoppingList(stateOf(stockOf([['pasta', 100]])), recipe('tomato_pasta')).shoppingList));

/* --- the list never duplicates --- */
check('generating twice does not duplicate list items',
  app.addToShoppingList(listed, scrambled).shoppingList.length === 1);
check('a perfect match adds nothing to the list',
  app.addToShoppingList(stateOf(stockOf([['egg', 3], ['butter', 10]])), scrambled)
    .shoppingList.length === 0);
check('addToShoppingList does not mutate the state it is given',
  forList.shoppingList.length === 0);

/* --- the store is rewritten after a list commit --- */
app.saveState(listed);
persisted = JSON.parse(storage.getItem(app.STORAGE_KEY));
check('the store is rewritten after generating the list',
  persisted.shoppingList.length === 1 &&
  persisted.shoppingList.every(function (i) { return isValidListAmount(i.amount); }));
function isValidListAmount(n) { return typeof n === 'number' && n > 0; }

/* --- the list survives a reload, ready for slice 4's card --- */
check('the shopping list survives a reload',
  app.loadState().shoppingList.length === 1 &&
  app.loadState().shoppingList[0].ingredientId === 'butter');

/* --- the combining animation flies the committed ingredients --- */
var spec = app.combineAnimationSpec(scrambled, ['egg', 'butter']);
check('the animation flies each committed ingredient once',
  spec.flying.length === 2 && spec.flying.map(function (i) { return i.id; }).join(',') === 'egg,butter',
  spec.flying.map(function (i) { return i.id; }).join(','));
check('the animation resolves into the dish emoji',
  spec.dishEmoji === scrambled.dishEmoji && spec.dishEmoji === '\uD83C\uDF73');
check('the animation spec drops unknown ids and duplicates',
  app.combineAnimationSpec(scrambled, ['egg', 'egg', 'nope']).flying.length === 1);

/* --- styles.css carries the keyframes --- */
var css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
check('styles.css defines the combining keyframes',
  css.indexOf('@keyframes fdc-combine-fly') !== -1 &&
  css.indexOf('@keyframes fdc-combine-dish') !== -1);

/* --- the commit path invokes the animation exactly once per commit --- */
var src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
var invocations = src.match(/playCombineAnimation\(/g) || [];
check('one definition plus one call per commit button (Cook this, Generate the list)',
  invocations.length === 3, String(invocations.length));

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failures.length + ' CHECK(S) FAILED');
process.exit(failures.length === 0 ? 0 : 1);
