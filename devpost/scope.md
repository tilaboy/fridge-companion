---
doc: scope
status: approved
---

# Fridge Cleanout (working name)

One line: a fridge-door companion that remembers what's in your kitchen and recommends recipes from what you actually have.

## The Unique Kernel

Most recipe apps answer "what can I cook?" once, from a search box — they don't know you have half an onion and leftover rice sitting in your fridge. This app remembers your kitchen, organized by your own food categories, and recommends only from what's actually on hand. Every time you cook or shop, your stock changes, so the same app gives you different answers on Tuesday than it did on Sunday — without you re-explaining your kitchen.

## Who It's For

Anyone standing in front of an open fridge wondering what to make with what's already there — starting with the learner himself, but designed so any person can use it. Today they either guess, or search for recipes and then check each ingredient against their fridge by hand.

## The Core Loop

Open the app → see what's in stock (by category) → get the top 2–3 recipe recommendations that fit the stock → pick one → see the recipe that turns those ingredients into food (ingredients marked have/missing, steps to cook) → decide to shop for what's missing or skip it → stock is deducted → add newly bought groceries back → recommendations change. The loop repeats daily, and the app's picture of your kitchen stays current.

## Inspiration & Identity

**"Fridge-door companion" style** — playful, warm, ingredient-first, local-first. The core metaphor: *the screen is your fridge door, not a cookbook*. Explicitly not a glossy recipe magazine, and not a heavy skeuomorphic 3D fridge.

- **Background:** subtle fridge surface — white/steel, soft shadows, maybe a faint magnet or tape texture.
- **Ingredient display:** chips/tiles grouped by your categories — Produce, Dairy, Pantry, Leftovers, etc.
- **Recipe cards:** 2–3 max, looking like notes or magnets. Each shows the dish as emoji/illustration, a fit line like "You have 4/5" or "Missing: 1", and a simple match indicator.
- **Recipe view:** checklist with have/missing clearly marked, then the steps.
- **Motion:** one signature animation — chosen ingredients slide/toss together into a finished dish emoji. Keep it lightweight.
- **Tone:** rounded corners, warm colors, handwritten-ish accents, high contrast, no stock photos.

This makes the core loop feel fast and fun, and it's the demo's visual signature.

## Why This Matters to the Learner

In the learner's words: excited because it's "very extensible, and combined both knowledge collection, recommendation, and front/backend." He wants to try it himself first, and it would be great if it were also available for other people. Learning goal: understand how spec-driven development makes the development process smoother.

## What "Working" Looks Like

A first-time user opens the app → enters the ingredients they already have, organized by food categories (seeded defaults plus the ability to add their own) → gets the first recommendations (top 2–3, ranked internally) → picks one → sees the recipe that turns those ingredients into food → chooses to shop for the missing items or skip them → the recipe's ingredients are deducted from stock → adds newly bought groceries → recommendations update accordingly. The whole loop is demonstrable in about a minute.

## The POC Boundary

- First-use ingredient entry organized by food categories — seeded defaults plus the ability to add custom ones
- A built-in recipe collection: a couple dozen recipes with ingredients and steps
- Matching engine: scores every recipe against current stock, shows the top 2–3
- Recipe view: ingredients marked have/missing, cooking steps
- Picking a recipe deducts ingredients from stock
- Grocery update: add newly bought ingredients back into stock
- Stock persists between sessions, locally in the browser
- Fridge-flavored look with one lightweight selection animation; dishes shown as illustrations/emoji
- No login — it runs locally

## Later

- Multiple people / shared kitchens
- Expiry tracking ("cook this before it goes bad")
- Shopping-list generation from what's missing
- Real recipe photos
- Unit conversion (2 eggs vs 200 g flour)
- A public deployed URL

## Explicitly Cut

- A real backend, database, and accounts — the matching brain still exists, it just runs locally. A hosted backend doubles the build and demo surface without proving the kernel any better.
- Heavy animation sequences — one simple transition carries the demo moment.
- Unit conversion in quantities — whole numbers only (3 eggs, 200 g flour). Real conversion is a rabbit hole that eats demo time.
