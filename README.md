# Fridge Door Companion

A local-first fridge-door companion: it remembers what's in your kitchen — organized by your own food categories — and recommends recipes from what you actually have. No server, no account, no network calls; your kitchen lives in your browser's own storage.

This is the **production repo**. The hackathon POC that started it lives at
[tilaboy/fridge-door-companion](https://github.com/tilaboy/fridge-door-companion),
and its history is carried over here.

## Status

**M0 (safe hands) and M1 (a fridge you can trust) are done.** Live at
**https://tilaboy.github.io/fridge-companion/** — installable, works offline,
and can no longer lose a kitchen silently. The pure domain is typed modules
with a real test suite, and the browser runs a Vite-built shell on top of it.
Schema 5 holds stock as lots with optional expiry (so the fridge can say "use
this first"), the kitchen's own ingredients and recipes, and hard food
preferences; v1–v4 kitchens migrate in place. Amounts take fractions and units:
`½ kg` of beef is stored as `500 g` and satisfies a `250 g` recipe, and mass ↔
volume converts when the ingredient declares a density. Pantry staples are
configurable per kitchen — marking one clears its stock and shopping entries,
and undo restores them. You can add your own ingredients (with a category, unit,
optional density, diet class, and allergen declaration) and recipes (ingredient
rows, steps, cooking time, and meal types); names are validated and
de-duplicated, and both join recommendations, export/import, and cross-tab
sync.

Diet, allergen, time, and meal filters are hard constraints applied before
ranking: a recipe is hidden unless every ingredient is declared safe, its
cooking time fits the budget, and it declares the selected meal. Built-in
ingredients carry conservative safety tags, dairy/egg/fish allergens are also
derived from the diet class, and unknown custom metadata fails closed while a
filter is active. All 35 built-in recipes carry cooking time and meal metadata;
custom recipes can declare both, and recipes without them stay hidden while
those filters are on. Cards show the time and meal they matched. Cooking,
restocking, shopping purchases, and preference changes can be undone from a
toast that restores the exact prior kitchen. Next: M2 card explanations,
expiry-aware ranking, servings, and cook-history repetition avoidance, per the
[production roadmap](docs/roadmap.md).

Decided: [TypeScript + Vite, no framework](docs/adr/0001-stack.md) and
[IndexedDB with sync deferred past v1](docs/adr/0002-storage-and-sync.md).

What M0 added:

- Export to a versioned kitchen file, and import with validation — the backup
  of record, and how two people share a fridge until sync exists.
- A persistent banner when a write to browser storage fails, instead of silent
  data loss.
- Cross-tab sync, so two open tabs cannot overwrite each other.
- Reset kitchen, which clears this app's key and nothing else.
- A PWA shell: manifest, generated icons, and a service worker that reloads
  with the network off.
- A privacy page that says plainly what is stored and where.
- CI running typecheck, tests, and a production build on push, then deploying
  `main` to GitHub Pages.

## Watch it first

[![Watch the Fridge Door Companion demo](https://i.ytimg.com/vi/lcoYnsWC08E/hqdefault.jpg)](https://youtu.be/lcoYnsWC08E)

▶ **[https://youtu.be/lcoYnsWC08E](https://youtu.be/lcoYnsWC08E)** — the whole loop in about a minute: filling the fridge, the ranking, cooking a dish, and the fridge paying for dinner. If you only watch one thing, watch this.

## Run it

From this folder:

```
npm ci
npm run dev
```

Then open the URL Vite prints (usually <http://localhost:5173>). `npm run build`
produces the deployable shell in `dist/`; `npm run preview` serves that build
locally, including the service worker.

Open it over `http://` rather than double-clicking `index.html`: `file://` makes
browser storage behave inconsistently across browsers, and the module build
cannot load from it (see `devpost/spec.md > Where It Runs and How Someone Tries It`).

## Try it

1. **First open:** the fridge door is already there, with one floating bubble per suggested category (Produce, Dairy, Pantry, Leftovers, Meat & Fish) around it. Rename them or add your own under **Rename or add categories** under the fridge.
2. **Fill the fridge:** tap the fridge to swing its door open, or tap a bubble to swell it into that category's icons. Then tap an icon and enter an amount, **press and drag** it onto the fridge, or double-click it for a default portion. Tap the fridge again (or **Close the door**) to shut it. Staples (milk, flour, salt, sugar) are assumed to be in your kitchen, so they never appear in a bubble.
3. **Reload the page:** your kitchen is exactly as you left it.
4. **Press My Recipes** (it sits right under the fridge): the app scores every built-in recipe against your stock and shows the top 2–3. Longer recipes get a thumb on the scale, so a full dinner is not beaten by a two-ingredient snack.
5. **Tap a card:** it comes to center with the green/red have-or-missing checklist and the steps. Press **Cook this** — watch the ingredients combine, and watch the amounts it removes float off the fridge and evaporate ("Out of the fridge"). **Generate the shopping list** only appears when the recipe is actually missing something; a recipe you can already make shows "Cook this" alone.
6. **Shop and restock:** the shopping-list card sits on the fridge door. Press **Got it** on an item and it moves into your stock with the recipe's quantity — so the next My Recipes answers differently.
7. **Keep a copy:** open **Your data** under the fridge and press **Export kitchen**. You get a versioned JSON file with your categories, stock, and shopping list. **Import kitchen** validates a file before replacing anything and refuses newer formats rather than guessing. **Reset kitchen** starts over and clears only this app's key.

## Install it, go offline

Open https://tilaboy.github.io/fridge-companion/ once, then install it from the
browser menu (Chrome/Edge: **Install**; Safari on iOS: **Share → Add to Home
Screen**). The service worker precaches the shell, so after that first visit the
app opens with the network off.

The worker is deliberately update-friendly: navigations are network-first, so a
deploy is picked up on the next load online, and assets are served from cache
while being refreshed in the background. The build stamps the cache name and the
hashed bundle names into `sw.js`, so a changed build automatically lands in a
fresh cache and the old one is dropped.

## For developers

- Vite builds one module entry (`src/app.js`) into `dist/`; no UI framework.
  `src/domain/` is TypeScript and has no DOM or storage access (ADR-001).
- Setup: `npm ci`, then `npm run typecheck` and `npm test`. `npm run dev` serves
  the source; `npm run build` emits `dist/` and stamps the service worker.
- `src/domain/` — the DOM-free kernel: state, amounts, categories, scoring,
  cook/shop actions, export/import. It takes a `Catalog` instead of reaching for
  globals, so tests can build a three-ingredient world. `tests/domain/` covers it
  with Vitest.
- `src/store/localStore.ts` — the localStorage boundary: load, save, raw read,
  reset. It takes a storage object, so tests never need a browser.
- `src/app.js` — the UI: rendering, gestures, cross-tab sync, and export/import
  wiring. It imports the domain and builds the catalog once.
- `src/data/ingredients.ts` — the built-in ingredient tray;
  `src/data/recipes.ts` — the built-in recipe collection, both typed.
- `docs/` — the [roadmap](docs/roadmap.md) and the [ADRs](docs/adr/). Read ADR-002
  before changing anything about storage.
- `devpost/` — the planning documents (scope, PRD, spec) and the build checklist that tracks progress. Hackathon history, kept for provenance.
- The door is one screen: a fridge in the middle with one bubble per category hung either side, placed by percentage on a fixed-height stage so nothing is measured at runtime (below 1000px the bubbles drop under the fridge as a two-up grid). Categories are edited in the disclosure under the fridge rather than on a first-use screen. The icon drag is a pointer drag (not HTML5 drag-and-drop) so it can be exercised end to end by the harnesses.
- Your kitchen keeps the categories you chose. If the built-in data later gains a category (Meat & Fish, for example), its ingredients show up under a trailing **Other** bubble until you tick that category on in **Rename or add categories**.
- `tests/` — Vitest. `tests/domain/` covers the kernel, `tests/store.test.ts` the
  storage boundary, `tests/journey.test.ts` walks first open → add → recommend →
  cook → shop → recommend again, `tests/data.test.ts` checks the built-in data,
  and `tests/shell.test.ts` checks the manifest, icons, privacy page, module
  entry, element ids, and every file the worker precaches.
- Export/import and cross-tab reconciliation live in `src/domain/transfer.ts`;
  the UI only wires them to file input, download, and a `BroadcastChannel`.
- `public/` — files copied to the site root unchanged: `styles.css`, the
  manifest, `sw.js`, `privacy.html`, icons, and `.nojekyll`.
- `tools/postbuild.mjs` runs after Vite: it reads the built `index.html`, appends
  the hashed bundle to the worker's precache list, and names the cache from the
  build contents, so there is no manual version to bump.
- `tools/make-icons.py` regenerates the PWA icons with no image library. It
  writes 1024px sources to `public/icons/`; derive the rest with `sips`
  (`sips -z 512 512 …`) and keep only the sizes referenced by the manifest and
  `index.html`.
- Deployment: `.github/workflows/ci.yml` runs typecheck, tests, and the build on
  Node 20 and 22, then — on `main` only — builds again and publishes `dist/` to
  GitHub Pages. The Pages site had to be enabled once in Settings → Pages →
  Source: **GitHub Actions** (`GITHUB_TOKEN` is not allowed to create it); after
  that, every green `main` build deploys with no further setup.

## License

[MIT](LICENSE) © 2026 Chao Li. Use it, fork it, ship it — keep the copyright notice and you are done. A link back is welcome, but not required.
