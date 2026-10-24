/* Fridge Door Companion — the browser UI.

 * Rendering, events, and the store wiring. The kitchen rules themselves live
 * in `src/domain/`; this file only decides how they look and what a gesture
 * means. The catalog is built once here and passed to the domain explicitly,
 * so nothing reaches for browser globals.
 */
import {
  ALLERGENS,
  ALLERGEN_LABELS,
  DIETS,
  DIET_CLASSES,
  DIET_CLASS_LABELS,
  DIET_LABELS,
  SEEDED_CATEGORIES,
  acceptedUnits,
  addCustomIngredient,
  addCustomRecipe,
  addToShoppingList,
  addToStock,
  buyShoppingListItem,
  clearStoredKitchen,
  combineAnimationSpec,
  confirmCategories,
  cookDeductions,
  cookRecipe,
  createState,
  describePreferences,
  ensureCategories,
  exportJson,
  formatAmount,
  getIngredient,
  getRecipe,
  groupTrayByCategory,
  expiryLabel,
  expiryStatus,
  hasActivePreferences,
  isEmptyKitchen,
  isValidAmount,
  isStapleFor,
  setPreferences,
  setStaple,
  soonestExpiry,
  missingIngredients,
  parseAmount,
  parseImportPayload,
  popUndo,
  pushUndo,
  recommend,
  remoteStateFromRaw,
  roundAmount,
  sameState,
  stockTotals,
  summarizeState,
  toCanonical,
  totalAmount,
} from './domain/index';
import { createCatalog } from './domain/catalog';
import { ingredients } from './data/ingredients';
import { recipes } from './data/recipes';
import {
  STORAGE_KEY,
  getStorage,
  loadState,
  readRawState,
  saveState,
} from './store/localStore';

const baseCatalog = createCatalog(ingredients, recipes);
  var catalog = baseCatalog; // built-ins plus whatever this kitchen added

  function rebuildCatalog() {
    catalog = createCatalog(
      ingredients.concat(state.customIngredients || []),
      recipes.concat(state.customRecipes || [])
    );
  }

  var state = createState();
  var session = {
    promptIngredientId: null,
    customCounter: 0,
    openBubble: null, // the category bubble currently swelled open
    clickTimer: null, // disambiguates click (prompt) from double-click (quick add)
    clickItemId: null,
    suppressClick: false, // set by a drag so its release opens nothing
    recipeDraft: [] // custom-recipe builder rows, canonical amounts
  };
  var els = {};
  var openPick = null; // the recommendation currently centered
  var removeFloatTimer = null; // clears the "out of the fridge" float
  var addFloatTimer = null; // clears the quick-add chip
  var undoStack = []; // in-memory snapshots, newest last
  var undoTimer = null; // hides the undo bar after a moment
  var doorOpen = false; // is the fridge door swung open?
  var dragState = null; // the icon being dragged toward the fridge

  function init() {
    els.seedList = document.getElementById('seed-list');
    els.stapleList = document.getElementById('staple-list');
    els.preferenceDiet = document.getElementById('preference-diet');
    els.allergenOptions = document.getElementById('allergen-options');
    els.clearPreferences = document.getElementById('clear-preferences');
    els.preferencesStatus = document.getElementById('preferences-status');
    els.customIngredientForm = document.getElementById('custom-ingredient-form');
    els.customName = document.getElementById('custom-ingredient-name');
    els.customEmoji = document.getElementById('custom-ingredient-emoji');
    els.customCategory = document.getElementById('custom-ingredient-category');
    els.customUnit = document.getElementById('custom-ingredient-unit');
    els.customDensity = document.getElementById('custom-ingredient-density');
    els.customDiet = document.getElementById('custom-ingredient-diet');
    els.customAllergensKnown = document.getElementById('custom-ingredient-allergens-known');
    els.customAllergenOptions = document.getElementById('custom-allergen-options');
    els.customError = document.getElementById('custom-ingredient-error');
    els.customStatus = document.getElementById('custom-ingredient-status');
    els.customRecipeForm = document.getElementById('custom-recipe-form');
    els.customRecipeName = document.getElementById('custom-recipe-name');
    els.customRecipeEmoji = document.getElementById('custom-recipe-emoji');
    els.customRecipeIngredient = document.getElementById('custom-recipe-ingredient');
    els.customRecipeAmount = document.getElementById('custom-recipe-amount');
    els.customRecipeUnit = document.getElementById('custom-recipe-unit');
    els.customRecipeAddRow = document.getElementById('custom-recipe-add-row');
    els.customRecipeDraft = document.getElementById('custom-recipe-draft');
    els.customRecipeSteps = document.getElementById('custom-recipe-steps');
    els.customRecipeError = document.getElementById('custom-recipe-error');
    els.customRecipeRowError = document.getElementById('custom-recipe-row-error');
    els.customRecipeStatus = document.getElementById('custom-recipe-status');
    els.customRecipeListWrap = document.getElementById('custom-recipe-list-wrap');
    els.customRecipeList = document.getElementById('custom-recipe-list');
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
    els.recFilterNote = document.getElementById('rec-filter-note');
    els.recClose = document.getElementById('rec-close');
    els.prompt = document.getElementById('amount-prompt');
    els.promptForm = document.getElementById('amount-form');
    els.promptEmoji = document.getElementById('prompt-emoji');
    els.promptName = document.getElementById('prompt-name');
    els.promptUnit = document.getElementById('prompt-unit');
    els.promptInput = document.getElementById('amount-input');
    els.promptExpiry = document.getElementById('amount-expiry');
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
    els.undoBar = document.getElementById('undo-bar');
    els.undoText = document.getElementById('undo-text');
    els.undoButton = document.getElementById('undo-button');
    els.exportButton = document.getElementById('export-button');
    els.importButton = document.getElementById('import-button');
    els.importFile = document.getElementById('import-file');
    els.dataStatus = document.getElementById('data-status');
    els.resetButton = document.getElementById('reset-button');

    // A first visit adopts the seeded categories and opens straight onto the
    // fridge door — no setup screen in front of the app.
    state = ensureCategories(loadState(baseCatalog));
    rebuildCatalog();
    persist(state);

    buildDietOptions(els.preferenceDiet, 'No diet filter');
    buildDietClassOptions(els.customDiet);
    buildAllergenOptions(els.allergenOptions, 'preference-allergen', 'allergen');
    buildAllergenOptions(els.customAllergenOptions, 'custom-allergen', 'custom-allergen');
    els.preferenceDiet.addEventListener('change', onPreferencesChange);
    els.allergenOptions.addEventListener('change', onPreferencesChange);
    els.clearPreferences.addEventListener('click', onClearPreferences);
    els.customAllergensKnown.addEventListener('change', syncCustomAllergenFields);

    renderSeedList();
    renderStapleList();
    refreshDoorPanels();
    els.customIngredientForm.addEventListener('submit', onAddCustomIngredient);
    els.customUnit.addEventListener('change', syncDensityField);
    syncDensityField();
    syncCustomAllergenFields();
    els.customRecipeForm.addEventListener('submit', onSaveCustomRecipe);
    els.customRecipeIngredient.addEventListener('change', syncRecipeUnitOptions);
    els.customRecipeAddRow.addEventListener('click', onAddRecipeRow);
    els.customRecipeAmount.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onAddRecipeRow();
      }
    });
    els.customRecipeDraft.addEventListener('click', onRemoveRecipeRow);
    els.addCategoryForm.addEventListener('submit', onAddCategory);
    els.confirmCategories.addEventListener('click', onConfirmCategories);
    els.exportButton.addEventListener('click', onExport);
    els.importButton.addEventListener('click', onImportPick);
    els.importFile.addEventListener('change', onImportFile);
    els.resetButton.addEventListener('click', onResetKitchen);
    els.undoButton.addEventListener('click', onUndo);
    startCrossTabSync();
    registerServiceWorker();
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
      broadcastChange();
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
    var result = parseImportPayload(baseCatalog, text);
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
    clearUndo();
    rebuildCatalog();
    persist(state);
    closePrompt();
    closeRecipeView();
    closeRecommendations();
    renderSeedList();
    renderStapleList();
    refreshDoorPanels();
    renderAll();
    els.dataStatus.textContent = 'Imported ' + detail + '.';
    announce('Kitchen imported: ' + detail + '.');
  }

  /* ---------- reset ---------- */

  function onResetKitchen() {
    if (!window.confirm('Clear this kitchen and start over? Your categories, stock, and ' +
        'shopping list will be gone. Export a copy first if you might want them back.')) {
      return;
    }
    clearStoredKitchen(getStorage());
    clearUndo();
    state = ensureCategories(createState());
    rebuildCatalog();
    persist(state);
    closePrompt();
    closeRecipeView();
    closeRecommendations();
    renderSeedList();
    renderStapleList();
    refreshDoorPanels();
    renderAll();
    els.dataStatus.textContent = 'Kitchen cleared. Start fresh by opening a bubble.';
    announce('Kitchen cleared.');
  }

  /* ---------- cross-tab sync ---------- */

  var syncChannel = null;
  var TAB_ID = 'tab-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* A tab that hears the signal re-reads storage instead of trusting a
   * payload, so a half-written message can never be applied. The domain owns
   * what a stored value means; unreadable data comes back as null and is
   * ignored rather than blanking a good kitchen. */
  function broadcastChange() {
    if (!syncChannel) return;
    try {
      syncChannel.postMessage({ tab: TAB_ID, at: Date.now() });
    } catch (e) { /* the other tab still catches up on reload */ }
  }

  /* Re-read from storage rather than trusting a payload: storage is the
   * source of truth, so a tab can never apply a half-written message. */
  function receiveRemoteState(raw) {
    var incoming = remoteStateFromRaw(baseCatalog, raw);
    if (!incoming || sameState(incoming, state)) return;
    state = incoming;
    rebuildCatalog();
    clearUndo(); // snapshots from before the other tab's change would clobber it
    // A recipe card or pick list built against the old kitchen is stale now.
    closeRecipeView();
    closeRecommendations();
    renderSeedList(); // the categories disclosure is not part of renderAll
    renderStapleList();
    refreshDoorPanels();
    renderAll();
    announce('The kitchen changed in another tab.');
  }

  function startCrossTabSync() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        syncChannel = new BroadcastChannel('fdc-kitchen');
        syncChannel.onmessage = function (event) {
          if (!event.data || event.data.tab === TAB_ID) return;
          receiveRemoteState(readRawState());
        };
        return;
      } catch (e) {
        syncChannel = null;
      }
    }
    // Fallback for browsers without BroadcastChannel: the storage event only
    // fires in other tabs, which is exactly the audience we want.
    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      receiveRemoteState(event.newValue);
    });
  }

  function registerServiceWorker() {
    if (import.meta.env.DEV) return; // no built shell to cache in dev
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return; // no worker on file://; see README
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // Offline reload is an enhancement; the app works without it.
      });
    });
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

  /* Every tray ingredient gets a checkbox, in name order, so marking an
   * uncommon staple does not mean hunting through bubbles. */
  function renderStapleList() {
    els.stapleList.innerHTML = '';
    catalog.ingredients.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    }).forEach(function (ing) {
      var li = document.createElement('li');
      li.className = 'seed-row';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'seed-check';
      cb.id = 'staple-' + ing.id;
      cb.dataset.ingredientId = ing.id;
      cb.checked = isStapleFor(catalog, state, ing.id);
      cb.addEventListener('change', function () {
        onToggleStaple(ing.id, cb.checked);
      });

      var label = document.createElement('label');
      label.className = 'staple-name';
      label.htmlFor = cb.id;
      label.textContent = ing.emoji + ' ' + ing.name;

      li.appendChild(cb);
      li.appendChild(label);
      els.stapleList.appendChild(li);
    });
  }

  function refreshDoorPanels() {
    renderPreferencesForm();
    renderCustomIngredientForm();
    renderCustomRecipeForm();
    renderCustomRecipeList();
  }

  function buildDietOptions(select, noneLabel) {
    select.innerHTML = '';
    var none = document.createElement('option');
    none.value = '';
    none.textContent = noneLabel;
    select.appendChild(none);
    DIETS.forEach(function (diet) {
      var option = document.createElement('option');
      option.value = diet;
      option.textContent = DIET_LABELS[diet];
      select.appendChild(option);
    });
  }

  function buildDietClassOptions(select) {
    select.innerHTML = '';
    DIET_CLASSES.forEach(function (dietClass) {
      var option = document.createElement('option');
      option.value = dietClass;
      option.textContent = dietClass === 'unknown'
        ? 'Not sure (hidden under diet filters)'
        : DIET_CLASS_LABELS[dietClass];
      select.appendChild(option);
    });
    select.value = 'unknown';
  }

  function buildAllergenOptions(container, idPrefix, dataAttribute) {
    container.innerHTML = '';
    ALLERGENS.forEach(function (allergen) {
      var label = document.createElement('label');
      label.className = 'allergen-option';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.id = idPrefix + '-' + allergen;
      input.setAttribute('data-' + dataAttribute, allergen);
      var text = document.createElement('span');
      text.textContent = ALLERGEN_LABELS[allergen];
      label.appendChild(input);
      label.appendChild(text);
      container.appendChild(label);
    });
  }

  function selectedAllergens(container, dataAttribute) {
    var chosen = [];
    container.querySelectorAll('input[data-' + dataAttribute + ']').forEach(function (input) {
      if (input.checked) chosen.push(input.getAttribute('data-' + dataAttribute));
    });
    return chosen;
  }

  function renderPreferencesForm() {
    els.preferenceDiet.value = state.preferences.diet || '';
    var chosen = {};
    state.preferences.allergens.forEach(function (allergen) { chosen[allergen] = true; });
    els.allergenOptions.querySelectorAll('input[data-allergen]').forEach(function (input) {
      input.checked = !!chosen[input.getAttribute('data-allergen')];
    });
    els.preferencesStatus.textContent = describePreferences(state.preferences);
  }

  function readPreferences() {
    return {
      diet: els.preferenceDiet.value || null,
      allergens: selectedAllergens(els.allergenOptions, 'allergen')
    };
  }

  function preferencesEqual(a, b) {
    if (a.diet !== b.diet || a.allergens.length !== b.allergens.length) return false;
    for (var i = 0; i < a.allergens.length; i++) {
      if (a.allergens[i] !== b.allergens[i]) return false;
    }
    return true;
  }

  function applyPreferences(next, message) {
    remember('preferences', message, state);
    state = setPreferences(state, next);
    persist(state);
    closeRecipeView();
    if (!els.recSection.classList.contains('hidden')) renderRecommendations();
    els.preferencesStatus.textContent = describePreferences(state.preferences);
    announce('Food preferences: ' + describePreferences(state.preferences) + '.');
  }

  function onPreferencesChange() {
    var next = readPreferences();
    if (preferencesEqual(next, state.preferences)) return;
    applyPreferences(next, 'Updated food preferences.');
  }

  function onClearPreferences() {
    if (!hasActivePreferences(state.preferences)) return;
    applyPreferences({ diet: null, allergens: [] }, 'Cleared food filters.');
    renderPreferencesForm();
  }

  function syncCustomAllergenFields() {
    var known = els.customAllergensKnown.checked;
    els.customAllergenOptions.querySelectorAll('input').forEach(function (input) {
      input.disabled = !known;
      if (!known) input.checked = false;
    });
  }

  function renderCustomRecipeForm() {
    // Undo or import can remove an ingredient a draft row pointed at.
    session.recipeDraft = session.recipeDraft.filter(function (row) {
      return !!getIngredient(catalog, row.ingredientId);
    });

    var current = els.customRecipeIngredient.value;
    els.customRecipeIngredient.innerHTML = '';
    catalog.ingredients.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    }).forEach(function (ing) {
      var option = document.createElement('option');
      option.value = ing.id;
      option.textContent = ing.emoji + ' ' + ing.name;
      els.customRecipeIngredient.appendChild(option);
    });
    if (catalog.ingredients.some(function (ing) { return ing.id === current; })) {
      els.customRecipeIngredient.value = current;
    }
    syncRecipeUnitOptions();
    renderRecipeDraft();
  }

  function syncRecipeUnitOptions() {
    var ing = getIngredient(catalog, els.customRecipeIngredient.value);
    var current = els.customRecipeUnit.value;
    els.customRecipeUnit.innerHTML = '';
    if (!ing) return;
    var units = acceptedUnits(ing);
    units.forEach(function (unit) {
      var option = document.createElement('option');
      option.value = unit;
      option.textContent = unit;
      els.customRecipeUnit.appendChild(option);
    });
    els.customRecipeUnit.value = units.indexOf(current) >= 0 ? current : ing.unit;
  }

  function onAddRecipeRow() {
    var ing = getIngredient(catalog, els.customRecipeIngredient.value);
    if (!ing) {
      els.customRecipeRowError.textContent = 'Pick an ingredient.';
      els.customRecipeRowError.classList.remove('hidden');
      return;
    }
    var amount = parseAmount(els.customRecipeAmount.value);
    if (amount === null || !isValidAmount(amount)) {
      els.customRecipeRowError.textContent = 'Type a positive amount, like 2 or 1/2.';
      els.customRecipeRowError.classList.remove('hidden');
      els.customRecipeAmount.focus();
      return;
    }
    var canonical = toCanonical(ing, amount, els.customRecipeUnit.value);
    if (canonical === null || !isValidAmount(canonical)) {
      els.customRecipeRowError.textContent = 'That amount does not fit that unit.';
      els.customRecipeRowError.classList.remove('hidden');
      els.customRecipeAmount.focus();
      return;
    }

    var existing = null;
    session.recipeDraft.forEach(function (row) {
      if (row.ingredientId === ing.id) existing = row;
    });
    if (existing) {
      existing.amount = roundAmount(existing.amount + canonical);
    } else {
      session.recipeDraft.push({ ingredientId: ing.id, amount: canonical });
    }
    els.customRecipeAmount.value = '';
    els.customRecipeRowError.classList.add('hidden');
    renderRecipeDraft();
    els.customRecipeAmount.focus();
  }

  function onRemoveRecipeRow(e) {
    var button = e.target && e.target.closest ? e.target.closest('button[data-draft-index]') : null;
    if (!button) return;
    var index = Number(button.dataset.draftIndex);
    if (!Number.isInteger(index) || index < 0 || index >= session.recipeDraft.length) return;
    session.recipeDraft.splice(index, 1);
    renderRecipeDraft();
  }

  function renderRecipeDraft() {
    els.customRecipeDraft.innerHTML = '';
    if (session.recipeDraft.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'draft-empty';
      empty.textContent = 'No ingredients yet.';
      els.customRecipeDraft.appendChild(empty);
      return;
    }
    session.recipeDraft.forEach(function (row, index) {
      var ing = getIngredient(catalog, row.ingredientId);
      if (!ing) return;
      var li = document.createElement('li');
      li.className = 'custom-draft-row';
      var emoji = document.createElement('span');
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = ing.emoji;
      var name = document.createElement('span');
      name.className = 'draft-name';
      name.textContent = ing.name;
      var amount = document.createElement('span');
      amount.className = 'draft-amount';
      amount.textContent = formatAmount(ing, row.amount);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'draft-remove';
      remove.dataset.draftIndex = String(index);
      remove.setAttribute('aria-label', 'Remove ' + ing.name);
      remove.textContent = '\u00d7';
      li.appendChild(emoji);
      li.appendChild(name);
      li.appendChild(amount);
      li.appendChild(remove);
      els.customRecipeDraft.appendChild(li);
    });
  }

  function renderCustomRecipeList() {
    els.customRecipeList.innerHTML = '';
    var list = state.customRecipes || [];
    els.customRecipeListWrap.classList.toggle('hidden', list.length === 0);
    list.forEach(function (recipe) {
      var li = document.createElement('li');
      li.className = 'custom-draft-row';
      var emoji = document.createElement('span');
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = recipe.dishEmoji;
      var name = document.createElement('span');
      name.className = 'draft-name';
      name.textContent = recipe.name;
      var meta = document.createElement('span');
      meta.className = 'draft-amount';
      meta.textContent = recipe.ingredients.length +
        (recipe.ingredients.length === 1 ? ' ingredient' : ' ingredients') +
        ' \u00b7 ' + recipe.steps.length + (recipe.steps.length === 1 ? ' step' : ' steps');
      li.appendChild(emoji);
      li.appendChild(name);
      li.appendChild(meta);
      els.customRecipeList.appendChild(li);
    });
  }

  function onSaveCustomRecipe(e) {
    e.preventDefault();
    var result = addCustomRecipe(catalog, state, {
      name: els.customRecipeName.value,
      dishEmoji: els.customRecipeEmoji.value,
      ingredients: session.recipeDraft,
      steps: els.customRecipeSteps.value.split(/\r?\n/)
    });
    if (!result.ok) {
      els.customRecipeError.textContent = result.error;
      els.customRecipeError.classList.remove('hidden');
      els.customRecipeStatus.textContent = '';
      return;
    }

    remember('recipe', 'Saved ' + result.recipe.name + '.', state);
    state = result.state;
    persist(state);
    rebuildCatalog();
    session.recipeDraft = [];
    els.customRecipeName.value = '';
    els.customRecipeEmoji.value = '';
    els.customRecipeAmount.value = '';
    els.customRecipeSteps.value = '';
    els.customRecipeError.classList.add('hidden');
    els.customRecipeRowError.classList.add('hidden');
    els.customRecipeStatus.textContent = 'Saved ' + result.recipe.name + '.';
    renderRecipeDraft();
    renderCustomRecipeList();
    if (!els.recSection.classList.contains('hidden')) renderRecommendations();
    announce(result.recipe.name + ' saved to your recipes.');
    els.customRecipeName.focus();
  }

  function renderCustomIngredientForm() {
    var current = els.customCategory.value;
    els.customCategory.innerHTML = '';
    state.categories.forEach(function (category) {
      var option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      els.customCategory.appendChild(option);
    });
    if (state.categories.some(function (category) { return category.id === current; })) {
      els.customCategory.value = current;
    }
    syncDensityField();
  }

  function syncDensityField() {
    var countable = els.customUnit.value === 'pcs' || els.customUnit.value === 'cloves' ||
      els.customUnit.value === 'slices' || els.customUnit.value === 'bunch';
    els.customDensity.disabled = countable;
    if (countable) {
      els.customDensity.value = '';
      els.customDensity.placeholder = 'Not used for count units';
    } else {
      els.customDensity.placeholder = 'Density g/ml (optional)';
    }
  }

  function onAddCustomIngredient(e) {
    e.preventDefault();
    var result = addCustomIngredient(catalog, state, {
      name: els.customName.value,
      emoji: els.customEmoji.value,
      categoryId: els.customCategory.value,
      unit: els.customUnit.value,
      densityGPerMl: els.customDensity.value,
      dietClass: els.customDiet.value,
      allergensKnown: els.customAllergensKnown.checked,
      allergens: selectedAllergens(els.customAllergenOptions, 'custom-allergen')
    });
    if (!result.ok) {
      els.customError.textContent = result.error;
      els.customError.classList.remove('hidden');
      els.customStatus.textContent = '';
      els.customName.focus();
      return;
    }

    remember('ingredients', 'Added ' + result.ingredient.name + ' to the tray.', state);
    state = result.state;
    persist(state);
    rebuildCatalog();
    els.customError.classList.add('hidden');
    els.customStatus.textContent = 'Added ' + result.ingredient.name + '.';
    els.customName.value = '';
    els.customEmoji.value = '';
    els.customDensity.value = '';
    els.customDiet.value = 'unknown';
    els.customAllergensKnown.checked = false;
    syncCustomAllergenFields();
    renderStapleList();
    renderCustomRecipeForm();
    renderAll();
    if (!els.recSection.classList.contains('hidden')) renderRecommendations();
    announce(result.ingredient.name + ' added to the tray.');
    els.customName.focus();
  }

  function onToggleStaple(ingredientId, staple) {
    var ing = getIngredient(catalog, ingredientId);
    if (!ing) return;
    remember('staples',
      (staple ? 'Made ' + ing.name + ' a staple.' : 'Stopped treating ' + ing.name + ' as a staple.'),
      state);
    state = setStaple(catalog, state, ingredientId, staple);
    persist(state);
    renderStapleList();
    renderAll();
    announce(staple
      ? ing.name + ' is now assumed in the pantry.'
      : ing.name + ' is now tracked in the fridge.');
    var again = els.stapleList.querySelector('input[data-ingredient-id="' + ingredientId + '"]');
    if (again) again.focus({ preventScroll: true });
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
    renderCustomIngredientForm();
    renderAll();
  }

  /* ---------- the fridge ---------- */

  function renderAll() {
    renderFridge();
    renderShoppingList();
    renderBubbles();
  }

  function trackedStockIds() {
    return Object.keys(stockTotals(state.stockLots)).filter(function (id) {
      return !isStapleFor(catalog, state, id) && totalAmount(state.stockLots, id) > 0;
    });
  }

  /* The shelf answers "what should I use first?": batches with a date lead,
   * earliest first, and the badge says how close that date is. */
  function bySoonestExpiry(a, b) {
    var aDate = soonestExpiry(state.stockLots, a.id) || '9999-12-31';
    var bDate = soonestExpiry(state.stockLots, b.id) || '9999-12-31';
    return aDate < bDate ? -1 : (aDate > bDate ? 1 : a.name.localeCompare(b.name));
  }

  /* The inside of the fridge: one shelf per category, the food standing on
   * it with its amount underneath. The door note carries the count, so the
   * shut fridge still answers "is there anything in there?". */
  function renderFridge() {
    els.fridgeStock.innerHTML = '';
    var any = false;
    groupTrayByCategory(catalog, state.categories).forEach(function (g) {
      var stocked = g.items
        .filter(function (ing) { return totalAmount(state.stockLots, ing.id) > 0; })
        .sort(bySoonestExpiry);
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
        var held = totalAmount(state.stockLots, ing.id);
        var soonest = soonestExpiry(state.stockLots, ing.id);
        var status = expiryStatus(soonest);
        var item = document.createElement('span');
        item.className = 'stock-item';
        var heldText = formatAmount(ing, held);
        item.title = ing.name + ' \u2014 ' + heldText +
          (soonest ? (status === 'expired' ? ' \u2014 expired ' : ' \u2014 use by ') + soonest : '');
        item.innerHTML =
          '<span class="stock-emoji" aria-hidden="true">' + ing.emoji + '</span>' +
          '<span class="stock-amount">' +
            (countableUnit(ing.unit) && Number.isInteger(held) ? '\u00d7' + held : escapeHtml(heldText)) +
          '</span>' +
          (soonest
            ? '<span class="stock-expiry stock-expiry-' + status + '">' +
                escapeHtml(expiryLabel(soonest)) + '</span>'
            : '');
        item.setAttribute('aria-label', ing.name + ', ' + heldText +
          (soonest ? (status === 'expired' ? ', expired ' : ', use by ') + soonest : ''));
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
    return groupTrayByCategory(catalog, state.categories)
      .map(function (g) {
        return {
          category: g.category,
          items: g.items.filter(function (ing) { return !isStapleFor(catalog, state, ing.id); })
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
    var stockedCount = g.items.filter(function (ing) {
      return totalAmount(state.stockLots, ing.id) > 0;
    }).length;

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
    var held = totalAmount(state.stockLots, ing.id);

    var pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'pick';
    pick.dataset.ingredientId = ing.id;
    var heldText = formatAmount(ing, held);
    pick.setAttribute('aria-label', 'Add ' + ing.name +
      (held > 0 ? ' (you have ' + heldText + ')' : ''));
    pick.title = ing.name + (held > 0 ? ' — ' + heldText + ' in the fridge' : '');
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
    var ing = getIngredient(catalog, ingredientId);
    if (!ing) return;
    var amount = defaultAmount(ing);
    remember('restock', 'Added ' + formatAmount(ing, amount) + ' of ' + ing.name + '.', state);
    state = addToStock(state, ingredientId, amount);
    persist(state);
    renderAll();
    if (!doorOpen) setDoor(true); // show it land
    playAddFloat(ing, amount);
    announce(ing.name + ' +' + formatAmount(ing, amount) + ' into the fridge');
    // Re-rendering rebuilt the bubble: put the caret back on the icon.
    var again = els.bubbleField.querySelector('.pick[data-ingredient-id="' + ingredientId + '"]');
    if (again) again.focus({ preventScroll: true });
  }

  function announce(text) {
    if (els.srStatus) els.srStatus.textContent = text;
  }

  /* ---------- undo ---------- */

  /* The action already happened, so the snapshot is taken before it. The
   * whole kitchen is cloned, not just the affected ingredient: an undo has to
   * put back lots, expiry dates, ids, the shopping list — everything. */
  function remember(kind, message, before) {
    undoStack = pushUndo(undoStack, { kind: kind, message: message, state: before });
    showUndo(message);
  }

  function showUndo(message) {
    els.undoText.textContent = message;
    els.undoBar.classList.remove('hidden');
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 12000);
  }

  function hideUndo() {
    clearTimeout(undoTimer);
    els.undoBar.classList.add('hidden');
  }

  function clearUndo() {
    undoStack = [];
    hideUndo();
  }

  function onUndo() {
    var result = popUndo(undoStack);
    if (!result) {
      hideUndo();
      return;
    }
    undoStack = result.rest;
    state = result.entry.state;
    rebuildCatalog();
    persist(state);
    closePrompt();
    closeRecipeView();
    closeRecommendations();
    renderStapleList(); // an undone staple change must move its checkboxes back
    refreshDoorPanels();
    renderAll();
    announce('Undid ' + result.entry.kind + '.');
    if (undoStack.length > 0) {
      showUndo(undoStack[undoStack.length - 1].message);
    } else {
      hideUndo();
    }
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
      '<span class="add-amount">+' + escapeHtml(formatAmount(ing, amount)) + '</span>';
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
      var ing = getIngredient(catalog, item.ingredientId);
      var fromRecipe = item.fromRecipeId ? getRecipe(catalog, item.fromRecipeId) : null;
      var li = document.createElement('li');
      li.className = 'shop-item';
      li.innerHTML =
        '<span class="shop-emoji">' + (ing ? ing.emoji : '') + '</span>' +
        '<span class="shop-name">' + escapeHtml(ing ? ing.name : item.ingredientId) + '</span>' +
        '<span class="shop-amount">' + escapeHtml(ing ? formatAmount(ing, item.amount) : String(item.amount)) + '</span>' +
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
    var item = null;
    for (var i = 0; i < state.shoppingList.length; i++) {
      if (state.shoppingList[i].ingredientId === ingredientId) item = state.shoppingList[i];
    }
    var ing = item ? getIngredient(catalog, ingredientId) : null;
    if (item && ing) {
      remember('restock', 'Bought ' + formatAmount(ing, item.amount) + ' of ' + ing.name + '.', state);
    }
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
    var filtered = hasActivePreferences(state.preferences);
    els.recFilterNote.classList.toggle('hidden', !filtered);
    els.recFilterNote.textContent = filtered
      ? 'Hard filters on: ' + describePreferences(state.preferences) + '.'
      : '';

    var picks = recommend(catalog, state);
    if (picks.length === 0) {
      // Empty state: no cards, just the friendly message (prd.md > Getting recommendations).
      els.recCards.classList.add('hidden');
      if (trackedStockIds().length === 0) {
        els.recEmpty.textContent = 'Uh-oh — your fridge is empty, please refuel.';
      } else if (filtered) {
        els.recEmpty.textContent =
          'Nothing in your fridge fits your food preferences right now.';
      } else {
        els.recEmpty.textContent = "Unfortunately, there's nothing fitting.";
      }
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
      if (isStapleFor(catalog, state, ri.ingredientId)) return; // listed separately as assumed
      var ing = getIngredient(catalog, ri.ingredientId);
      var held = totalAmount(state.stockLots, ri.ingredientId);
      var have = held >= ri.amount;
      var li = document.createElement('li');
      li.className = 'check-item ' + (have ? 'check-have' : 'check-missing');
      li.innerHTML =
        '<span class="check-mark" aria-hidden="true">' + (have ? '\u2713' : '\u2717') + '</span>' +
        '<span class="check-emoji">' + (ing ? ing.emoji : '') + '</span>' +
        '<span class="check-name">' + escapeHtml(ing ? ing.name : ri.ingredientId) + '</span>' +
        '<span class="check-amounts">' + (have
          ? 'you have ' + escapeHtml(formatAmount(ing, held))
          : 'need ' + escapeHtml(formatAmount(ing, ri.amount)) +
            (held > 0 ? ' (you have ' + escapeHtml(formatAmount(ing, held)) + ')' : '')) + '</span>';
      els.recipeChecklist.appendChild(li);
    });

    // Staples the recipe calls for: neither green nor red, just assumed.
    var staples = recipe.ingredients.filter(function (ri) { return isStapleFor(catalog, state, ri.ingredientId); });
    if (staples.length > 0) {
      els.recipeStaples.innerHTML = 'Assumed in your pantry: ' + staples.map(function (ri) {
        var ing = getIngredient(catalog, ri.ingredientId);
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
    var missingCount = missingIngredients(catalog, state, recipe).length;
    els.generateList.classList.toggle('hidden', missingCount === 0);
    els.generateList.disabled = missingCount === 0; // belt and braces: hidden first
    els.generateList.title = missingCount === 0 ? 'You already have everything for this one' : '';
  }

  /* ---------- commit actions (spec > Components > Commit actions) ---------- */

  function heldIngredientIds(recipe) {
    return recipe.ingredients
      .filter(function (ri) {
        return !isStapleFor(catalog, state, ri.ingredientId) && totalAmount(state.stockLots, ri.ingredientId) > 0;
      })
      .map(function (ri) { return ri.ingredientId; });
  }

  function onCookThis() {
    if (!openPick) return;
    var recipe = openPick.recipe;
    var spec = combineAnimationSpec(catalog, recipe, heldIngredientIds(recipe));
    var taken = cookDeductions(catalog, state, recipe); // read before the stock changes
    remember('cooking', 'Cooked ' + recipe.name + '.', state);
    state = cookRecipe(catalog, state, recipe); // deducts only what you have
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
    var missing = missingIngredients(catalog, state, recipe);
    var spec = combineAnimationSpec(catalog, recipe, missing.map(function (m) { return m.ingredientId; }));
    state = addToShoppingList(catalog, state, recipe); // missing items, recipe quantities
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
      var ing = getIngredient(catalog, d.ingredientId);
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
      amount.textContent = '\u2212' + formatAmount(ing, d.removed);
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
    var ing = getIngredient(catalog, ingredientId);
    if (!ing) return;
    session.promptIngredientId = ingredientId;
    els.promptEmoji.textContent = ing.emoji;
    els.promptName.textContent = ing.name;
    els.promptUnit.innerHTML = '';
    acceptedUnits(ing).forEach(function (unit) {
      var option = document.createElement('option');
      option.value = unit;
      option.textContent = unit;
      els.promptUnit.appendChild(option);
    });
    els.promptUnit.value = ing.unit;
    els.promptInput.value = '';
    els.promptExpiry.value = '';
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
    var ing = getIngredient(catalog, session.promptIngredientId);
    var typed = parseAmount(els.promptInput.value);
    var unit = els.promptUnit.value;
    var canonical = ing && isValidAmount(typed) ? toCanonical(ing, typed, unit) : null;
    if (!ing || !isValidAmount(typed) || canonical === null || !isValidAmount(canonical)) {
      els.promptError.textContent = 'A positive amount, like 2, 0.5, or 1/2.';
      els.promptError.classList.remove('hidden');
      return;
    }
    remember('restock', 'Added ' + formatAmount(ing, canonical) + ' of ' + ing.name + '.', state);
    state = addToStock(state, session.promptIngredientId, canonical, els.promptExpiry.value || null);
    persist(state);
    closePrompt();
    renderAll();
    if (!doorOpen) setDoor(true); // show it land
  }

/* Module scripts are deferred, so the document is parsed by the time this
 * runs; the readyState guard covers tests and unusual embedding. */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
