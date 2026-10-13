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

1. **First open:** confirm the suggested food categories (Produce, Dairy, Pantry, Leftovers) or add your own.
2. **Fill the fridge:** drag an ingredient into the fridge — or just tap it — and enter an amount.
3. **Reload the page:** your kitchen is exactly as you left it.

## For developers

- Plain HTML/CSS/JS — no framework, no build step, no dependencies.
- `data/ingredients.js` — the built-in ingredient tray.
- `devpost/` — the planning documents (scope, PRD, spec) and the build checklist that tracks progress.
- `verify/` — small node harnesses used to mechanically verify each build slice, e.g. `node verify/slice-1.js`.
