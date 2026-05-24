---
current_lattice_sha: 22bf98627ae86b1576db5d34cf447ab2b321b3e1
current_branch: fsb-integration-experiments
last_updated: 2026-05-24
schema_version: 1
---

# Lattice Pin -- FSB <-> Lattice Cross-Repo Audit Trail

This file is the SINGLE FSB-side index of work FSB has produced on the Lattice repo at `./lattice/` during the v0.10.0-attempt-2 milestone. Per CONTEXT.md D-16 there are no per-phase `XX-LATTICE-WORK.md` files; Lattice commit messages self-document via the `Ref: FSB v0.10.0-attempt-2 Phase N` footer convention (D-14).

**Lattice repo location (local, gitignored):** `./lattice/`
**Lattice branch in use:** `fsb-integration-experiments`
**Lattice baseline:** v1.1 Capability Receipts (451 tests; cloned from https://github.com/LakshmanTurlapati/Lattice)
**Current pinned SHA:** `22bf986` (full SHA in frontmatter)
**Mainline PR cadence:** Deferred to v0.11.0+ per CONTEXT.md D-15. All FSB-driven Lattice work stays on the experiment branch for this milestone.

## Per-FSB-Phase Log

Each row records one FSB phase's Lattice-side commits. The `Lattice SHA` column points at Lattice's HEAD AFTER the phase's Lattice commits landed (so the row's SHA is what FSB depends on once the phase is complete). The `Lattice work touched` column summarizes what was added/modified -- the authoritative narrative is in the Lattice commit bodies themselves (each tagged `Ref: FSB v0.10.0-attempt-2 Phase N`).

| FSB Phase | Date       | Lattice SHA                                 | Branch                          | Lattice work touched                                                                                              | Notes                                                                                                                                                                              |
|-----------|------------|---------------------------------------------|---------------------------------|-------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Phase 1   | 2026-05-24 | `22bf98627ae86b1576db5d34cf447ab2b321b3e1` | `fsb-integration-experiments`   | (1) `packages/lattice/src/index.ts` -- one-line re-export of `createReceipt` + `type CreateReceiptInput` (Plan 01-01, commit `ab6c1f6`). (2) `docs/fsb-integration-gaps.md` -- new 6-surface audit doc (Plan 01-01, commit `195e5ae`). (3) `packages/lattice/package.json` + `pnpm-lock.yaml` -- resolve pnpm `catalog:` specifiers to concrete versions so npm 11 can install the package via `file:` (Plan 01-02 ceremony, commit `22bf986`). | Phase 1 = audit + scaffolding. The catalog-fix is the surfaced packaging tweak D-13 permits; npm 11 rejects `catalog:` at parse time, and FSB consumes via `file:./lattice/packages/lattice`. The audit doc is the queue driver for Phase 2+. |

## How this file gets used

- **At plan-time:** When FSB plans a new phase, the planner reads `current_lattice_sha` + `current_branch` to ground "what Lattice surface FSB depends on right now."
- **At execute-time:** When a phase touches Lattice, the executor records the resulting Lattice HEAD SHA in this file via a new row + updates the `current_lattice_sha` frontmatter field. The commit ceremony lands the PIN.md update in the same FSB commit as the rest of the phase's FSB-side changes.
- **At verify-time:** Phase verifiers cross-check `current_lattice_sha` against the actual `cd lattice && git rev-parse fsb-integration-experiments` to confirm no drift. The smoke test (or successor SDK tests) MUST pass against the pinned SHA.

## Schema notes

- `current_lattice_sha`: 40-char hex; advances per FSB phase that touches Lattice.
- `current_branch`: fixed at `fsb-integration-experiments` for the v0.10.0-attempt-2 milestone (per D-15 -- no mainline PRs).
- Per-phase rows are append-only; closed phases are not edited retroactively.
- `Lattice work touched` cells are summary-form; the source of truth is the Lattice commit body (grep for `Ref: FSB v0.10.0-attempt-2 Phase N` inside `cd lattice && git log` to find a phase's commits).
