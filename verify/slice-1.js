#!/usr/bin/env node
/* Mechanical verification for build slice 1 — first-use setup, fridge door,
 * persistent stock. Run from the project root:  node verify/slice-1.js
 *
 * Loads the real app logic (app.js) with a localStorage stub and drives the
 * first-use journey, including the evidence the spec committed to:
 * add an ingredient -> reload -> the ingredient is still there. */
'use strict';

var fs = require('fs');
var path = require('path');

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
check('five seeded categories confirmed', state.categories.length === 5, String(state.categories.length));
check('saveState writes the versioned key',
  app.saveState(state) === true && storage.getItem(app.STORAGE_KEY) !== null);

/* --- the agreed evidence: categories survive a reload --- */
var reloaded = app.loadState();
check('categories survive a reload',
  JSON.stringify(reloaded.categories) === JSON.stringify(seeds),
  JSON.stringify(reloaded.categories));

/* --- the app opens straight onto the door: seeds are adopted, not confirmed --- */
var adopted = app.ensureCategories(app.createState());
check('a first visit adopts the seeded categories instead of a setup screen',
  adopted.categories.map(function (c) { return c.id; }).join(',') ===
  'produce,dairy,pantry,leftovers,meat',
  adopted.categories.map(function (c) { return c.id; }).join(','));
check('an existing kitchen keeps its own categories (renames survive)',
  JSON.stringify(app.ensureCategories({
    categories: [{ id: 'produce', name: 'Veg' }], stock: {}, shoppingList: []
  }).categories) === JSON.stringify([{ id: 'produce', name: 'Veg' }]));

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
  groups.map(function (g) { return g.category.id; }).join(',') === 'produce,dairy,pantry,leftovers,meat',
  groups.map(function (g) { return g.category.id; }).join(','));
check('every tray ingredient is grouped',
  groups.reduce(function (n, g) { return n + g.items.length; }, 0) === globalThis.FDC_INGREDIENTS.length);
check('tomato is filed under Produce',
  groups[0].items.some(function (i) { return i.id === 'tomato'; }));
check('leftovers category is usable',
  groups[3].items.some(function (i) { return i.id === 'cooked_rice'; }));
check('meat and fish have their own category',
  groups[4].items.some(function (i) { return i.id === 'chicken'; }) &&
  groups[4].items.some(function (i) { return i.id === 'salmon'; }));

/* --- an ingredient whose category the user dropped stays visible --- */
var withoutMeat = app.groupTrayByCategory(seeds.filter(function (c) { return c.id !== 'meat'; }));
var fallback = withoutMeat[withoutMeat.length - 1];
check('a dropped category falls back to "Other" instead of hiding ingredients',
  fallback.category.id === '__other' && fallback.category.name === 'Other' &&
  fallback.items.some(function (i) { return i.id === 'chicken'; }),
  JSON.stringify(fallback.category));
check('the fallback covers every ingredient the user has no category for',
  withoutMeat.reduce(function (n, g) { return n + g.items.length; }, 0) === globalThis.FDC_INGREDIENTS.length);

/* --- staples are marked in the tray data --- */
check('staples are declared in the ingredient data',
  app.isStaple('salt') && app.isStaple('sugar') && app.isStaple('flour') && app.isStaple('milk'));
check('ordinary ingredients are not staples',
  !app.isStaple('egg') && !app.isStaple('butter') && !app.isStaple('chicken'));

/* --- the door's shape: one screen, the tray beside the fridge (spec > Look
 *     and Feel). Layout is visual, so this reads the markup itself. --- */
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
check('the setup screen and the Done control are gone — the app opens on the door',
  html.indexOf('id="setup-screen"') === -1 && html.indexOf('id="done-button"') === -1 &&
  html.indexOf('id="first-use-hint"') === -1);
check('the ingredient tray lives in a panel beside the fridge, not below it',
  html.indexOf('class="door-layout"') !== -1 &&
  html.indexOf('class="door-main"') !== -1 &&
  html.indexOf('class="tray-panel"') !== -1 &&
  html.indexOf('id="ingredient-tray"') !== -1);
check('My Recipes sits under the fridge, above the shopping list',
  html.indexOf('id="fridge"') < html.indexOf('id="my-recipes-button"') &&
  html.indexOf('id="my-recipes-button"') < html.indexOf('id="shopping-list"'));
check('categories are edited in the tray panel instead of on a first screen',
  html.indexOf('id="categories-panel"') !== -1 && html.indexOf('id="seed-list"') !== -1);

/* The tray is where the learner works, so it takes two thirds of the row
 * and the fridge keeps one third (spec > Look and Feel). */
var cssSrc = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
check('the tray takes two thirds of the row and the fridge one third',
  /\.door-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*2fr\)/
    .test(cssSrc));

var appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
check('the tray is built as collapsible category groups whose open state survives a re-render',
  appSrc.indexOf("createElement('details')") !== -1 &&
  appSrc.indexOf("'tray-group-head'") !== -1 &&
  appSrc.indexOf('session.openGroups') !== -1);

/* Every element the app looks up must exist in the page — the guard that
 * catches a renamed or deleted id after a layout change. */
var wanted = [];
var idRe = /getElementById\('([^']+)'\)/g;
var idMatch;
while ((idMatch = idRe.exec(appSrc)) !== null) wanted.push(idMatch[1]);
var missingIds = wanted.filter(function (id) { return html.indexOf('id="' + id + '"') === -1; });
check('every element the app looks up exists in the page (' + wanted.length + ' ids)',
  missingIds.length === 0, missingIds.join(', '));

/* --- bad storage falls back to first use (spec > Important Failure Modes) --- */
storage.setItem(app.STORAGE_KEY, '{not json');
check('corrupted storage falls back to first use', app.loadState().categories.length === 0);

storage.setItem(app.STORAGE_KEY, JSON.stringify({
  categories: seeds,
  stock: { tomato: 0, onion: -1, garlic: 2.5, carrot: 4, salt: 99 },
  shoppingList: 'nope'
}));
var sanitized = app.loadState();
check('sanitize drops zero, negative, and fractional amounts',
  Object.keys(sanitized.stock).join(',') === 'carrot', JSON.stringify(sanitized.stock));
check('sanitize drops staple stock left by an earlier version',
  !('salt' in sanitized.stock), JSON.stringify(sanitized.stock));
check('sanitize drops a malformed shopping list',
  Array.isArray(sanitized.shoppingList) && sanitized.shoppingList.length === 0);

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failures.length + ' CHECK(S) FAILED');
process.exit(failures.length === 0 ? 0 : 1);
