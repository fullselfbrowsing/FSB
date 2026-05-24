---
phase: 01-lattice-gap-survey-scaffold
plan: 02
subsystem: lattice-integration
tags: [lattice, file-dep, smoke-test, capability-receipt, mv3, ed25519, scaffolding]
dependency_graph:
  requires:
    - phase: "01-lattice-gap-survey-scaffold (Plan 01-01)"
      provides: "Lattice fsb-integration-experiments HEAD with createReceipt re-export, built dist/, and 6-surface audit doc"
  provides:
    - "FSB consumes Lattice via npm file: dependency (node_modules/lattice symlink)"
    - "Real-runtime Capability Receipt round-trip smoke (mint + verify with ephemeral Ed25519 keypair)"
    - "tests/lattice-smoke.test.js appended to scripts.test chain (D-11)"
    - ".planning/LATTICE-PIN.md cross-repo audit trail (D-08, D-16, CD-06)"
    - "Lattice HEAD advanced to 22bf986 (catalog: -> literal versions packaging fix)"
  affects:
    - "Phase 2+ (Receipt + tripwire extension phases) -- the file: dep wiring + smoke harness pattern is reusable"
    - "Future in-extension Lattice load phase (bundler-aware) -- this plan deferred that prong per Option B"
tech_stack:
  added:
    - "lattice (file: dep) at ./lattice/packages/lattice -- resolves to dist/index.js"
  patterns:
    - "Dynamic ESM import from CJS test file (await import('lattice')) -- the Node-side bridge from FSB's CJS test convention into Lattice's ESM-only surface"
    - "Ephemeral Ed25519 keypair per smoke run (no committed key material) -- generateEd25519KeyPairJwk + createInMemorySigner"
    - "Cross-repo audit trail via .planning/LATTICE-PIN.md (single FSB-side index; D-16 replaces per-phase XX-LATTICE-WORK.md)"
    - "git add -f for .planning/ files (gitignored, force-added for SUMMARY/STATE commits)"
key_files:
  created:
    - "tests/lattice-smoke.test.js (175 lines; 29-assertion mint+verify round-trip)"
    - ".planning/LATTICE-PIN.md (37 lines; frontmatter + per-phase markdown table)"
    - ".planning/phases/01-lattice-gap-survey-scaffold/01-02-CHECKPOINT.md (116 lines; pause-state capture for Task 4 deferral)"
    - ".planning/phases/01-lattice-gap-survey-scaffold/01-02-SUMMARY.md (this file)"
  modified:
    - "package.json (+lattice file: dep, +smoke test in test chain)"
    - "package-lock.json (regenerated for file: dep)"
    - ".planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt (updated to post-catalog-fix Lattice HEAD 22bf986)"
key_decisions:
  - "Task 4 deferred to milestone-end UAT (user directive: 'continue all phases with GSD autonomous; UAT will be at the end')"
  - "Lattice catalog-fix landed as 2nd Lattice commit (22bf986) -- D-13 NARROWED form expanded once, user-authorized, to enable npm 11 file: install (the only architectural amendment)"
  - "Three baseline npm installs (mcp, showcase/server, showcase/angular) noted as pre-existing environment setup, not Phase 1 changes"
patterns_established:
  - "Lattice-side ceremony: conventional commits + Ref: FSB v0.10.0-attempt-2 Phase N footer; no remote push (D-14, D-15)"
  - "Smoke uses real-runtime invocation (typeof checks + actual createReceipt/verifyReceipt calls + result.ok assertions) -- not static-text grep stubs"
  - "Cross-repo SHA sync verified at both pin-write time and post-commit (PIN.md frontmatter == cd lattice && git rev-parse fsb-integration-experiments)"
requirements_completed:
  - "D-05 (path: dependency to lattice/packages/lattice via file: spec)"
  - "D-07 (developer ceremony documented; no postinstall coupling)"
  - "D-08 (.planning/LATTICE-PIN.md as the cross-repo audit trail)"
  - "D-09 AMENDED (smoke contexts = Node-side test only; manual MV3 prong downgraded per Option B)"
  - "D-10 (mint one Capability Receipt via Lattice's existing v1.1 surface)"
  - "D-11 (smoke ownership FSB-side; follows node tests/foo.test.js convention; added to npm test chain)"
  - "D-12 #2 (Node smoke check -- the substantive proof of FSB <-> Lattice round-trip)"
  - "D-12 #3 AMENDED (manual MV3 sanity reload -- DEFERRED to milestone UAT per user directive)"
  - "D-16 (LATTICE-PIN.md as single FSB-side cross-repo index; no per-phase XX-LATTICE-WORK.md files)"
  - "CD-06 RESOLVED (LATTICE-PIN.md uses markdown-table schema with frontmatter for current SHA)"
  - "FINT (FSB Integration Layer) -- path:dep wiring + smoke test"
  - "MCP (Wire-Contract Non-Regression) -- INV-01 holds via tool-definitions-parity.test.js continuing to pass byte-identically with smoke added to chain"
  - "INV-01 (MCP wire contracts UNTOUCHED -- 142/142 PASS)"
  - "INV-04 (MV3-survivability iterator preserved -- agent-loop.js setTimeout count=8 unchanged)"
  - "INV-06 (Lattice SDK primitives live in Lattice's repo; FSB code is integration glue only)"
metrics:
  duration_seconds: 20094
  tasks_completed: 4
  tasks_deferred: 1
  files_created: 4
  files_modified: 3
  fsb_commits: 5
  lattice_commits: 1
  completed_date: "2026-05-24"
---

# Phase 01 Plan 01-02: FSB-side path:dep + smoke test Summary

**FSB wires Lattice as an npm `file:` dependency, lands a real-runtime 29-assertion Capability Receipt mint+verify round-trip with an ephemeral Ed25519 keypair, and records the cross-repo audit trail at `.planning/LATTICE-PIN.md` -- closing D-12 #2 (Node smoke green) for Phase 1 with Task 4 (manual MV3 sanity reload) explicitly DEFERRED to milestone UAT per the user's autonomous-continuation directive.**

## Performance

- **Duration:** ~5h 35m wall-clock (Task 1 commit 2026-05-24T11:21:11Z -> Task 4 pause-commit 2026-05-24T16:56:06Z); active executor time was substantially shorter (the long wall-clock is the gap to the pause + the autonomous continuation)
- **Started:** 2026-05-24T11:21:11Z (FSB Task 1 commit `658ed87e`)
- **Completed:** 2026-05-24T17:10:22Z (Task 5 wrap-up commit, this SUMMARY)
- **Tasks completed:** 4 of 5 (Tasks 1, 2, 3, 5; Task 4 deferred-pending-UAT per user directive)
- **Tasks deferred:** 1 (Task 4 -- manual MV3 sanity reload deferred to milestone UAT)
- **Files modified/created on FSB side:** 3 modified, 4 created
- **Lattice commits this plan:** 1 (the catalog-fix at `22bf986`; Plan 01-01 produced the other two)
- **FSB commits this plan:** 5 (Task 1, Task 2, Task 3, pause-record, wrap-up Task 5)

## Accomplishments

- FSB now consumes Lattice end-to-end via the npm `file:` mechanism. `node_modules/lattice` is a working symlink into `./lattice/packages/lattice/`; `await import('lattice')` from the FSB test process resolves to the built `dist/index.js`.
- The smoke is the first real exercise of FSB <-> Lattice in this milestone: it generates a fresh Ed25519 keypair per run, mints one Capability Receipt via `lattice.createReceipt(...)`, asserts the DSSE-shaped envelope (`payloadType`, `payload`, `signatures[0].keyid/sig`), verifies the envelope round-trips through `lattice.verifyReceipt(envelope, keySet)` with `result.ok === true`, and adds a negative round-trip with a wrong public key that returns `result.ok === false` with `error.kind === "signature-invalid"`. 29 PASS assertions, 0 FAIL.
- `npm test` exits 0 with the smoke appended at the end of the long `&&` chain. INV-01 (`tool-definitions-parity.test.js` -- 142/142 PASS) and the entire ~144-test chain continue to pass byte-identically.
- The cross-repo audit trail (`.planning/LATTICE-PIN.md`) is the single FSB-side index of "what FSB has done to Lattice" in this milestone. Frontmatter records the current pinned Lattice SHA (`22bf98627ae86b1576db5d34cf447ab2b321b3e1`) and branch (`fsb-integration-experiments`); the per-phase markdown table records Phase 1's three Lattice commits with summaries.
- Phase 1's reconciliation block (Option B) is honored: zero `extension/*` modifications, no `manifest.json` change, no `extension/lattice-bridge.js` created, no in-extension Lattice import in any context.

## Task Commits

Each task was committed atomically on FSB's `automation` branch:

1. **Task 1: Add Lattice file: dep + smoke entry in test chain** -- `658ed87e` (`feat`) -- modifies `package.json` + `package-lock.json` (npm 11 file: spec verified; node_modules/lattice resolves; createReceipt/verifyReceipt/createInMemorySigner/generateEd25519KeyPairJwk/createMemoryKeySet all reachable via bare specifier)
2. **Task 2: Add Lattice round-trip smoke** -- `1545c14c` (`test`) -- adds `tests/lattice-smoke.test.js` (175 lines, 29 assertions, ephemeral Ed25519 per run)
3. **Task 3: Add .planning/LATTICE-PIN.md cross-repo audit trail** -- `be95d158` (`docs`) -- adds `.planning/LATTICE-PIN.md` (37 lines, frontmatter + Phase 1 row) and updates `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt` to the post-catalog-fix Lattice HEAD
4. **Task 4: Manual MV3 sanity reload check** -- DEFERRED to milestone UAT (see Deviations + User-Verification Procedure below)
5. **Pause/state record** -- `e3cd7fb5` (`docs`) -- captures the Task 4 pause state to `.planning/phases/01-lattice-gap-survey-scaffold/01-02-CHECKPOINT.md` (116 lines)
6. **Task 5: Wrap-up commit (this SUMMARY + STATE/ROADMAP/REQUIREMENTS updates)** -- captured separately in the metadata commit closing this plan

Lattice-side commit landed by this plan (in `./lattice/`, on `fsb-integration-experiments`, NOT pushed):

| SHA | Message | Files |
|-----|---------|-------|
| `22bf986` | `chore(packaging): resolve pnpm catalog: literals for npm consumers` | `packages/lattice/package.json` + `pnpm-lock.yaml` |

The other two Lattice commits (`195e5ae` audit doc, `ab6c1f6` createReceipt re-export) landed in Plan 01-01.

## Files Created/Modified

### Created

- `tests/lattice-smoke.test.js` (175 lines) -- real-runtime mint + verify round-trip smoke (29 assertions, ephemeral Ed25519 keypair per run, follows FSB's CJS test convention)
- `.planning/LATTICE-PIN.md` (37 lines, gitignored, `-f`-added) -- cross-repo audit trail with frontmatter (`current_lattice_sha: 22bf98627ae86b1576db5d34cf447ab2b321b3e1`, `current_branch: fsb-integration-experiments`, `schema_version: 1`) + Phase 1 row in the per-phase markdown table
- `.planning/phases/01-lattice-gap-survey-scaffold/01-02-CHECKPOINT.md` (116 lines, gitignored, `-f`-added) -- pause-state capture documenting commits-to-date, gate verification, and what remains
- `.planning/phases/01-lattice-gap-survey-scaffold/01-02-SUMMARY.md` (this file)

### Modified

- `package.json` (+5/-2) -- added `"lattice": "file:./lattice/packages/lattice"` to `dependencies` (line 81); appended `&& node tests/lattice-smoke.test.js` to `scripts.test`
- `package-lock.json` (+97/-2) -- npm 11 regenerated for the file: dep resolution
- `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt` (40-char SHA file) -- updated from `195e5ae5...` to `22bf9862...` after the catalog-fix Lattice commit

### Lattice-side modified (in `./lattice/`, on `fsb-integration-experiments`, NOT pushed)

- `lattice/packages/lattice/package.json` -- 6 catalog specifiers resolved to literal versions (see Architectural Decision below)
- `lattice/pnpm-lock.yaml` -- regenerated against literal versions (same resolved package set, no transitive drift)

## Verification Gates

### Wave 2 (Plan 01-02) pass-criteria (all 5 PASS)

| Gate | Command | Result | Last verified |
|------|---------|--------|---------------|
| 1. Smoke standalone | `node tests/lattice-smoke.test.js` | exits 0 -- **29 PASS / 0 FAIL** | 2026-05-24T17:09Z (post-resume re-verification) |
| 2. Full test chain | `npm test` | exits 0 -- 3840 PASS lines (full chain + smoke; the "5 FAIL" string matches are `PASS=N FAIL=0` lines, NOT actual failures -- verified with `grep -E "FAIL=[1-9]"` returning empty and `grep -E "^FAIL"` returning empty) | 2026-05-24T17:09Z |
| 3. INV-01 (MCP wire contracts UNTOUCHED) | `node tests/tool-definitions-parity.test.js` | exits 0 -- **142 PASS / 0 FAIL** | 2026-05-24T17:09Z |
| 4. INV-04 (MV3-survivability iterator preserved) | `grep -c "setTimeout" extension/ai/agent-loop.js` | **8** (baseline preserved at the four pinned sites: `:1824/2418/2487/2497`) | 2026-05-24T17:09Z |
| 5. Zero extension modifications | `git status --porcelain extension/` | empty (no extension files modified through the plan's entire execution) | 2026-05-24T17:09Z |

### D-12 pass-criteria roll-up (Phase 1 overall)

| # | Check | Status |
|---|-------|--------|
| D-12 #1 | `lattice/docs/fsb-integration-gaps.md` exists on `fsb-integration-experiments` covering all 6 surfaces with severity tags | **CLOSED** by Plan 01-01 (`195e5ae`). Cross-checked: `cd lattice && git show fsb-integration-experiments:docs/fsb-integration-gaps.md` returns 91 lines with 6 domain headers + 21 severity-tagged rows. |
| D-12 #2 | Node smoke check (`tests/lattice-smoke.test.js` mints + verifies a Capability Receipt round-trip) | **CLOSED** by Plan 01-02 Tasks 1 + 2 + 5. Substantive proof: `lattice.createReceipt(...)` + `lattice.verifyReceipt(envelope, keySet)` invoked with `result.ok === true` asserted, plus a negative round-trip asserting `result.ok === false` + `error.kind === "signature-invalid"`. |
| D-12 #3 AMENDED | Manual MV3 sanity reload check (no NEW SW or console errors caused by Phase 1's tree additions; existing extension features still work) | **DEFERRED-PENDING-UAT** per user directive ("continue all phases with GSD autonomous; UAT will be at the end"). See "Task 4 Deferral" below for full procedure + acceptance criteria for the end-of-milestone UAT execution. |

### Cross-repo SHA sync verification

- `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha`: `22bf98627ae86b1576db5d34cf447ab2b321b3e1`
- `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt`: `22bf98627ae86b1576db5d34cf447ab2b321b3e1`
- `cd lattice && git rev-parse fsb-integration-experiments`: `22bf98627ae86b1576db5d34cf447ab2b321b3e1`
- All three references match -- no drift.

### No-push verification (D-15)

- `cd lattice && git reflog | grep -c push` returns **0**. D-15 enforcement holds: zero pushes to Lattice's remote during this plan's execution.

## Task 4 Deferral (User-Authorized -- DEFERRED-PENDING-UAT)

### User directive (verbatim)

> "continue all phases with GSD autonomous; UAT will be at the end."

The manual MV3 sanity reload (the original D-12 #3 AMENDED pass-criterion #3) is **deferred to milestone-end UAT**, NOT skipped, NOT failed. This is a recorded `human_needed` verification item, NOT a `gaps_found` failure.

### Deferral rationale

The MV3 reload is a sanity check that introduces no regression risk if deferred at this stage of Phase 1, because:

1. **Zero `extension/*` files were modified during this plan.** `git status --porcelain extension/` is empty across all five task gates; the same is true for `mcp/`. The extension's MV3 service worker, popup, sidepanel, content scripts, manifest, and agent-loop iterator are byte-identical to their pre-Phase-1 state.
2. **Phase 1 made NO in-extension Lattice import.** Per the reconciliation block's Option B, no `import 'lattice'` was added anywhere in `extension/`, no `extension/lattice-bridge.js` was created, no `"type": "module"` was added to `extension/manifest.json`. The extension load surface is untouched.
3. **The tree additions Phase 1 made (`tests/lattice-smoke.test.js`, the `lattice` dependency line in `package.json`, `node_modules/lattice` symlink, `.planning/LATTICE-PIN.md`) are NOT loaded by the extension.** They are reachable only from FSB's Node test process. The Chrome runtime never reaches them.

Conclusion: deferring the MV3 reload to milestone UAT preserves the verification's intent (catch any extension regression before milestone close) without blocking autonomous Phase 1 closure on a manual prompt. If the UAT reload surfaces a NEW regression, the milestone gate catches it and the offending plan is identified by the file-touch diff.

### UAT procedure (5 assertions; user runs this at end-of-milestone)

This is the exact procedure to run when the user executes the milestone-end UAT for Phase 1. Captured here so it surfaces in the milestone's HUMAN-UAT audit:

1. **Open `chrome://extensions`** in Chrome (or Brave / Edge / Chromium). Confirm Developer mode is enabled (top-right toggle).
2. **Optional baseline capture:** Click "Inspect views: service worker" on the FSB extension card to open SW DevTools. Note any errors already present (these are pre-existing; Phase 1 is not responsible for them).
3. **Reload the FSB extension:** click the circular reload arrow ON THE FSB CARD (NOT a global Chrome restart). Watch the SW DevTools console as the extension reloads.
4. **Run the 5 assertions (mark PASS / FAIL for each):**
   - **(a) SW reloads cleanly.** No NEW red "Errors" badge on the FSB card in `chrome://extensions` (above the baseline noted in step 2).
   - **(b) SW console shows no NEW errors mentioning `lattice`, `import`, `ERR_MODULE_NOT_FOUND`, `node_modules`, or `package.json`.** Pre-existing errors are acceptable; only NEW errors introduced by Phase 1's tree additions are a FAIL. (Expected: PASS, because no extension file imports Lattice.)
   - **(c) Popup opens normally.** Click the FSB toolbar icon; popup renders without errors.
   - **(d) Sidepanel opens normally** via its standard entry point (right-click extension icon -> "Open side panel", or whatever FSB's standard route is). Side panel renders normally.
   - **(e) One short autopilot iteration completes at least one step** on a benign page (e.g., visit any page, ask FSB to "click the link to /about" or similar minimal task). The iteration should complete or progress at least one step. This is INV-04 sanity (the `setTimeout`-chained iterator at `extension/ai/agent-loop.js:1824/2418/2487/2497` still works).
5. **Evidence to capture for the milestone HUMAN-UAT.md:**
   - Reload timestamp (wall-clock).
   - PASS / FAIL for each of (a), (b), (c), (d), (e).
   - One-line summary of any pre-existing console errors that remained post-reload (not Phase 1's responsibility but acknowledged).
   - Screenshot path or console-log excerpt showing no NEW errors caused by Phase 1's tree additions.

### Expected outcome

All five assertions are expected to PASS because Phase 1's tree changes are inert to the extension runtime (see "Deferral rationale" above). If any assertion FAILS, the failure traces directly to a file-touch outside Phase 1's documented scope -- the offending change can be identified by `git diff` against `pre-pivot-archive/v0.10.0-fsb-first`'s extension/ tree and rolled back.

## Decisions Made

### Catalog-fix architectural decision (Lattice 2nd commit, `22bf986`)

**The single architectural amendment in Plan 01-02:** during Task 1 (`npm install` of the `file:` dep), npm 11.12.1 errored with `EUNSUPPORTEDPROTOCOL` when it encountered six `catalog:` specifiers in `lattice/packages/lattice/package.json`. These are pnpm-workspace-protocol references that pnpm resolves at install time via `lattice/pnpm-workspace.yaml`'s catalog table, but npm cannot parse them.

**Options surfaced to the user:**
- **Option 1 (selected):** resolve Lattice's pnpm `catalog:` deps to concrete versions on Lattice's side as a second Lattice commit. Lattice's pnpm workflow continues to work (pnpm uses literals in place of catalog lookups for these six entries).
- Option 2: switch FSB's `file:` strategy to something else (e.g., `npm pack` + `npm install ./tarball`). Rejected -- more friction per-developer.
- Option 3: build a separate `dist/` consumer entry point that doesn't carry catalog references. Rejected -- more Lattice changes.

**User authorization:** the user explicitly approved Option 1 as expanding D-13's NARROWED form (which originally permitted "at most one tsconfig/exports tweak"). This is a packaging tweak, not a primitive change. D-13's INTENT (no Lattice code-behavior changes in Phase 1) is preserved -- the catalog-fix is pure packaging mechanics.

**Substitutions applied** (sourced from `lattice/pnpm-workspace.yaml`):
- `@standard-schema/spec: catalog:` -> `1.1.0`
- `canonicalize: catalog:` -> `3.0.0`
- `mime: catalog:` -> `4.1.0`
- `@noble/ed25519: catalog:` -> `3.1.0`
- `@types/node: catalog:` -> `24.12.2`
- `zod: catalog:` -> `4.3.6`

The catalog mapping in `pnpm-workspace.yaml` is unchanged. The version literals are exact -- no semver range bumps, no loosening.

**Verification:** `pnpm install` regenerated `pnpm-lock.yaml` against the literal versions (same resolved package set, no transitive drift); `pnpm build` rebuilt both `lattice` and `lattice-cli` clean; `dist/index.js` and `dist/index.d.ts` retain the `createReceipt + CreateReceiptInput` re-export from `ab6c1f6` and stay importable by FSB's smoke.

**Lattice commit:** `22bf98627ae86b1576db5d34cf447ab2b321b3e1` -- `chore(packaging): resolve pnpm catalog: literals for npm consumers`. Carries the `Ref: FSB v0.10.0-attempt-2 Phase 1` footer per D-14.

### Three baseline `node_modules` installs (pre-existing environment setup)

These are NOT Phase 1 changes; they are local environment setup blockers that surfaced during the existing test chain's run BEFORE the smoke was added. Each was a pre-existing condition verified at HEAD~2 (pre-Plan-01-02 baseline). Documented here so the audit trail captures them:

1. **`npm --prefix mcp install`** -- resolved `tsc` to local TypeScript 5.9.3 instead of the system global TypeScript 5.1.6 (the global rejected `with { type: 'json' }` import attributes in `mcp/src/tools/pricing.ts:39`).
2. **`npm --prefix showcase/server install`** -- resolved `better-sqlite3` for `tests/server-telemetry-salt-rotation.test.js`.
3. **`npm --prefix showcase/angular install`** -- resolved `@angular/build:application` for `tests/showcase-build-smoke.test.js`.

All three are pre-existing baseline conditions, not introduced or affected by this plan. The mcp + showcase/server + showcase/angular workspaces are FSB's existing nested package setups; their dependency trees pre-date the v0.10.0-attempt-2 milestone.

### Task 4 deferral decision

See "Task 4 Deferral" section above. Per user directive at continuation time ("continue all phases with GSD autonomous; UAT will be at the end"), Task 4 was marked `deferred-pending-UAT` with full procedure inlined in this SUMMARY for the milestone UAT executor.

## Deviations from Plan

### 1. [Architectural Amendment - User-Authorized] Catalog-fix Lattice commit added

- **Found during:** Task 1 (`npm install` of the `file:` dep)
- **Issue:** npm 11.12.1 errored `EUNSUPPORTEDPROTOCOL` on the six `catalog:` specifiers in `lattice/packages/lattice/package.json`; FSB could not install the `file:` dep.
- **Resolution path:** STOPPED, surfaced 3 options to user, user selected Option 1 (resolve catalog to literals on Lattice side as a 2nd Lattice commit), executed the resolution. D-13's NARROWED form is expanded to allow this packaging fix.
- **Files modified (Lattice-side):** `lattice/packages/lattice/package.json` + `lattice/pnpm-lock.yaml`
- **Files modified (FSB-side):** `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt` (updated to the new Lattice HEAD `22bf986...` after the fix)
- **Verification:** `pnpm install` clean, `pnpm build` clean, `node -e "import('lattice')"` resolves all 5 required exports, npm 11 `npm install` succeeds, smoke passes, `npm test` passes.
- **Committed in (Lattice):** `22bf98627ae86b1576db5d34cf447ab2b321b3e1`

### 2. [User Directive - Deferral] Task 4 (manual MV3 sanity reload) deferred to milestone UAT

- **Found during:** Task 4 (originally a `checkpoint:human-verify` requiring user reload+evidence at this stage)
- **Resolution path:** At checkpoint pause, user directed "continue all phases with GSD autonomous; UAT will be at the end." Task 4 marked `deferred-pending-UAT` with full 5-assertion procedure inlined in this SUMMARY for end-of-milestone execution. NOT skipped, NOT failed -- DEFERRED with traceability. See "Task 4 Deferral" section above for the procedure the user will run at UAT time.
- **Files modified:** None (Task 4 is a verification-only step, no file changes)
- **Verification at deferral time:** the rationale (zero extension/* modifications + no in-extension Lattice import) means the deferral introduces no regression risk; the UAT will confirm this empirically.

---

**Total deviations:** 2 (1 architectural-amendment with user authorization, 1 user-directed deferral)
**Impact on plan:** Both deviations preserve plan intent. The catalog-fix is a packaging mechanics tweak that D-13's spirit permits (and the user explicitly authorized as such). The Task 4 deferral preserves the verification as a milestone UAT item rather than a per-plan blocker, per direct user directive.

## Issues Encountered

### Issue 1: npm 11 EUNSUPPORTEDPROTOCOL on `catalog:` specifiers

Resolved via the architectural amendment (catalog-fix Lattice commit `22bf986`). See Deviation 1 above.

### Issue 2: Three pre-existing baseline `node_modules` installs needed

Resolved via local environment setup (`npm --prefix mcp install`, `npm --prefix showcase/server install`, `npm --prefix showcase/angular install`). Pre-dates Phase 1; documented for audit completeness. See "Three baseline `node_modules` installs" under Decisions Made.

## Threat Register Verification

| Threat ID | Category | Disposition | Outcome |
|-----------|----------|-------------|---------|
| T-02-01 (smoke ships hardcoded private key) | mitigate | **PASS** -- smoke calls `lattice.generateEd25519KeyPairJwk()` per run; grep `tests/lattice-smoke.test.js` finds zero hardcoded `privateKeyJwk` literals or `process.env.LATTICE_*` references. |
| T-02-02 (npm install silently mutates extension/ or mcp/) | mitigate | **PASS** -- `git status --porcelain extension/` empty; `git status --porcelain mcp/` empty across all five task gates. Lattice has no postinstall hook (verified in `lattice/packages/lattice/package.json`). |
| T-02-03 (stale dist; createReceipt re-export actually missing) | mitigate | **PASS** -- Plan 01-01 rebuilt `dist/` with tsdown `clean: true`. Task 1 in this plan ran `node -e "import('lattice'); typeof l.createReceipt === 'function'"` before writing the smoke; smoke also asserts surface presence in its first 5 assertions before invoking round-trip. |
| T-02-04 (FSB commit does not reference Lattice SHA -- forensic gap) | mitigate | **PASS** -- the Plan 01-02 commit bodies (Tasks 1, 2, 3, pause-record) reference Plan 01-02 explicitly; `.planning/LATTICE-PIN.md` frontmatter records the SHA as a redundant tracked artifact; the wrap-up Task 5 commit body references the pinned Lattice SHA `22bf98627ae86b1576db5d34cf447ab2b321b3e1`. |
| T-02-05 (smoke leaks ephemeral private key to stdout/log) | mitigate | **PASS** -- smoke code reviewed; only logs the receipt body fields (kid is a public string id, no JWK material printed). No `console.log(privateKeyJwk)` or similar. |
| T-02-06 (smoke commits real provider API key via route.providerId) | accept | **OK** -- smoke uses stub values `fsb-smoke` / `fsb-smoke/round-trip`. Not real provider names. |
| T-02-07 (npm test runtime regression from Lattice build) | mitigate | **PASS** -- smoke is ~2 seconds standalone (per VALIDATION.md). Full `npm test` runtime unchanged within tolerance. |
| T-02-08 (file: dep symlink enables malicious code injection via lattice/dist/) | accept | **OK for Phase 1** -- test-process only (no in-extension import per Option B). Same developer has write access to FSB's tree itself; symlink does not amplify privilege. Revisit at elevated severity when in-extension import phase lands. |
| T-02-09 (INV-04 -- setTimeout-chained iterator accidentally modified) | mitigate | **PASS** -- `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 at all five task gates. Baseline preserved. |
| T-02-10 (INV-01 byte-identity broken between extension and mcp tool-definitions) | mitigate | **PASS** -- `node tests/tool-definitions-parity.test.js` returns 142/142 PASS at all five task gates. |

All `block on` threats (T-02-01, T-02-02, T-02-03, T-02-04, T-02-09, T-02-10) verified PASS.

## Self-Check

### Files verified

- `tests/lattice-smoke.test.js` -- FOUND (175 lines, contains `await import('lattice')` + `lattice.createReceipt(` + `lattice.verifyReceipt(` + `result.ok` assertions + `generateEd25519KeyPairJwk(` -- no hardcoded keypair)
- `.planning/LATTICE-PIN.md` -- FOUND (37 lines, frontmatter `current_lattice_sha: 22bf98627ae86b1576db5d34cf447ab2b321b3e1`, body row `| Phase 1 | 2026-05-24 | ...`)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-01-SHA.txt` -- FOUND (40-char hex `22bf98627ae86b1576db5d34cf447ab2b321b3e1`)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-02-CHECKPOINT.md` -- FOUND (116 lines, captures Task 4 pause state)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-02-SUMMARY.md` -- FOUND (this file)
- `node_modules/lattice` -- FOUND (symlink to `lattice/packages/lattice/`)
- `node_modules/lattice/dist/index.js` -- FOUND (reachable through symlink; `createReceipt` present)

### Commits verified

- `e3cd7fb5` `docs(01-02): pause Plan 01-02 at Task 4` -- FOUND
- `be95d158` `docs(01-02): add .planning/LATTICE-PIN.md` -- FOUND
- `1545c14c` `test(01-02): add Lattice round-trip smoke` -- FOUND
- `658ed87e` `feat(01-02): add Lattice file dep + smoke entry in test chain` -- FOUND
- Lattice `22bf986` `chore(packaging): resolve pnpm catalog: literals for npm consumers` -- FOUND in `cd lattice && git log`

### Gates verified at SUMMARY write time

- `node tests/lattice-smoke.test.js` exits 0 (29 PASS / 0 FAIL) -- PASS
- `node tests/tool-definitions-parity.test.js` exits 0 (142 PASS / 0 FAIL) -- PASS
- `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 -- PASS
- `git status --porcelain extension/` empty -- PASS
- `cd lattice && git rev-parse fsb-integration-experiments` matches `.planning/LATTICE-PIN.md` frontmatter `current_lattice_sha` -- PASS (`22bf98627ae86b1576db5d34cf447ab2b321b3e1`)

## Self-Check: PASSED

## What's Next

Phase 1 is **complete pending UAT**. The deferred Task 4 (MV3 sanity reload) is the only outstanding item, and it surfaces as a milestone HUMAN-UAT entry rather than a per-phase gate.

Phase 2 picks up the **Blocker** rows from `lattice/docs/fsb-integration-gaps.md` -- most likely the Receipts + Observability domains: receipt-shape extensions (stepName / stepIndex / parentStepName / timestamp / sessionId / parentStepName / previousStepName) and step-transition tracing kinds. The audit doc explicitly orders rows by severity (Blocker > Important > Nice-to-have) per D-03, so Phase 2 planning starts with the Blocker rows.

The scaffolding established by this plan (file: dep, smoke harness, LATTICE-PIN.md audit trail, Lattice commit ceremony) is reusable for every future phase that touches Lattice. The pattern is:

1. Plan N-01 lands Lattice changes on `fsb-integration-experiments` (conventional commit + `Ref: FSB v0.10.0-attempt-2 Phase N` footer; no push per D-15).
2. Plan N-02 wires the FSB side: extends the smoke (or adds a new one) to exercise the new Lattice surface; updates `.planning/LATTICE-PIN.md` with a new per-phase row; updates `.planning/phases/XX/N-01-SHA.txt`.
3. Single FSB `feat(phase-N):` commit lands the FSB-side changes; SUMMARY captures the Lattice SHA + the round-trip evidence.

---
*Phase: 01-lattice-gap-survey-scaffold*
*Plan: 01-02*
*Completed: 2026-05-24*
