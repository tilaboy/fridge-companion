# Architecture decision records

One file per decision, numbered, never edited after acceptance — supersede
instead.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-stack.md) | TypeScript + Vite, no UI framework for v1 | Accepted |
| [0002](0002-storage-and-sync.md) | IndexedDB per-entity store; sync deferred past v1 | Accepted |

Template for the next one:

```markdown
# ADR-00NN: <decision in one line>

- **Status:** Proposed | Accepted | Superseded by ADR-00MM
- **Date:** YYYY-MM-DD
- **Resolves:** <roadmap section / open question>

## Context
## Decision
## Consequences
## Alternatives rejected
```
