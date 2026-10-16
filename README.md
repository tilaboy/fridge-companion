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

1. **First open:** the fridge door is already there, with the suggested categories (Produce, Dairy, Pantry, Leftovers, Meat & Fish) in place. Rename them or add your own under **Rename or add categories** in the ingredient panel.
2. **Fill the fridge:** the ingredient panel sits beside the fridge. Tap a category to open it, then tap an ingredient — or drag it straight into the fridge — and enter an amount. Staples (milk, flour, salt, sugar) are assumed to be in your kitchen, so they never appear in the tray.
3. **Reload the page:** your kitchen is exactly as you left it.
4. **Press My Recipes** (it sits right under the fridge): the app scores every built-in recipe against your stock and shows the top 2–3. Longer recipes get a thumb on the scale, so a full dinner is not beaten by a two-ingredient snack.
5. **Tap a card:** it comes to center with the green/red have-or-missing checklist and the steps. Press **Cook this** — watch the ingredients combine, and watch the amounts it removes float off the fridge and evaporate ("Out of the fridge"). **Generate the shopping list** only appears when the recipe is actually missing something; a recipe you can already make shows "Cook this" alone.
6. **Shop and restock:** the shopping-list card sits on the fridge door. Press **Got it** on an item and it moves into your stock with the recipe's quantity — so the next My Recipes answers differently.

## For developers

- Plain HTML/CSS/JS — no framework, no build step, no dependencies.
- `data/ingredients.js` — the built-in ingredient tray; `data/recipes.js` — the built-in recipe collection.
- `devpost/` — the planning documents (scope, PRD, spec) and the build checklist that tracks progress.
- The door is one screen: the fridge takes one third of the two-column grid and the ingredient panel two thirds (the panel is where the picking and dragging happens), and the tray folds into one collapsible group per category (open state is remembered while you work). Categories are editable in the panel's disclosure rather than on a first-use screen.
- Your kitchen keeps the categories you chose. If the built-in data later gains a category (Meat & Fish, for example), its ingredients show up under a trailing **Other** group until you tick that category on in **Rename or add categories**.
- `verify/` — small node harnesses used to mechanically verify each build slice, e.g. `node verify/slice-1.js`. `verify/slice-4.js` also walks the whole journey end to end (first open → add → recommend → cook → shop → recommend again).
