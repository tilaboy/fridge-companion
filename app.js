/* Fridge Door Companion — application logic.
 *
 * Plain HTML/CSS/JS, no framework, no build step (spec > Stack).
 * Three sections, in dependency order:
 *   1. Pure logic — state shape, amount validation, stock math, tray grouping.
 *      No DOM and no storage access, so the same code runs under node for the
 *      mechanical verification harnesses (verify/slice-*.js).
 *   2. Store — browser storage via localStorage (spec > Components > The store):
 *      one versioned key, loaded on start, rewritten on every change.
 *   3. UI — rendering and events, browser only.
 */
(function (root) {
  'use strict';

  /* ================================================================== *
   * Built-in data
   * ================================================================== */

  var ingredients = root.FDC_INGREDIENTS || [];
  var recipes = root.FDC_RECIPES || [];

  function getIngredient(id) {
    for (var i = 0; i < ingredients.length; i++) {
      if (ingredients[i].id === id) return ingredients[i];
    }
    return null;
  }

  function getRecipe(id) {
    for (var i = 0; i < recipes.length; i++) {
      if (recipes[i].id === id) return recipes[i];
    }
    return null;
  }

  /* Staples are assumed always on hand (spec > Data Model > Staples): never
   * tracked in stock, never shown in the tray, never counted in a recipe's
   * score, never sent to the shopping list. Derived from the tray data so
   * data/ingredients.js stays the single source of truth. */
  var STAPLE_IDS = {};
  ingredients.forEach(function (ing) { if (ing.staple) STAPLE_IDS[ing.id] = true; });

  function isStaple(id) {
    return !!STAPLE_IDS[id];
  }

  /* ================================================================== *
   * 1. Pure logic
   * ================================================================== */

  var STORAGE_KEY = 'fdc-state-v1';

  var SEEDED_CATEGORIES = [
    { id: 'produce',   name: 'Produce' },
    { id: 'dairy',     name: 'Dairy' },
    { id: 'pantry',    name: 'Pantry' },
    { id: 'leftovers', name: 'Leftovers' },
    { id: 'meat',      name: 'Meat & Fish' }
  ];

  function createState() {
    return { categories: [], stock: {}, shoppingList: [] };
  }

  function cloneState(state) {
    return {
      categories: state.categories.map(function (c) { return { id: c.id, name: c.name }; }),
      stock: Object.assign({}, state.stock),
      shoppingList: state.shoppingList.map(function (i) {
        return { ingredientId: i.ingredientId, amount: i.amount, fromRecipeId: i.fromRecipeId || null };
      })
    };
  }

  /* The amount prompt accepts positive whole numbers only and refuses the
   * rest, so bad values never reach the store (spec > Important Failure
   * Modes). parseAmount turns whatever the user typed into a number or
   * null; isValidAmount is the gate. */
  function parseAmount(raw) {
    if (raw === null || raw === undefined) return null;
    var text = String(raw).trim();
    if (text === '') return null;
    var n = Number(text);
    if (!isFinite(n)) return null;
    return n;
  }

  function isValidAmount(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n > 0;
  }

  /* Re-adding an ingredient combines amounts (prd.md > Open Questions,
   * assumed: 2 eggs + 3 eggs = 5). Returns a new state; never mutates. */
  function addToStock(state, ingredientId, amount) {
    var next = cloneState(state);
    next.stock[ingredientId] = (next.stock[ingredientId] || 0) + amount;
    return next;
  }

  function validCategory(c) {
    return !!c && typeof c.id === 'string' && c.id !== '' &&
      typeof c.name === 'string' && c.name.trim() !== '';
  }

  /* Build the final category list from the setup screen's confirmed
   * choices: valid, unique, trimmed. */
  function confirmCategories(chosen) {
    var seen = {};
    var categories = [];
    (chosen || []).forEach(function (c) {
      if (!validCategory(c) || seen[c.id]) return;
      seen[c.id] = true;
      categories.push({ id: c.id, name: c.name.trim() });
    });
    return categories;
  }

  /* The app opens straight onto the fridge door, so a first visit (or cleared
   * browser data) adopts the seeded categories instead of confirming them on
   * a setup screen (spec > Components > Categories). Categories are edited
   * later, in the tray panel's disclosure. A state that already has
   * categories is returned untouched. */
  function ensureCategories(state) {
    if (state.categories.length > 0) return state;
    var next = cloneState(state);
    next.categories = confirmCategories(SEEDED_CATEGORIES);
    return next;
  }

  /* Group the built-in tray by the user's categories, in the user's own
   * order. Categories with no tray ingredients are skipped. An ingredient
   * whose category the user does not have (a category added to the built-in
   * data after they set up, for example) lands in a trailing "Other" group
   * rather than silently disappearing. */
  function groupTrayByCategory(categories) {
    var byId = {};
    (categories || []).forEach(function (c) { byId[c.id] = []; });
    var loose = [];
    ingredients.forEach(function (ing) {
      if (byId[ing.categoryId]) byId[ing.categoryId].push(ing);
      else loose.push(ing);
    });
    var groups = (categories || [])
      .map(function (c) { return { category: c, items: byId[c.id] }; })
      .filter(function (g) { return g.items.length > 0; });
    if (loose.length > 0) {
      groups.push({ category: { id: '__other', name: 'Other' }, items: loose });
    }
    return groups;
  }

  /* ================================================================== *
   * The recommendation engine (spec > Components > Recommendation engine)
   * ================================================================== */

  /* Score one recipe against the stock: the share of its ingredients the
   * user holds in sufficient amount. The amount-level check means needing
   * 200 g with 100 g in stock counts as missing (spec > Data Model).
   * Staples are excluded from both sides — they are assumed on hand. */
  function scoreRecipe(recipe, stock) {
    var have = 0;
    var total = 0;
    recipe.ingredients.forEach(function (ri) {
      if (isStaple(ri.ingredientId)) return;
      total += 1;
      if ((stock[ri.ingredientId] || 0) >= ri.amount) have += 1;
    });
    return {
      recipe: recipe,
      have: have,
      missing: total - have,
      total: total,
      score: total === 0 ? 0 : have / total
    };
  }

  /* The length bias the learner asked for at the final review: a short recipe
   * is far easier to complete, so without it the picks skew short. Ranking
   * weight = fit × (1 + LENGTH_BONUS × tracked ingredients), so a
   * three-ingredient recipe carries ×1.3 and a five-ingredient one ×1.5.
   * `score` itself stays the honest fit ratio the cards display — only the
   * order changes. Consequence, accepted knowingly: a nearly-complete long
   * recipe can now outrank a complete short one. */
  var LENGTH_BONUS = 0.1;

  function lengthMultiplier(total) {
    return 1 + LENGTH_BONUS * total;
  }

  /* The matching rule, with the length bias applied: fit × length, tie-broken
   * by fewest missing, then by id for a stable order. Only recipes with at
   * least one ingredient in hand are candidates; the top 2-3 come back
   * (prd.md > Product Decisions). */
  function recommend(state, recipeList) {
    var list = recipeList || recipes;
    return list
      .map(function (r) {
        var scored = scoreRecipe(r, state.stock);
        scored.rank = scored.score * lengthMultiplier(scored.total);
        return scored;
      })
      .filter(function (s) { return s.have > 0; })
      .sort(function (a, b) {
        if (b.rank !== a.rank) return b.rank - a.rank;             // fit × length
        if (a.missing !== b.missing) return a.missing - b.missing;  // then fewest missing
        return a.recipe.id < b.recipe.id ? -1 : 1;                 // stable order
      })
      .slice(0, 3);
  }

  /* ================================================================== *
   * Commit actions (spec > Components > Commit actions)
   * ================================================================== */

  /* The ingredients a recipe is missing: held in less than the required
   * amount — the same amount-level rule the engine scores with. Staples are
   * never "missing" (they are assumed on hand, and never shopped for). */
  function missingIngredients(state, recipe) {
    return recipe.ingredients
      .filter(function (ri) {
        return !isStaple(ri.ingredientId) && (state.stock[ri.ingredientId] || 0) < ri.amount;
      })
      .map(function (ri) { return { ingredientId: ri.ingredientId, amount: ri.amount }; });
  }

  /* "Cook this": deduct each ingredient the user actually has — the full
   * recipe amount when there is enough, otherwise whatever is left, never
   * below zero. Ingredients that reach 0 drop off the fridge display
   * (spec > Data Model), so their key is removed. Staples are never
   * deducted: they are assumed on hand. Returns a new state. */
  function cookRecipe(state, recipe) {
    var next = cloneState(state);
    recipe.ingredients.forEach(function (ri) {
      if (isStaple(ri.ingredientId)) return;
      var held = next.stock[ri.ingredientId] || 0;
      if (held <= 0) return; // missing: untouched
      var left = held - ri.amount;
      if (left <= 0) delete next.stock[ri.ingredientId];
      else next.stock[ri.ingredientId] = left;
    });
    return next;
  }

  /* What one "Cook this" actually takes out of the fridge: for every
   * ingredient the kitchen holds, how much is removed and what is left.
   * Staples are never removed; missing ingredients never appear. Pure data,
   * so the harness can check it without a browser and the UI can show the
   * removal as it happens. */
  function cookDeductions(state, recipe) {
    var out = [];
    recipe.ingredients.forEach(function (ri) {
      if (isStaple(ri.ingredientId)) return;
      var held = state.stock[ri.ingredientId] || 0;
      if (held <= 0) return; // missing: never removed
      var removed = Math.min(held, ri.amount);
      out.push({
        ingredientId: ri.ingredientId,
        removed: removed,
        before: held,
        after: held - removed
      });
    });
    return out;
  }

  /* "Generate the shopping list": the missing ingredients, each with the
   * recipe's quantity. An ingredient already on the list is not duplicated
   * (the first recipe's quantity stands). Returns a new state. */
  function addToShoppingList(state, recipe) {
    var next = cloneState(state);
    var listed = {};
    next.shoppingList.forEach(function (item) { listed[item.ingredientId] = true; });
    missingIngredients(state, recipe).forEach(function (m) {
      if (listed[m.ingredientId]) return;
      listed[m.ingredientId] = true;
      next.shoppingList.push({
        ingredientId: m.ingredientId,
        amount: m.amount,
        fromRecipeId: recipe.id
      });
    });
    return next;
  }

  /* "Got it": the item joins stock with the recipe's quantity — combining
   * with whatever is already there — and leaves the list (spec >
   * Components > Shopping list card). Returns a new state. */
  function buyShoppingListItem(state, ingredientId) {
    var next = cloneState(state);
    var bought = null;
    next.shoppingList = next.shoppingList.filter(function (item) {
      if (item.ingredientId === ingredientId && !bought) {
        bought = item;
        return false;
      }
      return true;
    });
    if (bought) next.stock[ingredientId] = (next.stock[ingredientId] || 0) + bought.amount;
    return next;
  }

  /* What the combining animation flies: the committed ingredient tiles,
   * resolved from the tray, converging on the dish emoji (spec >
   * Components > Combining animation). Pure data so the harness can
   * check it without a browser. */
  function combineAnimationSpec(recipe, ingredientIds) {
    var seen = {};
    var flying = [];
    (ingredientIds || []).forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      var ing = getIngredient(id);
      if (ing) flying.push(ing);
    });
    return { dishEmoji: recipe.dishEmoji, flying: flying };
  }

  /* ================================================================== *
   * 2. Store — browser storage
   * ================================================================== */

  function getStorage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (e) { /* storage blocked (private mode, etc.) — run in memory */ }
    return null;
  }

  /* Storage is user data that could be stale, hand-edited, or corrupt.
   * Sanitize on load: drop anything that doesn't match the data model
   * (spec > Data Model). `knownOnly` is for imported files, where a reference
   * to an ingredient or recipe this build does not have is junk rather than
   * something to keep. */
  function sanitizeState(parsed, options) {
    var knownOnly = !!(options && options.knownOnly);
    var fresh = createState();
    if (!parsed || typeof parsed !== 'object') return fresh;

    if (Array.isArray(parsed.categories)) {
      fresh.categories = confirmCategories(parsed.categories);
    }
    if (parsed.stock && typeof parsed.stock === 'object' && !Array.isArray(parsed.stock)) {
      Object.keys(parsed.stock).forEach(function (id) {
        var n = Number(parsed.stock[id]);
        // Staples are no longer tracked, so drop any left behind by an
        // earlier version of the app.
        if (!isValidAmount(n) || isStaple(id)) return;
        if (knownOnly && !getIngredient(id)) return;
        fresh.stock[id] = n;
      });
    }
    if (Array.isArray(parsed.shoppingList)) {
      fresh.shoppingList = parsed.shoppingList.filter(function (item) {
        return !!item && typeof item.ingredientId === 'string' &&
          isValidAmount(Number(item.amount)) &&
          (!knownOnly || !!getIngredient(item.ingredientId));
      }).map(function (item) {
        var fromRecipeId = typeof item.fromRecipeId === 'string' ? item.fromRecipeId : null;
        if (knownOnly && fromRecipeId && !getRecipe(fromRecipeId)) fromRecipeId = null;
        return {
          ingredientId: item.ingredientId,
          amount: Number(item.amount),
          fromRecipeId: fromRecipeId
        };
      });
    }
    return fresh;
  }

  /* ---------- export / import ---------- */

  /* A versioned envelope, not a bare dump of the storage key: the importer can
   * tell our file from any other JSON, refuse a newer schema instead of
   * mangling it, and tell the user what is inside before replacing anything. */
  var APP_ID = 'fridge-companion';
  var SCHEMA_VERSION = 1;

  function isEmptyKitchen(state) {
    return state.categories.length === 0 &&
      Object.keys(state.stock).length === 0 &&
      state.shoppingList.length === 0;
  }

  function summarizeState(state) {
    return {
      categories: state.categories.length,
      ingredients: Object.keys(state.stock).length,
      shoppingList: state.shoppingList.length
    };
  }

  function buildExport(state, now) {
    var at = now instanceof Date ? now : new Date();
    return {
      app: APP_ID,
      format: 'kitchen',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: at.toISOString(),
      summary: summarizeState(state),
      state: cloneState(state)
    };
  }

  function exportJson(state, now) {
    return JSON.stringify(buildExport(state, now), null, 2) + '\n';
  }

  function looksLikeKitchen(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Array.isArray(value.categories) ||
      (!!value.stock && typeof value.stock === 'object' && !Array.isArray(value.stock)) ||
      Array.isArray(value.shoppingList);
  }

  /* Import is the one place stale or hostile data enters on purpose. It accepts
   * our envelope and a bare v1 state (what the POC wrote to `fdc-state-v1`),
   * refuses everything else, and runs whatever survives through sanitizeState
   * so no import can produce a shape the rest of the app doesn't expect. */
  function parseImportPayload(text) {
    var parsed;
    try {
      parsed = JSON.parse(String(text));
    } catch (e) {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'That file does not contain a kitchen.' };
    }

    var envelope = Object.prototype.hasOwnProperty.call(parsed, 'state') ||
      parsed.app === APP_ID ||
      Object.prototype.hasOwnProperty.call(parsed, 'schemaVersion');
    var raw = parsed;
    var version = 0;

    if (envelope) {
      if (parsed.app !== undefined && parsed.app !== APP_ID) {
        return { ok: false, error: 'That file belongs to a different app.' };
      }
      version = Number(parsed.schemaVersion);
      if (!isFinite(version) || version < 1) {
        return { ok: false, error: 'That file has no readable schema version.' };
      }
      if (version > SCHEMA_VERSION) {
        return {
          ok: false,
          error: 'That file was made by a newer version of the app. Update before importing it.'
        };
      }
      raw = parsed.state;
    }

    if (!looksLikeKitchen(raw)) {
      return { ok: false, error: 'That file does not look like a Fridge Door Companion kitchen.' };
    }

    var clean = sanitizeState(raw, { knownOnly: true });
    if (isEmptyKitchen(clean)) {
      return { ok: false, error: 'That file has no stock, categories, or shopping list to import.' };
    }
    return {
      ok: true,
      state: clean,
      schemaVersion: version,
      legacy: !envelope,
      summary: summarizeState(clean)
    };
  }

  function loadState() {
    var storage = getStorage();
    if (!storage) return createState();
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return createState();
      return sanitizeState(JSON.parse(raw));
    } catch (e) {
      // Unreadable or corrupted storage → first use again
      // (spec > Important Failure Modes).
      return createState();
    }
  }

  function saveState(state) {
    var storage = getStorage();
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ================================================================== *
   * 3. UI — rendering and events (browser only)
   * ================================================================== */

  var state = createState();
  var session = {
    promptIngredientId: null,
    customCounter: 0,
    openBubble: null, // the category bubble currently swelled open
    clickTimer: null, // disambiguates click (prompt) from double-click (quick add)
    clickItemId: null,
    suppressClick: false // set by a drag so its release opens nothing
  };
  var els = {};
  var openPick = null; // the recommendation currently centered
  var removeFloatTimer = null; // clears the "out of the fridge" float
  var addFloatTimer = null; // clears the quick-add chip
  var doorOpen = false; // is the fridge door swung open?
  var dragState = null; // the icon being dragged toward the fridge

  function init() {
    els.seedList = document.getElementById('seed-list');
    els.addCategoryForm = document.getElementById('add-category-form');
    els.confirmCategories = document.getElementById('confirm-categories');
    els.categoryError = document.getElementById('category-error');
    els.fridge = document.getElementById('fridge');
    els.fridgeDoor = document.getElementById('fridge-door-panel');
    els.fridgeInterior = document.getElementById('fridge-interior');
    els.fridgeClose = document.getElementById('fridge-close');
    els.fridgeEmptyNote = document.getElementById('fridge-empty-note');
    els.fridgeStock = document.getElementById('fridge-stock');
    els.doorCount = document.getElementById('door-count');
    els.doorHint = document.getElementById('door-hint');
    els.bubbleField = document.getElementById('bubble-field');
    els.myRecipesButton = document.getElementById('my-recipes-button');
    els.recSection = document.getElementById('recommendations');
    els.recCards = document.getElementById('rec-cards');
    els.recEmpty = document.getElementById('rec-empty');
    els.recClose = document.getElementById('rec-close');
    els.prompt = document.getElementById('amount-prompt');
    els.promptForm = document.getElementById('amount-form');
    els.promptEmoji = document.getElementById('prompt-emoji');
    els.promptName = document.getElementById('prompt-name');
    els.promptUnit = document.getElementById('prompt-unit');
    els.promptInput = document.getElementById('amount-input');
    els.promptError = document.getElementById('prompt-error');
    els.promptCancel = document.getElementById('prompt-cancel');
    els.recipeView = document.getElementById('recipe-view');
    els.recipeClose = document.getElementById('recipe-close');
    els.recipeDish = document.getElementById('recipe-dish');
    els.recipeTitle = document.getElementById('recipe-title');
    els.recipeChecklist = document.getElementById('recipe-checklist');
    els.recipeSteps = document.getElementById('recipe-steps');
    els.recipeStaples = document.getElementById('recipe-staples');
    els.cookThis = document.getElementById('cook-this');
    els.generateList = document.getElementById('generate-list');
    els.shoppingList = document.getElementById('shopping-list');
    els.shoppingItems = document.getElementById('shopping-items');
    els.combineStage = document.getElementById('combine-stage');
    els.combineFly = document.getElementById('combine-fly');
    els.combineDish = document.getElementById('combine-dish');
    els.combineLine = document.getElementById('combine-line');
    els.removeFloat = document.getElementById('remove-float');
    els.addFloat = document.getElementById('add-float');
    els.srStatus = document.getElementById('sr-status');
    els.storageBanner = document.getElementById('storage-banner');
    els.storageBannerText = document.getElementById('storage-banner-text');
    els.exportButton = document.getElementById('export-button');
    els.importButton = document.getElementById('import-button');
    els.importFile = document.getElementById('import-file');
    els.dataStatus = document.getElementById('data-status');

    // A first visit adopts the seeded categories and opens straight onto the
    // fridge door — no setup screen in front of the app.
    state = ensureCategories(loadState());
    persist(state);

    renderSeedList();
    els.addCategoryForm.addEventListener('submit', onAddCategory);
    els.confirmCategories.addEventListener('click', onConfirmCategories);
    els.exportButton.addEventListener('click', onExport);
    els.importButton.addEventListener('click', onImportPick);
    els.importFile.addEventListener('change', onImportFile);
    els.myRecipesButton.addEventListener('click', onMyRecipes);
    els.recClose.addEventListener('click', closeRecommendations);
    els.recipeClose.addEventListener('click', closeRecipeView);
    els.cookThis.addEventListener('click', onCookThis);
    els.generateList.addEventListener('click', onGenerateList);
    els.promptForm.addEventListener('submit', onSubmitAmount);
    els.promptCancel.addEventListener('click', closePrompt);
    els.fridgeDoor.addEventListener('click', function () { setDoor(!doorOpen); });
    els.fridgeClose.addEventListener('click', function () { setDoor(false); });
    // Once open the panel is swung aside and inert, so the fridge body takes
    // the click: pushing anywhere on it shuts the door, the way a real one
    // closes. Stock chips are excluded — they are something to read.
    els.fridge.addEventListener('click', function (e) {
      if (!doorOpen) return;
      if (e.target.closest('#fridge-door-panel') || e.target.closest('.stock-item')) return;
      setDoor(false);
    });
    els.prompt.addEventListener('click', function (e) {
      if (e.target === els.prompt) closePrompt();
    });
    els.recipeView.addEventListener('click', function (e) {
      if (e.target === els.recipeView) closeRecipeView();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      // Close the top-most layer first: prompt, then recipe, then bubble, then door.
      if (!els.prompt.classList.contains('hidden')) { closePrompt(); return; }
      if (!els.recipeView.classList.contains('hidden')) { closeRecipeView(); return; }
      if (session.openBubble) { closeBubbles(); return; }
      if (doorOpen) setDoor(false);
    });
    renderAll();
  }

  /* ---------- helpers ---------- */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- saving, and saying so when it fails ---------- */

  /* Every write goes through here for one reason: a `false` from saveState is
   * a promise to the user that their kitchen is safe, so staying quiet is a
   * bug (roadmap §2 principle 2). The banner is persistent on purpose — it
   * cannot be dismissed, because the risk does not go away. */
  function persist(nextState) {
    var ok = saveState(nextState);
    if (!ok) {
      els.storageBannerText.textContent =
        'Your last change could not be saved. This browser is blocking storage or is full, ' +
        'so the kitchen will not survive a reload. Export a copy now.';
      els.storageBanner.classList.remove('hidden');
    } else {
      els.storageBanner.classList.add('hidden');
    }
    return ok;
  }

  /* ---------- export / import ---------- */

  function countLine(summary) {
    function plural(n, one, many) {
      return n + ' ' + (n === 1 ? one : (many || one + 's'));
    }
    return plural(summary.ingredients, 'ingredient') + ', ' +
      plural(summary.categories, 'category', 'categories') + ', ' +
      plural(summary.shoppingList, 'shopping-list item');
  }

  function todayStamp(now) {
    var d = now instanceof Date ? now : new Date();
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function onExport() {
    try {
      var blob = new Blob([exportJson(state)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'fridge-companion-kitchen-' + todayStamp() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      els.dataStatus.textContent = 'Exported ' + countLine(summarizeState(state)) + '.';
      announce('Kitchen exported.');
    } catch (e) {
      els.dataStatus.textContent =
        'That export did not work in this browser. Try a different browser before clearing data.';
    }
  }

  function onImportPick() {
    els.importFile.click();
  }

  function onImportFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      applyImport(String(reader.result));
      els.importFile.value = ''; // allow picking the same file again
    };
    reader.onerror = function () {
      els.dataStatus.textContent = 'That file could not be read.';
      els.importFile.value = '';
    };
    reader.readAsText(file);
  }

  /* Import is destructive, so it asks first unless this kitchen is empty —
   * and it replaces state only after the payload has been validated. */
  function applyImport(text) {
    var result = parseImportPayload(text);
    if (!result.ok) {
      els.dataStatus.textContent = result.error;
      announce(result.error);
      return;
    }
    var detail = countLine(result.summary);
    if (!isEmptyKitchen(state) &&
        !window.confirm('Replace the kitchen in this browser with the imported one (' + detail +
          ')? The current kitchen will be lost.')) {
      els.dataStatus.textContent = 'Import cancelled. Nothing changed.';
      return;
    }
    state = result.state;
    persist(state);
    closePrompt();
    closeRecipeView();
    closeRecommendations();
    renderAll();
    els.dataStatus.textContent = 'Imported ' + detail + '.';
    announce('Kitchen imported: ' + detail + '.');
  }

  /* ---------- categories (the tray panel's disclosure) ---------- */

  /* Every seeded category is offered — checked when it is in use, and showing
   * the learner's own name when they have renamed it — plus any custom
   * categories already saved. */
  function renderSeedList() {
    els.seedList.innerHTML = '';
    var inUse = {};
    state.categories.forEach(function (c) { inUse[c.id] = c.name; });
    var seeded = {};
    SEEDED_CATEGORIES.forEach(function (c) {
      seeded[c.id] = true;
      var used = Object.prototype.hasOwnProperty.call(inUse, c.id);
      els.seedList.appendChild(makeSeedRow(c.id, used ? inUse[c.id] : c.name, used));
    });
    state.categories.forEach(function (c) {
      if (!seeded[c.id]) els.seedList.appendChild(makeSeedRow(c.id, c.name, true));
    });
  }

  function makeSeedRow(id, name, checked) {
    var li = document.createElement('li');
    li.className = 'seed-row';
    li.dataset.categoryId = id;

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'seed-check';
    cb.checked = checked;

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'seed-name';
    nameInput.value = name;
    nameInput.maxLength = 24;
    nameInput.placeholder = 'Category name';

    li.appendChild(cb);
    li.appendChild(nameInput);
    return li;
  }

  function onAddCategory(e) {
    e.preventDefault();
    session.customCounter += 1;
    var row = makeSeedRow('cat-' + Date.now() + '-' + session.customCounter, '', true);
    els.seedList.appendChild(row);
    row.querySelector('.seed-name').focus();
  }

  function readChosenCategories() {
    var chosen = [];
    els.seedList.querySelectorAll('.seed-row').forEach(function (li) {
      var cb = li.querySelector('.seed-check');
      var nameInput = li.querySelector('.seed-name');
      if (!cb.checked) return;
      var name = nameInput.value.trim();
      if (name === '') return;
      chosen.push({ id: li.dataset.categoryId, name: name });
    });
    return chosen;
  }

  function onConfirmCategories() {
    var chosen = readChosenCategories();
    if (chosen.length === 0) {
      els.categoryError.textContent = 'Keep at least one category.';
      els.categoryError.classList.remove('hidden');
      return;
    }
    els.categoryError.classList.add('hidden');
    state.categories = confirmCategories(chosen);
    persist(state);
    renderSeedList();
    renderAll();
  }

  /* ---------- the fridge ---------- */

  function renderAll() {
    renderFridge();
    renderShoppingList();
    renderBubbles();
  }

  function trackedStockIds() {
    return Object.keys(state.stock).filter(function (id) {
      return !isStaple(id) && (state.stock[id] || 0) > 0;
    });
  }

  /* The inside of the fridge: one shelf per category, the food standing on
   * it with its amount underneath. The door note carries the count, so the
   * shut fridge still answers "is there anything in there?". */
  function renderFridge() {
    els.fridgeStock.innerHTML = '';
    var any = false;
    groupTrayByCategory(state.categories).forEach(function (g) {
      var stocked = g.items.filter(function (ing) { return (state.stock[ing.id] || 0) > 0; });
      if (stocked.length === 0) return;
      any = true;

      var shelf = document.createElement('section');
      shelf.className = 'shelf';

      var label = document.createElement('span');
      label.className = 'shelf-label';
      label.textContent = g.category.name;
      shelf.appendChild(label);

      var row = document.createElement('div');
      row.className = 'shelf-row';
      stocked.forEach(function (ing) {
        var held = state.stock[ing.id];
        var item = document.createElement('span');
        item.className = 'stock-item';
        item.title = ing.name + ' \u2014 ' + held + ' ' + ing.unit;
        item.innerHTML =
          '<span class="stock-emoji" aria-hidden="true">' + ing.emoji + '</span>' +
          '<span class="stock-amount">' +
            (countableUnit(ing.unit) ? '\u00d7' + held : held + ' ' + escapeHtml(ing.unit)) +
          '</span>';
        item.setAttribute('aria-label', ing.name + ', ' + held + ' ' + ing.unit);
        row.appendChild(item);
      });

      shelf.appendChild(row);
      els.fridgeStock.appendChild(shelf);
    });

    els.fridgeEmptyNote.classList.toggle('hidden', any);

    var n = trackedStockIds().length;
    els.doorCount.textContent = n === 0 ? 'empty' : (n === 1 ? '1 item' : n + ' items');
    if (doorOpen) els.fridgeEmptyNote.classList.toggle('hidden', any);
  }

  /* "pcs" and friends read as a count (×3), weights and volumes as 200 g. */
  function countableUnit(unit) {
    return unit === 'pcs' || unit === 'cloves' || unit === 'slices' || unit === 'bunch';
  }

  /* ---------- the door ---------- */

  function setDoor(open) {
    doorOpen = open;
    els.fridge.setAttribute('data-open', open ? 'true' : 'false');
    els.fridgeDoor.setAttribute('aria-expanded', open ? 'true' : 'false');
    els.fridgeInterior.setAttribute('aria-hidden', open ? 'false' : 'true');
    els.doorHint.textContent = open ? 'door open' : 'tap to open';
    if (open) els.fridgeEmptyNote.classList.toggle('hidden', trackedStockIds().length > 0);
  }

  /* ---------- the bubbles ---------- */

  /* Two columns either side of the fridge, their vertical slots spread over
   * the stage. Percentages, so the scene scales with the panel without a
   * single measurement; the media query at 1000px turns the same markup into
   * a plain grid under the fridge. */
  var BUBBLE_X = { left: 17, right: 83 };

  /* A soft tint per bubble, so the groups read apart at a glance. Purely
   * decorative and cycled by position, so user-added categories get one too. */
  var BUBBLE_TINTS = ['#f9d6b0', '#cfe6c6', '#f6e3a2', '#c8ddf3', '#f3cccc', '#dccfef'];

  function bubbleSlotYs(count) {
    if (count <= 1) return [0.5];
    var out = [];
    for (var i = 0; i < count; i++) out.push(0.24 + (i / (count - 1)) * 0.52);
    return out;
  }

  function categoryGroups() {
    return groupTrayByCategory(state.categories)
      .map(function (g) {
        return {
          category: g.category,
          items: g.items.filter(function (ing) { return !isStaple(ing.id); })
        };
      })
      .filter(function (g) { return g.items.length > 0; });
  }

  function renderBubbles() {
    els.bubbleField.innerHTML = '';
    var groups = categoryGroups();
    var columns = { left: [], right: [] };
    groups.forEach(function (g, i) {
      columns[i % 2 === 0 ? 'left' : 'right'].push(g);
    });

    var tintIndex = 0;
    ['left', 'right'].forEach(function (side) {
      var ys = bubbleSlotYs(columns[side].length);
      columns[side].forEach(function (g, i) {
        els.bubbleField.appendChild(
          makeBubble(g, BUBBLE_X[side], ys[i] * 100, BUBBLE_TINTS[tintIndex++ % BUBBLE_TINTS.length])
        );
      });
    });
    els.bubbleField.classList.toggle('is-focusing', !!session.openBubble);
  }

  function makeBubble(g, xPct, yPct, tint) {
    var stockedCount = g.items.filter(function (ing) { return (state.stock[ing.id] || 0) > 0; }).length;

    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.dataset.categoryId = g.category.id;
    bubble.style.left = xPct + '%';
    bubble.style.top = yPct + '%';
    if (tint) bubble.style.setProperty('--tint', tint);
    // the open card is only as tall as its rows of icons
    var rows = Math.ceil(g.items.length / 3);
    bubble.style.setProperty('--open-h', Math.min(306, 66 + rows * 54) + 'px');

    var face = document.createElement('button');
    face.type = 'button';
    face.className = 'bubble-face';
    face.id = 'bubble-face-' + g.category.id;
    face.setAttribute('aria-expanded', 'false');
    face.setAttribute('aria-controls', 'bubble-items-' + g.category.id);
    face.setAttribute(
      'aria-label',
      g.category.name + ', ' + g.items.length + ' ingredients' +
      (stockedCount > 0 ? ', ' + stockedCount + ' already in the fridge' : '')
    );

    var peeks = g.items.slice(0, 3).map(function (ing) {
      return '<span>' + ing.emoji + '</span>';
    }).join('');
    face.innerHTML =
      '<span class="bubble-peek" aria-hidden="true">' + peeks + '</span>' +
      '<span class="bubble-name">' + escapeHtml(g.category.name) + '</span>' +
      '<span class="bubble-count">' +
        (stockedCount > 0 ? stockedCount + '/' + g.items.length : String(g.items.length)) +
      '</span>' +
      '<span class="bubble-close-mark" aria-hidden="true">\u00d7</span>';
    face.addEventListener('click', function () { toggleBubble(g.category.id); });
    bubble.appendChild(face);

    var panel = document.createElement('div');
    panel.className = 'bubble-items';
    panel.id = 'bubble-items-' + g.category.id;
    panel.hidden = true;
    g.items.forEach(function (ing) { panel.appendChild(makePick(ing)); });
    bubble.appendChild(panel);

    setBubbleOpen(bubble, session.openBubble === g.category.id);
    return bubble;
  }

  function setBubbleOpen(bubble, open) {
    bubble.classList.toggle('is-open', open);
    var face = bubble.querySelector('.bubble-face');
    var panel = bubble.querySelector('.bubble-items');
    if (face) face.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (panel) panel.hidden = !open;
  }

  /* One bubble at a time: the open one swells and the rest sink back, so the
   * stage never turns into a wall of icons. The DOM is patched in place
   * rather than re-rendered, or the swell would be lost. */
  function toggleBubble(categoryId) {
    var openId = session.openBubble === categoryId ? null : categoryId;
    session.openBubble = openId;
    els.bubbleField.classList.toggle('is-focusing', !!openId);
    var focusWasInside = els.bubbleField.contains(document.activeElement);
    Array.prototype.forEach.call(els.bubbleField.children, function (bubble) {
      setBubbleOpen(bubble, bubble.dataset.categoryId === openId);
    });
    // Closing swallows the icons that held the caret: hand it back to the
    // bubble's own button rather than dropping focus on <body>.
    if (!openId && focusWasInside) {
      var face = document.getElementById('bubble-face-' + categoryId);
      if (face) face.focus({ preventScroll: true });
    }
  }

  function closeBubbles() {
    session.openBubble = null;
    els.bubbleField.classList.remove('is-focusing');
    Array.prototype.forEach.call(els.bubbleField.children, function (bubble) {
      setBubbleOpen(bubble, false);
    });
  }

  function makePick(ing) {
    var held = state.stock[ing.id] || 0;

    var pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'pick';
    pick.dataset.ingredientId = ing.id;
    pick.setAttribute('aria-label', 'Add ' + ing.name +
      (held > 0 ? ' (you have ' + held + ' ' + ing.unit + ')' : ''));
    pick.title = ing.name + (held > 0 ? ' — ' + held + ' ' + ing.unit + ' in the fridge' : '');
    pick.innerHTML =
      '<span class="pick-emoji" aria-hidden="true">' + ing.emoji + '</span>' +
      '<span class="pick-name">' + escapeHtml(ing.name) + '</span>' +
      (held > 0 ? '<span class="pick-have" aria-hidden="true">' + held + '</span>' : '');

    // One click asks how much; a double click takes a portion straight in;
    // press and move drags the icon into the fridge.
    pick.addEventListener('click', function () {
      // the tail of a drag must not also read as a click
      if (session.suppressClick) return;
      onPickClick(ing);
    });
    pick.addEventListener('pointerdown', function (e) { startPickDrag(e, ing); });
    return pick;
  }

  /* A mouse can mean either gesture, so the single click waits 190ms to see
   * whether a second one is coming. Touch has no double click, so the tap
   * goes straight to the amount prompt. */
  var HOVER_CAPABLE = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
    : true;

  function onPickClick(ing) {
    if (!HOVER_CAPABLE) { openPrompt(ing.id); return; }
    if (session.clickTimer && session.clickItemId === ing.id) {
      clearTimeout(session.clickTimer);
      session.clickTimer = null;
      session.clickItemId = null;
      quickAdd(ing.id);
      return;
    }
    clearTimeout(session.clickTimer);
    session.clickItemId = ing.id;
    session.clickTimer = setTimeout(function () {
      session.clickTimer = null;
      session.clickItemId = null;
      openPrompt(ing.id);
    }, 190);
  }

  /* One sensible portion per unit, so the double-click path never asks. */
  var QUICK_AMOUNTS = { g: 100, ml: 100, pcs: 1, cloves: 3, slices: 2, bunch: 1 };

  function defaultAmount(ing) {
    return QUICK_AMOUNTS[ing.unit] || 1;
  }

  function quickAdd(ingredientId) {
    var ing = getIngredient(ingredientId);
    if (!ing) return;
    var amount = defaultAmount(ing);
    state = addToStock(state, ingredientId, amount);
    persist(state);
    renderAll();
    if (!doorOpen) setDoor(true); // show it land
    playAddFloat(ing, amount);
    announce(ing.name + ' +' + amount + ' ' + ing.unit + ' into the fridge');
    // Re-rendering rebuilt the bubble: put the caret back on the icon.
    var again = els.bubbleField.querySelector('.pick[data-ingredient-id="' + ingredientId + '"]');
    if (again) again.focus({ preventScroll: true });
  }

  function announce(text) {
    if (els.srStatus) els.srStatus.textContent = text;
  }

  /* The quick add is silent otherwise, so a chip says what went in. */
  function playAddFloat(ing, amount) {
    clearTimeout(addFloatTimer);
    els.addFloat.innerHTML = '';
    var rect = els.fridge.getBoundingClientRect();

    var chip = document.createElement('span');
    chip.className = 'add-chip';
    chip.innerHTML =
      '<span class="add-emoji">' + ing.emoji + '</span>' +
      '<span class="add-name">' + escapeHtml(ing.name) + '</span>' +
      '<span class="add-amount">+' + amount + ' ' + escapeHtml(ing.unit) + '</span>';
    chip.style.left = (rect.left + rect.width / 2) + 'px';
    chip.style.top = (rect.top + rect.height * 0.42) + 'px';
    els.addFloat.appendChild(chip);
    els.addFloat.classList.remove('hidden');

    addFloatTimer = setTimeout(function () {
      els.addFloat.classList.add('hidden');
      els.addFloat.innerHTML = '';
    }, 1450);
  }

  /* ---------- dragging an icon into the fridge ---------- */

  /* HTML5 drag-and-drop was tried first and it failed in the hand: the stage
   * layer above the fridge swallowed the dragover, so a drag started and then
   * went nowhere. A pointer drag is used instead — it needs nothing but
   * pointer events, so it behaves the same in every browser and can be driven
   * end to end by the verification harness. A finger keeps its tap: dragging
   * with touch would fight the bubble's own scrolling. */
  var DRAG_THRESHOLD = 7;

  function startPickDrag(e, ing) {
    if (e.pointerType === 'touch') return;
    if (e.button !== undefined && e.button !== 0) return;
    if (dragState) endPickDrag();
    dragState = { ing: ing, startX: e.clientX, startY: e.clientY, active: false, ghost: null };
    // Capture, so a release outside the window still ends the drag instead of
    // leaving the ghost stranded on the screen.
    if (e.currentTarget && e.currentTarget.setPointerCapture) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    }
    window.addEventListener('pointermove', onPickDragMove, true);
    window.addEventListener('pointerup', onPickDragEnd, true);
    window.addEventListener('pointercancel', onPickDragCancel, true);
  }

  function onPickDragMove(e) {
    if (!dragState) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    if (!dragState.active) {
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      dragState.active = true;
      // The gesture is a drag, not a click: cancel the amount prompt this
      // press would otherwise open on release.
      session.suppressClick = true;
      clearTimeout(session.clickTimer);
      session.clickTimer = null;
      session.clickItemId = null;
      dragState.ghost = makeDragGhost(dragState.ing);
      document.body.classList.add('is-dragging');
    }
    e.preventDefault();
    moveDragGhost(e.clientX, e.clientY);
    setDragOver(pointInFridge(e.clientX, e.clientY));
  }

  function onPickDragEnd(e) {
    if (!dragState) return;
    var wasActive = dragState.active;
    var landed = wasActive && pointInFridge(e.clientX, e.clientY);
    var ing = dragState.ing;
    endPickDrag();
    if (landed) openPrompt(ing.id);
    // the click that follows the release is swallowed, then the flag clears
    setTimeout(function () { session.suppressClick = false; }, 180);
  }

  function onPickDragCancel() {
    if (!dragState) return;
    endPickDrag();
    setTimeout(function () { session.suppressClick = false; }, 180);
  }

  function endPickDrag() {
    window.removeEventListener('pointermove', onPickDragMove, true);
    window.removeEventListener('pointerup', onPickDragEnd, true);
    window.removeEventListener('pointercancel', onPickDragCancel, true);
    if (dragState && dragState.ghost && dragState.ghost.parentNode) {
      dragState.ghost.parentNode.removeChild(dragState.ghost);
    }
    dragState = null;
    document.body.classList.remove('is-dragging');
    els.fridge.classList.remove('drop-target');
  }

  function makeDragGhost(ing) {
    var ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML =
      '<span class="drag-ghost-emoji" aria-hidden="true">' + ing.emoji + '</span>' +
      '<span class="drag-ghost-name">' + escapeHtml(ing.name) + '</span>';
    ghost.style.left = dragState.startX + 'px';
    ghost.style.top = dragState.startY + 'px';
    document.body.appendChild(ghost);
    return ghost;
  }

  function moveDragGhost(x, y) {
    if (!dragState || !dragState.ghost) return;
    dragState.ghost.style.left = x + 'px';
    dragState.ghost.style.top = y + 'px';
  }

  function pointInFridge(x, y) {
    var r = els.fridge.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* Hovering the fridge mid-drag opens the door, so the drop lands somewhere
   * you can see. */
  function setDragOver(over) {
    els.fridge.classList.toggle('drop-target', over);
    if (over && !doorOpen) setDoor(true);
  }

  /* ---------- shopping list card (spec > Components > Shopping list card) ---------- */

  /* Lives on the fridge door until its items are checked off; an emptied
   * list removes the card. */
  function renderShoppingList() {
    els.shoppingItems.innerHTML = '';
    state.shoppingList.forEach(function (item) {
      var ing = getIngredient(item.ingredientId);
      var fromRecipe = item.fromRecipeId ? getRecipe(item.fromRecipeId) : null;
      var li = document.createElement('li');
      li.className = 'shop-item';
      li.innerHTML =
        '<span class="shop-emoji">' + (ing ? ing.emoji : '') + '</span>' +
        '<span class="shop-name">' + escapeHtml(ing ? ing.name : item.ingredientId) + '</span>' +
        '<span class="shop-amount">' + item.amount + ' ' + escapeHtml(ing ? ing.unit : '') + '</span>' +
        (fromRecipe ? '<span class="shop-from">for ' + escapeHtml(fromRecipe.name) + '</span>' : '');
      var buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'shop-buy';
      buy.textContent = 'Got it';
      buy.setAttribute('aria-label', 'Mark ' + (ing ? ing.name : item.ingredientId) + ' as bought');
      buy.addEventListener('click', function () { onBuyItem(item.ingredientId); });
      li.appendChild(buy);
      els.shoppingItems.appendChild(li);
    });
    els.shoppingList.classList.toggle('hidden', state.shoppingList.length === 0);
  }

  function onBuyItem(ingredientId) {
    state = buyShoppingListItem(state, ingredientId);
    persist(state);
    renderAll();
  }

  /* ---------- recommendations (spec > Components > Recommendation engine) ---------- */

  function onMyRecipes() {
    renderRecommendations();
    els.recSection.classList.remove('hidden');
  }

  function closeRecommendations() {
    els.recSection.classList.add('hidden');
  }

  function renderRecommendations() {
    els.recCards.innerHTML = '';
    var picks = recommend(state);
    if (picks.length === 0) {
      // Empty state: no cards, just the friendly message (prd.md > Getting recommendations).
      els.recCards.classList.add('hidden');
      els.recEmpty.textContent = Object.keys(state.stock).length === 0
        ? 'Uh-oh — your fridge is empty, please refuel.'
        : "Unfortunately, there's nothing fitting.";
      els.recEmpty.classList.remove('hidden');
      return;
    }
    els.recEmpty.classList.add('hidden');
    els.recCards.classList.remove('hidden');
    picks.forEach(function (pick) { els.recCards.appendChild(makeRecCard(pick)); });
  }

  function makeRecCard(pick) {
    var card = document.createElement('article');
    card.className = 'rec-card';
    card.dataset.recipeId = pick.recipe.id;

    var dots = '';
    for (var i = 0; i < pick.total; i++) {
      dots += '<span class="dot' + (i < pick.have ? ' dot-filled' : '') + '"></span>';
    }

    card.innerHTML =
      '<div class="rec-dish">' + pick.recipe.dishEmoji + '</div>' +
      '<h3 class="rec-name">' + escapeHtml(pick.recipe.name) + '</h3>' +
      '<p class="rec-fit">You have ' + pick.have + '/' + pick.total +
        (pick.missing > 0 ? ' &middot; Missing: ' + pick.missing : ' &middot; all set') + '</p>' +
      '<div class="rec-dots" aria-hidden="true">' + dots + '</div>';
    // Tapping a card brings it to center (spec > Components > Recipe card view).
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-label', 'Open ' + pick.recipe.name);
    card.addEventListener('click', function () { openRecipe(pick); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRecipe(pick);
      }
    });
    return card;
  }

  /* ---------- recipe card view (spec > Components > Recipe card view) ---------- */

  function openRecipe(pick) {
    openPick = pick;
    renderRecipeView(pick);
    els.recipeView.classList.remove('hidden');
  }

  function closeRecipeView() {
    els.recipeView.classList.add('hidden');
    openPick = null;
  }

  function renderRecipeView(pick) {
    var recipe = pick.recipe;
    els.recipeDish.textContent = recipe.dishEmoji;
    els.recipeTitle.textContent = recipe.name;

    els.recipeChecklist.innerHTML = '';
    recipe.ingredients.forEach(function (ri) {
      if (isStaple(ri.ingredientId)) return; // listed separately as assumed
      var ing = getIngredient(ri.ingredientId);
      var held = state.stock[ri.ingredientId] || 0;
      var have = held >= ri.amount;
      var li = document.createElement('li');
      li.className = 'check-item ' + (have ? 'check-have' : 'check-missing');
      li.innerHTML =
        '<span class="check-mark" aria-hidden="true">' + (have ? '\u2713' : '\u2717') + '</span>' +
        '<span class="check-emoji">' + (ing ? ing.emoji : '') + '</span>' +
        '<span class="check-name">' + escapeHtml(ing ? ing.name : ri.ingredientId) + '</span>' +
        '<span class="check-amounts">' + (have
          ? 'you have ' + held + ' ' + escapeHtml(ing.unit)
          : 'need ' + ri.amount + ' ' + escapeHtml(ing.unit) +
            (held > 0 ? ' (you have ' + held + ')' : '')) + '</span>';
      els.recipeChecklist.appendChild(li);
    });

    // Staples the recipe calls for: neither green nor red, just assumed.
    var staples = recipe.ingredients.filter(function (ri) { return isStaple(ri.ingredientId); });
    if (staples.length > 0) {
      els.recipeStaples.innerHTML = 'Assumed in your pantry: ' + staples.map(function (ri) {
        var ing = getIngredient(ri.ingredientId);
        return ing ? ing.emoji + ' ' + escapeHtml(ing.name) : escapeHtml(ri.ingredientId);
      }).join(' &middot; ');
      els.recipeStaples.classList.remove('hidden');
    } else {
      els.recipeStaples.classList.add('hidden');
    }

    els.recipeSteps.innerHTML = '';
    recipe.steps.forEach(function (step) {
      var li = document.createElement('li');
      li.textContent = step;
      els.recipeSteps.appendChild(li);
    });

    // A recipe the kitchen already covers has nothing to shop for, so the
    // shopping button disappears entirely and "Cook this" stands alone.
    var missingCount = missingIngredients(state, recipe).length;
    els.generateList.classList.toggle('hidden', missingCount === 0);
    els.generateList.disabled = missingCount === 0; // belt and braces: hidden first
    els.generateList.title = missingCount === 0 ? 'You already have everything for this one' : '';
  }

  /* ---------- commit actions (spec > Components > Commit actions) ---------- */

  function heldIngredientIds(recipe) {
    return recipe.ingredients
      .filter(function (ri) {
        return !isStaple(ri.ingredientId) && (state.stock[ri.ingredientId] || 0) > 0;
      })
      .map(function (ri) { return ri.ingredientId; });
  }

  function onCookThis() {
    if (!openPick) return;
    var recipe = openPick.recipe;
    var spec = combineAnimationSpec(recipe, heldIngredientIds(recipe));
    var taken = cookDeductions(state, recipe); // read before the stock changes
    state = cookRecipe(state, recipe); // deducts only what you have
    persist(state);
    closeRecipeView();
    closeRecommendations();
    renderAll();
    playCombineAnimation(spec, 'Bon Appétit!');
    playRemoveFloat(taken); // the amounts leaving the fridge, rising and evaporating
  }

  function onGenerateList() {
    if (!openPick) return;
    var recipe = openPick.recipe;
    var missing = missingIngredients(state, recipe);
    var spec = combineAnimationSpec(recipe, missing.map(function (m) { return m.ingredientId; }));
    state = addToShoppingList(state, recipe); // missing items, recipe quantities
    persist(state);
    closeRecipeView();
    closeRecommendations();
    renderAll();
    playCombineAnimation(spec, 'On your shopping list!');
  }

  /* ---------- the combining animation (spec > Components > Combining animation) ---------- */

  /* One CSS keyframe sequence, played once per commit: the committed
   * ingredient tiles slide together and resolve into the dish emoji. */
  function playCombineAnimation(spec, closingLine) {
    els.combineFly.innerHTML = '';
    spec.flying.forEach(function (ing, i) {
      var tile = document.createElement('span');
      tile.className = 'combine-tile';
      tile.textContent = ing.emoji;
      // Deterministic spread around the dish, so every play reads the same.
      var angle = (i / Math.max(spec.flying.length, 1)) * Math.PI * 2 - Math.PI / 2;
      var dist = 130 + (i % 3) * 26;
      tile.style.setProperty('--dx', Math.round(Math.cos(angle) * dist) + 'px');
      tile.style.setProperty('--dy', Math.round(Math.sin(angle) * dist - 30) + 'px');
      tile.style.setProperty('--rot', ((i % 2 ? 1 : -1) * (12 + i * 7)) + 'deg');
      tile.style.animationDelay = (i * 60) + 'ms';
      els.combineFly.appendChild(tile);
    });

    els.combineDish.textContent = spec.dishEmoji;
    // Restart the dish animation cleanly on repeated commits.
    els.combineDish.style.animation = 'none';
    void els.combineDish.offsetWidth;
    els.combineDish.style.animation = '';
    els.combineLine.textContent = closingLine || 'Bon Appétit!';

    els.combineStage.classList.remove('hidden');

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      els.combineStage.classList.add('hidden');
    }
    els.combineDish.addEventListener('animationend', finish, { once: true });
    // Fallback for reduced-motion (animations disabled) and any browser
    // that never fires animationend: the sequence is ~1.2s long.
    setTimeout(finish, 1800);
  }

  /* Cooking takes food out of the fridge: each amount that leaves rises off
   * the fridge and evaporates (spec > Components > Commit actions). The
   * float is anchored to the fridge's own screen position and held inside
   * its column, so it reads as coming out of the storage no matter how wide
   * the layout makes the fridge.
   *
   * The chips play one at a time, REMOVE_STAGGER_MS apart, rather than all
   * rising together (final-review round three): a multi-ingredient cook read
   * as one blur, so the individual deductions were impossible to follow. */
  var REMOVE_STAGGER_MS = 500;

  function playRemoveFloat(deductions) {
    clearTimeout(removeFloatTimer);
    els.removeFloat.innerHTML = '';
    if (!deductions || !deductions.length) {
      els.removeFloat.classList.add('hidden');
      return;
    }

    // The last chip starts (n-1) staggers in, then takes its 1250ms rise,
    // plus a beat to settle before the layer is cleared.
    var total = 1250 + (deductions.length - 1) * REMOVE_STAGGER_MS + 150;

    var rect = els.fridge.getBoundingClientRect();
    var midX = rect.left + rect.width / 2;
    var startY = rect.top + Math.max(44, rect.height * 0.40);
    // The fridge column is narrow, so the float stays narrow: a small
    // zig-zag that never leaves the fridge's own width.
    var maxSpread = Math.max(0, Math.min(rect.width * 0.13, 26));
    // Room the chip has, inside the fridge's padding.
    var room = rect.width - 34;

    var title = document.createElement('p');
    title.className = 'remove-title';
    title.textContent = 'Out of the fridge';
    title.style.left = midX + 'px';
    title.style.top = (rect.top + 6) + 'px';
    // The title stays for the whole sequence: with the chips staggered, a
    // 1250ms title would vanish mid-way through a multi-ingredient cook.
    title.style.animationDuration = total + 'ms';
    els.removeFloat.appendChild(title);

    // Unhide before building the chips: the layer is pointer-events:none,
    // and a display:none parent measures its children as zero width — the
    // fit check below needs real numbers.
    els.removeFloat.classList.remove('hidden');

    deductions.forEach(function (d, i) {
      var ing = getIngredient(d.ingredientId);
      if (!ing) return;

      var chip = document.createElement('span');
      chip.className = 'remove-chip';

      var emoji = document.createElement('span');
      emoji.className = 'remove-emoji';
      emoji.textContent = ing.emoji;
      chip.appendChild(emoji);

      var name = document.createElement('span');
      name.className = 'remove-name';
      name.textContent = ing.name;
      chip.appendChild(name);

      var amount = document.createElement('span');
      amount.className = 'remove-amount';
      amount.textContent = '\u2212' + d.removed + ' ' + ing.unit;
      chip.appendChild(amount);

      // Deterministic zig-zag, so a stack of removals stays readable.
      var spread = ((i % 3) - 1) * maxSpread;
      chip.style.left = (midX + spread) + 'px';
      chip.style.top = (startY + i * 26) + 'px';
      chip.style.animationDelay = (i * REMOVE_STAGGER_MS) + 'ms';
      els.removeFloat.appendChild(chip);

      // A narrow fridge comes first: if the full line would spill over the
      // fridge's edges, the emoji and the amount still carry the message.
      if (chip.getBoundingClientRect().width > room) name.remove();
    });

    removeFloatTimer = setTimeout(function () {
      els.removeFloat.classList.add('hidden');
      els.removeFloat.innerHTML = '';
    }, total);
  }

  /* ---------- amount prompt ---------- */

  function openPrompt(ingredientId) {
    var ing = getIngredient(ingredientId);
    if (!ing) return;
    session.promptIngredientId = ingredientId;
    els.promptEmoji.textContent = ing.emoji;
    els.promptName.textContent = ing.name;
    els.promptUnit.textContent = ing.unit;
    els.promptInput.value = '';
    els.promptError.classList.add('hidden');
    els.prompt.classList.remove('hidden');
    els.promptInput.focus();
  }

  function closePrompt() {
    els.prompt.classList.add('hidden');
    session.promptIngredientId = null;
  }

  function onSubmitAmount(e) {
    e.preventDefault();
    var n = parseAmount(els.promptInput.value);
    if (!isValidAmount(n)) {
      els.promptError.textContent = 'Whole numbers greater than zero, please — like 2 or 200.';
      els.promptError.classList.remove('hidden');
      return;
    }
    state = addToStock(state, session.promptIngredientId, n);
    persist(state);
    closePrompt();
    renderAll();
    if (!doorOpen) setDoor(true); // show it land
  }

  /* ================================================================== *
   * Exports — the pure logic, for the verification harnesses
   * ================================================================== */

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    SEEDED_CATEGORIES: SEEDED_CATEGORIES,
    createState: createState,
    cloneState: cloneState,
    parseAmount: parseAmount,
    isValidAmount: isValidAmount,
    addToStock: addToStock,
    confirmCategories: confirmCategories,
    ensureCategories: ensureCategories,
    groupTrayByCategory: groupTrayByCategory,
    getIngredient: getIngredient,
    isStaple: isStaple,
    STAPLE_IDS: STAPLE_IDS,
    APP_ID: APP_ID,
    SCHEMA_VERSION: SCHEMA_VERSION,
    sanitizeState: sanitizeState,
    summarizeState: summarizeState,
    isEmptyKitchen: isEmptyKitchen,
    buildExport: buildExport,
    exportJson: exportJson,
    parseImportPayload: parseImportPayload,
    loadState: loadState,
    saveState: saveState,
    scoreRecipe: scoreRecipe,
    LENGTH_BONUS: LENGTH_BONUS,
    lengthMultiplier: lengthMultiplier,
    recommend: recommend,
    missingIngredients: missingIngredients,
    cookRecipe: cookRecipe,
    cookDeductions: cookDeductions,
    addToShoppingList: addToShoppingList,
    buyShoppingListItem: buyShoppingListItem,
    getRecipe: getRecipe,
    combineAnimationSpec: combineAnimationSpec
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
