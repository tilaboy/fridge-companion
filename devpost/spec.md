---
doc: spec
status: approved
---

# Fridge Door Companion — Technical Spec

## How This Works, In Plain Language

Fridge Door Companion is a single web page that runs in your browser. There is no server, no account, and no internet connection needed once it has loaded.

- **Your kitchen lives in the browser's own storage** (a feature called `localStorage`). Think of it as a text file the browser keeps for this app: the app reads it when it opens and rewrites it whenever something changes. Two honest caveats: it's per-browser (Chrome's fridge isn't Firefox's fridge), and clearing browser data erases it.
- **The recipes and the ingredient tray are built-in data files** that ship with the app — three dozen recipes, the full icon set the matching needs, and the staples list.
- **A few staples are assumed to be in your kitchen** (milk, flour, salt, sugar). They are never tracked, never scored, and never shopped for; recipes that call for them just list them as assumed.
- **When you press My Recipes**, the app walks the recipe list, scores each recipe against your stock (the share of its ingredients you already have in full amount), sorts them, and shows the top 2–3.
- **The look is CSS** — colors, the fridge-door surfaces, and the one signature animation (ingredients sliding together into the dish emoji) are all plain styling, no graphics library.

Why this shape and not something bigger: the product is one screen and one loop. A framework or a server would add setup and a new class of errors without changing what the demo proves. This is the shape you accepted, with the tradeoff that a bigger future version would want a port.

## The Core Journey Through the System

The PRD's core journey, traced through the pieces (PRD ref: `prd.md > The Core Journey`):

1. **First open** → the app reads the browser storage → it's empty → the category-setup screen appears.
2. **Categories created** → storage rewritten → the fridge door renders, with the ingredient icon tray grouped by your categories.
3. **Drag or tap an icon** → an amount prompt appears (e.g. 2, eggs) → confirm → the stock is updated and storage is rewritten → the fridge door shows the new ingredient.
4. **Done** → the first-use entry ends; everything entered so far stays.
5. **My Recipes** → the matching engine scores every built-in recipe against the stock → the top 2–3 render as cards.
6. **Tap a card** → it comes to center: the have/missing checklist (green/red), then the steps, closed with "Bon Appétit".
7. **"Cook this"** → the ingredients you have are deducted from stock; storage is rewritten. **"Generate the shopping list"** → the missing ingredients appear on the shopping-list card. The combining animation plays once.
8. **Check an item off the shopping list** → it is added to stock with the recipe's quantity and leaves the list; storage is rewritten.
9. **Close and return** → storage is read again → the kitchen is exactly as you left it, and the next My Recipes reflects every change.
10. **Nothing fits** → no cards, just the friendly empty-state message.

## Stack

- **HTML + CSS + JavaScript, plain, no framework, no build step, no npm.** Three files the browser reads directly (`index.html`, `styles.css`, `app.js`), plus a `data/` folder with the built-in content.
  - Rationale (learner-accepted): one screen and one loop don't repay framework overhead at PoC size. Accepted tradeoff: less structure; a larger future version would want a port.
- **Storage: `localStorage`** — the browser's built-in key-value store. The learner's "text file we read on load and rewrite on update" model, mapped to what a browser app can actually do.
- **Animation: CSS keyframes**, no library.
- **Fonts: system font stacks** (rounded sans for body, a cursive fallback stack for the handwritten-ish accents) — no network fonts, so the app stays fully offline.
- **No external services. No API keys. Works offline.**

Documentation for the platform features used:
- `localStorage`: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- HTML drag and drop: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
- Python's built-in static server: https://docs.python.org/3/library/http.server.html

## Where It Runs and How Someone Tries It

- **Runtime:** any modern browser (Chrome, Firefox, Safari, Edge). No language runtime beyond Python 3 for the convenience server (preinstalled on macOS).
- **Exact start:** from the project root, run `python3 -m http.server 8000`, then open http://localhost:8000.
- **Why not double-click the file:** opening `index.html` directly (`file://`) makes browser storage behave inconsistently across browsers. The one-line server gives every browser the same, correct behavior — and it's what the demo recording uses.
- **Demo recording:** open the URL and walk the core journey — enter ingredients, get recommendations, open a card, cook, generate the shopping list, check an item off.
- **Submission:** a short demo video + a public GitHub repository (both required). Deployment is optional and never a substitute. Since the learner would eventually like others to use the app, these static files publish to GitHub Pages for free — recorded here as an **optional** step for `6-ship`, not a requirement for the PoC.

## Look and Feel

Carried forward from `prd.md > Look and Feel` and `scope.md > Inspiration & Identity` — direction only, in terms the build can act on:

- **Metaphor:** the screen is your fridge door, not a cookbook. Not a glossy recipe magazine, not a heavy 3D skeuomorphic fridge.
- **Background:** subtle fridge surface — white/steel, soft shadows, a faint magnet-or-tape texture (CSS gradients/shadows, no images).
- **Ingredient display:** chips/tiles grouped by the user's categories (Produce, Dairy, Pantry, Leftovers, Meat & Fish…). Staples never appear here.
- **Recipe cards:** 2–3 max, looking like notes or magnets — slight rotation, tape accent; dish as emoji/illustration; fit line "You have 4/5" or "Missing: 1"; a simple match indicator (e.g. a fill bar or dot row).
- **Recipe view:** checklist with have/missing clearly marked — **green = have, red = missing**, high contrast — then the steps, closed with "Bon Appétit".
- **Motion:** one signature animation — the chosen ingredients slide/toss together into the finished dish emoji, CSS keyframes, plays once on commit. Kept in the POC per the learner's ruling.
- **Tone:** rounded corners, warm colors, handwritten-ish accents, no stock photos. Empty-state copy stays playful ("Unfortunately, there's nothing fitting" / "Uh-oh — your fridge is empty, please refuel").
- **Stack constraint:** everything above is achievable in plain CSS; the handwritten accents use a system cursive fallback stack rather than a bundled or network font, to stay offline-friendly.

## Components

### App shell and fridge door
`index.html` + `app.js`. Renders the category chips, the fridge at center, the ingredient icon tray grouped by category, the **Done** / **My Recipes** controls, and the shopping-list card when one exists. Talks to the store for all reads and writes.
PRD ref: `prd.md > Setting up your kitchen (first use)`, `prd.md > Adding ingredients to stock`.

### The store (state + browser storage)
The single source of truth: `{ categories, stock, shoppingList }`. Loaded once on start; rewritten after every change. One `localStorage` key (versioned, e.g. `fdc-state-v1`).
PRD ref: `prd.md > States and Boundaries` (persistence).

### Amount prompt
A small modal shown when an icon is dragged in or tapped. Number input + the ingredient's unit; accepts positive whole numbers only; confirming adds the ingredient to stock, combining amounts if it's already there.
PRD ref: `prd.md > Adding ingredients to stock`.

### Recommendation engine
Scores every built-in recipe: **score = (ingredients you have in sufficient amount) ÷ (total ingredients)**, tie-broken by fewest missing. Amount-level check: needing 200 g with 100 g in stock counts as missing. **Staples are excluded from both sides of the score** — they are assumed on hand, so a recipe calling for salt is neither rewarded nor penalised for it. Returns the top 2–3, or an empty result that triggers the empty state.
PRD ref: `prd.md > Getting recommendations`.

### Recipe card view
A recommendation card brought to center: dish emoji, the have/missing ingredient checklist (green/red), a muted line naming the staples the recipe assumes, the cooking steps, the "Bon Appétit" close, and the commit buttons.
PRD ref: `prd.md > Cooking from a recipe`.

### Commit actions
**"Cook this"** deducts the recipe's ingredients from stock — only what the user actually has, and never a staple. **"Generate the shopping list"** sends the missing ingredients (with the recipe's quantities) to the shopping-list card; staples are never sent. Both rewrite the store; committing plays the combining animation.
PRD ref: `prd.md > Cooking from a recipe`.

### Shopping list card
Lives on the fridge door until its items are checked off. Checking an item off adds it to stock with the recipe's quantity and removes it from the list.
PRD ref: `prd.md > The shopping list and restocking`.

### Combining animation
One CSS keyframe sequence: the chosen ingredient tiles slide/toss together and resolve into the dish emoji. Plays once per commit.
PRD ref: `prd.md > Cooking from a recipe` (signature animation).

### Built-in data files
`data/ingredients.js` — the icon tray: id, name, emoji, category, unit for every ingredient the recipes need, plus a `staple` flag on the four assumed-on-hand items (milk, flour, salt, sugar). `data/recipes.js` — three dozen recipes: id, name, dish emoji, ingredient list with amounts, steps. Every recipe ingredient exists in the tray, and every tray ingredient is used by at least one recipe (the POC's fixed-ingredient decision); staples are in the file so recipes keep one source for names and units, but they stay out of the tray, the score, and the shopping list.
PRD ref: `prd.md > Setting up your kitchen (first use)`.

## Data Model

User data (lives in browser storage, one versioned key):

- `categories`: `[{ id, name }]` — the user's storage categories.
- `stock`: `{ [ingredientId]: amount }` — whole numbers only; amount 0 means "not in stock" and the ingredient drops off the fridge display. Staples never appear here.
- `shoppingList`: `[{ ingredientId, amount, fromRecipeId }]` — missing ingredients collected from recipe commits, removed when checked off. Staples never appear here either.

Built-in data (ships in code, never written at runtime):

- `ingredients`: `[{ id, name, emoji, categoryId, unit, staple? }]`
- `recipes`: `[{ id, name, dishEmoji, ingredients: [{ ingredientId, amount }], steps: [string] }]`

### Staples

Milk, flour, salt, and sugar are marked `staple: true` in the tray data and assumed to be in the kitchen: they are hidden from the tray, excluded from both sides of a recipe's score, never deducted when cooking, never reported missing, and never sent to the shopping list. The recipe view names them under "Assumed in your pantry" so a recipe still reads completely. The rule lives in one place (`isStaple`, derived from the ingredient data) so the data file stays the single source of truth, and `sanitizeState` drops any staple amounts left in storage by an earlier version. A consequence the learner accepted: a staple-heavy recipe keeps only its tracked ingredients, so Rice Pudding (rice, milk, sugar) is a one-ingredient recipe.

For every piece: where it lives (above), how it updates (store rewrite on each change), and what happens when the user leaves and comes back (everything reloads from storage exactly as left). The recipes and tray are static code, so they are identical on every visit.

## File Structure

```
agent/
├── index.html            # the fridge door: all screens in one page
├── styles.css            # fridge-surface look, cards, animation keyframes
├── app.js                # store, rendering, amount prompt, matching, commits
├── data/
│   ├── ingredients.js    # built-in icon tray (id, emoji, category, unit)
│   └── recipes.js        # built-in recipe collection
├── devpost/              # learning docs: scope, prd, spec, checklist (canonical)
├── README.md             # how to run (the http.server command)
└── .gitignore            # learner-profile.md and local env files stay private
```

(What goes into the *public* repository — e.g. whether `skills/` course material is included — is a `6-ship` decision, recorded there.)

## External Services and Dependencies

None. No APIs, no keys, no accounts, no network calls at runtime. `python3 -m http.server` is standard library only.

## Important Failure Modes

- **First visit / cleared browser data** → the app simply shows first-use setup again. Data loss is silent; acceptable for a PoOC and inherent to local-first.
- **Strange amount input** (empty, zero, negative, text) → the prompt accepts positive whole numbers only and refuses the rest, so bad values never reach the store.
- **Drag on a touch device** → covered: tap does the same thing and opens the same prompt.
- **Opening via `file://`** → storage behaves inconsistently across browsers → always start via the local server, as documented in the README.

## What Was Simplified and Why

- **`localStorage` instead of a user-visible text file** — the browser keeps the data; the load-on-open / rewrite-on-change model is identical. The learner's own instinct, mapped to what a browser can do.
- **No framework** — one screen and one loop; structure cost exceeds benefit at POC size. Learner-accepted with the tradeoff stated.
- **Fixed ingredient tray, no custom entry** — the tray covers the built-in recipes; first-use stays minutes-long. (From `prd.md > Product Decisions`.)
- **Staples rather than tracking everything** — milk, flour, salt, and sugar are assumed on hand, so the fridge holds what you'd actually run out of. Cost, accepted at the final review: staple-heavy recipes get thin (Rice Pudding reduces to rice).
- **A trailing "Other" group in the tray** — if the built-in data gains a category the user does not have (Meat & Fish, added after they set up), those ingredients group under "Other" instead of silently disappearing.
- **Whole-number amounts, no unit conversion** — 3 eggs, 200 g flour. (From `scope.md > Explicitly Cut`.)
- **Emoji dish illustrations, no photos** — no sourcing work, fits the fridge-door tone. (From `prd.md > Look and Feel`.)
- **One CSS keyframe animation, no animation library** — the signature moment without a dependency.
- **No deployment for the POC** — video + repository satisfy the submission; GitHub Pages stays an optional later step.

## Decisions and Open Issues

**Learner decisions (made in this interview):**

- Plain HTML/CSS/JavaScript, no framework, no build step — accepted with the tradeoff stated (less structure; a future port is a known cost).
- Browser storage via `localStorage` — the learner's "text file, read on load, rewrite on update" model, accepted after the per-browser and clear-data caveats.
- Matching rule: score = have ÷ need, tie-break fewest missing, amount-level check — accepted as proposed.
- Drag is the signature gesture; tap does the same thing — accepted so the app works on phones and demos faster.
- One simple combining animation stays in the POC.
- Milk, flour, salt, and sugar are staples: assumed always in the kitchen, never tracked, never scored, never shopped for (decided at the final kick-the-tires review).
- Meat and fish join the collection — a new seeded "Meat & Fish" category, seven ingredients, and nine recipes — so the recommendations cover a real dinner (same review).

**Implementation details derived from those decisions (not separately decided):**

- One versioned `localStorage` key holding all user data.
- Amount 0 removes an ingredient from the fridge display.
- System font stacks (no network fonts) to stay offline.
- The tap path opens the exact same amount prompt as drag.

**One genuine uncertainty, raised by the learner and clarified:** the learner was unsure what actually runs in a browser app with no backend and how data could persist without one. Clarified with the text-file analogy and the three caveats (per-browser, cleared with browser data, `file://` inconsistency). Agreed evidence during the build: the first working slice must include *add an ingredient → reload the page → the ingredient is still there* — that check is the proof the storage model is real.

**Open (carried from `prd.md > Open Questions`, all non-blocking, confirm at review or during the build):**

- Re-adding an ingredient combines amounts (assumed).
- Seeded category suggestions (Produce / Dairy / Pantry / Leftovers) are offered as editable starting points rather than a blank slate (assumed).
- The shopping-list card persists on the fridge door until its items are checked off (assumed).
