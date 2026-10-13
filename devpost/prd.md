---
doc: prd
status: approved
---

# Fridge Door Companion — Product Requirements

One line: a local-first fridge-door companion that remembers what's in your kitchen — organized by your own food categories — and recommends recipes from what you actually have.
Source: `scope.md > The Unique Kernel`, `scope.md > The Core Loop`.

## The Core Journey

The complete path, end to end:

1. **First open.** The app invites you to set up your storage categories — the kinds of food you keep (Produce, Dairy, Pantry, Leftovers, and your own).
2. **The fridge door appears.** A fridge sits at the center of the screen with ingredient icons (potatoes, tomatoes, fish, meat, and the rest of the built-in set) arranged around it, grouped by your categories.
3. **Fill the fridge.** You drag an ingredient icon into the fridge. A small prompt asks how much (100 g, 2 eggs, 1 bunch…). The ingredient joins your stock, filed under its category.
4. **Finish anytime.** A **Done** button ends the entry whenever you're ready. A **My Recipes** button is always available.
5. **Get recommendations.** Pressing **My Recipes** scores every built-in recipe against your stock and shows the **top 2–3** as cards.
6. **Each card** shows the dish as an emoji/illustration, the fit line ("You have 4/5" / "Missing: 1"), and a simple match indicator.
7. **Tap a card.** It comes to the center: ingredients marked **green (have) / red (missing)**, then the cooking steps, closed with a "Bon Appétit" flourish.
8. **Commit.** From the centered card: **"Cook this"** deducts the recipe's ingredients from your stock (only what you have). **"Generate the shopping list"** sends the missing ingredients to a shopping-list card.
9. **Restock.** After shopping, you check items off the shopping-list card — each checked item is added back to your stock with the quantity the recipe needed.
10. **The loop repeats.** Stock persists between sessions, so the next **My Recipes** reflects everything you've cooked and bought. The kitchen stays current without re-explaining it.

## Screens and Layout

One surface, two states — no invented screens:

- **The fridge door (main screen).** Your category chips, the fridge at center, the ingredient icon tray around it, **Done** and **My Recipes** buttons, and the shopping-list card when one exists.
- **The recipe card (centered state).** A recommendation card brought to the center of the fridge door: dish emoji/illustration, the have/missing ingredient checklist (green/red), the steps, and the commit buttons. This is the same screen with the card expanded — not a separate page.

## Look and Feel

"Fridge-door companion" style — playful, warm, ingredient-first, local-first. The core metaphor: **the screen is your fridge door, not a cookbook.** Explicitly not a glossy recipe magazine, and not a heavy skeuomorphic 3D fridge.

- **Background:** subtle fridge surface — white/steel, soft shadows, a faint magnet or tape texture.
- **Ingredient display:** chips/tiles grouped by your categories — Produce, Dairy, Pantry, Leftovers, etc.
- **Recipe cards:** 2–3 max, looking like notes or magnets. Each shows the dish as emoji/illustration, a fit line like "You have 4/5" or "Missing: 1", and a simple match indicator.
- **Recipe view:** checklist with have/missing clearly marked (green / red), then the steps.
- **Motion:** one signature animation — chosen ingredients slide/toss together into a finished dish emoji. Lightweight, plays once on commit. **Kept in the POC** per the learner's ruling during the PRD interview.
- **Tone:** rounded corners, warm colors, handwritten-ish accents, high contrast, no stock photos.

## Features and Behavior

### Setting up your kitchen (first use)
Source: `scope.md > The POC Boundary` (first-use ingredient entry organized by food categories).

- The user creates their storage categories — the kinds of food they keep. Seeded suggestions (Produce, Dairy, Pantry, Leftovers…) are offered as a starting point, and the user can add their own.
  - [ ] Acceptance: on first open, the user can create or confirm at least one category before any ingredient is added.
  - [ ] Acceptance: the fridge door groups ingredient icons by the user's categories.
- The fridge door shows a fridge at center with the built-in ingredient icon tray around it.
  - [ ] Acceptance: every ingredient needed by the built-in recipe collection has an icon in the tray (the POC tray covers the recipes).

### Adding ingredients to stock
Source: `scope.md > The Core Loop` (stock → recommendations).

- Dragging an ingredient icon into the fridge opens an amount prompt; confirming adds the ingredient to stock under its category.
  - [ ] Acceptance: dragging an icon into the fridge opens an amount prompt; confirming adds the ingredient with the given amount, visible on the fridge door.
  - [ ] Acceptance: **Done** ends the first-use entry at any time, keeping everything entered so far.
  - [ ] Acceptance: **My Recipes** works with whatever has been entered, even a partial kitchen.

### Getting recommendations
Source: `scope.md > The Unique Kernel` (recommends only from what's actually on hand).

- Pressing **My Recipes** scores every built-in recipe against current stock and shows the top 2–3 as cards (fewer cards if fewer recipes fit).
  - [ ] Acceptance: at most 3 cards are shown, ordered by fit against the stock.
  - [ ] Acceptance: each card shows the dish emoji/illustration, a fit line ("You have 4/5" / "Missing: 1"), and a match indicator.
- **Empty state:** when nothing fits (or stock is empty), no cards are shown — instead a friendly message in the app's voice, e.g. "Unfortunately, there's nothing fitting" or "Uh-oh — your fridge is empty, please refuel."
  - [ ] Acceptance: with no fitting recipes, zero cards appear and the friendly message is shown instead.

### Cooking from a recipe
Source: `scope.md > The Core Loop` (pick a recipe → ingredients deducted).

- Tapping a recommendation card centers it: ingredients marked green (have) / red (missing), then the steps, closed with a "Bon Appétit" flourish.
  - [ ] Acceptance: tapping a card brings it to the center with have-ingredients visually distinct from missing ones (green vs. red) and the steps listed.
- **"Cook this"** deducts the recipe's ingredients from stock — only what the user actually has. Missing ingredients are never deducted (there is nothing to deduct).
  - [ ] Acceptance: after "Cook this", each have-ingredient's stock amount decreases by the recipe's amount; missing ingredients leave stock untouched.
- **"Generate the shopping list"** sends the missing ingredients to the shopping-list card with the quantities the recipe needs.
  - [ ] Acceptance: missing ingredients appear on the shopping-list card with the recipe's quantities.
- **Signature animation:** on committing to a recipe, the chosen ingredients slide/toss together into the finished dish emoji — one lightweight animation, played once.
  - [ ] Acceptance: committing to a recipe plays the combining animation once before the result is shown.

### The shopping list and restocking
Source: `scope.md > The Core Loop` (grocery update → recommendations change).

- The shopping-list card lives on the fridge door. After shopping, the user checks items off; each checked item is added to stock with the recipe's quantity and removed from the list.
  - [ ] Acceptance: checking off a shopping-list item adds it to stock with the recipe's quantity and removes it from the card.
  - [ ] Acceptance: the shopping-list card is visible on the fridge door until its items are checked off. *(Assumption — confirm at review.)*

## States and Boundaries

- **First use** — no stock yet: category setup first, then the fridge door with the icon tray. **My Recipes** shows the empty-state message.
- **Normal use** — stock exists: the fridge door shows stock grouped by category; **My Recipes** shows the top 2–3 cards.
- **Empty recommendations** — no cards, just the friendly message ("nothing fitting" / "fridge is empty, please refuel").
- **Committed** — stock deducted; shopping list updated if generated.
- **Persistence** — stock, categories, and the shopping list persist between sessions, locally in the browser. No account, nothing leaves the device.
- **No error surface beyond the empty state** — the POC has no network calls, so there are no network errors to handle.

## Product Decisions

- **Top 2–3 recommendations only, ranked internally** — keeps the screen fast and the choice easy. (Carried from `scope.md`; the exact scoring formula is deferred to `4-spec`.)
- **POC works only with the pre-built ingredient icons** (covering the recipe collection) — no custom ingredient entry; keeps first-use to minutes. *(Learner's ruling this interview.)*
- **Mark-as-bought restocking**, not manual re-entry — one gesture closes the loop. *(Learner's ruling this interview.)*
- **Deduct only what you have** on "Cook this"; missing items are simply not deducted. *(Learner's ruling this interview.)*
- **One simple combining animation stays in the POC** — it's the demo's visual signature. *(Learner's ruling this interview; scope boundary unchanged.)*
- **Empty state shows no cards plus a playful message** — matches the fridge-door tone. *(Learner's ruling this interview.)*
- **Project name: Fridge Door Companion** — replacing the working name "Fridge Cleanout". *(Learner's choice this interview.)*
- **The shopping-list card moved into the POC** — `scope.md > Later` listed shopping-list generation as deferred, but the interview showed it is what closes the core loop, so it is now part of the proof of concept.

## What We're Building

- First-use category setup (seeded suggestions + custom categories)
- The fridge door: fridge at center, ingredient icon tray grouped by category
- Drag-to-add with amount prompt (100 g, 2 eggs, 1 bunch…)
- Done / My Recipes controls
- Built-in recipe collection (a couple dozen recipes with ingredients and steps)
- Matching engine: scores recipes against stock, shows the top 2–3
- Recipe card (centered): have/missing checklist (green/red), steps, "Bon Appétit"
- Commit actions: "Cook this" (deduct) and "Generate the shopping list"
- Shopping-list card with mark-as-bought restocking
- One lightweight combining animation
- Local persistence of stock, categories, and the shopping list
- No login; runs locally

## Deferred From the POC

- **Custom ingredient entry** (adding ingredients beyond the built-in icon tray) — the tray covers the built-in recipes, which is all the POC needs to prove the kernel.
- **Shopping-list management beyond the card** (editing quantities, multiple lists, clearing) — the card exists to close the loop, not to be a shopping app.
- **Multiple people / shared kitchens** — needs accounts and sync; doubles the build and demo surface.
- **Expiry tracking** ("cook this before it goes bad") — a great future recommendation signal, not needed to prove the kernel.
- **Real recipe photos** — emoji/illustrations carry the look; photos add sourcing work.
- **Unit conversion** (2 eggs vs. 200 g flour) — whole-number amounts only in the POC.
- **A public deployed URL** — the POC runs locally; deployment is optional for the submission.

## Possible Later Enhancements

- Expiry-aware ranking ("cook this before it goes bad")
- A larger built-in recipe collection and custom ingredient entry
- Shared kitchens for households
- Real dish photography
- Unit conversion and smarter amount handling

## Non-Goals

- **No accounts, login, or backend** — the matching brain runs locally; a hosted backend doubles the build and demo surface without proving the kernel better. (From `scope.md > Explicitly Cut`.)
- **No custom ingredient entry in the POC** — fixed icon tray by design.
- **No heavy animation sequences** — one signature animation only.
- **No unit conversion** — whole-number amounts.
- **No stock photos, no glossy recipe-magazine styling** — the fridge-door companion look is the identity.

## Open Questions

- **Adding an ingredient already in stock** — assumed amounts combine (2 eggs + 3 eggs = 5). Non-blocking; confirm at review.
- **Seeded default categories** — assumed the app offers Produce / Dairy / Pantry / Leftovers as suggestions the user can edit or extend, rather than a blank slate. Non-blocking; confirm at review.
- **The exact scoring formula** ("best fit") — deferred to `4-spec` by agreement; this PRD only requires that the top 2–3 are ordered by fit.
