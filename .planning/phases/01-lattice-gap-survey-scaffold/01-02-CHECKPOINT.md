---
phase: 01
plan: 01-02
status: paused_for_manual_check
paused_at: 2026-05-24
checkpoint_type: human-verify
remaining_tasks: [4, 5]
---

# Plan 01-02 — Paused at Task 4 (manual MV3 sanity reload)

## State at pause

**Tasks 1-3 complete and committed.** Wave 2 is partially executed.

### Lattice commits (`./lattice/`, `fsb-integration-experiments`, NOT pushed)

| SHA | Message |
|-----|---------|
| `22bf986` | chore(packaging): resolve pnpm catalog: literals for npm consumers |
| `195e5ae` | docs(fsb-integration): add FSB integration gap survey across 6 surfaces (Plan 01-01) |
| `ab6c1f6` | feat(receipts): re-export createReceipt + CreateReceiptInput (Plan 01-01) |

All three carry `Ref: FSB v0.10.0-attempt-2 Phase 1` footer. `git reflog | grep -c push` returns 0 (D-15 holds).

### FSB commits (`automation` branch)

| SHA | Message |
|-----|---------|
| `be95d158` | docs(01-02): add .planning/LATTICE-PIN.md cross-repo audit trail |
| `1545c14c` | test(01-02): add Lattice round-trip smoke (mint + verify Capability Receipt) |
| `658ed87e` | feat(01-02): add Lattice file dep + smoke entry in test chain |

### Verification gates (all PASS at pause time)

- `node tests/lattice-smoke.test.js` exits 0 (29/29 PASS)
- `npm test` (full chain) exits 0 (3787 PASS, 0 FAIL)
- `node tests/tool-definitions-parity.test.js` (INV-01) PASS (142/142)
- `grep -c "setTimeout" extension/ai/agent-loop.js` (INV-04) returns 8
- Zero `extension/*` files modified
- `cd lattice && git rev-parse fsb-integration-experiments` matches `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt` (`22bf98627ae86b1576db5d34cf447ab2b321b3e1`)
- `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha` matches Lattice HEAD
- Smoke uses ephemeral `generateEd25519KeyPairJwk()` (no committed key material)
- Smoke invokes real-runtime `createReceipt(` + `verifyReceipt(`

### Uncommitted in-tree changes

- `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt` modified (updated to the new Lattice HEAD `22bf98627ae86b1576db5d34cf447ab2b321b3e1` after the catalog-fix commit). Staged for fold into Task 5's wrap-up commit; not committed in isolation.

### Catalog-fix architectural decision (already user-approved)

- User selected **Option 1**: resolve Lattice's pnpm `catalog:` deps to concrete versions on Lattice's side as a second Lattice commit.
- Substitutions applied (6 specifiers, sourced from `lattice/pnpm-workspace.yaml`):
  - `@standard-schema/spec: catalog:` -> literal
  - `canonicalize: catalog:` -> literal
  - `mime: catalog:` -> literal
  - `@noble/ed25519: catalog:` -> literal
  - `@types/node: catalog:` -> literal
  - `zod: catalog:` -> literal
- Lattice's pnpm workflow continues to work (pnpm uses literals in place of catalog lookups for these six entries).
- D-13's NARROWED form is expanded to allow this packaging fix as the second Lattice-side change (user-authorized).

### Three pre-existing baseline `node_modules` installs

These are NOT Phase 1 changes; they are local environment setup blockers that surfaced during the existing test chain's run. Documented here so the SUMMARY captures them:

1. `npm --prefix mcp install` (resolved `tsc` to local TypeScript 5.9.3 instead of global 5.1.6 which rejected `with { type: 'json' }` import attributes in `mcp/src/tools/pricing.ts:39`)
2. `npm --prefix showcase/server install` (resolved `better-sqlite3` for `tests/server-telemetry-salt-rotation.test.js`)
3. `npm --prefix showcase/angular install` (resolved `@angular/build:application` for `tests/showcase-build-smoke.test.js`)

All three are pre-existing baseline conditions, verified at HEAD~2 before Plan 01-02's commits.

## What remains

### Task 4: Manual MV3 sanity reload (human-verify checkpoint)

**Pass-criteria (all five must hold):**

a. SW reloads cleanly: no NEW red "Errors" badge on the FSB card in `chrome://extensions`.
b. SW console shows no NEW errors mentioning `lattice`, `import`, `ERR_MODULE_NOT_FOUND`, `node_modules`, `package.json`. (Pre-existing errors are acceptable -- Phase 1 isn't responsible for them.)
c. Popup opens normally when the toolbar icon is clicked.
d. Sidepanel opens normally via its standard entry point.
e. One short autopilot iteration on a benign page completes at least one step (INV-04 sanity).

**Evidence to capture for SUMMARY:**

- Reload timestamp (wall-clock).
- PASS / FAIL for each of a, b, c, d, e.
- One-line summary of any pre-existing console errors that remained post-reload.
- Screenshot path or console-log excerpt showing no NEW errors.

### Task 5: Wrap-up commit

After Task 4 passes, the resumed executor will:

1. Stage `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt` (the updated Lattice HEAD tracker).
2. Create `.planning/phases/01-lattice-gap-survey-scaffold/01-02-SUMMARY.md` capturing all evidence (commits, smoke output, INV-01/04 confirmations, the manual reload evidence).
3. Update STATE.md / ROADMAP.md / REQUIREMENTS.md via gsd-tools.
4. Create the final metadata commit covering SUMMARY.md, STATE.md, ROADMAP.md, REQUIREMENTS.md, and the SHA-tracker update.
5. Return `## PLAN COMPLETE`.

## How to resume

When you are ready to perform the manual MV3 sanity reload:

1. Open `chrome://extensions`, perform the five-step procedure from Task 4 above.
2. Re-run `/gsd-execute-phase 1` -- the orchestrator detects Plan 01-02 has no SUMMARY.md, spawns a fresh continuation executor, which reads this CHECKPOINT.md, verifies Tasks 1-3 are still intact + gates still pass, asks you to confirm the MV3 reload result, then executes Task 5 if you approve.
3. Alternatively, message me directly with `approved` (plus the evidence requested above) or `failed: <description>` and I will spawn the continuation manually.

## Files referenced

- `.planning/phases/01-lattice-gap-survey-scaffold/01-02-PLAN.md` (the plan)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-CONTEXT.md` (decisions + reconciliation block)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-RESEARCH.md` (smoke skeleton + pitfalls)
- `.planning/LATTICE-PIN.md` (cross-repo audit trail; references all three Lattice commits)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt` (updated to `22bf98627ae86b1576db5d34cf447ab2b321b3e1` -- staged for Task 5 fold-in commit)
