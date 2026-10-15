---
doc: checklist
status: approved
---

<!-- `status` is the progress state every skill reads. Write `draft` when you first save this file,
     and change it to `approved` when the learner clearly approves the displayed plan ("looks good" counts).
     Do not request a second sign-off. Never skip the draft save —
     an unsaved draft dies with the conversation. -->

# Build Checklist

Build mode: fast

## Slices

- [x] **1. You set up your kitchen, fill your fridge, and it all survives a reload**
  Becomes usable: The app runs. On first open you confirm the seeded categories (Produce, Dairy, Pantry, Leftovers) or add your own; the fridge door appears with the built-in ingredient tray grouped by your categories; you drag or tap an ingredient, enter an amount, and it joins your stock. Reload the page — your kitchen is exactly as you left it.
  Why now: This is the entire first-use journey end to end, and it carries the evidence the spec committed to: add an ingredient → reload → still there. It retires the learner's recorded uncertainty (how an app with no backend remembers anything) on the first slice, where a surprise is cheapest. The unfamiliar mechanics — browser storage behavior, drag plus tap — are all proven here, before anything builds on them.
  PRD ref: `prd.md > The Core Journey` (steps 1-4), `prd.md > Features and Behavior > Setting up your kitchen (first use)`, `prd.md > Features and Behavior > Adding ingredients to stock`
  Spec ref: `spec.md > File Structure`, `spec.md > Components` (App shell and fridge door, The store, Amount prompt, Built-in data files), `spec.md > Data Model`, `spec.md > Look and Feel`
  Build: Scaffold `index.html`, `styles.css`, `app.js`, and `data/ingredients.js` per the spec's file structure. Store module: one versioned `localStorage` key, load on start, rewrite on every change. First-use category setup with seeded suggestions plus custom categories. Fridge door with category chips, fridge at center, ingredient tray grouped by category. Drag-and-drop with tap as the same gesture, both opening the amount prompt (positive whole numbers only; re-adding combines amounts). Done control ends first-use entry; My Recipes arrives with the engine in slice 2. Fridge-door look per spec — this is the first visible slice.
  Verify (mechanical): `node --check` passes on `app.js` and `data/ingredients.js`; `python3 -m http.server` serves `/`, `/app.js`, `/styles.css`, `/data/ingredients.js` with HTTP 200; a node harness loads the app logic with a `localStorage` stub, completes category setup, adds one ingredient, re-runs the load path (simulated reload), and asserts categories, stock, and amounts come back from storage — and that the amount prompt refuses 0, negatives, and non-numbers.
  Learner check: Open http://localhost:8000, confirm or edit the seeded categories, drag (or tap) an ingredient into the fridge, enter an amount, then reload the page — your categories and the ingredient should still be on the fridge door.
  Commit: `First-use setup, fridge door, and persistent stock`

- [x] **2. My Recipes recommends from what you actually have**
  Becomes usable: Pressing My Recipes scores every built-in recipe against your stock and shows the top 2-3 as cards with the fit line and match indicator; an empty or non-fitting kitchen shows the friendly empty-state message instead of cards.
  Why now: This is the unique kernel — recommends only from what's on hand — and it lands on slice 2, directly behind the storage proof. That placement is what makes the early hands-on checkpoint useful: the learner can shape the card look and the ranking while the commit half of the loop is still ahead.
  PRD ref: `prd.md > The Core Journey` (steps 5-6), `prd.md > Features and Behavior > Getting recommendations`
  Spec ref: `spec.md > Components` (Recommendation engine, Recipe card view), `spec.md > Data Model`
  Build: `data/recipes.js` — the built-in collection covering every ingredient in the tray. Recommendation engine: score = ingredients held in sufficient amount ÷ total ingredients, tie-broken by fewest missing, amount-level check, top 2-3. My Recipes control on the fridge door. Recipe cards as notes/magnets: dish emoji, fit line ("You have 4/5" / "Missing: 1"), simple match indicator. Empty state with the playful message.
  Verify (mechanical): A node harness drives the engine with fixture stocks: correct top-2-3 ordering by score, tie-break by fewest missing, a short amount counts as missing (need 200 g, have 100 g), at most 3 cards, and an empty result for an empty or non-fitting stock.
  Learner check: Add several ingredients, press My Recipes, and look at the cards that come back — do the top picks look like things you'd actually make from that stock? Empty the fridge and press again to see the friendly message.
  Commit: `Recipe recommendations from current stock`

- [x] **3. You open a recipe, cook it, and the stock changes**
  Becomes usable: Tapping a card centers it: have/missing checklist (green/red), the cooking steps, the "Bon Appétit" close. "Cook this" deducts only what you have; "Generate the shopping list" sends the missing ingredients (with the recipe's quantities) to the shopping list. Committing plays the combining animation once.
  Why now: The kernel proved recommendations; this slice proves the commit half of the core loop — cooking changes your kitchen, which is what makes tomorrow's recommendations different from today's. It also carries the demo's signature animation at the exact moment it belongs: on commit.
  PRD ref: `prd.md > The Core Journey` (steps 7-8), `prd.md > Features and Behavior > Cooking from a recipe`
  Spec ref: `spec.md > Components` (Recipe card view, Commit actions, Combining animation), `spec.md > Look and Feel`
  Build: Centered recipe-card state on the same screen (not a new page): dish emoji, green/red have/missing checklist, steps, "Bon Appétit" flourish. "Cook this" deducts each have-ingredient by the recipe amount (missing untouched, never negative); amounts reaching 0 drop the ingredient from the fridge display. "Generate the shopping list" adds missing ingredients with the recipe's quantities to the shopping list. One CSS keyframe combining animation, played once per commit.
  Verify (mechanical): A node harness asserts the commit effects: after "Cook this", each have-ingredient's stock drops by exactly the recipe amount and missing ingredients are untouched; after "Generate the shopping list", the missing ingredients appear with the recipe's quantities; the store is rewritten in both cases; `styles.css` contains the keyframes and the commit path invokes the animation exactly once.
  Learner check: Press My Recipes, tap a card, check the green/red checklist and steps, press "Cook this" — watch the combining animation play once, then look at your fridge door and see the used ingredients gone or reduced.
  Commit: `Recipe card view with cook-this commit and combining animation`

- [x] **4. The shopping list restocks your fridge and the loop repeats**
  Becomes usable: The shopping-list card lives on the fridge door; checking an item off adds it to stock with the recipe's quantity and removes it from the list. Cook, shop, restock — the next My Recipes reflects everything.
  Why now: This closes the core loop the scope named: stock changes as you cook and shop, so the app answers differently on Tuesday than on Sunday. With it, the whole journey is demonstrable in about a minute — which is exactly what the demo video needs.
  PRD ref: `prd.md > The Core Journey` (steps 9-10), `prd.md > Features and Behavior > The shopping list and restocking`
  Spec ref: `spec.md > Components` (Shopping list card), `spec.md > Data Model`
  Build: Shopping-list card on the fridge door, visible until its items are checked off. Checking an item off adds it to stock with the recipe's quantity and removes it from the card; store rewritten on every change.
  Verify (mechanical): A node harness asserts: checking off an item adds the recipe's quantity to stock and removes the item from the list; an emptied list removes the card; the state survives a simulated reload. A final end-to-end harness run walks the whole core journey — setup, add, recommend, cook, generate list, restock, recommend again — and asserts the second recommendation reflects the changes.
  Learner check: Generate a shopping list from a recipe, check an item off, and confirm it lands in your stock; press My Recipes again and see the recommendations reflect what you cooked and bought.
  Commit: `Shopping list card with mark-as-bought restocking`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 2 (recommendations working): the learner tries My Recipes and shapes the card look and ranking before slices 3-4 build on them
  - Not taken as a separate pass: fast mode ran straight from slice 2 into slices 3-4, so the reserved window closed before the learner used it. The shaping feedback this checkpoint was designed to capture (card look, ranking) arrived at the final review instead and was resolved there in two rounds — see Revisions. Left unchecked deliberately: the check itself never happened, and a back-filled box would be false evidence.
- [x] Final kick-the-tires exploration and feedback completed — after slice 4: the learner ran the full core journey and reported changes in two rounds — first that meat and fish were missing entirely and that tracking salt/sugar/flour/milk made recipes look incomplete; then that the setup page should merge into the door, that the tray should move beside the fridge with My Recipes next to it, and that longer recipes should be favoured in the ranking. A third pass asked for the columns to be reversed (fridge one third, tray two thirds) and for cooking to announce what it removes. All resolved — see Revisions.

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: Offered at the end of `5-build`, tailored to a professional programmer who is plan-first experienced and new to spec-driven (`learner-profile.md > Desired Learning Outcome`: how spec-driven development smooths the process). One focused alternative proposed, per the wrap-up reference: trace the length-bias decision through its evidence — `checklist.md > Revisions` (the trade accepted knowingly: bolognese 5/6 ×1.6 outranking complete scrambled eggs 2/2 ×1.2) and `verify/slice-2.js` (the synthetic equal-rank pair that re-proved the fewest-missing tie-break after the bias invalidated the old fixture) — or try the small edit below. Awaiting the learner's choice; a redirect is welcome, and the map stands on its own either way.
Route and stops: Reference route prepared inside `devpost/app-map.html`, not yet walked through together: `app.js > onCookThis` (the "Cook this" handler — reads the deduction before committing) → `app.js > cookRecipe` (the deduction rule in pure logic) → `app.js > playRemoveFloat` (the chips rising off the fridge), with the storage stop `saveState` / `loadState` around `STORAGE_KEY` (`'fdc-state-v1'`) noted alongside. Paths and symbols checked against the finished code at commit `ac6e542`.
Edit outcome: Not yet — one optional small edit offered: change `LENGTH_BONUS` in `app.js` (0.1 → e.g. 0.2), press My Recipes to watch the order change, run `node verify/slice-2.js` to see the harness react, then keep or revert. No kernel, data, or dependency changes.
Reflection: Offered, awaiting the answer: "What would you do differently next time you start with an agent?" A short answer or declining is enough; a personal answer belongs only in the ignored learner profile.
Activity mode: Reference route in the app map plus a live focused alternative offered, not yet taken. Map verified by rendering `file://…/devpost/app-map.html` in headless Chrome (light and dark both checked).

## Revisions

- [Generate the shopping list needed a visible surface one slice earlier than planned] — the plan had slice 3 write to the shopping list while the card itself arrived in slice 4, which would have left the commit with no feedback at all. Slice 3 shipped a transient note on the fridge door instead; slice 4 replaced that note with the real shopping-list card and deleted the note code.
- [Salt, sugar, flour, and milk became staples instead of tracked ingredients] — final-review feedback: tracking them made nearly every recipe look incomplete and asked the learner to shop for things already in the cupboard. The build then found a consequence the plan had not considered — a staple-heavy recipe keeps only its tracked ingredients, so Rice Pudding (rice, milk, sugar) becomes a one-ingredient recipe.
- [The collection grew from 26 to 35 recipes with a Meat & Fish category] — final-review feedback: the recommendations contained no meat or fish at all. Adds seven ingredients, nine recipes, and a fifth seeded category; existing kitchens show the new category's ingredients under a trailing "Other" group, which also fixes the older gap where ingredients with an unknown category were hidden entirely.
- [The "then simplest" score tie-break was dropped] — it went beyond the rule the spec committed to (score, then fewest missing). With staples it also systematically favoured staple-heavy dishes: a one-ingredient Rice Pudding topped a full larder.
- [The app opens straight onto the fridge door; the setup screen and the Done control are gone] — final-review feedback: "set up your kitchen" and the drop page were two halves of one job. The seeded categories are adopted on the first visit and edited in a disclosure inside the tray panel, so nothing stands between opening the app and filling the fridge.
- [The ingredient tray moved beside the fridge, with My Recipes directly under it] — final-review feedback: the tray was a long strip below the fridge and My Recipes sat at the very bottom, so adding ingredients pushed the fridge out of view and the learner could not see the change they were causing. The tray is now a compact sticky panel of collapsible category groups beside the fridge, and My Recipes sits immediately under the fridge it acts on.
- [The ranking gained a length bias: score × (1 + 0.1 × tracked ingredients)] — at the final review the learner noticed short recipes won simply because they are much easier to complete, and asked for longer ones to be favoured for the demo. The consequence was measured and accepted knowingly: bolognese (5/6, ×1.6) now outranks scrambled eggs (2/2, ×1.2). The built-in data no longer produces an equal-rank pair, so the remaining fewest-missing tie-break is now verified with a synthetic recipe pair instead of the old fixture.
- [The door's columns were reversed to one third fridge, two thirds tray] — after the tray moved beside the fridge, the fridge still held the wide column and the tray was squeezed into a 300px strip, which is the wrong way round: the tray is where the learner picks and drags. The fridge stays legible as a narrow column, and the tray gets the room. Verified in a real browser: 986px row measures 322px fridge / 644px tray.
- ["Cook this" now floats the amounts it removes, rising off the fridge and evaporating] — the deduction was silent, so the only way to see what cooking cost was to notice the fridge had got shorter. Each removed amount now rises off the fridge in its own chip, read from the state before the deduction so the numbers can never drift from what actually happened. Two build findings fixed along the way: the chips must be measured after the layer is unhidden (a display:none parent reports zero-width children), and the zig-zag has to stay inside the fridge's own column or the float drifts over the tray it is supposed to sit behind.
- [The planned early hands-on checkpoint after slice 2 was never taken] — fast mode continued into slices 3-4 without the planned pause, so the window reserved for shaping the card look and the ranking closed unused. The feedback that checkpoint was designed to capture arrived at the final review instead, in two rounds, and was resolved there (meat and fish, staples, the one-screen door, the length bias — see the revisions above). Recorded here rather than back-filled: the box stays unchecked because the check itself never happened, and the final review's two rounds preserved everything the early pass would have offered.

<!-- Leave this section empty when you write the checklist — no placeholder bullet.
     `5-build` appends a bullet here when implementation contradicts an assumption
     in the plan, in the form:
       - [What changed] — [what the build discovered that made the original plan wrong].
     One bullet per revision, no dates. This is how plan adaptation gets recorded. -->
