# ADR-001: TypeScript + Vite, no UI framework for v1

- **Status:** Accepted
- **Date:** 2026-10-22
- **Resolves:** roadmap §6 "ADR-001 — framework or vanilla?" and the
  "Framework or vanilla?" row in §11.
- **Supersedes:** the open question only. The POC's no-framework choice stands.

## Context

The POC is one 1,400-line `app.js` in plain ES5, split into pure logic, store,
and UI, with four node harnesses that load it directly. That structure is the
most valuable thing in the POC: the kernel is testable without a browser and
without a build step.

Production adds a v2 schema, import validation, migrations, focus-managed
dialogs, a PWA shell, and — later and maybe never — accounts. The open
question was whether that justifies a framework and/or TypeScript.

## Decision

1. **TypeScript, strict, starting at the module split.** The v2 data model is
   the crux of this project; types are the cheapest way to keep every layer
   honest about it. No `any` at module boundaries.
2. **Vite** for dev server and build. Output stays a plain static site that can
   be hosted on GitHub Pages, Netlify, or Cloudflare Pages with no server.
3. **No UI framework for v1.** Keep the render-function style, but use native
   `<dialog>` for the recipe view and amount prompt so focus trapping, Escape,
   and the top layer come from the platform instead of hand-written code.
4. **zod at the edges only** — imported files, storage reads, and migrations.
   The domain layer takes typed values, not `unknown`.
5. **Vitest** for unit tests (the harnesses are ported, not rewritten), and
   **one Playwright smoke test** (load → add → reload → export) in M0. The full
   e2e + axe suite stays in M4.
6. **Migration path:** M0 keeps the current plain-JS files and adds CI. The
   `src/domain` split in M1 introduces TypeScript incrementally with `allowJs`
   + `checkJs`, so the kernel is typed before the UI is.

## Implementation note (2026-10-23)

The split landed in two slices: the kernel was extracted into strict TypeScript
and proved identical to v1 with a temporary parity suite; then the UI was moved
onto it as an ES module, Vite took over the build, and Pages started publishing
`dist/` instead of the repo root. The six node harnesses were ported into
Vitest before deletion, so no coverage was dropped.

Two parts of decision 6 are deliberately still open: the UI is `src/app.js` (an
ES module, untyped) rather than `checkJs`-checked TypeScript, and the parity
suite is gone now that there is only one implementation. Typing the UI, adding
zod at the edges, and the Playwright smoke test remain follow-ups inside M1/M4.

## Consequences

- The data model becomes executable documentation; import validation and
  migration share the same schema definitions.
- A build step appears, so deployment publishes an artifact rather than the
  repo root. That is acceptable: the PWA needs a build for asset hashing
  anyway.
- Hand-rolled rendering needs discipline. Mitigation: one `renderAll()` entry
  point, no direct DOM writes outside render functions, and the Playwright
  smoke test as a backstop.
- Vanilla ES5 style is not carried forward — new code is TS/ES2022 modules.
  The old files are deleted as each slice is ported, not left to rot.
- Revisit if M3 (accounts, live shared lists) is actually funded. Svelte earns
  its keep when the UI needs fine-grained reactivity over shared state; until
  then it is compiler overhead for one screen.

## Alternatives rejected

- **Svelte / Preact now.** Defensible, but the hard parts here are data
  modeling, storage, and content — not view reactivity. Adopting a framework
  now would also put the pure kernel behind a compiler.
- **Plain JS + JSDoc types.** Closer to the POC, but weaker refactoring and no
  runtime validation story; zod + TS gives both from one source.
- **Next.js / SSR.** Nothing here needs a server, and local-first forbids
  making one a prerequisite.
