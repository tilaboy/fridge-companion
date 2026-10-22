#!/usr/bin/env node
/* Mechanical verification for build slice 5 — export and import, the safety
 * net that makes a local-first kitchen portable. Run from the project root:
 *   node verify/slice-5.js
 *
 * Why this exists: import is the only place foreign data enters the app on
 * purpose, so the tests are mostly about what it refuses. Scenes:
 *   1. The export envelope: versioned, self-describing, and detached from the
 *      live state.
 *   2. Round trip: export → import returns the same kitchen, sanitized.
 *   3. Legacy: a bare v1 state (the POC's storage key) imports unchanged.
 *   4. Sanitizing: unknown ids, staples, bad amounts, and malformed lists are
 *      dropped rather than trusted.
 *   5. Refusals: invalid JSON, arrays, foreign apps, newer schemas, and
 *      empty kitchens.
 *   6. Importing never mutates the payload it was given. */
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

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('slice 5: export, import, and refusing bad files');

globalThis.localStorage = makeStorage();
globalThis.FDC_INGREDIENTS = require('../data/ingredients.js');
globalThis.FDC_RECIPES = require('../data/recipes.js');
var app = require('../app.js');

var kitchen = app.createState();
kitchen.categories = app.confirmCategories(app.SEEDED_CATEGORIES);
kitchen.stock = { tomato: 3, egg: 6 };
kitchen.shoppingList = [
  { ingredientId: 'onion', amount: 2, fromRecipeId: 'scrambled_eggs' }
];

/* --- 1. the export envelope --- */
var now = new Date('2026-10-22T10:00:00.000Z');
var envelope = app.buildExport(kitchen, now);
check('the envelope names the app and the format',
  envelope.app === 'fridge-companion' && envelope.format === 'kitchen',
  JSON.stringify(envelope.app));
check('the envelope carries the schema version',
  envelope.schemaVersion === app.SCHEMA_VERSION);
check('the envelope stamps the injected export time',
  envelope.exportedAt === '2026-10-22T10:00:00.000Z', envelope.exportedAt);
check('the envelope summarizes what is inside',
  sameJson(envelope.summary, { categories: 5, ingredients: 2, shoppingList: 1 }),
  JSON.stringify(envelope.summary));

var exported = app.exportJson(kitchen, now);
check('exportJson emits parseable JSON ending in a newline',
  exported.charAt(exported.length - 1) === '\n' && !!JSON.parse(exported));
check('the file is human-readable, not minified',
  exported.indexOf('\n  "app"') !== -1);

/* an export is a snapshot, not a live reference */
envelope.state.stock.tomato = 99;
check('the exported state does not alias the live kitchen',
  kitchen.stock.tomato === 3, String(kitchen.stock.tomato));

/* --- 2. round trip --- */
var roundTrip = app.parseImportPayload(exported);
check('the export imports back cleanly', roundTrip.ok === true, roundTrip.error);
check('a round trip is not treated as legacy', roundTrip.legacy === false);
check('the round trip keeps the schema version', roundTrip.schemaVersion === app.SCHEMA_VERSION);
check('the round trip preserves the kitchen exactly',
  sameJson(roundTrip.state, kitchen), JSON.stringify(roundTrip.state));
check('the round trip reports the same summary',
  sameJson(roundTrip.summary, { categories: 5, ingredients: 2, shoppingList: 1 }));

/* --- 3. legacy bare v1 state --- */
var legacy = {
  categories: [{ id: 'produce', name: 'Produce' }],
  stock: { tomato: 4 },
  shoppingList: []
};
var legacyResult = app.parseImportPayload(JSON.stringify(legacy));
check('a bare v1 state imports without an envelope',
  legacyResult.ok === true, legacyResult.error);
check('a bare v1 state is marked legacy at version 0',
  legacyResult.legacy === true && legacyResult.schemaVersion === 0);
check('the legacy kitchen survives',
  sameJson(legacyResult.state, legacy), JSON.stringify(legacyResult.state));

/* --- 4. sanitize on import --- */
var hostile = {
  categories: [
    { id: 'produce', name: '  Produce  ' },
    { id: 'produce', name: 'Produce again' },
    { id: '', name: 'No id' },
    { id: 'dairy', name: '   ' }
  ],
  stock: {
    tomato: '2',          // numeric string → number
    egg: 1.5,             // fractional → dropped
    onion: -3,            // negative → dropped
    salt: 5,              // staple → dropped
    ghost: 3              // not a real ingredient → dropped
  },
  shoppingList: [
    { ingredientId: 'onion', amount: '2', fromRecipeId: 'scrambled_eggs' },
    { ingredientId: 'ghost', amount: 1 },
    { ingredientId: 'egg', amount: 0 },
    { ingredientId: 'tomato', amount: 1, fromRecipeId: 'no_such_recipe' }
  ]
};
var cleaned = app.parseImportPayload(JSON.stringify(hostile));
check('a messy but valid kitchen still imports', cleaned.ok === true, cleaned.error);
check('categories are trimmed, de-duplicated, and validated',
  sameJson(cleaned.state.categories, [{ id: 'produce', name: 'Produce' }]),
  JSON.stringify(cleaned.state.categories));
check('stock keeps only real, positive, whole, non-staple amounts',
  sameJson(cleaned.state.stock, { tomato: 2 }), JSON.stringify(cleaned.state.stock));
check('the shopping list drops unknown ingredients and bad amounts',
  cleaned.state.shoppingList.length === 2, String(cleaned.state.shoppingList.length));
check('a numeric-string amount becomes a number',
  cleaned.state.shoppingList[0].amount === 2);
check('an unknown recipe reference is cleared, not kept',
  cleaned.state.shoppingList[1].fromRecipeId === null,
  JSON.stringify(cleaned.state.shoppingList[1]));

/* prototype pollution via a hand-edited file */
var polluted = app.parseImportPayload('{"stock":{"__proto__":3,"tomato":1}}');
check('a __proto__ stock key is ignored',
  polluted.ok === true && sameJson(polluted.state.stock, { tomato: 1 }),
  JSON.stringify(polluted.state.stock));
check('Object.prototype is untouched',
  Object.prototype.tomato === undefined);

/* --- 5. refusals --- */
function rejects(text, why) {
  var result = app.parseImportPayload(text);
  check('refuses ' + why, result.ok === false && typeof result.error === 'string');
}

rejects('not json at all', 'invalid JSON');
rejects('[]', 'an array');
rejects('null', 'null');
rejects('{}', 'an object with nothing in it');
rejects('"just a string"', 'a bare string');
rejects(JSON.stringify({ app: 'other-app', schemaVersion: 1, state: legacy }),
  'a file from a different app');
rejects(JSON.stringify({ app: 'fridge-companion', schemaVersion: 99, state: legacy }),
  'a newer schema instead of mangling it');
rejects(JSON.stringify({ app: 'fridge-companion', state: legacy }),
  'an envelope with no schema version');
rejects(JSON.stringify({ app: 'fridge-companion', schemaVersion: 1, state: 'nope' }),
  'an envelope with no kitchen inside');
rejects(JSON.stringify({ categories: [], stock: {}, shoppingList: [] }),
  'an empty kitchen');
rejects(JSON.stringify({ stock: { ghost: 2 } }),
  'a kitchen with only unknown ingredients');

var newer = app.parseImportPayload(
  JSON.stringify({ app: 'fridge-companion', schemaVersion: 99, state: legacy }));
check('the newer-schema refusal tells the user to update',
  /newer version/.test(newer.error), newer.error);

/* --- 6. import does not mutate its payload --- */
var payload = JSON.stringify(legacy);
var before = payload;
app.parseImportPayload(payload);
check('importing leaves the payload string untouched', payload === before);

/* --- stored state and exported state agree --- */
app.saveState(kitchen);
var stored = app.loadState();
var storedExport = app.parseImportPayload(app.exportJson(stored, now));
check('what was saved exports and imports back unchanged',
  sameJson(storedExport.state, kitchen), JSON.stringify(storedExport.state));

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failures.length + ' CHECK(S) FAILED');
process.exit(failures.length === 0 ? 0 : 1);
