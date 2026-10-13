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

  function getIngredient(id) {
    for (var i = 0; i < ingredients.length; i++) {
      if (ingredients[i].id === id) return ingredients[i];
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
    els.prompt = document.getElementById('amount-prompt');
    els.promptForm = document.getElementById('amount-form');
    els.promptEmoji = document.getElementById('prompt-emoji');
    els.promptName = document.getElementById('prompt-name');
    els.promptUnit = document.getElementById('prompt-unit');
    els.promptInput = document.getElementById('amount-input');
    els.promptError = document.getElementById('prompt-error');
    els.promptCancel = document.getElementById('prompt-cancel');

    state = loadState();

    renderSeedList();
    els.addCategoryForm.addEventListener('submit', onAddCategory);
    els.confirmCategories.addEventListener('click', onConfirmCategories);
    els.doneButton.addEventListener('click', function () {
      session.entryMode = false;
      renderHint();
    });
    els.promptForm.addEventListener('submit', onSubmitAmount);
    els.promptCancel.addEventListener('click', closePrompt);
    els.prompt.addEventListener('click', function (e) {
      if (e.target === els.prompt) closePrompt();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePrompt();
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
    saveState: saveState
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
