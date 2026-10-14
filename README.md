# Fridge Door Companion

A local-first fridge-door companion: it remembers what's in your kitchen — organized by your own food categories — and recommends recipes from what you actually have. No server, no account, no network calls; your kitchen lives in your browser's own storage.

## Run it

From this folder:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Use the local server rather than double-clicking `index.html`: opening the file directly (`file://`) makes browser storage behave inconsistently across browsers (see `devpost/spec.md > Where It Runs and How Someone Tries It`).

## Try it

1. **First open:** confirm the suggested food categories (Produce, Dairy, Pantry, Leftovers, Meat & Fish) or add your own.
2. **Fill the fridge:** drag an ingredient into the fridge — or just tap it — and enter an amount. Staples (milk, flour, salt, sugar) are assumed to be in your kitchen, so they never appear in the tray.
3. **Reload the page:** your kitchen is exactly as you left it.
4. **Press My Recipes:** the app scores every built-in recipe against your stock and shows the top 2–3 that fit.
5. **Tap a card:** it comes to center with the green/red have-or-missing checklist and the steps. Press **Cook this** — watch the ingredients combine, then see your fridge change — or **Generate the shopping list** to collect what's missing.
6. **Shop and restock:** the shopping-list card sits on the fridge door. Press **Got it** on an item and it moves into your stock with the recipe's quantity — so the next My Recipes answers differently.

## For developers

- Plain HTML/CSS/JS — no framework, no build step, no dependencies.
- `data/ingredients.js` — the built-in ingredient tray; `data/recipes.js` — the built-in recipe collection.
- `devpost/` — the planning documents (scope, PRD, spec) and the build checklist that tracks progress.
- Your kitchen keeps the categories you chose at first use. If the built-in data later gains a category (Meat & Fish, for example), its ingredients show up under a trailing **Other** group until you set your kitchen up again (clear the site's storage and reload).
- `verify/` — small node harnesses used to mechanically verify each build slice, e.g. `node verify/slice-1.js`. `verify/slice-4.js` also walks the whole journey end to end (setup → add → recommend → cook → shop → recommend again).
