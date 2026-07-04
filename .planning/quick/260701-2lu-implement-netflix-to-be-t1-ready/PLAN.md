---
quick_id: 260701-2lu
slug: implement-netflix-to-be-t1-ready
status: complete
---

# Implement Netflix to be T1 Ready

## Scope

Netflix is in the DENY-01 ToS-hostile media roster, so the correct T1 terminal state is not a live handler or guarded write. The current policy contract requires every Netflix descriptor to stay non-invocable as `blocked` with `originClass: denied` until an explicit product/legal policy change.

## Implementation

1. Verify the existing runtime readiness model classifies all 18 Netflix descriptors as blocked-policy rows.
2. Add focused gates proving Netflix cannot be accidentally promoted to executable T1 while denylisted.
3. Record the quick task as complete with working-tree commit status because this Conductor workspace has unrelated parallel app-target edits.

## Verification

- `node tests/t1-readiness-report.test.js`
- `node tests/t1-tail-worklist.test.js`
- `node tests/t1-terminal-states.test.js`
