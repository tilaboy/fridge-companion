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

Last updated: 2026-10-22.

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
- No custom ingredients or recipes. 33 ingredients / 35 recipes is a demo set.
- Staples are hardcoded to milk/flour/salt/sugar; real kitchens differ.
- No package sizes (a 500 g pack vs the 200 g a recipe needs).
- No servings scaling at cook time.

### 3.3 Recommendation quality

Current: `have ÷ need × (1 + 0.1 × ingredients)`, top 3, `filter(have > 0)`.

Missing:

- Time-to-cook, meal type, difficulty, cuisine.
- Diet, allergens, dislikes — hard constraints.
- Expiry-weighted "cook this first".
- Cook history and repetition avoidance.
- "Surprise me", filters, and a "not this" signal.
- A fallback when the fridge is empty (today: friendly empty state only).
- Content depth: 150–300 recipes with recorded provenance.

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
| State | versioned single object, `sanitizeState`, pure clone-on-write | schema v2, stock lots, custom items, settings, migration |
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

## 7. Proposed data model (v2)

```js
// Ingredient — built-in or user-created
{
  id, name, emoji, categoryId,
  defaultUnit: 'g',
  dimension: 'mass' | 'volume' | 'count',
  densityGPerMl: 1.0,        // optional; enables mass <-> volume
  allergens: [],             // 'dairy' | 'gluten' | 'egg' | 'shellfish' | ...
  dietFlags: [],             // 'vegetarian' | 'vegan' | ...
  aliases: []
}

// Stock is a list of lots, so purchases and expiry are real
{ ingredientId, amount, unit, addedAt, expiresAt, note }

// Recipe
{
  id, name, dishEmoji, servings, timeMinutes,
  tags: [], dietFlags: [], allergens: [],
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
  schemaVersion: 2,
  categories,
  customIngredients,
  stockLots,
  shoppingList,
  cookHistory,
  settings: { unitSystem, staples, diet, allergens, dislikes }
}
```

## 8. Milestones

### M0 — Safe hands (days)

Make the app reachable, installable, and incapable of silent data loss.

> **Progress (2026-10-23):** every box is closed except the live URL. Verified by
> harnesses (`verify/slice-5.js`, `slice-6.js`), a headless-Chrome reload with the
> network emulated off, and a two-tab edit that reached the other tab. The v1 → v2
> migration this section used to ask for moved to M1, where the v2 schema is built.

- [x] Export to versioned JSON; import validates and round-trips; the v2 migration
      lands with M1.
- [x] Storage failure (quota/blocked) shows a persistent banner; no false success.
- [x] Cross-tab sync via `BroadcastChannel`, with `storage` events as the fallback.
- [x] "Reset kitchen" with confirmation; clears only app keys.
- [ ] Deployed static URL (GitHub Pages) — Pages is enabled on the repo but no
      deploy has succeeded yet; see README for the one-time setting.
- [x] PWA manifest, icons, service worker; reload with network off works.
- [x] Privacy page published (`privacy.html`).

**Done when:** a user can install it, use it offline, survive a cleared browser
via export/import, and see a warning when a write fails.

### M1 — A fridge you can trust (1–2 weeks)

- [ ] Decimal/fraction amounts; conversion within a dimension; cross-dimension
      conversion when density is known.
- [ ] Stock lots with optional expiry; "use soon" ordering; expired badge.
- [ ] Custom ingredients and recipes with validation and de-duplication.
- [ ] Configurable staples per user.
- [ ] Undo for cook and restock; confirmation for destructive actions.
- [ ] Idempotent v1 → v2 migration covered by tests.

**Done when:** 0.5 kg of mince satisfies a 200 g recipe, an expiring item is
visible, and undo restores the exact prior state.

### M2 — Picks worth trusting (2–4 weeks)

- [ ] Diet and allergen filters are hard constraints; never violated.
- [ ] Time budget and meal type filters.
- [ ] Expiry-weighted ranking; each card states why it ranked.
- [ ] Servings scaling adjusts amounts and deductions.
- [ ] Repetition avoidance from cook history.
- [ ] 150+ recipes with recorded provenance and licensing.

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
| Recipe content licensing? | M2 | Own, public domain, or licensed; record provenance |
| ~~Free local + paid sync?~~ | v1.1 | **Deferred** with sync |
| Default unit system? | M1 | Locale default with a user override |
| Keep emoji or move to photos? | M2+ | Licensing and performance cost |
