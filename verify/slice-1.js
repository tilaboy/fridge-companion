#!/usr/bin/env node
/* Mechanical verification for build slice 1 — first-use setup, fridge door,
 * persistent stock. Run from the project root:  node verify/slice-1.js
 *
 * Loads the real app logic (app.js) with a localStorage stub and drives the
 * first-use journey, including the evidence the spec committed to:
 * add an ingredient -> reload -> the ingredient is still there. */
'use strict';

/* A minimal localStorage stand-in. The "reload" test is simply a fresh
 * loadState() against the same storage contents. */
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

console.log('slice 1: first-use setup, fridge door, persistent stock');

var storage = makeStorage();
globalThis.localStorage = storage;
globalThis.FDC_INGREDIENTS = require('../data/ingredients.js');
var app = require('../app.js');

/* --- fresh load is the first-use state --- */
var state = app.loadState();
check('fresh load has no categories (first use)', state.categories.length === 0);
check('fresh load has empty stock', Object.keys(state.stock).length === 0);
check('fresh load has an empty shopping list', state.shoppingList.length === 0);

/* --- category setup: confirm the seeds --- */
var seeds = app.SEEDED_CATEGORIES;
state.categories = app.confirmCategories(seeds);
check('four seeded categories confirmed', state.categories.length === 4);
check('saveState writes the versioned key',
  app.saveState(state) === true && storage.getItem(app.STORAGE_KEY) !== null);

/* --- the agreed evidence: categories survive a reload --- */
var reloaded = app.loadState();
check('categories survive a reload',
  JSON.stringify(reloaded.categories) === JSON.stringify(seeds),
  JSON.stringify(reloaded.categories));

/* --- adding ingredients (both drag and tap end at addToStock) --- */
reloaded = app.addToStock(reloaded, 'tomato', 3);
app.saveState(reloaded);
check('an added ingredient survives a reload',
  app.loadState().stock.tomato === 3, String(app.loadState().stock.tomato));

reloaded = app.addToStock(reloaded, 'tomato', 2); // re-adding combines
app.saveState(reloaded);
check('re-adding combines amounts (3 + 2 = 5)',
  app.loadState().stock.tomato === 5, String(app.loadState().stock.tomato));

/* --- the amount prompt refuses everything but positive whole numbers --- */
check('valid whole amounts accepted', [1, 3, 200].every(app.isValidAmount));
check('zero refused', !app.isValidAmount(0));
check('negative refused', !app.isValidAmount(-2));
check('fractional refused', !app.isValidAmount(2.5));
check('non-numeric input refused',
  app.parseAmount('abc') === null && app.parseAmount('') === null && app.parseAmount(null) === null);
check('numeric strings parse and pass', app.parseAmount('4') === 4 && app.isValidAmount(app.parseAmount('4')));

/* --- the tray groups by the user's categories --- */
var groups = app.groupTrayByCategory(seeds);
check('tray groups follow the user category order',
  groups.map(function (g) { return g.category.id; }).join(',') === 'produce,dairy,pantry,leftovers');
check('every tray ingredient is grouped',
  groups.reduce(function (n, g) { return n + g.items.length; }, 0) === globalThis.FDC_INGREDIENTS.length);
check('tomato is filed under Produce',
  groups[0].items.some(function (i) { return i.id === 'tomato'; }));
check('leftovers category is usable',
  groups[3].items.some(function (i) { return i.id === 'cooked_rice'; }));

/* --- bad storage falls back to first use (spec > Important Failure Modes) --- */
storage.setItem(app.STORAGE_KEY, '{not json');
check('corrupted storage falls back to first use', app.loadState().categories.length === 0);

storage.setItem(app.STORAGE_KEY, JSON.stringify({
  categories: seeds,
  stock: { tomato: 0, onion: -1, garlic: 2.5, carrot: 4 },
  shoppingList: 'nope'
}));
var sanitized = app.loadState();
check('sanitize drops zero, negative, and fractional amounts',
  Object.keys(sanitized.stock).join(',') === 'carrot', JSON.stringify(sanitized.stock));
check('sanitize drops a malformed shopping list',
  Array.isArray(sanitized.shoppingList) && sanitized.shoppingList.length === 0);

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failures.length + ' CHECK(S) FAILED');
process.exit(failures.length === 0 ? 0 : 1);
