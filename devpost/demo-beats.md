# Demo video — beat sheet (recording mechanics)

A shot list for the required demo video: **what to show, in what order, roughly how long**. The spoken narration is yours — this sheet only covers the mechanics, so the words stay yours too. (If you write the narration, I can check spelling and grammar afterwards, nothing more.)

**Target length:** about 60 seconds. Confirm the exact limit and format on your actual submission form before recording — the form is the authority, not this sheet.

## What must be visible (the proof, not slides)

Reviewers must see the proof of concept **working**, without cloning anything:

1. the fridge filling from the tray (the input),
2. **My Recipes reacting to what you actually have** (the kernel: ranked recommendations with honest fit lines),
3. **Cook this changing the fridge** (the result: the combine animation, the amounts rising off the fridge one by one, the stock visibly shorter),
4. the ranking reacting to that new stock on the next My Recipes press.

## The beats (≈60s)

| Time | On screen | Notes |
|---|---|---|
| 0:00–0:10 | The door as it opens: the empty-fridge note, then drag 3–4 ingredients in (beef, tomato, pasta, onion) and enter amounts | Shows the whole input path in one move. The seed categories appear automatically on first open — no setup screen to explain. |
| 0:10–0:20 | Press **My Recipes**; the cards appear with their fit lines ("You have 5/6 · Missing: 1") | This is the kernel — give it a full beat and let a fit line stay readable. |
| 0:20–0:40 | Open the top card: the green/red checklist and the steps; press **Cook this** | The combine animation plays, then the chips rise off the fridge **one at a time** and the fridge gets visibly shorter. Do not cut before the last chip has risen. |
| 0:40–0:52 | Press **My Recipes** again: the order has changed because the stock changed | The result beat — the engine reacting to the cook. |
| 0:52–1:00 | Close on the door as it now stands (optional: the repo URL on screen) | A still ending beat; no need to talk over it. |

**Optional second minute (only if the form allows):** a recipe that is missing something — the **Generate the shopping list** button appears (it is hidden when nothing is missing), press it, then check one item off the shopping-list card and watch it join the fridge.

## Recording mechanics

- **Serve it locally first:** in the project folder run `python3 -m http.server 8000`, then open `http://localhost:8000` (documented in the README). No deployment needed for the video.
- **Start from a clean fridge:** use a fresh browser profile, or clear site data for localhost before recording, so the demo opens on the empty-fridge state.
- **One clean window:** ~1280×900, bookmarks bar hidden, no personal tabs, no notifications, nothing else on screen. The app has no login and no credentials — nothing sensitive can leak, but keep your desktop and other windows out of the frame anyway.
- **Two takes minimum:** one for the full journey above, one close pass on the Cook this sequence (the chips rising one by one are easier to see up close). Cut them together if you like.
- **Check before uploading:** play it back once with the sound off — the fit line, the chips, and the shorter fridge should all be readable without audio.

## After you record

Upload it somewhere reviewers can open **without logging in** (unlisted YouTube, a public Loom, a public drive link — your choice), then verify the link in a private/incognito window. Paste the final URL into `devpost/ship-checklist.md` when it is ready.
