# ADR-002: IndexedDB behind an entity store; sync deferred past v1

- **Status:** Accepted
- **Date:** 2026-10-22
- **Resolves:** roadmap §6 "ADR-002 — storage" and the durability gap in §3.1.
- **Amends:** roadmap §8 M3 (accounts and sync) → v1.1, not v1.

## Context

Today the kitchen is one `localStorage` key (`fdc-state-v1`) holding one
versioned object. `saveState()` returns `false` on quota or blocked storage and
the UI ignores it. There is no export, no cross-tab handling, and no backup.

Two facts drive this decision:

1. **Silent eviction is worse than a full disk.** Safari caps script-writable
   storage for non-installed sites and can evict it without telling anyone.
   A `false` from `setItem` cannot detect that. "Never lose a kitchen" is
   therefore not satisfiable on `localStorage`, regardless of data size.
2. **The `loadState`/`saveState` seam cannot carry sync.** Whole-object
   last-write-wins is the wrong primitive for two devices, two tabs, or undo.
   If sync is even a possibility, the persistence seam has to be per-entity.

## Decision

1. **IndexedDB is the primary store**, behind a small adapter (`src/store`),
   with **one object store per entity type**: `categories`, `stockLots`,
   `shoppingList`, `cookHistory`, `settings`, `meta`. State is a projection
   built at boot.
2. **Every entity record carries `updatedAt` (ms).** Lot and cook-event records
   also carry a UUID `id`. This is the hook for per-entity conflict resolution,
   cross-tab merge, and inverse-op undo later.
3. **Request persistence.** Call `navigator.storage.persist()` after the first
   successful write, and show the result (`persisted` / `best-effort`) in the
   data panel. Do not block the app on the answer.
4. **Fallback chain: IDB → localStorage snapshot (`fdc-state-v2`) → memory.**
   Every step down the chain raises a persistent banner. No write ever fails
   silently: `persist()` returns a result and the UI reports it.
5. **Export is the backup of record.** A versioned JSON envelope
   (`app`, `format`, `schemaVersion`, `exportedAt`, `state`) is always one
   click away. Import validates, refuses newer schemas explicitly, and
   sanitizes before applying.
6. **Cross-tab sync** via `BroadcastChannel` (with a `storage`-event fallback),
   per-entity last-write-wins on `updatedAt`.
7. **Accounts and multi-device sync are out of scope for v1.** Household
   sharing ships as "export a kitchen file, send it, import it", which needs no
   account and no server. Revisit M3 only after v1 has users and evidence.
8. **Undo is scoped, not a time machine.** A bounded in-memory snapshot ring
   plus inverse operations for cook/restock. Nothing unbounded is persisted.
9. **Legacy reads:** read `fdc-state-v1` once, migrate to v2, write v2. Keep
   the v1 read path for one release, covered by round-trip tests.

## Consequences

- Storage access becomes async, so boot is `await load()` → project → render.
  The kernel stays pure; only the adapter touches IDB.
- ~150 more lines than `JSON.stringify`, plus migration tests. Cheap against
  the cost of one silently lost kitchen.
- Undo and cross-tab merge become possible without redesigning storage.
- IDB is harder to inspect by hand. Mitigation: the data panel's export is also
  the debugging tool, plus a `meta` record with the app/schema version.
- Sync remains a real M3 cost (offline replay, conflict policy), but it is an
  *addition* to this seam rather than a rewrite of it.

## Alternatives rejected

- **Stay on localStorage.** Cannot honor principle #2 (eviction is silent), and
  forces a rewrite at the first sync or undo feature.
- **One IDB record holding the whole state.** Fixes size and eviction, but
  keeps whole-object writes and re-creates the M3 rewrite this ADR avoids.
- **Remote-first (Supabase/Firebase) now.** Contradicts local-first: it makes
  the network a prerequisite and turns a static PWA into an account product
  before there is evidence anyone wants that.
