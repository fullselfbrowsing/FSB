# Phase 36: Codegen Pipeline + No-Dead-Entry Resolution - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 2 areas, all recommended answers accepted

<domain>
## Phase Boundary

Build the build-time descriptor import pipeline AND the load-bearing "no dead descriptor"
resolution so that the moment descriptors land they are both **safe** (side-effect class
cross-checked, escalate-to-write on disagreement) and **invocable** (every searchable slug
resolves to a non-null tier). The pipeline + quality gates must exist BEFORE any real content
import (Phases 37-39). Gated on the Phase-35 classification gate (`classifyGate()`) — no
origin emits a descriptor unless it is denylist-classified.

**In scope:** `scripts/import-opentabs-catalog.mjs` (tsx, build-time); side-effect inference
(verb-map + override table + GraphQL/RPC carve-out); `verify-catalog-crosscheck.mjs` (chained
into `validate:extension`); the `capability-catalog.js resolve()` no-dead-entry fallback
branch; the searchable-slug → non-null-tier harness; `package-extension.mjs` inlining via the
existing `readJsonDir` path; a ONE-category smoke proof (eval harness re-pass + SW cold-start).

**Out of scope (later phases):** the actual full breadth import of all real OpenTabs apps —
Phases 37 (BRDTH-01/02/03), 38, 39 reuse this pipeline batch by batch. Depth hand-ports → 40-41.
Discovery seeding → 42.
</domain>

<decisions>
## Implementation Decisions

### Area 1 — Pipeline scope & extraction
- **Phase-36 scope:** the pipeline + cross-check + no-dead-entry resolve + ONE non-sensitive
  smoke category proof (a dev/productivity app). The full 2,523-descriptor breadth import is
  Phases 37-39 (BRDTH owns it) — Phase 36 proves the machinery, not the content.
- **zod→params flattening:** permissive `z.toJSONSchema` — `z.union`→`anyOf`, `z.record`/
  `z.enum` handled, optional fields preserved — while preserving the closed-vocab params
  contract. The forbidden-field-name pre-scan (script/expr/transform/code/fn/js) is the Wall-1
  guard that rejects any emitted descriptor containing an eval-able field name.
- **Provenance:** each emitted descriptor carries the OpenTabs commit SHA
  `4b17021637d2cac12b8d84d21c40e765aa7b85e9` + its source path. Descriptors emit FLAT into
  `catalog/descriptors/` as `opentabs__<service>__<op>.json` — `opentabs/` is a LOGICAL
  namespace (filename prefix + `provenance.source`), NOT a physical subdir, because
  `readJsonDir` is non-recursive and would silently drop a subdir (research A1; the provenance
  intent is fully preserved).
- **Runtime (Wall 1):** the importer runs under `tsx` at BUILD time only. NO runtime
  dependency on OpenTabs / `@opentabs-dev/plugin-sdk` / `zod` is shipped into the extension —
  the extension ships pure-data descriptors. `verify-recipe-path-guard.mjs` stays green.

### Area 2 — Safety gates & no-dead-entry resolve()
- **Side-effect inference:** transport verb-map — `apiGet`→read; `apiPost`/`apiPut`/`apiPatch`
  →write; `apiDelete`→destructive — PLUS an override table for known-destructive POSTs
  (`void_invoice`, `delete_customer` → destructive) and a GraphQL/RPC carve-out so POST
  mutations are NEVER classed `read`.
- **Cross-check failure mode:** `verify-catalog-crosscheck.mjs` compares the descriptor's
  declared side-effect class against the derived class; on disagreement it is **fail-safe-high**
  (escalate to write/destructive) and the gate FAILS the build when a descriptor UNDER-states a
  destructive op. Chained into `validate:extension` (→ `ci`). Proven by a destructive-op sample
  test (`void_invoice`, `delete_customer` class `destructive`; a GraphQL/RPC POST never `read`).
- **resolve() no-dead-entry fallback:** `capability-catalog.js resolve()` gains a SINGLE
  fallback branch — a descriptor-only slug (no bundled handler, no recipe) resolves to **T3
  (DOM)** by default, or **T2 (learn-pending)** when the origin is seeded for discovery. A
  harness assertion proves every slug `search_capabilities` can return resolves to a non-null
  tier, so `invoke` NEVER returns `RECIPE_NOT_FOUND` for a searchable slug.
- **Integration invariants:** the generated catalog is inlined by `package-extension.mjs` via
  the EXISTING `readJsonDir` path with a stable `catalogVersion`; the generated
  `recipe-index.generated.js` IIFE shape and djb2 hashing are UNCHANGED (INV-01). The
  `resolve()` branch is the only load-bearing runtime edit.

### Claude's Discretion
- The exact zod edge-case handling (`z.union`/`z.record`/`z.enum`/`z.lazy`) — researcher to nail.
- The precise override-table membership + the GraphQL/RPC detection mechanism.
- The chosen smoke category + the eval-harness fixture shape + the concrete SW cold-start budget.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets / Integration Seams (read live on branch `automation`)
- `scripts/verify-classification-gate.mjs` — Phase 35's `classifyGate(items, opts)` dual-export;
  the importer MUST call it before emitting any descriptor JSON (the denylist-first gate).
- `extension/utils/capability-catalog.js` — `resolve()` / `REGISTRY` / `HEAD_HANDLER_MODULES` /
  `seedHeadHandlers` / `registerHandler`. `resolve()` currently returns null for any non-REGISTRY
  slug — THE load-bearing change is the descriptor-only fallback branch.
- `extension/utils/capability-search.js` — `buildIndex` / `catalogVersion` (search indexes ALL
  descriptors; without the resolve() fallback they are searchable-but-uninvocable).
- `scripts/package-extension.mjs` — `readJsonDir` + the generated `recipe-index.generated.js`
  IIFE (djb2). The catalog inlining path; keep the IIFE/hash shape unchanged (INV-01).
- `catalog/handlers/github.js` — the T1a hand-port shape (reference; depth is Phases 40-41).
- `vendor/opentabs-snapshot/PIN.md` + `_provenance.json` — the Phase-35 provenance scaffold the
  importer stamps from. OpenTabs source: `github.com/opentabs-dev/opentabs` (MIT, SHA pinned).
- `scripts/verify-recipe-path-guard.mjs` — the Wall-1 guard that must stay green.

### Established Patterns
- Closed-vocab descriptor JSON as DATA; build-time codegen only; `node`/`tsx` scripts.
- Standalone node test scripts (`node tests/<name>.test.js`, PASS=/FAIL=, exit 1 on fail).
- Verify scripts chained into `validate:extension` (→ `ci`, → `npm test`).

### Integration Points
- The importer consumes the OpenTabs pinned snapshot metadata + calls `classifyGate()` (Phase 35).
- The cross-check gate joins `verify-classification-gate.mjs` + `verify-recipe-path-guard.mjs` in
  `validate:extension`.
- `resolve()` is consumed by `capability-router.invoke()` (both front doors, INV-02).
</code_context>

<specifics>
## Specific Ideas

- The two headline risks (from research): (a) **discoverable-but-uninvocable dead descriptors** —
  search indexes all, but resolve() returns null for non-REGISTRY slugs → the resolve() fallback
  is the fix; (b) **side-effect mis-classification at scale** — GraphQL/RPC POST mutations
  mislabeled read → fully writable with no friction → the verb-map + carve-out + fail-safe-high
  cross-check is the fix. Sample-test `void_invoice` / `delete_customer`.
- The pipeline must decouple **discoverable** from **invocable**: never auto-mint a recipe from
  guessed auth; descriptor-only → T3/T2 (learn/DOM), never a fabricated API call.
- Keep the head capped (CI assertion on `HEAD_HANDLER_MODULES`) — breadth is descriptors-only.
</specifics>

<deferred>
## Deferred Ideas

- Full breadth import of all real OpenTabs apps → Phases 37 (BRDTH-01/02/03), 38, 39.
- Depth hand-ports (T1a/T1b handlers) → Phases 40-41.
- Discovery seeding + tail learn → Phase 42.
- Catalog-scale performance hardening + the milestone full-test gate → Phase 43.
</deferred>
