# Fridge Door Companion

A local-first fridge-door companion: it remembers what's in your kitchen — organized by your own food categories — and recommends recipes from what you actually have. No server, no account, no network calls; your kitchen lives in your browser's own storage.

This is the **production repo**. The hackathon POC that started it lives at
[tilaboy/fridge-door-companion](https://github.com/tilaboy/fridge-door-companion),
and its history is carried over here.

## Status

**M0 (safe hands) is done.** Live at
**https://tilaboy.github.io/fridge-companion/** — installable, works offline,
and can no longer lose a kitchen silently. Next up: M1, the v2 kitchen (fractions
and units, stock lots with expiry, custom items, undo) per the
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
- CI running every harness on push, then deploying `main` to GitHub Pages.

## Watch it first

[![Watch the Fridge Door Companion demo](https://i.ytimg.com/vi/lcoYnsWC08E/hqdefault.jpg)](https://youtu.be/lcoYnsWC08E)

▶ **[https://youtu.be/lcoYnsWC08E](https://youtu.be/lcoYnsWC08E)** — the whole loop in about a minute: filling the fridge, the ranking, cooking a dish, and the fridge paying for dinner. If you only watch one thing, watch this.

## Run it

From this folder:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Use the local server rather than double-clicking `index.html`: opening the file directly (`file://`) makes browser storage behave inconsistently across browsers (see `devpost/spec.md > Where It Runs and How Someone Tries It`).

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
while being refreshed in the background. If you change the precache list, bump
`CACHE` in `sw.js` so stale entries are dropped.

## For developers

- Plain HTML/CSS/JS today, no framework, no build step, no dependencies. The
  move to TypeScript + Vite starts with the module split (ADR-001).
- `data/ingredients.js` — the built-in ingredient tray; `data/recipes.js` — the built-in recipe collection.
- `docs/` — the [roadmap](docs/roadmap.md) and the [ADRs](docs/adr/). Read ADR-002
  before changing anything about storage.
- `devpost/` — the planning documents (scope, PRD, spec) and the build checklist that tracks progress. Hackathon history, kept for provenance.
- The door is one screen: a fridge in the middle with one bubble per category hung either side, placed by percentage on a fixed-height stage so nothing is measured at runtime (below 1000px the bubbles drop under the fridge as a two-up grid). Categories are edited in the disclosure under the fridge rather than on a first-use screen. The icon drag is a pointer drag (not HTML5 drag-and-drop) so it can be exercised end to end by the harnesses.
- Your kitchen keeps the categories you chose. If the built-in data later gains a category (Meat & Fish, for example), its ingredients show up under a trailing **Other** bubble until you tick that category on in **Rename or add categories**.
- `verify/` — node harnesses for each build slice. `node verify/all.js` runs all
  of them in separate processes; CI does exactly that. `verify/slice-4.js` walks
  the whole journey end to end (first open → add → recommend → cook → shop →
  recommend again), `verify/slice-5.js` covers export/import and the files it
  refuses, and `verify/slice-6.js` covers reset, cross-tab reconciliation, the
  PWA shell (manifest fields, real icon dimensions, every precached file), and
  the privacy page.
- Export/import and cross-tab reconciliation live in `app.js` as pure functions
  (`buildExport`, `exportJson`, `parseImportPayload`, `remoteStateFromRaw`)
  so the harnesses can test them without a browser; the UI only wires them to
  file input, download, and a `BroadcastChannel`.
- `tools/make-icons.py` regenerates the PWA icons with no image library. It
  writes 1024px sources; derive the rest with `sips` (`sips -z 512 512 …`) and
  keep only the sizes referenced by the manifest and `index.html`.
- Deployment: `.github/workflows/ci.yml` runs the harnesses on Node 20 and 22,
  then — on `main` only, after they pass — publishes the repo root to GitHub
  Pages. The Pages site had to be enabled once in Settings → Pages → Source:
  **GitHub Actions** (`GITHUB_TOKEN` is not allowed to create it); after that,
  every green `main` build deploys with no further setup. `.nojekyll` keeps the
  shell byte-for-byte.

## License

[MIT](LICENSE) © 2026 Chao Li. Use it, fork it, ship it — keep the copyright notice and you are done. A link back is welcome, but not required.
