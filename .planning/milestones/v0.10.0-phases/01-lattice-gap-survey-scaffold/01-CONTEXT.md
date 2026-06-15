# Phase 1: Lattice SDK gap survey + integration scaffolding - Context

**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

**This phase delivers two outcomes:**

1. **Gap survey** — A documented audit of where Lattice v1.1 (`./lattice/packages/lattice` at the current `fsb-integration-experiments` HEAD) falls short of what FSB's autopilot loop needs. Single source of truth lands on Lattice's side at `lattice/docs/fsb-integration-gaps.md`. Drives Phase 2+ ordering.

2. **Integration scaffolding** — Working `path:` dependency wiring from FSB to Lattice, exercised by an end-to-end smoke test that mints one Capability Receipt through Lattice's existing v1.1 surface from both Node-side CI and the Chrome MV3 service worker runtime.

**Explicitly NOT in this phase** (deferred to later phases or other milestones):
- Receipt-shape extensions (stepName/stepIndex/parentStepName fields) — those go in the receipt-extensions phase
- Tripwire band system extensions — separate phase
- Provider adapter alignment for FSB's 7-provider matrix — separate phase
- Delegation primitive design — separate phase (or out-of-scope if Lattice keeps multi-agent excluded)
- MV3-survivability adapter contract — separate phase
- Sidepanel UI consumption — defer until first phase that needs Lattice on the renderer

**The scope anchor:** if Phase 1's smoke test starts demanding Lattice receipt extensions, that's scope creep into Phase 2. Hold the line at "audit + scaffolding."

</domain>

<decisions>
## Implementation Decisions

### Gap Survey Scope + Deliverable

- **D-01 Audit breadth = full 6-area sweep.** The gap survey covers all six Lattice surfaces in one pass: (1) receipts, (2) tripwires/hooks, (3) providers, (4) delegation policy, (5) MV3-survivability adapter shape, (6) step-marker/observability primitives. Wide-and-shallow: each area gets at minimum a "Covered / Needs extension / Needs addition" verdict and a one-sentence rationale. Sets up Phase 2+ with a fully-loaded queue.

- **D-02 Deliverable landing = Lattice-side only.** Single source of truth at `lattice/docs/fsb-integration-gaps.md`, committed to Lattice's `fsb-integration-experiments` branch. FSB-side gets a one-line pointer in `.planning/research/lattice-integration.md` (or equivalent) plus the LATTICE-PIN.md entry (D-08). No duplicate copy in FSB's phase artifacts — INV-06 says primitives + their docs live in Lattice.

- **D-03 Prioritization = FSB-blocking severity.** Each gap row gets a severity tag: **Blocker** (FSB autopilot reliability regression without it), **Important** (closes the duplication-vs-Lattice pattern from attempt-1), or **Nice-to-have** (future-Lattice-consumer benefit, not FSB-critical). Severity drives downstream phase ordering directly — Blockers go first.

- **D-04 Audit format = per-gap rows.** Flat scannable table with columns: `Domain | Gap | Status | Severity | Notes`. Status ∈ {Covered, Needs extension, Needs addition, Out of scope}. One row per gap, multiple rows per domain. Easy to scan, easy to update as gaps get closed.

### Integration Model

- **D-05 Primary mode = `path:` dependency to `lattice/packages/lattice`.** FSB's `package.json` adds `"lattice": "file:./lattice/packages/lattice"` (or `"link:./lattice/packages/lattice"` depending on `npm` semantics — researcher to confirm). npm follows the path, reads its `package.json`, picks up the `dist/` exports. Works with the existing npm-based FSB tooling. Reproducible because `lattice/` is already on disk per developer (cloned by every contributor; gitignored).

- **D-06 MV3 SW load = native ES module imports.** Chrome MV3 service workers support ES module imports when the worker is registered as a module-type script. FSB's smoke path adds a module-type bridge file (e.g., `extension/lattice-bridge.js`) that does `import { … } from 'lattice'`. `background.js` itself stays vanilla classic-script. No bundler infrastructure in Phase 1 — that gets revisited if/when the audit reveals a packaging blocker. Sidepanel-side consumption deferred entirely.

- **D-07 Build flow = developer-driven `pnpm install && pnpm build` inside `lattice/`.** Manual step documented in the FSB contributing notes + Phase 1 PLAN. `lattice/` is gitignored, so its `dist/` is per-developer. FSB CI runs the same two commands before `npm test` if/when Lattice imports start gating tests. Simple and explicit — avoids coupling FSB's `npm install` to Lattice's full toolchain (pnpm 10, Node 24).

- **D-08 Lock-step = `.planning/LATTICE-PIN.md` in FSB.** New file at `.planning/LATTICE-PIN.md` records: (a) current Lattice commit SHA FSB is developed against, (b) Lattice branch name (`fsb-integration-experiments`), (c) per-FSB-phase log of which Lattice commits were produced + which gap-doc sections they advanced. Acts as the cross-repo audit trail. Updated at every FSB phase's commit-docs step that touches Lattice.

### Smoke Test Definition

- **D-09 Smoke contexts = Node-side test + manual MV3 SW load check.** Two-prong coverage: (1) `tests/lattice-smoke.test.js` runs in FSB CI under `npm test`; (2) developer manually reloads the unpacked extension, opens the SW console, confirms the bridge file emits the smoke-test receipt without throwing. Sidepanel deferred to a later phase that actually consumes Lattice for UI. No Puppeteer/Playwright harness invented for Phase 1.

- **D-10 Smoke primitive = mint one Capability Receipt via Lattice's existing v1.1 surface.** Smoke test imports Lattice's existing receipt-minting function (likely from `packages/lattice/src/receipts/`), constructs a minimal stubbed capability + action, asserts the returned receipt is well-formed (has expected fields per Lattice's current schema). Uses Lattice as-shipped — **zero Lattice-side changes required to make the smoke pass.**

- **D-11 Smoke ownership = FSB-side.** `tests/lattice-smoke.test.js` lives alongside FSB's existing ~100+ node tests, follows the same `node tests/foo.test.js` convention, gets added to FSB's `npm test` runner. Proves FSB *consumes* Lattice correctly. Lattice's own 451 vitest tests are separately authoritative for Lattice's internal correctness; the smoke does not duplicate them.

- **D-12 Phase 1 pass criteria = three explicit checks.** All three must pass for Phase 1 verifier to mark Phase 1 Complete:
  1. **Doc check:** `lattice/docs/fsb-integration-gaps.md` exists on `fsb-integration-experiments` HEAD, covers all 6 surfaces from D-01, every row tagged with severity per D-03.
  2. **Node smoke check:** `node tests/lattice-smoke.test.js` exits 0 in FSB CI.
  3. **Manual MV3 check:** Developer reloads unpacked extension, observes the SW console log line confirming smoke receipt minted without exception. Captured as a screenshot + log excerpt in the phase VERIFICATION artifact.

### Lattice-Side Work Direction

- **D-13 Maximum Lattice code change in Phase 1 = audit doc + at most one tsconfig/exports tweak.** The audit doc itself is the primary Lattice-side commit. The *only* code change permitted is a packaging/exports fix if the smoke test reveals one (e.g., a missing field in the `exports` map that blocks Node's path-resolution into MV3 SW import). Anything bigger (receipt-shape extensions, tripwire bands, provider adapters) is strictly deferred to its own phase per ROADMAP.

- **D-14 Lattice-side commit ceremony = conventional commits + FSB-phase backref.** Each Lattice commit on `fsb-integration-experiments` follows conventional commits format (e.g., `docs(fsb-integration): add gap survey`). Commit body includes `Ref: FSB v0.10.0-attempt-2 Phase 1` line so cross-repo traceability is grep-able. **No `@changesets/cli` entries during the experiment branch** — changeset polish deferred until upstream mainline PR cadence is decided.

- **D-15 Upstream PR strategy = deferred to v0.11.0+.** Throughout v0.10.0-attempt-2, ALL Lattice changes live on `fsb-integration-experiments`. FSB depends on that branch via the cloned worktree. Mainline PR cadence is its own decision after this milestone validates the patterns. Lowest coordination cost while the design is still moving. No per-phase mainline PRs; no end-of-milestone giant PR commitment either.

- **D-16 FSB-side cross-repo traceability = LATTICE-PIN.md only.** No per-phase `XX-LATTICE-WORK.md` summary files. Lattice commit messages self-document via the `Ref:` line from D-14. `.planning/LATTICE-PIN.md` is the single FSB-side index of "what FSB did to Lattice." Easier to keep in sync; one file to grep.

### Claude's Discretion

The following details are left to the researcher/planner — Claude will pick reasonable defaults consistent with the locked decisions above:

- **CD-01 Exact npm spec for the `path:` dep.** Whether `package.json` uses `"lattice": "file:./lattice/packages/lattice"` vs `"lattice": "link:./lattice/packages/lattice"` vs explicit `npm install ./lattice/packages/lattice --no-save` — researcher confirms which produces a working `import 'lattice'` from FSB's runtime.
- **CD-02 Exact location of the FSB-side bridge file.** `extension/lattice-bridge.js`? `extension/ai/lattice.js`? Planner picks the path that minimizes blast radius on existing imports.
- **CD-03 Whether to add a `postinstall` script that verifies `lattice/packages/lattice/dist/` exists** and prints a helpful "run `cd lattice && pnpm install && pnpm build` first" error if not. Recommended; planner decides.
- **CD-04 Whether the smoke test stubs Lattice's input dependencies** (artifacts, capabilities, policy) inline or via a small fixture file under `tests/fixtures/`. Either is fine.
- **CD-05 Exact filename for the gap survey on Lattice side.** `lattice/docs/fsb-integration-gaps.md` is the locked path; researcher decides whether to mirror it at `lattice/docs/integrations/fsb-gaps.md` if Lattice's existing docs convention prefers subdirectories. Default to the flat path unless evidence says otherwise.
- **CD-06 LATTICE-PIN.md schema.** Markdown table vs frontmatter vs JSON — planner picks. Required content (D-08): commit SHA, branch, per-phase log. Format around that.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### FSB-side milestone scope (active)
- `.planning/ROADMAP.md` — Phase 1 definition + INV-01..INV-06 invariants + Lattice integration model
- `.planning/REQUIREMENTS.md` — LSDK/FINT/MCP/PRV category scaffolds; Phase 1 will populate LSDK-01..N and FINT-01 (path:dep wiring REQ)
- `.planning/PROJECT.md` — Current Milestone section (v0.10.0-attempt-2) + invariants
- `.planning/STATE.md` — Pre-planning state, risk register R1-R4, Lattice Integration State block

### Pivot context (read once for context, not re-read for each task)
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/PIVOT-v0.10.0-PLAN.md` — Full pivot rationale; explains WHY attempt-2 inverts to Lattice-first

### Attempt-1 reference artifacts (informational — these are the patterns being migrated INTO Lattice, not re-implemented in FSB)
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/01-hooks-foundation/` — Hook pipeline design (priority bands, matcher, race-with-log, freeze) that maps to Lattice gap-survey "tripwires/hooks" domain
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/02-state-inspectability-carve-out/02-RESEARCH.md` — 981-line research, includes the Lattice receipt-shape envelope spec that informs the receipts-domain gap analysis
- `.planning/milestones/v0.10.0-attempt-1-pre-pivot/02-state-inspectability-carve-out/02-CONTEXT.md` — Decision history for step-marker / receipt-shape design

### Lattice-side scope
- `lattice/AGENTS.md` — Lattice's project vision (capability-first, deterministic routing, MCP-native, transparency), stack constraints (TS 6, Node 24, ESM-only, pnpm, tsdown), provider strategy, MCP integration plan
- `lattice/README.md` — Public surface intro (researcher to read for capability + run API shape)
- `lattice/packages/lattice/package.json` — `exports` map, `scripts` (build/test/typecheck), dependency surface (`@standard-schema/spec`, `canonicalize`, `mime`)
- `lattice/packages/lattice/src/receipts/` — Existing receipt primitives (canonical, envelope, keyset, receipt, redact, sign, types, verify) — primary input to receipts-domain audit
- `lattice/packages/lattice/src/policy/` — Existing policy surface — input to tripwire/hook audit
- `lattice/packages/lattice/src/providers/` — Existing provider abstraction (adapters, fake, packaging, provider) — input to provider-domain audit
- `lattice/packages/lattice/src/runtime/` — Existing runtime — input to MV3-survivability audit
- `lattice/packages/lattice/src/tools/` — Existing tools surface — input to delegation audit (if Lattice has any tool-orchestration concept)
- `lattice/packages/lattice/src/tracing/` — Existing tracing — input to observability/step-marker audit

### Hard invariants (every task gates against these)
- INV-01 MCP wire contracts UNTOUCHED (verified by `tests/tool-definitions-parity.test.js`)
- INV-02 Tool surface parity (FSB autopilot uses same `TOOL_REGISTRY` as MCP)
- INV-03 Provider parity across 7 providers
- INV-04 MV3-survivability preserved (`setTimeout`-chained iterator at `extension/ai/agent-loop.js:1824/2418/2487/2497`)
- INV-05 No resurrection of `extension/agents/agent-{executor,manager,scheduler}.js`
- INV-06 (NEW) Lattice SDK primitives live in Lattice's repo, not FSB's

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Existing FSB test convention:** ~100+ `tests/*.test.js` files using `node tests/foo.test.js` invocation. New `tests/lattice-smoke.test.js` follows this exact pattern. No new test framework.
- **`tests/tool-definitions-parity.test.js`:** Already wired into `npm test`. Phase 1 must not perturb its output (INV-01 verification). Smoke test addition is additive — won't touch tool-definitions on either side.
- **FSB `npm test` runner in `package.json`:** Long single-line `&&` chain. Phase 1 appends `node tests/lattice-smoke.test.js` to the end of the chain at the appropriate position (probably after `agent-loop-empty-contents.test.js`, the current last test).

### Established Patterns
- **MV3 SW eviction sensitivity:** `extension/ai/agent-loop.js` has the load-bearing `setTimeout`-chained iterator at the four sites tracked in INV-04. Smoke-test bridge file does NOT touch this pattern — it's a side-channel import for proving Lattice loads, not an iterator refactor.
- **Vanilla JS in `extension/`:** All `extension/*.js` is vanilla. The bridge file is the first MV3-SW module-type script in FSB. Module-type SW registration requires `"background": { "service_worker": "background.js", "type": "module" }` in `manifest.json` — researcher confirms whether FSB's current manifest already declares `"type": "module"` or if Phase 1 adds it.
- **Lattice is pnpm monorepo / Node ≥24 / TypeScript ESM-only:** Cross-package-manager (FSB uses npm, Lattice uses pnpm) is a known integration friction. D-07 handles this with developer-driven `cd lattice && pnpm install && pnpm build` ceremony.

### Integration Points
- **`package.json`:** New `"lattice"` dependency entry (D-05). New `tests/lattice-smoke.test.js` test in the test chain (D-11). Possibly a new `postinstall` script (CD-03).
- **`manifest.json`:** Possibly add `"type": "module"` to the `background` block (depends on current state — researcher checks).
- **New file: `extension/lattice-bridge.js` (or equivalent CD-02 path):** Module-type bridge that imports from Lattice. Loaded by `background.js` via a one-line `import` or `importScripts` shim. Smoke-test path emits its receipt from this file.
- **New file: `.planning/LATTICE-PIN.md`:** Cross-repo audit trail (D-08, D-16).
- **New file: `lattice/docs/fsb-integration-gaps.md`:** Audit deliverable (D-02). Committed on Lattice's `fsb-integration-experiments` branch.
- **New file: `tests/lattice-smoke.test.js`:** Node-side smoke (D-09, D-10, D-11).

</code_context>

<specifics>
## Specific Ideas

- **Receipt mint as smoke primitive:** The user is consistent that v0.10.0-attempt-2's Lattice round-trip should be validated continuously, starting now. Minting one receipt — Lattice's *core* primitive — is the most direct proof. Anything weaker (typeof check, example run) doesn't actually validate the FSB consumption path.
- **No mainline PRs during v0.10.0-attempt-2:** Explicit user preference (D-15). The `fsb-integration-experiments` branch is the integration sandbox; mainline cadence is its own concern after this milestone proves the pattern is correct.
- **Per-gap severity tagging drives Phase 2 picks:** D-03 makes the audit *actionable* — Blocker gaps directly populate Phase 2's task list. Avoids the attempt-1 LAT-05 anti-pattern (audit identified port candidates but didn't execute them).
- **MV3 SW manual check is acceptable for Phase 1:** Skipping a full headless-Chrome harness for the smoke is intentional — Phase 1's job is to prove the loop works at all, not to industrialize the test for repeatability. Industrialization (if needed) lands when a later phase first puts Lattice on a tested SW critical path.

</specifics>

<deferred>
## Deferred Ideas

These came up during scoping but belong outside Phase 1:

- **Sidepanel-side Lattice consumption** — Phase 1's smoke skips renderer-context. Lands in the first phase that actually puts Lattice on the sidepanel critical path (likely the Agent State Inspector revival phase).
- **Headless MV3 SW test harness** — Industrializing the manual extension-reload check into automated SW load testing. Deferred until a phase actually needs continuous MV3 SW correctness gates.
- **REQUIREMENTS.md LSDK/FINT REQ-ID population** — Phase 1's audit doc identifies the gaps; mapping those gaps into concrete LSDK-NN / FINT-NN REQ-IDs is Phase 2's setup work (or part of Phase 2's CONTEXT capture).
- **Lattice mainline PR cadence** — Deferred to v0.11.0+ per D-15.
- **Lattice receipt-shape extensions** — All FSB-attempt-1 stepName/stepIndex/parentStepName work goes into the receipt-extensions phase (Phase 2 likely).
- **Tripwire band system extensions** — All FSB-attempt-1 priority-band / matcher / race-with-log / freeze work goes into the tripwire-extensions phase (Phase 3 likely).
- **Provider adapter alignment** — FSB's 7-provider matrix vs Lattice's provider abstraction goes into its own phase.
- **Delegation primitive** — Pending Lattice's multi-agent policy stance; surface in audit, plan in a later phase if Lattice opens the door.
- **MV3-survivability adapter contract** — Documented as a Lattice-side novel contract in its own phase.

</deferred>

<reconciliation>
## Research-Driven Reconciliation (2026-05-24, post-research)

Phase 1 research (`01-RESEARCH.md`) uncovered two Chrome-platform facts that contradict D-06 / D-09 as originally written. User selected **Option B (defer in-extension load)** to keep Phase 1 inside its scope ceiling. This section AMENDS the locked decisions above; downstream agents follow the amendments. Original decision text is preserved verbatim for the audit trail.

### The two facts (verified)

- **F-01 SW classic/module mutual exclusion.** Chrome MV3 service workers are EITHER classic (`importScripts()`) OR module (`import`), never both. FSB's `extension/background.js` makes 100+ `importScripts()` calls in load-order-sensitive chains (`install-identity.js MUST load FIRST`, etc.). Adding `"type": "module"` to the manifest breaks SW registration. `[VERIFIED: Chrome MV3 docs + background.js head]`
- **F-02 No bare-specifier resolution in extension contexts.** Chrome (and the Web Platform) does not resolve `import 'lattice'` at runtime in ANY extension context (SW, offscreen, sidepanel). Only relative URLs or `chrome-extension://` URLs resolve. Bare specifiers require a bundler to be rewritten to relative paths before load. FSB has no bundler in Phase 1 scope. `[VERIFIED: 01-RESEARCH.md Pitfall 3 + Chrome MV3 docs]`

Together these mean D-06's literal text ("bridge file does `import { … } from 'lattice'` … loaded by background.js") is unachievable without a SW refactor + bundler — both of which violate D-13's "no FSB runtime behaviour changes" intent.

### Amendments

- **D-06 (AMENDED).** FSB does NOT add `"type": "module"` to `manifest.json` in Phase 1. FSB does NOT import Lattice from any extension context (SW, offscreen, sidepanel) in Phase 1. The new bridge file (`extension/lattice-bridge.js` per CD-02) is NOT introduced in Phase 1 — it would have nothing to do and would itself be unreachable from a classic SW. In-extension Lattice loading is deferred to a future phase that bundles Lattice into the extension's resource tree (or migrates the SW to module-type as its own scoped concern).

- **D-09 (AMENDED).** Smoke contexts = Node-side test only (was: Node-side + manual MV3 SW load). The manual MV3 prong is downgraded — see D-12 amendment.

- **D-12 #3 (AMENDED).** Manual MV3 check is downgraded from "developer reloads extension, opens SW console, confirms bridge file emits the smoke-test receipt" to: "developer reloads the unpacked extension after Phase 1's commits are applied; SW console shows no NEW errors caused by Phase 1's file additions; the extension's existing functionality (popup open, sidepanel open, an existing autopilot run) continues to work end-to-end." This is a sanity check that Phase 1's tree changes don't break the extension, NOT a proof that Lattice loads inside an extension context. Captured in PLAN's verification notes / phase SUMMARY as a checked manual step.

- **D-12 #2 (CLARIFIED, unchanged in intent).** Node smoke (`node tests/lattice-smoke.test.js`) is now the SUBSTANTIVE proof of FSB ↔ Lattice round-trip. It mints one Capability Receipt via `await import('lattice')` from a CJS test file (Node 25.9 verified), calls `createReceipt(...)` with an ephemeral Ed25519 keypair from `generateEd25519KeyPairJwk` + `createInMemorySigner`, then `verifyReceipt(envelope, createMemoryKeySet([...]))` to round-trip-confirm the signature.

- **D-13 (NARROWED — the "at most ONE Lattice-side tweak" specified).** The single allowed Lattice-side code change in Phase 1 is **adding `export { createReceipt, type CreateReceiptInput } from "./receipts/receipt.js";` to `lattice/packages/lattice/src/index.ts`** so the smoke can import `createReceipt` via the package's documented bare specifier. No other Lattice code change is permitted (per the original D-13).

### Resolutions of Claude's Discretion

Research empirically tested these — they're no longer "discretion":

- **CD-01 (RESOLVED).** `"lattice": "file:./lattice/packages/lattice"`. `link:` silently produces no symlink on npm 11.12.1 (verified at `/tmp/npm-spec-probe`). `--no-save` is non-reproducible. `npm link` requires global state. `file:` is correct.
- **CD-02 (DEFERRED).** No bridge file is added in Phase 1 (per amended D-06). When in-extension import lands in a future phase, that phase will pick the placement.
- **CD-03 (RESOLVED).** No postinstall hook. The PLAN's Setup task / README addition is the documentation route per D-07. Adding a postinstall would couple FSB's `npm install` to Lattice's pnpm + would surprise CI.
- **CD-04 (RESOLVED).** Smoke uses inline stubs — matches FSB's existing test convention (`tests/fixtures/` contains data fixtures, not test stubs).
- **CD-05 (RESOLVED).** Flat path: `lattice/docs/fsb-integration-gaps.md` (not `lattice/docs/integrations/fsb-gaps.md`). `lattice/docs/` does not exist on the experiment branch yet — Phase 1 creates the directory + file in one step.
- **CD-06 (RESOLVED).** LATTICE-PIN.md is a markdown table — consistent with `.planning/` style. Columns: `FSB Phase | Date | Lattice SHA | Branch | Lattice work touched | Notes`. Frontmatter holds the "current pin" (single SHA + branch); per-phase log is the table body.

### What survives unchanged

D-01 (6-area sweep), D-02 (Lattice-side doc), D-03 (severity tagging), D-04 (row format), D-05 (`file:` dep), D-07 (developer-driven pnpm), D-08 (`.planning/LATTICE-PIN.md`), D-10 (one receipt mint via existing v1.1 surface), D-11 (FSB-side `tests/lattice-smoke.test.js`), D-14 (conv commits + `Ref:`), D-15 (no mainline PR), D-16 (LATTICE-PIN.md as single index). Phase boundary (`<domain>`) is unchanged: still audit + scaffolding; nothing primitive added to FSB.

### Net plan-shape impact

- One FSB-side test file (`tests/lattice-smoke.test.js`).
- One FSB-side `package.json` dependency line + one test-chain insertion in `scripts.test`.
- One FSB-side new doc (`.planning/LATTICE-PIN.md`).
- One Lattice-side doc (`lattice/docs/fsb-integration-gaps.md`).
- One Lattice-side single-line code change (`lattice/packages/lattice/src/index.ts` re-export).
- One developer ceremony (`cd lattice && pnpm install && pnpm build`) — documented in the PLAN's Setup task.
- ZERO `extension/` file additions or `manifest.json` edits in Phase 1.

</reconciliation>

---

*Phase: 01-lattice-gap-survey-scaffold*
*Context gathered: 2026-05-24*
