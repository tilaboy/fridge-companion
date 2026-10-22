#!/usr/bin/env node
/* Mechanical verification for build slice 6 — the rest of M0: reset, cross-tab
 * sync, and the installable/offline shell. Run from the project root:
 *   node verify/slice-6.js
 *
 * Scenes:
 *   1. Reset clears this app's key and nothing else.
 *   2. A tab receiving another tab's storage value reconciles to the same
 *      kitchen; a missing key means reset; garbage is ignored, never applied.
 *   3. The PWA shell is complete: manifest fields, real icons at the declared
 *      sizes, and every precached file present on disk.
 *   4. The privacy page exists and the app links to it. */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

function makeStorage() {
  var data = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) { data[key] = String(value); },
    removeItem: function (key) { delete data[key]; },
    clear: function () { data = {}; },
    keys: function () { return Object.keys(data); }
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

function pngSize(file) {
  var bytes = fs.readFileSync(file);
  var isPng = bytes.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

console.log('slice 6: reset, cross-tab sync, and the installable shell');

globalThis.localStorage = makeStorage();
globalThis.FDC_INGREDIENTS = require('../data/ingredients.js');
globalThis.FDC_RECIPES = require('../data/recipes.js');
var app = require('../app.js');

/* --- 1. reset --- */
var storage = globalThis.localStorage;
storage.setItem(app.STORAGE_KEY, JSON.stringify({ categories: [], stock: { tomato: 2 }, shoppingList: [] }));
storage.setItem('some-other-app', 'keep me');
check('reset clears this app key', app.clearStoredKitchen(storage) === true &&
  storage.getItem(app.STORAGE_KEY) === null);
check('reset leaves other apps on the same origin alone',
  storage.getItem('some-other-app') === 'keep me');
check('reset reports failure when storage is unavailable',
  app.clearStoredKitchen(null) === false);

/* --- 2. cross-tab reconciliation --- */
var local = app.createState();
local.categories = app.confirmCategories(app.SEEDED_CATEGORIES);
local.stock = { tomato: 1 };

var raw = JSON.stringify({ categories: [{ id: 'pantry', name: 'Pantry' }], stock: { onion: 4 }, shoppingList: [] });
var incoming = app.remoteStateFromRaw(raw);
check('a remote kitchen is adopted as the local state',
  incoming && incoming.stock.onion === 4 &&
  JSON.stringify(incoming.categories) === JSON.stringify([{ id: 'pantry', name: 'Pantry' }]),
  JSON.stringify(incoming));

check('the same kitchen compares equal regardless of the local object identity',
  app.sameState(incoming, app.remoteStateFromRaw(raw)) === true);
check('a different kitchen compares different',
  app.sameState(local, incoming) === false);

var afterReset = app.remoteStateFromRaw(null);
check('a missing key means another tab reset, so seeds return',
  afterReset.stock && Object.keys(afterReset.stock).length === 0 &&
  JSON.stringify(afterReset.categories) === JSON.stringify(app.SEEDED_CATEGORIES),
  JSON.stringify(afterReset.categories));

check('unreadable storage is ignored rather than applied',
  app.remoteStateFromRaw('{not json') === null);
check('a rejected payload leaves the current kitchen untouched',
  app.sameState(local, local) === true && local.stock.tomato === 1);

/* two loads of the same kitchen serialize identically, so sameState is a
 * trustworthy "nothing changed" test */
storage.setItem(app.STORAGE_KEY, JSON.stringify({ categories: [], stock: { egg: 2, tomato: 1 }, shoppingList: [] }));
check('loads of the same kitchen compare equal',
  app.sameState(app.loadState(), app.loadState()));

/* --- 3. the PWA shell --- */
var manifestPath = path.join(ROOT, 'manifest.webmanifest');
var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

check('the manifest names the app', manifest.name === 'Fridge Door Companion' && !!manifest.short_name);
check('the manifest is installable',
  manifest.display === 'standalone' && manifest.start_url && manifest.scope);
check('start_url and scope are relative, so a project page works',
  manifest.start_url.indexOf('/') !== 0 && manifest.scope.indexOf('/') !== 0,
  manifest.start_url + ' / ' + manifest.scope);
check('the manifest sets theme and background colors',
  /^#[0-9a-f]{6}$/i.test(manifest.theme_color) && /^#[0-9a-f]{6}$/i.test(manifest.background_color));
check('the manifest declares a maskable icon',
  manifest.icons.some(function (i) { return i.purpose === 'maskable'; }));

manifest.icons.forEach(function (icon) {
  var file = path.join(ROOT, icon.src);
  var size = fs.existsSync(file) ? pngSize(file) : null;
  var declared = icon.sizes.split('x').map(Number);
  check('manifest icon ' + icon.src + ' exists at ' + icon.sizes,
    !!size && size.width === declared[0] && size.height === declared[1],
    size ? size.width + 'x' + size.height : 'missing');
});

['icons/icon-32.png', 'icons/icon-180.png'].forEach(function (rel) {
  check('referenced icon ' + rel + ' exists', fs.existsSync(path.join(ROOT, rel)));
});

var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check('index.html links the manifest', /rel="manifest" href="manifest\.webmanifest"/.test(html));
check('index.html sets a theme color and an apple touch icon',
  /name="theme-color"/.test(html) && /rel="apple-touch-icon"/.test(html));
check('index.html links the privacy page', /href="privacy\.html"/.test(html));

var appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
check('app.js registers the service worker', /serviceWorker\.register\('sw\.js'\)/.test(appJs));
check('the service worker is not registered on file://', /location\.protocol === 'file:'/.test(appJs));

var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('the service worker has a versioned cache', /var CACHE = 'fdc-shell-v\d+';/.test(sw));

var shellMatch = sw.match(/var SHELL = \[([\s\S]*?)\];/);
var shell = shellMatch ? shellMatch[1].match(/'([^']+)'/g).map(function (s) { return s.slice(1, -1); }) : [];
check('the service worker precaches a shell of at least 10 files', shell.length >= 10, String(shell.length));

shell.forEach(function (entry) {
  if (!/^\.\//.test(entry)) return;
  var rel = entry.replace(/^\.\//, '') || 'index.html';
  if (rel.slice(-1) === '/') rel += 'index.html';
  check('precached ' + entry + ' exists', fs.existsSync(path.join(ROOT, rel)));
});

check('the hosted shell bypasses Jekyll', fs.existsSync(path.join(ROOT, '.nojekyll')));

/* --- 4. the privacy page --- */
var privacyPath = path.join(ROOT, 'privacy.html');
check('the privacy page exists', fs.existsSync(privacyPath));
var privacy = fs.existsSync(privacyPath) ? fs.readFileSync(privacyPath, 'utf8') : '';
check('the privacy page uses the app stylesheet', /href="styles\.css"/.test(privacy));
check('the privacy page states the app collects no analytics',
  /No analytics/i.test(privacy) && /no cookies/i.test(privacy));
check('the privacy page explains reset and export',
  /Reset kitchen/.test(privacy) && /Export kitchen/.test(privacy));
check('the privacy page links back to the app', /href="\.\/"/.test(privacy));

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\n' + failures.length + ' CHECK(S) FAILED');
process.exit(failures.length === 0 ? 0 : 1);
