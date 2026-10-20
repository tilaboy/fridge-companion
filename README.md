# Fridge Door Companion

A local-first fridge-door companion: it remembers what's in your kitchen — organized by your own food categories — and recommends recipes from what you actually have. No server, no account, no network calls; your kitchen lives in your browser's own storage.

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

## For developers

- Plain HTML/CSS/JS — no framework, no build step, no dependencies.
- `data/ingredients.js` — the built-in ingredient tray; `data/recipes.js` — the built-in recipe collection.
- `devpost/` — the planning documents (scope, PRD, spec) and the build checklist that tracks progress.
- The door is one screen: a fridge in the middle with one bubble per category hung either side, placed by percentage on a fixed-height stage so nothing is measured at runtime (below 1000px the bubbles drop under the fridge as a two-up grid). Categories are edited in the disclosure under the fridge rather than on a first-use screen. The icon drag is a pointer drag (not HTML5 drag-and-drop) so it can be exercised end to end by the harnesses.
- Your kitchen keeps the categories you chose. If the built-in data later gains a category (Meat & Fish, for example), its ingredients show up under a trailing **Other** bubble until you tick that category on in **Rename or add categories**.
- `verify/` — small node harnesses used to mechanically verify each build slice, e.g. `node verify/slice-1.js`. `verify/slice-4.js` also walks the whole journey end to end (first open → add → recommend → cook → shop → recommend again).

## License

[MIT](LICENSE) © 2026 Chao Li. Use it, fork it, ship it — keep the copyright notice and you are done. A link back is welcome, but not required.
