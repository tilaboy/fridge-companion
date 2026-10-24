---
doc: roadmap
status: draft
---

# Fridge Companion — Production Roadmap

Where this POC stands, what is missing before real people can rely on it, and a
phased path to the production app in the new **`fridge-companion`** repository.

This is a living document. Each milestone is independently shippable; tick the
boxes as they land. In the new repo it belongs at `docs/roadmap.md`, next to the
ADRs it references.

Last updated: 2026-10-24.

## 1. What the POC already proves

The kernel is real and worth carrying forward unchanged in spirit:

- Stock → ranked recommendations → cook (deduct) → shop (restock) → recommend
  again, all local and offline.
- Clean separation already in `app.js`: pure logic → store → UI, which is what
  makes the node harnesses possible.
- Defensive basics that many POCs skip: `sanitizeState()` on load,
  `escapeHtml()` on every user-controlled string, `prefers-reduced-motion`,
  aria labels, Escape handling.
- Four green harnesses (`verify/slice-1.js` … `slice-4.js`, 117 assertions),
  including a full end-to-end journey.

The gap is not the kernel. It is the data model, durability, content depth, and
the platform around it.

## 2. Guiding principles for the production version

1. **Local-first by default.** The app must stay fully usable with no account
   and no network. Sync is an enhancement, never a prerequisite.
2. **Never lose a kitchen silently.** Every write either succeeds or tells the
   user. Export must always be one click away.
3. **Safety before cleverness.** Allergens and diets are hard constraints, not
   ranking signals.
4. **The fridge is perishable.** Freshness is the product, not a later feature.
5. **Keep the kernel small and pure.** Units, stock math, ranking, and cooking
   stay DOM-free and storage-free so they stay testable.
6. **Explain the pick.** A recommendation without a reason is a slot machine.

## 3. Gap analysis

### 3.1 Data durability and sync — the biggest risk

The kitchen lives in one `localStorage` key (`fdc-state-v1`).

- Clearing browser data, private mode, or a different browser/device wipes the
  kitchen. `saveState()` returns `false` on quota or blocked storage and the UI
  never says so.
- No export/import/backup.
- No cross-tab sync (no `storage` listener), so two open tabs overwrite each
  other.
- No accounts or multi-device sync.
- No household sharing.

**POC-acceptable. Production-blocking.**

### 3.2 The stock model is too thin to cook with

- `isValidAmount()` requires integers — no ½ onion, 1.5 cups, 0.5 kg.
- One fixed unit per ingredient, no conversion (g ↔ kg, cups ↔ ml).
- No expiry or best-before dates. Without freshness the "fridge" is a list of
  things you once typed, and the best ranking signal ("use this up") is lost.
- The POC had no custom ingredients or recipes: its 33 ingredients / 35 recipes
  was a demo set; production now ships 150 recipes and custom items.
- Staples are hardcoded to milk/flour/salt/sugar; real kitchens differ.
- No package sizes (a 500 g pack vs the 200 g a recipe needs).

### 3.3 Recommendation quality

Current: `have ÷ need × (1 + 0.1 × ingredients)`, top 3, `filter(have > 0)`.

Missing:

- Time-to-cook, meal type, difficulty, cuisine.
- Diet, allergens, dislikes — hard constraints.
- Expiry-weighted "cook this first".
- Cook history and repetition avoidance.
- "Surprise me", filters, and a "not this" signal.
- A fallback when the fridge is empty (today: friendly empty state only).
- Content depth: 150–300 recipes with recorded provenance (M2 now ships 150).

### 3.4 The loop has no safety net

- No undo or confirmation on "Cook this" or "Got it".
- The shopping list is transient and per-recipe; `addToShoppingList()` keeps the
  first recipe's amount instead of merging quantities.
- No free-form add, aisle grouping, "you already have this", or shareable list.
- No cook history.

### 3.5 Platform, distribution, operations

- No PWA manifest or service worker: not installable, no offline reload.
- No deployment config; GitHub Pages is still an optional unchecked box.
- No CI, lint, or browser e2e; the harnesses are run by hand.
- No analytics or error monitoring.
- No privacy policy or terms.
- English and metric only; no i18n or locale formatting.

### 3.6 Accessibility and polish

- `aria-modal="true"` on the recipe dialog, but no focus trap and no focus
  restore.
- Drag has a click fallback, but no visible keyboard path and limited live
  announcements for visual stock changes.
- No dark mode in the app (the app map has one).
- No reset/onboarding path for a returning user who wants to start over.

## 4. If you only do five things

1. Export/import + storage-failure banner + cross-tab sync.
2. Expiry dates and a "use soon" view.
3. Fractions, unit conversion, custom ingredients and recipes.
4. Diet/allergen filters and cook history.
5. Deploy as an installable PWA with error monitoring.

## 5. What carries over, what changes

| Area | Carry over | Replace / add |
| --- | --- | --- |
| Kernel | score = have ÷ need, amount-level check, staples exclusion, top-N | hard filters, expiry weighting, explanations, history |
| State | versioned single object, `sanitizeState`, pure clone-on-write | schema v6, stock lots, custom items, hard preferences, time/meal/servings metadata, migration |
| Store | `loadState` / `saveState` seam | storage adapter interface + optional remote adapter |
| UI | fridge-door metaphor, bubbles, pointer drag, reduced motion | focus management, keyboard path, dark mode, empty/error states |
| Data | `data/ingredients.js`, `data/recipes.js` shape | richer schema, tags/allergens/time/servings, provenance |
| Tests | node harnesses for pure logic | test runner in CI, Playwright e2e, axe |

## 6. Proposed target architecture

```
fridge-companion/
├── index.html
├── public/                  # manifest, icons, service worker
├── src/
│   ├── domain/              # pure: units, stock, recommend, cook, shopping
│   ├── data/                # ingredients, recipes, provenance
│   ├── store/               # localStore, remoteStore, syncEngine, migrations
│   ├── ui/                  # render, gestures, dialogs, focus
│   └── main.js
├── tests/
│   ├── unit/                # domain + migrations
│   └── e2e/                 # Playwright + axe
├── docs/                    # roadmap, ADRs, privacy
└── .github/workflows/ci.yml
```

**ADR-001 — stack. Accepted:** TypeScript + Vite, no UI framework for v1,
native `<dialog>`, zod at the edges, Vitest from M0. The v2 schema is the crux,
so types land before the UI does. See [`adr/0001-stack.md`](adr/0001-stack.md).

**ADR-002 — storage and sync. Accepted:** IndexedDB behind a per-entity store,
`navigator.storage.persist()`, per-entity `updatedAt`, export as the backup of
record, and **accounts/sync deferred to v1.1** (household sharing ships as a
kitchen file first). Size was never the reason to leave `localStorage`; silent
eviction was. See [`adr/0002-storage-and-sync.md`](adr/0002-storage-and-sync.md).

## 7. Data model (current v7, with proposed additions)

```js
// Ingredient — built-in or user-created
{
  id, name, emoji, categoryId,
  defaultUnit: 'g',
  dimension: 'mass' | 'volume' | 'count',
  densityGPerMl: 1.0,        // optional; enables mass <-> volume
  dietClass: 'plant' | 'dairy' | 'egg' | 'honey' | 'fish' | 'meat' | 'unknown',
  allergens: [],             // 'dairy' | 'gluten' | 'egg' | 'shellfish' | ...
                             // undefined = unknown; [] = known none
  aliases: []
}

// Stock is a list of lots, so purchases and expiry are real
{ ingredientId, amount, unit, addedAt, expiresAt, note }

// Recipe
{
  id, name, dishEmoji,
  servings,                                  // base yield; legacy default 2
  timeMinutes,
  mealTypes: [],                             // breakfast | lunch | dinner | snack
  tags: [], dietFlags: [], allergens: [],   // current safety is derived from ingredients
  ingredients: [{ ingredientId, amount, unit, optional }],
  steps: [],
  source: 'original' | 'public-domain' | '<license + url>'
}

// Shopping item
{ ingredientId, amount, unit, fromRecipeId, checked }

// Cook event
{ id, recipeId, cookedAt, servings }

// Persisted state
{
  schemaVersion: 7,
  categories,
  // Hard filters, never ranking penalties.
  preferences: { diet, allergens, maxTimeMinutes, meal },
  customIngredients,
  customRecipes,
  stockLots,
  shoppingList,
  cookHistory,                 // newest last, capped at 50
  settings: { unitSystem, staples, dislikes }
}
```

## 8. Milestones

### M0 — Safe hands ✅ complete 2026-10-23

Make the app reachable, installable, and incapable of silent data loss.

**Live:** https://tilaboy.github.io/fridge-companion/

- [x] Export to versioned JSON; import validates and round-trips; the v2 migration
      lands with M1.
- [x] Storage failure (quota/blocked) shows a persistent banner; no false success.
- [x] Cross-tab sync via `BroadcastChannel`, with `storage` events as the fallback.
- [x] "Reset kitchen" with confirmation; clears only app keys.
- [x] Deployed static URL, published by CI after the checks pass.
- [x] PWA manifest, icons, service worker; reload with network off works.
- [x] Privacy page published (`privacy.html`).

Verified at the time by the six node harnesses (since ported into `tests/`), a
headless-Chrome reload of the live URL with the network emulated off, and a
two-tab edit that reached the other tab. The v1 → v2 migration this section used
to ask for moved to M1, where the v2 schema is built.

**Done when:** a user can install it, use it offline, survive a cleared browser
via export/import, and see a warning when a write fails.

### M1 — A fridge you can trust ✅ complete 2026-10-24

> **Progress (2026-10-24):** the module split is done. The kernel is typed
> (`src/domain/`) and tested; the UI is an ES module on top of it, built by Vite
> into `dist/` and deployed by CI. The six node harnesses were ported into
> Vitest tests (domain, store, data, journey, shell) before being deleted; a
> temporary parity suite proved the extraction identical to v1 and retired with
> the old copy. The suite is now 138 tests.
>
> Schema 2 introduced `stockLots` (amount, optional expiry, arrival time);
> every total is derived from them, cooking consumes the soonest-expiring batch first. The
> fridge shows expiry badges and sorts by use-soon, the amount prompt takes an
> optional date, and the v1 `stock` map migrates in place on load or import —
> idempotently, and covered by tests. Verified in Chrome: a lot created with a
> date keeps it through reload and cooking, and a seeded v1 kitchen becomes one
> stock lot with staples dropped.
>
> Amounts now accept `0.5`, `1/2`, `1 1/2`, and `½`; the prompt offers the
> ingredient's convertible units, and `½ kg` of beef is stored as 500 g. Mass and
> volume cross only when the ingredient declares a density (milk, butter, flour,
> rice, sugar, honey, olive oil, soy sauce), so the app never invents one. The
> fridge, recipe view, shopping list, and animations all format from the
> canonical amount.
>
> Undo now covers cooking, adding stock, and checking off a shopping-list item.
> Each commit pushes a whole-kitchen snapshot onto a bounded in-memory stack
> (20 entries); the toast names the action, and the button restores lots,
> expiry dates, ids, and the list exactly, then offers the previous step. The
> stack clears on import, reset, and cross-tab changes so it can never clobber
> another tab. Verified in Chrome: cook then undo restores byte-identical
> storage; two undos return the initial empty kitchen; a purchase undoes back to
> the same list.
>
> Pantry staples are now per-kitchen choices layered over the tray defaults.
> Unchecking a built-in staple (salt, sugar, flour, milk) makes it a tracked
> ingredient again; checking any other ingredient assumes it is always on hand
> and clears its lots and shopping entries. The choice lives in
> `stapleOverrides` inside the kitchen state, so export, import, and cross-tab
> sync carry it, and scoring/cooking read the effective set. Verified in
> Chrome: salt leaves and rejoins the tray as its box changes, marking beef
> empties its lot, and undo restores the lot and the unchecked box.
>
> Custom ingredients and recipes now live in the kitchen itself. The state moved
> to schema 3: older builds refuse an exported file rather than silently
> dropping the new definitions, while v1 stock maps and v2 lots still import.
> Names are compared case- and whitespace-insensitively, colliding ids are
> repaired, recipes merge repeated ingredient rows, and unknown ingredients or
> empty steps are refused. The door has an "Add your own ingredient" form
> (category, canonical unit, optional density) and a recipe builder with draft
> ingredient rows, removal, and per-line steps. Custom items join the tray,
> recommendation scoring, export/import, cross-tab sync, and the existing undo
> stack; undoing a definition also rebuilds the catalog. Verified in Chrome: a
> custom ingredient took stock in ml through its density, survived reload, and
> vanished from the tray on undo; a custom recipe with a custom ingredient was
> recommended, cooked down its lots, refused a duplicate name, and survived
> reload.
>
> Schema 4 added hard food preferences. A recipe is allowed only when every
> ingredient passes; a conflicting recipe is filtered before scoring, never
> demoted. Built-in ingredients carry a diet class and conservative allergen
> tags, dairy/egg/fish are also derived from the diet class, and an ingredient
> with missing metadata fails closed while the relevant filter is active.
> Custom ingredients now declare a diet class and, optionally, their allergens;
> an unchecked "Allergen info known" box stays unknown rather than silently
> meaning "none". The door has a "Food preferences" panel, recommendations
> name the active filters, and the filtered empty state says why. Verified in
> Chrome: a shellfish-tagged custom recipe disappears under the shellfish
> filter, undo restores it, the filter survives reload, clearing restores the
> recipe, vegan hides a fish recipe, and unknown diet/allergen metadata stays
> hidden until declared.

- [x] Decimal/fraction amounts; conversion within a dimension; cross-dimension
      conversion when density is known.
- [x] Stock lots with optional expiry; "use soon" ordering; expired badge.
- [x] Custom ingredients and recipes with validation and de-duplication.
- [x] Configurable staples per user.
- [x] Undo for cook and restock; confirmation for destructive actions.
- [x] Idempotent v1 → v7 migration covered by tests.

**Done when:** 0.5 kg of mince satisfies a 200 g recipe, an expiring item is
visible, and undo restores the exact prior state.

### M2 — Picks worth trusting (2–4 weeks)

> Safety, time/meal, and freshness slices landed at schema 5; servings followed
> at schema 6, and repetition avoidance at schema 7. Built-in and custom
> ingredient safety metadata, time and meal metadata on every built-in recipe, a
> Food preferences panel, hard diet/allergen/time/meal filtering before ranking,
> expiry-weighted ordering, and a one-line reason on every card. Unknown
> metadata fails closed, and cards show the time and meal they matched. The
> collection now has 150 built-in recipes, each with recorded provenance and
> licensing, so M2 is complete.
>
> Schema 5 adds time and meal metadata. Every built-in recipe declares a
> cooking time and at least one meal slot; custom recipes can declare both, and
> recipes with missing metadata stay hidden while that filter is active. The
> Food preferences panel has time and meal selects, recommendation cards show
> the metadata they matched, and the same hard-filter-before-ranking path is
> used. Verified in Chrome: a 15-minute lunch survived a 20-minute + lunch
> filter, a 25-minute lunch and a legacy no-metadata recipe disappeared, dinner
> hid the lunch recipes, the filters survived reload, undo restored the prior
> filters, and an invalid custom time was refused.
>
> Freshness does not change the schema. A complete recipe that can use up a
> tracked ingredient expiring within three days gets a ×1.2 rank lift; expired
> stock is ×0.8, the card names the item, and the fit line says "check dates".
> Partial recipes get no freshness nudge, because the kitchen cannot use the
> ingredient until the missing items arrive. The displayed fit ratio stays
> honest, and every card falls back to a fit line when no date drives the
> order. Verified in Chrome:
> soon-expiring spinach lifted "Spinach and Eggs" to first with "Use Spinach —
> use by Oct 26"; after its date passed, "Cheese Toast" led, the spinach card
> said "Spinach is past its date", and its fit line switched to "check dates";
> complete and one-short cards showed their fit fallbacks. The reason line
> stayed on one line at desktop and phone widths.
>
> Schema 6 adds a base yield in servings. Every built-in recipe is written
> for two, custom recipes can declare 1–12 and default to two, and legacy
> recipes without a yield keep scaling from two. The recipe card steps the yield
> up or down, scales the checklist amounts, and passes a scaled clone to the
> same cook, missing-ingredient, and shopping-list functions, so deductions and
> list quantities match the chosen yield. A complete recipe's green line names
> the amount it will use, with the held amount beside it when they differ.
> Verified in Chrome: at two servings the pasta card used 200 g from 400 g held;
> at four it used 400 g, cooked away all four tracked lots, and undo restored
> them exactly; with only two servings held, four showed every shortfall and
> sent 400 g / 4 pcs / 4 cloves / 30 ml to the list; the stepper clamped at one
> and twelve; a custom recipe saved with four servings; and the card stayed
> inside a 390px viewport.
>
> Schema 7 adds a bounded cook history. A successful "Cook this" records the
> recipe, timestamp, and chosen yield; history is newest-last, capped at 50, and
> undo restores the prior history with the whole-kitchen snapshot. Ranking keeps
> only the latest cook per recipe as a soft multiplier — ×0.5 within 2 days,
> ×0.8 within 7, ×0.95 within 14, then 1 — so a recent repeat can fall behind a
> close alternative but is never hidden. The card says "Cooked today",
> "Cooked yesterday", or "Cooked N days ago" after any expiry reason. Invalid,
> future-dated, or unknown-recipe events are dropped on import; a schema 6
> kitchen loads with an empty history. Verified in Chrome: with complete pasta
> and eggs, the pasta led on fit; after a three-day-old pasta cook, the eggs
> moved ahead and the pasta card read "Cooked 3 days ago."; in a custom-only
> kitchen the repeat stayed as the sole card and read "Cooked yesterday."; a
> cook appended the chosen yield, undo restored the prior history and stock,
> and an offline reload still opened the shell.
>
> Content depth does not change the schema. The built-in collection is now 150
> recipes, all written for this project against the existing 33-ingredient tray.
> Every recipe records `source: { kind, author, license, url? }`; the collection
> is original work under the repository's MIT license, and the recipe card shows
> the provenance while custom recipes read as your own. Data tests enforce
> 150+, unique ids and names, valid servings/time/meals, positive whole amounts,
> at least three steps, ingredient coverage, and provenance on every recipe.
> Imported custom recipes cannot claim a built-in source; the sanitizer drops
> that field.

- [x] Diet and allergen filters are hard constraints; never violated.
- [x] Time budget and meal type filters.
- [x] Expiry-weighted ranking; each card states why it ranked.
- [x] Servings scaling adjusts amounts and deductions.
- [x] Repetition avoidance from cook history.
- [x] 150+ recipes with recorded provenance and licensing.

**Done when:** a shellfish-allergic user never sees shellfish, "under 20 min"
works, and a card explains itself in one line.

### M3 — Accounts and sync (v1.1, 1–2 months)

Out of scope for v1 (ADR-002): v1 ships household sharing as an exported kitchen
file, and this milestone is funded by v1 evidence rather than by the plan.

- [ ] Auth; signed-out local mode still fully usable.
- [ ] Multi-device sync with a documented conflict policy.
- [ ] Offline edits replay on reconnect.
- [ ] Household sharing: shared stock and shopping list.
- [ ] Account data export and delete.

**Done when:** two devices converge, offline edits survive reconnect, and two
household members see the same fridge.

### M4 — Operate it (ongoing)

- [ ] CI gates: lint, typecheck, unit, e2e, axe.
- [ ] Error monitoring and privacy-friendly analytics.
- [ ] i18n scaffolding plus one non-English locale; locale unit formatting.
- [ ] Dark mode, full keyboard path, focus trap/restore.
- [ ] Performance budget and a documented a11y audit.

**Done when:** a regression cannot merge without tests, and you hear about
breakage from monitoring rather than users.

## 9. Migration path from the POC

1. Add JSON export to the POC first (small change) so real kitchens can move.
2. Build the v2 schema and importer in `fridge-companion`.
3. Keep reading `fdc-state-v1` for at least one release.
4. Cover migrations with round-trip tests before shipping v2.

## 10. Non-goals for v1

Nutrition tracking, meal-plan calendar, grocery delivery, social feed, native
apps, monetization, and photo-heavy recipe pages. Emoji stays the visual
signature until content licensing and budgets justify photos.

## 11. Open questions

| Question | Blocks | Notes |
| --- | --- | --- |
| ~~Framework or vanilla?~~ | — | **Resolved:** ADR-001 — TypeScript + Vite, no framework |
| ~~Which backend/auth?~~ | v1.1 | **Deferred** with sync; revisit after v1 evidence |
| ~~Recipe content licensing?~~ | — | **Resolved:** built-ins are original work under MIT; each recipe records provenance |
| ~~Free local + paid sync?~~ | v1.1 | **Deferred** with sync |
| Default unit system? | M1 | Locale default with a user override |
| Keep emoji or move to photos? | M2+ | Licensing and performance cost |
