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

  /* ================================================================== *
   * 1. Pure logic
   * ================================================================== */

  var STORAGE_KEY = 'fdc-state-v1';

  var SEEDED_CATEGORIES = [
    { id: 'produce',   name: 'Produce' },
    { id: 'dairy',     name: 'Dairy' },
    { id: 'pantry',    name: 'Pantry' },
    { id: 'leftovers', name: 'Leftovers' }
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

  /* Group the built-in tray by the user's categories, in the user's own
   * order. Categories with no tray ingredients are skipped. */
  function groupTrayByCategory(categories) {
    var byId = {};
    (categories || []).forEach(function (c) { byId[c.id] = []; });
    ingredients.forEach(function (ing) {
      if (byId[ing.categoryId]) byId[ing.categoryId].push(ing);
    });
    return (categories || [])
      .map(function (c) { return { category: c, items: byId[c.id] }; })
      .filter(function (g) { return g.items.length > 0; });
  }

  /* ================================================================== *
   * The recommendation engine (spec > Components > Recommendation engine)
   * ================================================================== */

  /* Score one recipe against the stock: the share of its ingredients the
   * user holds in sufficient amount. The amount-level check means needing
   * 200 g with 100 g in stock counts as missing (spec > Data Model). */
  function scoreRecipe(recipe, stock) {
    var have = 0;
    recipe.ingredients.forEach(function (ri) {
      if ((stock[ri.ingredientId] || 0) >= ri.amount) have += 1;
    });
    var total = recipe.ingredients.length;
    return {
      recipe: recipe,
      have: have,
      missing: total - have,
      total: total,
      score: total === 0 ? 0 : have / total
    };
  }

  /* The matching rule the spec committed to: score = have ÷ need, tie-broken
   * by fewest missing, then simplest, then by id for a stable order. Only
   * recipes with at least one ingredient in hand are candidates; the top
   * 2-3 come back (prd.md > Product Decisions). */
  function recommend(state, recipeList) {
    var list = recipeList || recipes;
    return list
      .map(function (r) { return scoreRecipe(r, state.stock); })
      .filter(function (s) { return s.have > 0; })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;      // best fit first
        if (a.missing !== b.missing) return a.missing - b.missing; // then fewest missing
        if (a.total !== b.total) return a.total - b.total;      // then simplest
        return a.recipe.id < b.recipe.id ? -1 : 1;              // stable order
      })
      .slice(0, 3);
  }

  /* ================================================================== *
   * Commit actions (spec > Components > Commit actions)
   * ================================================================== */

  /* The ingredients a recipe is missing: held in less than the required
   * amount — the same amount-level rule the engine scores with. */
  function missingIngredients(state, recipe) {
    return recipe.ingredients
      .filter(function (ri) { return (state.stock[ri.ingredientId] || 0) < ri.amount; })
      .map(function (ri) { return { ingredientId: ri.ingredientId, amount: ri.amount }; });
  }

  /* "Cook this": deduct each ingredient the user actually has — the full
   * recipe amount when there is enough, otherwise whatever is left, never
   * below zero. Ingredients that reach 0 drop off the fridge display
   * (spec > Data Model), so their key is removed. Returns a new state. */
  function cookRecipe(state, recipe) {
    var next = cloneState(state);
    recipe.ingredients.forEach(function (ri) {
      var held = next.stock[ri.ingredientId] || 0;
      if (held <= 0) return; // missing: untouched
      var left = held - ri.amount;
      if (left <= 0) delete next.stock[ri.ingredientId];
      else next.stock[ri.ingredientId] = left;
    });
    return next;
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
   * (spec > Data Model). */
  function sanitizeState(parsed) {
    var fresh = createState();
    if (!parsed || typeof parsed !== 'object') return fresh;

    if (Array.isArray(parsed.categories)) {
      fresh.categories = confirmCategories(parsed.categories);
    }
    if (parsed.stock && typeof parsed.stock === 'object' && !Array.isArray(parsed.stock)) {
      Object.keys(parsed.stock).forEach(function (id) {
        var n = Number(parsed.stock[id]);
        if (isValidAmount(n)) fresh.stock[id] = n;
      });
    }
    if (Array.isArray(parsed.shoppingList)) {
      fresh.shoppingList = parsed.shoppingList.filter(function (item) {
        return !!item && typeof item.ingredientId === 'string' &&
          isValidAmount(Number(item.amount));
      }).map(function (item) {
        return {
          ingredientId: item.ingredientId,
          amount: Number(item.amount),
          fromRecipeId: typeof item.fromRecipeId === 'string' ? item.fromRecipeId : null
        };
      });
    }
    return fresh;
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
  var session = { entryMode: true, promptIngredientId: null, customCounter: 0 };
  var els = {};
  var openPick = null; // the recommendation currently centered

  function init() {
    els.setupScreen = document.getElementById('setup-screen');
    els.seedList = document.getElementById('seed-list');
    els.addCategoryForm = document.getElementById('add-category-form');
    els.confirmCategories = document.getElementById('confirm-categories');
    els.setupError = document.getElementById('setup-error');
    els.fridgeDoor = document.getElementById('fridge-door');
    els.hint = document.getElementById('first-use-hint');
    els.chips = document.getElementById('category-chips');
    els.fridge = document.getElementById('fridge');
    els.fridgeEmptyNote = document.getElementById('fridge-empty-note');
    els.fridgeStock = document.getElementById('fridge-stock');
    els.tray = document.getElementById('ingredient-tray');
    els.doneButton = document.getElementById('done-button');
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
    els.cookThis = document.getElementById('cook-this');
    els.generateList = document.getElementById('generate-list');
    els.shoppingList = document.getElementById('shopping-list');
    els.shoppingItems = document.getElementById('shopping-items');
    els.combineStage = document.getElementById('combine-stage');
    els.combineFly = document.getElementById('combine-fly');
    els.combineDish = document.getElementById('combine-dish');
    els.combineLine = document.getElementById('combine-line');

    state = loadState();

    renderSeedList();
    els.addCategoryForm.addEventListener('submit', onAddCategory);
    els.confirmCategories.addEventListener('click', onConfirmCategories);
    els.doneButton.addEventListener('click', function () {
      session.entryMode = false;
      renderHint();
    });
    els.myRecipesButton.addEventListener('click', onMyRecipes);
    els.recClose.addEventListener('click', closeRecommendations);
    els.recipeClose.addEventListener('click', closeRecipeView);
    els.cookThis.addEventListener('click', onCookThis);
    els.generateList.addEventListener('click', onGenerateList);
    els.promptForm.addEventListener('submit', onSubmitAmount);
    els.promptCancel.addEventListener('click', closePrompt);
    els.prompt.addEventListener('click', function (e) {
      if (e.target === els.prompt) closePrompt();
    });
    els.recipeView.addEventListener('click', function (e) {
      if (e.target === els.recipeView) closeRecipeView();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      // Close the top-most layer first.
      if (!els.prompt.classList.contains('hidden')) { closePrompt(); return; }
      if (!els.recipeView.classList.contains('hidden')) closeRecipeView();
    });
    wireFridgeDrop();

    if (state.categories.length > 0) showFridgeDoor();
    renderAll();
  }

  /* ---------- helpers ---------- */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showSetup() {
    els.setupScreen.classList.remove('hidden');
    els.fridgeDoor.classList.add('hidden');
  }

  function showFridgeDoor() {
    els.setupScreen.classList.add('hidden');
    els.fridgeDoor.classList.remove('hidden');
    session.entryMode = true;
  }

  /* ---------- first-use setup ---------- */

  function renderSeedList() {
    els.seedList.innerHTML = '';
    SEEDED_CATEGORIES.forEach(function (c) {
      els.seedList.appendChild(makeSeedRow(c.id, c.name, true));
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
      els.setupError.textContent = 'Pick at least one category to continue.';
      els.setupError.classList.remove('hidden');
      return;
    }
    els.setupError.classList.add('hidden');
    state.categories = confirmCategories(chosen);
    saveState(state);
    showFridgeDoor();
    renderAll();
  }

  /* ---------- the fridge door ---------- */

  function renderAll() {
    renderCategoryChips();
    renderFridge();
    renderShoppingList();
    renderTray();
    renderHint();
  }

  function renderCategoryChips() {
    els.chips.innerHTML = '';
    state.categories.forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = c.name;
      els.chips.appendChild(chip);
    });
  }

  function renderFridge() {
    els.fridgeStock.innerHTML = '';
    var any = false;
    groupTrayByCategory(state.categories).forEach(function (g) {
      var stocked = g.items.filter(function (ing) { return (state.stock[ing.id] || 0) > 0; });
      if (stocked.length === 0) return;
      any = true;

      var section = document.createElement('section');
      section.className = 'fridge-group';
      var h = document.createElement('h3');
      h.className = 'fridge-group-title';
      h.textContent = g.category.name;
      section.appendChild(h);

      var row = document.createElement('div');
      row.className = 'fridge-row';
      stocked.forEach(function (ing) {
        var chip = document.createElement('span');
        chip.className = 'stock-chip';
        chip.innerHTML =
          '<span class="stock-emoji">' + ing.emoji + '</span>' +
          '<span class="stock-amount">' + state.stock[ing.id] + ' ' + escapeHtml(ing.unit) + '</span>' +
          '<span class="stock-name">' + escapeHtml(ing.name) + '</span>';
        row.appendChild(chip);
      });
      section.appendChild(row);
      els.fridgeStock.appendChild(section);
    });
    els.fridgeEmptyNote.classList.toggle('hidden', any);
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
    saveState(state);
    renderAll();
  }

  function renderTray() {
    els.tray.innerHTML = '';
    groupTrayByCategory(state.categories).forEach(function (g) {
      var section = document.createElement('section');
      section.className = 'tray-group';

      var h = document.createElement('h3');
      h.className = 'tray-group-title';
      h.textContent = g.category.name;
      section.appendChild(h);

      var row = document.createElement('div');
      row.className = 'tray-row';
      g.items.forEach(function (ing) { row.appendChild(makeTile(ing)); });
      section.appendChild(row);
      els.tray.appendChild(section);
    });
  }

  function makeTile(ing) {
    var tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.draggable = true;
    tile.setAttribute('aria-label', 'Add ' + ing.name);
    tile.innerHTML =
      '<span class="tile-emoji">' + ing.emoji + '</span>' +
      '<span class="tile-name">' + escapeHtml(ing.name) + '</span>';
    // Tap does the same thing as drag (spec: the touch-friendly path).
    tile.addEventListener('click', function () { openPrompt(ing.id); });
    tile.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', ing.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    return tile;
  }

  function renderHint() {
    var stockEmpty = Object.keys(state.stock).length === 0;
    els.hint.classList.toggle('hidden', !(session.entryMode && stockEmpty));
  }

  function wireFridgeDrop() {
    els.fridge.addEventListener('dragover', function (e) {
      e.preventDefault();
      els.fridge.classList.add('drop-target');
    });
    els.fridge.addEventListener('dragleave', function () {
      els.fridge.classList.remove('drop-target');
    });
    els.fridge.addEventListener('drop', function (e) {
      e.preventDefault();
      els.fridge.classList.remove('drop-target');
      var id = e.dataTransfer.getData('text/plain');
      if (getIngredient(id)) openPrompt(id);
    });
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

    els.recipeSteps.innerHTML = '';
    recipe.steps.forEach(function (step) {
      var li = document.createElement('li');
      li.textContent = step;
      els.recipeSteps.appendChild(li);
    });

    // Nothing to shop for when the kitchen already covers the recipe.
    var missing = missingIngredients(state, recipe).length;
    els.generateList.disabled = missing === 0;
    els.generateList.title = missing === 0 ? 'You already have everything for this one' : '';
  }

  /* ---------- commit actions (spec > Components > Commit actions) ---------- */

  function heldIngredientIds(recipe) {
    return recipe.ingredients
      .filter(function (ri) { return (state.stock[ri.ingredientId] || 0) > 0; })
      .map(function (ri) { return ri.ingredientId; });
  }

  function onCookThis() {
    if (!openPick) return;
    var recipe = openPick.recipe;
    var spec = combineAnimationSpec(recipe, heldIngredientIds(recipe));
    state = cookRecipe(state, recipe); // deducts only what you have
    saveState(state);
    closeRecipeView();
    closeRecommendations();
    renderAll();
    playCombineAnimation(spec, 'Bon Appétit!');
  }

  function onGenerateList() {
    if (!openPick) return;
    var recipe = openPick.recipe;
    var missing = missingIngredients(state, recipe);
    var spec = combineAnimationSpec(recipe, missing.map(function (m) { return m.ingredientId; }));
    state = addToShoppingList(state, recipe); // missing items, recipe quantities
    saveState(state);
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
    saveState(state);
    closePrompt();
    renderAll();
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
    groupTrayByCategory: groupTrayByCategory,
    getIngredient: getIngredient,
    sanitizeState: sanitizeState,
    loadState: loadState,
    saveState: saveState,
    scoreRecipe: scoreRecipe,
    recommend: recommend,
    missingIngredients: missingIngredients,
    cookRecipe: cookRecipe,
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
