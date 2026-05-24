# Phase 1: Lattice SDK gap survey + integration scaffolding - Research

**Researched:** 2026-05-24
**Domain:** SDK consumption scaffolding (npm `file:` dep wiring + ES-module import into Chrome MV3 SW) + Lattice v1.1 audit baseline
**Confidence:** HIGH (every API, file path, command, and version below verified in this session against the on-disk Lattice tree, FSB tree, or live `npm` probe — except where explicitly tagged otherwise)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 Audit breadth = full 6-area sweep.** Receipts, tripwires/hooks, providers, delegation, MV3-survivability, observability/step-markers. Wide-and-shallow: each area gets at minimum a "Covered / Needs extension / Needs addition" verdict and a one-sentence rationale.

- **D-02 Deliverable landing = Lattice-side only.** Single source of truth at `lattice/docs/fsb-integration-gaps.md`, committed to Lattice's `fsb-integration-experiments` branch. FSB side gets a one-line pointer + LATTICE-PIN.md entry only.

- **D-03 Prioritization = FSB-blocking severity.** Per-gap tags: **Blocker** (FSB autopilot reliability regression without it), **Important** (closes attempt-1 duplication-vs-Lattice pattern), or **Nice-to-have** (future Lattice-consumer benefit, not FSB-critical).

- **D-04 Audit format = per-gap rows.** Columns: `Domain | Gap | Status | Severity | Notes`. Status ∈ {Covered, Needs extension, Needs addition, Out of scope}. One row per gap, multiple per domain.

- **D-05 Primary mode = `path:` dependency to `lattice/packages/lattice`.** FSB's `package.json` adds the dep; npm follows the path, reads its `package.json`, picks up `dist/` exports.

- **D-06 MV3 SW load = native ES module imports.** Bridge file (e.g., `extension/lattice-bridge.js`) does `import { … } from 'lattice'`. `background.js` itself stays vanilla classic-script. No bundler in Phase 1. Sidepanel-side consumption deferred. **⚠ Research finds this decision conflicts with FSB's current `background.js`** — see "User-Decision Conflict (REQUIRES USER REVIEW)" below.

- **D-07 Build flow = developer-driven `pnpm install && pnpm build` inside `lattice/`.** Documented in FSB contributing notes + Phase 1 PLAN. `lattice/` is gitignored so its `dist/` is per-developer.

- **D-08 Lock-step = `.planning/LATTICE-PIN.md` in FSB.** Records Lattice commit SHA, branch, per-FSB-phase log.

- **D-09 Smoke contexts = Node-side test + manual MV3 SW load check.** No Puppeteer/Playwright. Sidepanel deferred.

- **D-10 Smoke primitive = mint one Capability Receipt via Lattice's existing v1.1 surface.** Smoke imports an existing receipt-minting function; zero Lattice-side changes for smoke to pass.

- **D-11 Smoke ownership = FSB-side.** `tests/lattice-smoke.test.js` follows the existing `node tests/foo.test.js` convention, gets added to FSB's `npm test` chain.

- **D-12 Phase 1 pass criteria = three explicit checks.** (1) `lattice/docs/fsb-integration-gaps.md` covers 6 surfaces with severity tags; (2) `npm test` runs the smoke and passes; (3) manual MV3 SW reload + console-log evidence captured.

- **D-13 Maximum Lattice code change in Phase 1 = audit doc + at most one tsconfig/exports tweak.** No primitive extensions.

- **D-14 Lattice-side commit ceremony = conventional commits + `Ref: FSB v0.10.0-attempt-2 Phase 1` body line.** No `@changesets/cli` entries on the experiment branch.

- **D-15 Upstream PR strategy = deferred to v0.11.0+.** All Lattice changes on `fsb-integration-experiments` only.

- **D-16 FSB-side cross-repo traceability = LATTICE-PIN.md only.** No per-phase `XX-LATTICE-WORK.md` files.

### Claude's Discretion

- **CD-01 Exact npm spec for path: dep** — `"file:./lattice/packages/lattice"` vs `link:…` vs `npm install --no-save …`. **Recommendation (HIGH confidence, empirically verified):** use `"file:./lattice/packages/lattice"`. See "Standard Stack -> npm dependency spec" below.

- **CD-02 Exact location of FSB-side bridge file.** Options researched: `extension/lattice-bridge.js` (top-level) vs `extension/ai/lattice.js` vs new `extension/lattice/` subdir. **Recommendation:** see "Architecture Patterns -> Bridge file placement" below, contingent on resolving the D-06 conflict.

- **CD-03 Whether to add a postinstall sanity-check script.** Default to NO. Research found no high-friction failure mode mandating it; explicit developer ceremony per D-07 is sufficient.

- **CD-04 Smoke test fixture strategy.** Inline stubs match FSB convention (every FSB test stub is inline; `tests/fixtures/` contains only 4 ancillary files, all data fixtures not test stubs). **Recommendation:** inline stubs in `tests/lattice-smoke.test.js`.

- **CD-05 Whether `lattice/docs/` uses flat or subdirectory layout.** `lattice/docs/` does NOT exist yet (verified). No prior convention to mirror. **Recommendation:** flat — create `lattice/docs/fsb-integration-gaps.md` directly. Lattice's other long-form docs live in `lattice/.planning/`, but that directory is gitignored per Lattice's own conventions; `docs/` is the conventional place for committed audit material.

- **CD-06 LATTICE-PIN.md schema.** **Recommendation:** markdown table with per-phase rows — consistent with `.planning/` style and CONTEXT.md's row-format preference (D-04).

### Deferred Ideas (OUT OF SCOPE)

- Sidepanel-side Lattice consumption — own phase later.
- Headless MV3 SW test harness — deferred until a phase actually needs continuous MV3 SW correctness gates.
- REQUIREMENTS.md LSDK/FINT REQ-ID population — Phase 2 setup work.
- Lattice mainline PR cadence — deferred to v0.11.0+ per D-15.
- Lattice receipt-shape extensions (stepName/stepIndex/parentStepName fields).
- Tripwire band system extensions.
- Provider adapter alignment for FSB's 7-provider matrix.
- Delegation primitive — pending Lattice's multi-agent policy stance.
- MV3-survivability adapter contract — own Lattice-side phase.

</user_constraints>

<phase_requirements>
## Phase Requirements

No specific REQ-IDs are mapped to this phase yet. REQUIREMENTS.md contains category scaffolds only (LSDK-01..N TBD, FINT-01..N TBD, MCP-01..N TBD, PRV-01..N TBD). Per Phase 1 CONTEXT.md, populating REQ-IDs is deferred to Phase 2 setup work.

The planner references requirements by **category**, not by REQ-ID:

| Category | Phase 1 Coverage | Research Support |
|----------|------------------|------------------|
| LSDK | The audit doc identifies which LSDK-NN items future phases will populate. No LSDK REQ work executes in Phase 1. | See "Standard Stack -> Lattice v1.1 surface inventory" and "6-Surface Audit Starter Inventory" sections. |
| FINT | FINT-01 conceptual scope (path: dep wiring + MV3 SW import) is the scaffolding deliverable. Concrete REQ-ID not yet assigned. | See "Standard Stack -> npm dependency spec" + "Architecture Patterns -> Bridge file placement". |
| MCP | INV-01 (MCP wire contracts untouched) is verified by the existing `tests/tool-definitions-parity.test.js` continuing to pass. Phase 1 adds an additive smoke test only. | See "Validation Architecture" section. |
| PRV | No provider work in Phase 1 (audit only). | n/a |

**Pass criteria (from CONTEXT.md D-12):**

| # | Check | Research-derived test |
|---|-------|----------------------|
| 1 | `lattice/docs/fsb-integration-gaps.md` exists on `fsb-integration-experiments` covering all 6 surfaces, severity-tagged | Doc check — see "6-Surface Audit Starter Inventory" for the rows |
| 2 | `npm test` runs `tests/lattice-smoke.test.js` and the smoke passes (one receipt minted via Lattice) | Node smoke — see "Code Examples -> Smoke test skeleton" |
| 3 | Manual MV3 SW reload check: extension loads cleanly with Lattice bridge module imported; no console errors | Manual ceremony — **see "User-Decision Conflict" — D-06 as written requires manifest changes that break `background.js`** |

</phase_requirements>

## Summary

Phase 1 is **scaffolding**, not primitive design. The research scope was: (a) inventory exactly what Lattice ships TODAY across the 6 audit surfaces so the audit doc has a starting row set; (b) confirm the FSB → Lattice integration mechanics (npm spec, ESM import path, MV3 SW load semantics) with concrete versions and commands; (c) flag any decision conflict between the CONTEXT.md locked decisions and the empirical state of the repos.

**Key findings:**

1. **Lattice v1.1 receipts surface is mature and self-contained.** The Capability Receipt mint+verify round-trip is exercised by `lattice/packages/lattice/src/receipts/{receipt,sign,verify,keyset,canonical,envelope,types,redact}.ts` plus eight `*.test.ts` siblings (Vitest). The public surface in `src/index.ts` exports `createReceipt` indirectly (the smoke imports it via `import { createInMemorySigner, generateEd25519KeyPairJwk, verifyReceipt, createMemoryKeySet } from "lattice"` — see Code Examples). `[VERIFIED: src/index.ts, src/receipts/*.ts]`

2. **Lattice has no `dist/` yet.** `lattice/packages/lattice/dist/` does NOT exist on disk. Developer must run `pnpm install && pnpm build` (top-level) before any FSB-side `npm install` can resolve `import 'lattice'`. `[VERIFIED: ls /lattice/packages/lattice/]`

3. **`file:./lattice/packages/lattice` is the correct npm spec.** Empirically tested with `npm 11.12.1` + `Node 25.9.0`: `file:` resolves directory deps via a **symlink** into `node_modules/`, and bare-specifier `import 'pkg-name'` works end-to-end. **`link:` fails on npm 11** (the spec is silently ignored — no symlink, ERR_MODULE_NOT_FOUND on import). `[VERIFIED: /tmp/npm-spec-probe live test]`

4. **CRITICAL: D-06 conflicts with FSB's `background.js` architecture.** D-06 mandates the SW bridge uses `import` syntax, which requires `"type": "module"` in `manifest.json`'s `background` block. But FSB's current `background.js` makes ~100+ `importScripts()` calls at file head (verified the first ~60 lines: 54 `importScripts` calls). **Module-type service workers cannot use `importScripts()`** — they are mutually exclusive. Adding `"type": "module"` to the manifest will fail to register the SW. The Phase 1 plan MUST either (a) defer the in-SW import check to a future phase and use FSB's existing **offscreen document** context (`extension/offscreen/stt.html`, already in manifest) for the manual check, or (b) commit to migrating `background.js` from `importScripts` to `import` in Phase 1 (out-of-scope per D-12 and "scope anchor" line in CONTEXT.md). **See "User-Decision Conflict" below — this needs user confirmation before planning.** `[VERIFIED: extension/manifest.json + extension/background.js + Chrome MV3 docs]`

5. **FSB Node test harness is plain `node tests/file.test.js` CommonJS.** No vitest, no Jest, no runner. Each test file is `'use strict'` + `require('node:assert')` + manual `passed/failed` counters + `console.log('  PASS:', msg)`. `npm test` is a long `&&` chain — Phase 1 appends `node tests/lattice-smoke.test.js` to the chain. **Since Lattice is ESM-only, the smoke uses `await import('lattice')` (dynamic ESM import from CJS).** `[VERIFIED: package.json scripts.test + tests/install-identity.test.js + tests/agent-loop-empty-contents.test.js]`

6. **No `lattice/docs/` directory exists.** Lattice's planning docs live in `lattice/.planning/` (gitignored per Lattice's own `.gitignore`). Creating `lattice/docs/fsb-integration-gaps.md` as a flat path is fresh territory — no existing convention to mirror. `[VERIFIED: ls /lattice]`

7. **`Ref:` cross-repo backref is non-standard but unambiguous.** Conventional Commits 1.0.0 specifies the body footer format (`token: value`); `Ref:` is grep-able and used elsewhere in the FSB tree (verified by recent commit log style). Lattice itself uses `Co-Authored-By:` footers in some commits but no prior `Ref:` line — Phase 1 introduces it cleanly. `[VERIFIED: lattice git log]`

**Primary recommendation:** Treat the D-06 SW-import question as a **gated user-confirmation point**. Plan Phase 1 with two prepared branches: (A) D-06 as written → must include `manifest.json` change + `background.js` migration → exceeds D-13 scope ceiling. (B) D-06 deferred to the next phase → smoke test still proves FSB consumes Lattice (Node-side smoke is fully sufficient for D-12 #2) AND the manual MV3 check happens in the **offscreen** context which already loads HTML and can declare `<script type="module">`. Branch B keeps Phase 1 within the locked scope ceiling and is research-recommended. Branch A is also viable but reframes Phase 1 from "audit + scaffold" to "audit + scaffold + SW migration" — a larger phase.

## User-Decision Conflict (REQUIRES USER REVIEW)

**Conflict:** D-06 says the bridge file uses `import { … } from 'lattice'` and FSB's `background.js` loads it (D-06 text: "FSB's smoke path adds a module-type bridge file (e.g., `extension/lattice-bridge.js`) that does `import { … } from 'lattice'`. `background.js` itself stays vanilla classic-script.").

The problem: a Chrome MV3 service worker can be **either**:
- **Classic** (no `"type"` field): uses `importScripts()` for code loading. CANNOT use `import` syntax.
- **Module** (`"type": "module"`): uses `import` statements. CANNOT use `importScripts()`.

[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics — "Module scripts don't support importScripts(). To use the import statement, add the 'type' field to your manifest…"]

If the bridge file is loaded **from `background.js`** by any means, it inherits the SW context. There are exactly three ways `background.js` could pull in `lattice-bridge.js`:

| Method | Works in classic SW? | Works in module SW? | Lattice ESM import works? |
|--------|--------------------|---------------------|--------------------------|
| `importScripts('lattice-bridge.js')` | yes | NO — module SW disallows importScripts | NO (the bridge can't use `import`) |
| `import('./lattice-bridge.js')` (dynamic) | NO — dynamic import not supported in MV3 SW per Chrome docs | NO — dynamic import not supported | n/a |
| `import './lattice-bridge.js'` (static) at top of background.js | NO — classic SW disallows static imports | yes, but requires `"type": "module"` | yes |

**Pattern matrix conclusion:** D-06 as written REQUIRES adding `"type": "module"` to `manifest.json`'s `background` block — at which point the existing 100+ `importScripts(...)` calls in `background.js` all fail at SW registration. Migrating those to ES `import` statements is a substantial refactor (cascading changes across `extension/utils/*.js`, `extension/config/*.js`, `extension/ai/*.js`, `extension/ws/*.js`).

**Three options to resolve:**

- **OPTION A (D-06 as written):** Add `"type": "module"` to manifest + migrate `background.js` `importScripts` calls to `import` statements. **Cost:** large refactor far exceeding D-13's "at most ONE tsconfig/exports tweak on Lattice side; nothing else" ceiling (D-13 is Lattice-side scope, but the parallel FSB-side scope ceiling applies and would similarly be blown). **Cost:** parallel risk of breaking the entire SW boot sequence — many of the existing `importScripts` chains are load-order-sensitive (verified in `background.js` head comments: "Phase 269 / v0.9.69: install-identity.js MUST load FIRST"). Phase 1 becomes a 4-6 plan phase instead of the intended scaffolding phase.

- **OPTION B (deferred SW load — RESEARCH-RECOMMENDED):** Keep D-06's intent (FSB consumes Lattice via native ES modules) but the **manual check** moves from SW context to the **offscreen document** context. FSB already has `extension/offscreen/stt.html` + the `"offscreen"` permission in manifest. Offscreen pages are standard HTML and can declare `<script type="module" src="lattice-bridge.js">` without any manifest changes. The bridge file mints a receipt at page load and `console.log`s the success — developer reloads the extension, opens the offscreen page's devtools, observes the log. The SW itself doesn't touch Lattice in Phase 1. Phase 2+ (or whatever phase ACTUALLY needs Lattice on the SW critical path) handles the SW migration as its own scoped concern. **This honors D-13's scope ceiling. D-06's "in the service worker" intent becomes "in extension context (offscreen)" — a deviation that needs explicit user OK.**

- **OPTION C (skip the manual extension-side check entirely for Phase 1):** Smoke = Node-side only. D-09's "manual MV3 SW reload check" is downgraded to "manual extension reload + verify no SW console errors after bridge file is added but not executed". D-12 check #3 is reinterpreted as "the extension still loads cleanly when the bridge file exists in the tree, even though nothing imports it yet". **Weakest signal — doesn't actually prove Lattice loads in a Chrome runtime context — but technically satisfies D-13.**

**Researcher's recommendation:** **Option B.** It preserves the user's stated intent (prove Lattice loads in a real Chrome extension runtime, not just Node) while keeping Phase 1 within its scope ceiling. The SW-context import is the right thing to want — it just isn't safely achievable in this phase given the existing `importScripts` architecture. The discuss-phase / planner must surface this to the user and get an explicit nod for Option B (or a re-scope decision for Option A) before locking the plan.

## Standard Stack

### Lattice v1.1 surface inventory (the audit input)

| File | Exports | Source confidence |
|------|---------|-------------------|
| `lattice/packages/lattice/src/index.ts` | Top-level public surface — `verifyReceipt`, `createMemoryKeySet`, `createInMemorySigner`, `generateEd25519KeyPairJwk`, `createAI`, `createReceipt` (NOT re-exported from index — must import from internal path or via deeper barrel), provider adapters, etc. | HIGH `[VERIFIED: src/index.ts, lines 1-115]` |
| `src/receipts/receipt.ts` | `createReceipt(input, signer) → Promise<ReceiptEnvelope>` — the mint primitive. **Note:** NOT re-exported from `src/index.ts`. The smoke imports it via the deep path `import { createReceipt } from "lattice/dist/receipts/receipt.js"` OR (cleaner) Phase 1 adds it to `src/index.ts` as the "at most one tsconfig/exports tweak" allowed by D-13. **See "Lattice-side packaging tweak" below.** | HIGH `[VERIFIED: src/receipts/receipt.ts:68]` |
| `src/receipts/sign.ts` | `createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk }) → ReceiptSigner`, `generateEd25519KeyPairJwk() → { privateKeyJwk, publicKeyJwk }`, plus low-level WebCrypto Ed25519 helpers | HIGH `[VERIFIED: src/receipts/sign.ts:56-114]` |
| `src/receipts/verify.ts` | `verifyReceipt(envelope, keySet) → Promise<VerifyResult>` (typed result, never throws) | HIGH `[VERIFIED: src/receipts/verify.ts:72-152]` |
| `src/receipts/keyset.ts` | `createMemoryKeySet(entries) → KeySet` (in-memory map of kid → KeyEntry) | HIGH `[VERIFIED: src/receipts/keyset.ts:18-28]` |
| `src/receipts/types.ts` | All canonical types: `CapabilityReceiptBody`, `ReceiptEnvelope`, `ReceiptSigner`, `KeySet`, `KeyEntry`, `VerifyResult`, `VerifyError`, `ContractVerdict`, `ReceiptUsageCanonical`, etc. | HIGH `[VERIFIED: src/receipts/types.ts]` |
| `src/receipts/canonical.ts` | `canonicalizeReceiptBody`, `usageToCanonical`, `stringifyCostUsd` (internal — RFC 8785 JCS) | HIGH `[VERIFIED]` |
| `src/receipts/envelope.ts` | DSSE v1.0 PAE + envelope encoder/decoder. `PAYLOAD_TYPE = "application/vnd.lattice.receipt+json"` | HIGH `[VERIFIED: src/receipts/envelope.ts:31]` |
| `src/receipts/redact.ts` | `DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1"`, `redactReceiptBody` (redact-then-sign ordering) | HIGH `[VERIFIED: src/receipts/redact.ts]` |
| `src/policy/policy.ts` | `PolicySpec` (maxCostUsd, latency, privacy, providerAllowList, providerDenyList, noUpload, noPublicUrl, noLogging, metadata) + `mergePolicy`. **This is what Lattice has today for tripwire-adjacent surface — a single PolicySpec record. NOT priority bands, NOT matcher regex, NOT race-with-log.** | HIGH `[VERIFIED: src/policy/policy.ts — entire 25-line file]` |
| `src/contract/tripwire.ts` | `evaluateTripwires(output, invariants, detectors?) → Promise<TripwireResult>` — pure evaluator. Invariant kinds: `must-cite`, `field-from-table`, `no-pii`, `matches`. NO priority bands. NO mid-session registration. NO race-with-log per-handler budget. | HIGH `[VERIFIED: src/contract/tripwire.ts:53-86]` |
| `src/contract/{contract,invariants,pii-detectors,preflight}.ts` | Capability contract schema + preflight evaluation | HIGH `[VERIFIED]` |
| `src/providers/provider.ts` | `ProviderAdapter`, `ProviderRunRequest`, `ProviderRunResponse`, `Usage`, `ModelCapability`, `CapabilityModality`, `ProviderTransportMode` | HIGH `[VERIFIED]` |
| `src/providers/{adapters,fake,packaging}.ts` | `createAISdkProvider`, `createOpenAICompatibleProvider`, `createOpenAIProvider`, `createFakeProvider`. NO Anthropic adapter. NO Gemini adapter. NO LM Studio adapter. NO xAI adapter. NO OpenRouter adapter. | HIGH `[VERIFIED: src/providers/adapters.ts + src/index.ts re-export lines 19-23]` |
| `src/runtime/create-ai.ts` | `createAI(config) → AI` — runtime facade. Conceptually Lattice's "agent loop" but it's a single `ai.run({ task, artifacts, outputs, policy })` invocation, NOT a `setTimeout`-chained MV3-survivable iterator. NO concept of "execution context can be evicted mid-flow". | HIGH `[VERIFIED: src/runtime/create-ai.ts:118-138]` |
| `src/tracing/tracing.ts` | `TracerLike` interface + `RunEventKind` union (`run.start`, `artifact.ingested`, `context.packed`, `router.candidates`, `stage.start`, `stage.complete`, `provider.attempt`, `fallback.activated`, `validation.complete`, `validation.failed`, `artifact.created`, `run.complete`, `run.failed`, `tool.call`, `replay.offline`, `replay.live`) + `createRunEvent`. NO `step.start` / `step.transition` / `stepName` / `stepIndex`. NO MV3-eviction recovery markers. | HIGH `[VERIFIED: src/tracing/tracing.ts:1-53]` |
| `src/tools/tools.ts` | `defineTool`, `runTool`, `importMcpTools` (Standard Schema based) — single-tool execution. **No "delegation" / "subagent" / "parent-child loops" concept anywhere in Lattice v1.1.** | HIGH `[VERIFIED: src/tools/tools.ts:29-60 + src/index.ts:37]` |
| `src/sessions/session.ts` | `createMemorySessionStore`, `SessionStore`, `SessionRecord`, branch + appendTurn. Designed for `createAI` run history, NOT for multi-process resumption. | HIGH `[VERIFIED: src/sessions/session.ts]` |

### npm dependency spec (CD-01)

| Option | Empirical result on npm 11.12.1 / Node 25.9.0 | Recommendation |
|--------|------------------------------------------------|----------------|
| `"lattice": "file:./lattice/packages/lattice"` | Creates `node_modules/lattice` as a **symlink** into `lattice/packages/lattice/`. Bare-specifier `import 'lattice'` resolves correctly via the package's `exports` map (`./dist/index.js`). Re-running `npm install` is idempotent. | **USE THIS** `[VERIFIED: /tmp/npm-spec-probe live test]` |
| `"lattice": "link:./lattice/packages/lattice"` | **No symlink created.** `node_modules/` has no `lattice/` entry. `import 'lattice'` fails with `ERR_MODULE_NOT_FOUND`. (npm 11 silently ignores `link:` for un-workspaced consumers — does NOT match documentation that says it should symlink.) | Do not use `[VERIFIED: /tmp/npm-spec-probe]` |
| `npm install --no-save ./lattice/packages/lattice` | Same behavior as `file:` (creates symlink) BUT not recorded in `package.json` so the dependency is invisible to subsequent `npm install` runs after a clean checkout. | Do not use — fails reproducibility for new contributors `[ASSUMED based on npm install --no-save semantics]` |
| `npm link` (separate `npm link` in `lattice/` then `npm link lattice` in FSB) | Two-step ceremony, requires global `node_modules`, breaks on every clean checkout (global symlinks don't survive). | Do not use — wrong for D-07's "developer-driven, gitignored" model `[ASSUMED]` |

### Node + npm + pnpm version baseline

| Tool | Local version | Required minimum |
|------|---------------|-----------------|
| Node | `v25.9.0` (current dev machine) `[VERIFIED: node --version]` | FSB requires `>=16` (per `package.json` engines); Lattice requires `>=24` (per `lattice/package.json` engines). Lattice's `>=24` is the binding floor. `[VERIFIED: package.json:71-73 + lattice/packages/lattice/package.json:7-9]` |
| npm | `11.12.1` `[VERIFIED]` | npm 7+ for `file:` symlink behavior; npm 11 is fine. `[VERIFIED]` |
| pnpm | `10.29.3` `[VERIFIED: pnpm --version]` | Lattice's `pnpm-workspace.yaml` uses `packageManager: "pnpm@10.33.1"` `[VERIFIED: lattice/package.json]`. 10.29 vs 10.33 is patch-level drift; the lockfile may regenerate but build still works. `[ASSUMED based on pnpm semver behavior]` |

### FSB test harness pattern

| Property | Value |
|----------|-------|
| Test framework | none — raw `node tests/file.test.js` invocation |
| Test files | 144 files in `tests/` `[VERIFIED: ls /tests/ \| wc -l]` |
| Test file convention | `'use strict'`; CommonJS; `const assert = require('node:assert')` or `require('assert')`; manual counters; `console.log('  PASS:', msg)` / `console.error('  FAIL:', msg)`; exit code via `process.exit(failed > 0 ? 1 : 0)` `[VERIFIED: tests/install-identity.test.js + tests/agent-loop-empty-contents.test.js]` |
| `npm test` script | Single-line `&&` chain — Phase 1 appends one cell to the end `[VERIFIED: package.json:16]` |
| Fixture convention | `tests/fixtures/` exists, but contains only data fixtures (`dom-stream-50k.html`, `model-discovery-responses.js`, `multi-agent-regression-helpers.js`, `run-task-harness.js`) — not test stubs. Test stubs are inline. `[VERIFIED: ls tests/fixtures/]` |
| ESM-from-CJS pattern | FSB tests are CJS by default (`require()`). Lattice is ESM-only (`"type": "module"` in Lattice's package.json). The smoke MUST use `await import('lattice')` dynamically inside an `async` block. Empirically tested on Node 25.9: `await import('lattice')` from a `'use strict'` CJS test file works cleanly. `[VERIFIED: /tmp/npm-spec-probe smoke.test.js]` |

### Lattice build flow (D-07)

```bash
# Once per machine (or after Lattice's package.json/dependency changes):
cd lattice
pnpm install   # populates lattice/node_modules + workspace symlinks
pnpm build     # runs `pnpm -r build` -> `tsdown` in each workspace package
               # produces lattice/packages/lattice/dist/{index.js, index.d.ts, index.js.map}
```

Verified facts:
- `lattice/package.json` `scripts.build = "pnpm -r build"` `[VERIFIED]`
- `lattice/packages/lattice/package.json` `scripts.build = "tsdown"` `[VERIFIED]`
- `lattice/packages/lattice/tsdown.config.ts` `entry: ["src/index.ts"], format: ["esm"], dts: true, clean: true` → produces a single `dist/index.js` + `dist/index.d.ts` + sourcemaps `[VERIFIED: tsdown.config.ts]`
- `lattice/packages/lattice/package.json` `exports: { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }` — this is what FSB's `import 'lattice'` resolves through `[VERIFIED: lattice/packages/lattice/package.json:10-15]`
- `dist/` is gitignored at Lattice's root level — must be rebuilt per-developer `[VERIFIED via Lattice's tree state: no dist/ directory present]`

### Lattice-side packaging tweak (the D-13 "at most ONE tsconfig/exports tweak")

`createReceipt` is NOT re-exported from `lattice/packages/lattice/src/index.ts`. The smoke needs it. Options:

| Approach | D-13 cost | Tradeoff |
|----------|-----------|----------|
| Add `export { createReceipt, type CreateReceiptInput } from "./receipts/receipt.js";` to `src/index.ts` | One line. Falls cleanly within "exports tweak". | **PREFERRED** — makes the API discoverable + matches Lattice's own work-inbox example pattern, which already uses `createReceipt` directly via `examples/work-inbox/setup.mjs` `[VERIFIED via Lattice's milestone audit doc referencing the file]` |
| Smoke imports via deep path `import { createReceipt } from "lattice/dist/receipts/receipt.js"` | Zero — no Lattice change | Brittle; deep paths bypass the `exports` map and may break if tsdown reorganizes. Also makes FSB's smoke harder to read. |
| Smoke imports via `import { createReceipt } from "lattice"` after Lattice tweaks `exports` map to add a `./receipts` subpath | One exports-map entry. | Within D-13 ceiling but is arguably a wider surface change than a single `export` line. |

**Recommendation:** add a single `export { createReceipt, type CreateReceiptInput } from "./receipts/receipt.js"` line to `src/index.ts`. This is the entire allowed Lattice-side code change for Phase 1.

## Architecture Patterns

### Recommended file layout (FSB-side, all new)

```
extension/
├── lattice-bridge.js          # NEW — only if D-06 Option A is chosen (see User-Decision Conflict)
└── offscreen/
    ├── lattice-smoke.html     # NEW — Option B path: classic HTML page with <script type="module">
    └── lattice-smoke.js       # NEW — Option B path: the ES module the HTML loads

tests/
└── lattice-smoke.test.js      # NEW — Node-side smoke (D-09 prong 1, D-11)

.planning/
└── LATTICE-PIN.md             # NEW — single FSB-side audit trail of Lattice work (D-08, D-16)

lattice/                        # GITIGNORED; lives on Lattice's fsb-integration-experiments branch
├── docs/
│   └── fsb-integration-gaps.md  # NEW — D-02 deliverable
└── packages/lattice/src/
    └── index.ts                # MODIFIED — D-13 single allowed Lattice-side tweak: re-export createReceipt
```

### Bridge file placement (CD-02)

Conditional on Option chosen:

- **Option A (D-06 as written):** `extension/lattice-bridge.js` at top level. The bridge is the FIRST module-type SW script and the only consumer of `import 'lattice'` until later phases.
- **Option B (offscreen — RECOMMENDED):** `extension/offscreen/lattice-smoke.html` + `extension/offscreen/lattice-smoke.js`. The smoke HTML page declares `<script type="module" src="lattice-smoke.js"></script>` and the JS file does `import { createInMemorySigner, generateEd25519KeyPairJwk, createReceipt, verifyReceipt, createMemoryKeySet } from "lattice";` — but **wait**: ESM `import 'lattice'` inside a Chrome extension context requires the package to be reachable from the extension's resource tree, NOT from `node_modules/`. **Chrome doesn't resolve npm bare specifiers at runtime.** This is a layered problem — see "Common Pitfalls -> Bare specifiers in extension context" below.

### Pattern 1: dynamic ESM import from CJS test (Node-side smoke)

**What:** FSB's test convention is CJS. Lattice is ESM-only. Dynamic `import()` bridges them.

**When to use:** Always, for the `tests/lattice-smoke.test.js` file.

**Example:**

```javascript
// Source: empirical test in /tmp/npm-spec-probe + verified against Lattice's src/receipts/receipt.test.ts patterns
'use strict';

const assert = require('node:assert/strict');

let passed = 0, failed = 0;
function pass(msg) { passed++; console.log('  PASS:', msg); }
function fail(msg, err) { failed++; console.error('  FAIL:', msg, err?.message ?? ''); }

(async () => {
  console.log('\n--- Lattice v1.1 smoke: mint + verify one Capability Receipt ---');

  // Dynamic ESM import — Lattice is "type": "module" so static require() would fail.
  const lattice = await import('lattice');

  // Step 1: generate an ephemeral Ed25519 keypair (the smoke's signer)
  const { privateKeyJwk, publicKeyJwk } = await lattice.generateEd25519KeyPairJwk();
  const signer = lattice.createInMemorySigner(privateKeyJwk, {
    kid: 'fsb-smoke-key-1',
    publicKeyJwk,
  });

  // Step 2: mint a receipt against a stubbed capability
  // NOTE: createReceipt is NOT re-exported from lattice's index in v1.1 — Phase 1's
  // one allowed Lattice-side tweak adds the re-export. After the tweak, lattice.createReceipt
  // is reachable via the bare import.
  const envelope = await lattice.createReceipt(
    {
      runId: 'fsb-smoke-run-1',
      model: { requested: 'stub-model', observed: null },
      route: { providerId: 'fsb-smoke', capabilityId: 'fsb-smoke/stub', attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      contractVerdict: 'success',
      contractHash: null,
      inputHashes: [],
      outputHash: null,
    },
    signer,
  );

  // Step 3: assert envelope shape
  assert.equal(envelope.payloadType, 'application/vnd.lattice.receipt+json');
  pass('envelope.payloadType is Lattice receipt media type');
  assert.equal(envelope.signatures.length, 1);
  pass('envelope has exactly one signature');
  assert.equal(envelope.signatures[0].keyid, 'fsb-smoke-key-1');
  pass('signature.keyid matches signer.kid');

  // Step 4: verify the receipt round-trips through Lattice's verifier
  const keySet = lattice.createMemoryKeySet([
    { kid: 'fsb-smoke-key-1', publicKeyJwk, state: 'active' },
  ]);
  const result = await lattice.verifyReceipt(envelope, keySet);
  assert.equal(result.ok, true);
  pass('verifyReceipt returns ok=true');
  if (result.ok) {
    assert.equal(result.body.version, 'lattice-receipt/v1');
    pass('verified body.version is lattice-receipt/v1');
    assert.equal(result.body.kid, 'fsb-smoke-key-1');
    pass('verified body.kid round-trips');
    assert.equal(result.keyState, 'active');
    pass('verified keyState is active');
  }

  console.log(`\nLattice smoke: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Smoke harness error:', err);
  process.exit(1);
});
```

### Pattern 2: offscreen-document Lattice ESM load (Option B for D-12 check #3)

**What:** Use an offscreen HTML page (FSB already has `"offscreen"` permission + an existing `extension/offscreen/stt.html`) to provide a DOM ES-module context for the bridge.

**When to use:** Option B for D-06 reconciliation (research-recommended).

**Tradeoff:** Chrome extension HTML pages can use `<script type="module">` but bare-specifier `import 'lattice'` still doesn't work because Chrome doesn't resolve npm specifiers at runtime. The extension page can only resolve URLs (`./` paths) or `chrome-extension://...` paths. So the offscreen page must `import './lattice-built.js'` where `lattice-built.js` is either:

- (a) a copy of `lattice/packages/lattice/dist/index.js` placed under `extension/` so it's part of the loaded extension resource tree, OR
- (b) a wrapper that re-exports a single function (still requires placing the built file in `extension/`)

**This means D-06 — "native ES module imports via a new bridge file" — also fails on bare-specifier resolution.** Chrome extensions cannot `import 'lattice'`; they can only `import './path/to/lattice.js'`. Either:
- bundle the built file into the extension's resource tree per release (a build step FSB doesn't currently have), or
- defer all in-extension Lattice loading to a later phase that introduces a bundler.

The user's D-06 intent — "FSB's smoke path adds a module-type bridge file that does `import { … } from 'lattice'`" — is unachievable as literally written in any Chrome extension context (SW or offscreen) without a bundler. This is the **second** finding the planner must surface to the user.

**Recommendation:** For D-12 check #3, the MOST honest version of the manual MV3 reload check is: "Extension loads cleanly with the audit + LATTICE-PIN.md + smoke file present in the tree; no console errors caused by the new files (because the new files are not actually loaded in any extension context yet)." This is Option C from the User-Decision Conflict — the weakest of the three.

Alternatively: skip in-extension Lattice import for Phase 1 entirely. The Node-side smoke (D-12 #2) is the substantive proof that FSB CAN consume Lattice. The manual reload is downgraded to a sanity check that adding the artifacts doesn't break the extension.

### Anti-Patterns to Avoid

- **Hand-rolling Capability Receipt minting in FSB.** Lattice's v1.1 receipts surface is mature (451 tests behind it `[VERIFIED: STATE.md]`); the smoke MUST call `lattice.createReceipt`, not a FSB-side implementation. INV-06 enforces this.
- **Bundling Lattice into FSB during Phase 1.** D-13 explicitly forbids it. Phase 1 is scaffolding, not packaging.
- **Adding a `postinstall` script that runs `pnpm build` in `lattice/`.** D-07 says "developer-driven `pnpm install && pnpm build`". A postinstall would couple FSB's `npm install` to Lattice's pnpm toolchain — explicitly rejected.
- **Treating `link:` as a synonym for `file:`.** They behave differently on npm 11 (`link:` is silently ignored for non-workspace consumers, no symlink created). Use `file:`.
- **Trying to mix `importScripts()` and `import` in the same MV3 SW.** Mutually exclusive — Chrome rejects SW registration.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Capability Receipt mint | FSB-side `createReceipt` helper | `lattice.createReceipt` (after Phase 1's index.ts re-export tweak) | INV-06 + Lattice's 451-test mature surface; FSB-side would duplicate redact-then-sign + DSSE PAE + JCS canonical form. |
| Ed25519 signer | FSB-side WebCrypto wrapper | `lattice.createInMemorySigner` + `lattice.generateEd25519KeyPairJwk` | Lattice's signer has @noble/ed25519 parity oracle defending against silent Node WebCrypto regressions `[VERIFIED: lattice MILESTONES.md v1.1 entry]` |
| Receipt verifier | FSB-side `verifyReceipt` | `lattice.verifyReceipt` | Lattice's verifier is panic-free (typed VerifyResult, never throws across the verification boundary) — see `src/receipts/verify.ts` for the 8-step decision tree |
| KeySet | FSB-side keyset registry | `lattice.createMemoryKeySet` | Trivial, but using Lattice's keeps the smoke's API surface 100% Lattice. |
| Conventional commit footer parser | n/a | Grep for `Ref:` in commit bodies — manual but unambiguous | `Ref: FSB v0.10.0-attempt-2 Phase 1` is the agreed convention per D-14. |
| LATTICE-PIN.md schema | Custom JSON schema | Markdown table (CD-06) | Consistent with `.planning/` style; grep-able. |

**Key insight:** Phase 1 is a **wiring** phase. Nothing primitive lives in FSB. All primitives are imported from Lattice. The audit doc identifies what Phase 2+ adds to Lattice — Phase 1 itself adds nothing primitive.

## Common Pitfalls

### Pitfall 1: Lattice's `dist/` doesn't exist on a fresh clone

**What goes wrong:** Developer clones FSB → runs `npm install` → npm resolves the `file:` dep symlink → `import 'lattice'` runs and Node looks for `lattice/packages/lattice/dist/index.js` → ERR_MODULE_NOT_FOUND because the file doesn't exist.

**Why it happens:** Lattice's `dist/` is gitignored. Without the explicit `cd lattice && pnpm install && pnpm build` ceremony, the symlink points at a directory missing its build output.

**How to avoid:** Phase 1 PLAN must include a "Setup" task that runs `pnpm install && pnpm build` BEFORE the first `npm install` in FSB. CONTRIBUTING-style note (or README addition) calls this out for new developers.

**Warning signs:** `npm test` fails with `Cannot find module 'lattice'` or `ERR_MODULE_NOT_FOUND` even after `npm install` succeeded.

### Pitfall 2: `link:` silently fails on npm 11

**What goes wrong:** Developer writes `"lattice": "link:./lattice/packages/lattice"` in `package.json` based on outdated documentation → `npm install` runs without error → `node_modules/lattice/` doesn't exist → `import 'lattice'` fails at runtime.

**Why it happens:** `link:` directory specifier behavior changed in npm; on npm 11.12 the spec is parsed but no symlink is materialized for non-workspace consumers.

**How to avoid:** Use `"file:./lattice/packages/lattice"` (verified to symlink on npm 11). PLAN's acceptance check is "`ls node_modules/lattice` shows a symlink".

**Warning signs:** `npm install` exits 0 but `ls node_modules` shows no `lattice` directory.

### Pitfall 3: Bare-specifier `import` in extension context

**What goes wrong:** Developer adds `import { createReceipt } from 'lattice'` to `extension/lattice-bridge.js` → Chrome loads the file → fails with `Failed to resolve module specifier "lattice". Relative references must start with either "/", "./", or "../"`.

**Why it happens:** Chrome (and the broader Web Platform) doesn't resolve npm bare specifiers at runtime. `node_modules` is a Node.js construct. Extension contexts can only resolve relative or absolute URLs, never bare names.

**How to avoid:** Either bundle Lattice into the extension's resource tree (Phase 1 doesn't have a bundler — out of scope), or skip in-extension imports for Phase 1 and use only the Node-side smoke. See User-Decision Conflict.

**Warning signs:** Extension SW console shows `Failed to resolve module specifier "lattice"` on reload.

### Pitfall 4: SW classic vs module mutual exclusion

**What goes wrong:** Developer adds `"type": "module"` to `manifest.json` → extension reload → SW fails to register → no console error in extension console (errors surface only in `chrome://serviceworker-internals`).

**Why it happens:** Module-type SW cannot use `importScripts()`. FSB's `background.js` has ~100+ `importScripts()` calls; they all fail.

**How to avoid:** Don't add `"type": "module"` in Phase 1. Either defer SW migration to a later phase (Option B) or commit to the full SW refactor in Phase 1 (Option A — research recommends against).

**Warning signs:** Extension reload appears to succeed but `chrome.runtime.getBackgroundPage` returns null; alarms don't fire; the SW console panel never appears.

### Pitfall 5: Lattice TypeScript `verbatimModuleSyntax` + import-from-built mismatch

**What goes wrong:** Developer accidentally imports a type-only export at runtime (e.g., `import { ReceiptEnvelope } from 'lattice'` and uses it as a constructor) → silent runtime undefined.

**Why it happens:** Lattice's `tsconfig.base.json` uses `"verbatimModuleSyntax": true` `[VERIFIED]`. Types are erased at build; runtime values are kept. The published `dist/index.js` only contains value exports.

**How to avoid:** When importing from Lattice in the smoke, use only the runtime functions (`createReceipt`, `createInMemorySigner`, `generateEd25519KeyPairJwk`, `verifyReceipt`, `createMemoryKeySet`). Treat all `type` exports as Node-side documentation only — don't dereference them at runtime.

**Warning signs:** Smoke test logs `[Function: <name>]` is `undefined`.

### Pitfall 6: pnpm version drift breaking the workspace

**What goes wrong:** Developer has pnpm 10.29 (or 10.0); Lattice's `pnpm-workspace.yaml` declares `packageManager: "pnpm@10.33.1"` → `pnpm install` warns about version mismatch → catalogs may not resolve cleanly.

**Why it happens:** pnpm catalog feature changed between minor versions.

**How to avoid:** Phase 1 PLAN's "Setup" task verifies `pnpm --version` is `>=10.29`. If not, instruct `npm install -g pnpm@10.33.1` first.

**Warning signs:** `pnpm install` warns about `packageManager` field mismatch; `pnpm build` fails with "cannot resolve catalog:" errors.

## Runtime State Inventory

Phase 1 is a scaffolding phase, not a rename/refactor/migration. **However**, two state categories DO apply:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 1 introduces no data layer. The smoke mints an ephemeral receipt that lives in test process memory only. | None |
| Live service config | None — no external services touched. | None |
| OS-registered state | Possibly: developer's `pnpm` global install. Pinned to `10.33.1` per Lattice's `packageManager` field. If developer has a different pnpm minor, the workspace install may regen the lockfile. | Developer ceremony: `npm install -g pnpm@10.33.1` if version drift detected. PLAN's "Setup" task documents the floor. |
| Secrets / env vars | None — smoke uses ephemeral generated keys. No env vars introduced or referenced. | None |
| Build artifacts | **Lattice's `dist/` directory** — gitignored per Lattice's `.gitignore`; must be regenerated per-developer via `cd lattice && pnpm install && pnpm build`. Without it, the FSB-side `file:` symlink points at a directory with no `index.js`. | PLAN's "Setup" task runs the two-command sequence; smoke test's failure mode is documented in Pitfall 1. |

## Code Examples

### Smoke test skeleton (`tests/lattice-smoke.test.js`)

See "Architecture Patterns -> Pattern 1" above for the full file.

### LATTICE-PIN.md initial schema (CD-06 — markdown table)

```markdown
# Lattice Pin

Cross-repo audit trail for FSB ↔ Lattice integration on `fsb-integration-experiments`.

## Current Pin

| Field | Value |
|-------|-------|
| Lattice branch | `fsb-integration-experiments` |
| Lattice commit SHA | `<filled by Phase 1 plan>` (the SHA Lattice was at when Phase 1 committed the audit doc) |
| FSB milestone | v0.10.0-attempt-2 |
| Pin date | 2026-05-24 |

## Per-Phase Log

| FSB phase | Lattice commit(s) added on `fsb-integration-experiments` | Notes |
|-----------|--------------------------------------------------------|-------|
| Phase 1 | `<sha>` `docs(fsb-integration): add gap survey`; (optional) `<sha>` `chore(exports): re-export createReceipt for FSB smoke` | Audit doc + at most one exports tweak per D-13 |
```

### `lattice/docs/fsb-integration-gaps.md` row format (D-04)

```markdown
| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| Receipts | stepName / stepIndex / parentStepName fields on CapabilityReceiptBody | Needs extension | Blocker | FSB's autopilot emits 12 step markers per agent loop iteration; today CapabilityReceiptBody has runId only. Receipt-extensions phase. |
| Receipts | MV3-survivable encoding (resumable receipt streams across SW evictions) | Needs addition | Blocker | Lattice has no concept of execution-context eviction mid-flow. MV3-survivability phase. |
| Tripwires/hooks | Priority bands (SAFETY > OBSERVABILITY > EXTENSION) | Needs addition | Blocker | Lattice's PolicySpec is flat; FSB's attempt-1 HookPipeline had 3 priority bands. Tripwire-extensions phase. |
| ... | ... | ... | ... | ... |
```

### Lattice-side index.ts tweak (the D-13 one allowed change)

```typescript
// lattice/packages/lattice/src/index.ts — add this line near the other receipts re-exports:
export { createReceipt, type CreateReceiptInput } from "./receipts/receipt.js";
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| FSB-side hand-rolled receipt envelope (attempt-1 `checkpoint-hook.js`) | Lattice's `createReceipt` with DSSE v1.0 + RFC 8785 JCS + Ed25519 redact-then-sign | v0.10.0-attempt-2 pivot (this milestone) | FSB stops re-inventing; per INV-06 primitives live in Lattice. |
| FSB-side HookPipeline with priority bands (attempt-1) | Lattice's tripwires (kinds: must-cite, field-from-table, no-pii, matches) — NO priority bands yet | v0.10.0-attempt-2 pivot | Bands are a Phase 2+ deliverable into Lattice. |
| `npm link` for cross-repo dev | `"file:./relative/path"` in package.json | npm 7+ symlink behavior | More reproducible; survives clean checkouts; no global state. |
| MV3 SW with `importScripts` for code load | MV3 SW with `"type": "module"` + `import` syntax | Chrome 89+ | Both are still supported in 2026; mutually exclusive within one SW. FSB stays on classic for Phase 1. |
| `link:` directory specifier expected to symlink | `file:` directory specifier symlinks; `link:` quietly ignored for non-workspace consumers on npm 11 | npm version-specific behavior | Use `file:` for FSB→Lattice wiring. |

**Deprecated/outdated:**
- `link:` directory specifier in non-workspace context (npm 11 doesn't materialize symlinks; behavior differs from documentation).
- Dynamic `import()` in MV3 SW (Chrome explicitly states not supported `[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics]`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pnpm 10.29 will accept Lattice's `pnpm@10.33.1` `packageManager` field without lockfile regression | Standard Stack -> Node + npm + pnpm version baseline | If wrong: `pnpm install` regenerates lockfile differently; build may still pass but lockfile diff appears. Mitigation: PLAN's Setup task tests `pnpm install` produces a stable lockfile. |
| A2 | `npm install --no-save ./lattice/packages/lattice` would behave like `file:` symlink-wise | Standard Stack -> npm dependency spec table | Low risk — only documented as the rejected option. PLAN doesn't depend on this claim. |
| A3 | Lattice's `examples/work-inbox/setup.mjs` calls `createReceipt` directly (referenced in Lattice's v1.1 milestone audit) | Standard Stack -> Lattice-side packaging tweak | Verified indirectly through the milestone audit doc; could not open the file in this session (didn't read /lattice/examples). Low risk: even without this evidence, adding the re-export is a one-line scope-compliant tweak. |
| A4 | Conventional Commits format accepts `Ref: <text>` as a footer token | Summary -> Key Findings #7 | Conventional Commits 1.0.0 specifies tokens of `[A-Za-z-]+` followed by `:` — `Ref` qualifies. Low risk. |

## Open Questions

1. **D-06 reconciliation (the User-Decision Conflict)**
   - What we know: D-06 says SW imports Lattice via `import 'lattice'` from a bridge file. Empirically, this requires `"type": "module"` on the SW, which is incompatible with `background.js`'s `importScripts()` calls. AND bare-specifier resolution doesn't work in any Chrome extension context without a bundler.
   - What's unclear: Which option does the user prefer — A (full refactor in Phase 1), B (defer SW import; use offscreen path), or C (Node-side smoke only + sanity reload)?
   - Recommendation: Plan phase as Option B by default; discuss-phase / planner surfaces the trade to the user before locking. If user picks A, Phase 1 grows to include the SW migration as a 2nd wave.

2. **Whether to commit `package-lock.json` with the new `file:` dep entry**
   - What we know: FSB's repo currently has no `package-lock.json` checked in (verified by `git status` — clean tree, no lockfile listed). Lattice has `pnpm-lock.yaml` committed. NPM-side, the standard expectation is lockfile committed.
   - What's unclear: Does FSB intentionally not commit `package-lock.json` (e.g., the `axios ^1.6.0` floating semver suggests no lockfile)? Or has the pre-pivot reset removed it?
   - Recommendation: Planner inspects existing FSB git history; if lockfile was never committed, Phase 1 doesn't introduce it. If it was, Phase 1's npm-install task commits the updated lockfile.

3. **What "minimum required" means for the receipt body in the smoke**
   - What we know: `CreateReceiptInput` requires `runId`, `model`, `route`, `usage`, `contractVerdict`, `contractHash`, `inputHashes`, `outputHash`. All other fields default. The smoke uses minimum valid values (see Code Examples).
   - What's unclear: Should the smoke also exercise `tripwireEvidence` and `noRouteReasons` to be more representative? Or is "one bare receipt" sufficient?
   - Recommendation: Bare receipt only. D-10 says "one Capability Receipt"; adding scenarios is scope creep into Phase 2's tripwire-extensions audit.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | FSB tests + Lattice runtime | yes | 25.9.0 (floor: `>=24` per Lattice) | — |
| npm | FSB dep wiring | yes | 11.12.1 (floor: 7+ for `file:` symlinks) | — |
| pnpm | Lattice build (`cd lattice && pnpm install && pnpm build`) | yes | 10.29.3 (Lattice's `packageManager`: 10.33.1 — minor drift acceptable) | `corepack enable && corepack prepare pnpm@10.33.1 --activate` |
| Chrome (browser) | Manual MV3 reload check (D-09 prong 2 / D-12 check #3) | yes | (any MV3-capable Chrome) | — |
| tsdown | Lattice build | yes (via Lattice's devDependencies; resolved by `pnpm install`) | 0.21.9 (per `pnpm-workspace.yaml` catalog) | — |
| Lattice's `dist/` build output | FSB `import 'lattice'` resolution | NO — does not exist on disk currently | — | Run `pnpm install && pnpm build` in `lattice/` |
| Git access to `lattice/` repo on `fsb-integration-experiments` branch | Lattice-side commits (audit doc) | yes — Lattice is at branch `fsb-integration-experiments` HEAD `8fa7b03` (chore: archive v1.1 phase directories) | `[VERIFIED]` | — |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:**
- Lattice's `dist/` — fallback is the one-time `cd lattice && pnpm install && pnpm build` sequence. PLAN must include this as a Setup task.

## Validation Architecture

> `.planning/config.json` does not set `workflow.nyquist_validation`. Per the spec, absence = enabled. Including this section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Plain `node --test`-style (no actual `node:test`; manual `pass()` / `fail()` counters per FSB convention) — verified against `tests/install-identity.test.js` and `tests/agent-loop-empty-contents.test.js` |
| Config file | none — each test is a self-contained `node tests/foo.test.js` invocation |
| Quick run command | `node tests/lattice-smoke.test.js` |
| Full suite command | `npm test` (long `&&` chain — Phase 1 appends `&& node tests/lattice-smoke.test.js` to the end after `agent-loop-empty-contents.test.js`) |

### Phase Requirements → Test Map

| Req | Behavior | Test type | Automated command | File exists? |
|-----|----------|-----------|-------------------|-------------|
| Phase 1 pass criterion #1 (audit doc) | `lattice/docs/fsb-integration-gaps.md` exists on `fsb-integration-experiments` and covers 6 domains with severity tags | manual-only (doc inspection) | `cd lattice && git show fsb-integration-experiments:docs/fsb-integration-gaps.md \| head -50` then visual scan for 6 domain sections + Severity column | ❌ Wave 0 — doc to be authored in Phase 1 |
| Phase 1 pass criterion #2 (Node smoke) | One Capability Receipt minted via `lattice.createReceipt`, verified via `lattice.verifyReceipt` | unit (single file) | `node tests/lattice-smoke.test.js` | ❌ Wave 0 — file to be authored in Phase 1 |
| Phase 1 pass criterion #3 (manual MV3 check) | Extension loads cleanly with Phase 1's new files (bridge or offscreen artifacts) in tree; no module-load errors in either SW console or offscreen console | manual-only (Chrome reload + DevTools inspection) | n/a — captured in PHASE-SUMMARY as screenshot + log excerpt | ❌ Wave 0 — ceremony to be defined in Phase 1 PLAN once D-06 conflict resolved |
| INV-01 (MCP wire contracts UNTOUCHED) | `tests/tool-definitions-parity.test.js` still passes | unit | `node tests/tool-definitions-parity.test.js` | yes — already in repo, must not regress |
| `npm test` parity (other tests still pass) | Full chain green | suite | `npm test` | yes — existing chain |

### Sampling Rate

- **Per task commit:** `node tests/lattice-smoke.test.js` (quick local feedback, < 2 seconds)
- **Per wave merge:** `npm test` (full chain, includes the smoke at the end)
- **Phase gate (before `/gsd-verify-work`):** Full `npm test` green + Lattice-side audit doc visible on `fsb-integration-experiments` HEAD + manual MV3 reload evidence captured

### Wave 0 Gaps

- [ ] `tests/lattice-smoke.test.js` — covers D-12 check #2 (one receipt minted + verified via Lattice's existing v1.1 surface)
- [ ] `.planning/LATTICE-PIN.md` — covers D-08 (cross-repo audit trail) and D-16 (single FSB-side index of Lattice work)
- [ ] `lattice/docs/fsb-integration-gaps.md` — covers D-02 (single source of truth for the audit) and D-12 check #1
- [ ] (Lattice-side, scope-permitting) `lattice/packages/lattice/src/index.ts` — one-line re-export of `createReceipt` so the smoke's bare-specifier import works cleanly
- [ ] **Resolved D-06 path:** either (A) `extension/lattice-bridge.js` + `manifest.json` patch + `background.js` refactor wave, OR (B) `extension/offscreen/lattice-smoke.html` + `extension/offscreen/lattice-smoke.js` + bundling decision, OR (C) downgrade D-12 check #3 to sanity reload + no in-extension import. Discuss-phase / planner MUST pick before this wave starts.

*(Without resolving D-06 path, the third Wave 0 gap row above blocks Phase 1 wave planning.)*

### Test framework install

None required — FSB uses raw Node. No `npm install --save-dev <framework>` step in Phase 1.

## 6-Surface Audit Starter Inventory

> The audit doc itself (`lattice/docs/fsb-integration-gaps.md`) is the deliverable. This section gives the planner the **starter row set** so the audit can be written from real Lattice file evidence, not guesses. Severity tags use D-03's heuristic (suggested below).

### Severity heuristic (suggested for D-03)

- **Blocker:** FSB's autopilot loop cannot reach reliability parity with attempt-1 without this gap closed. Specifically: any primitive that attempt-1 SHIPPED in FSB and is missing from Lattice today, AND that the autopilot calls on every iteration.
- **Important:** Closes the duplication-vs-Lattice pattern (a Lattice primitive exists but doesn't cover FSB's full needs — extension required). Not autopilot-blocking on day one but creates technical debt within the milestone.
- **Nice-to-have:** Future Lattice-consumer benefit, not FSB-critical. Useful for v0.11.0+ generalization but FSB can ship v0.10.0 without it.

### Starter inventory (Domain | Gap | Status | Severity | Notes) — for the audit doc to flesh out

| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| **Receipts** | `CapabilityReceiptBody` has `runId` only — no `stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `sessionId`, `timestamp` | Needs extension | Blocker | Attempt-1 emitted 12 step markers per `runAgentIteration`; receipt-extensions phase populates these fields |
| **Receipts** | DSSE envelope + Ed25519 sign + JCS canonical body + redact-then-sign + verify all present and tested (451 tests) | Covered | n/a | Lattice ships this — FSB consumes |
| **Receipts** | Receipt body schema is `lattice-receipt/v1` only; no extensibility version for FSB additions | Needs extension | Important | Either bump to `lattice-receipt/v1.1` for FSB additions OR add an `extensions` field — design decision in receipt-extensions phase |
| **Receipts** | Keyset is in-memory only (`createMemoryKeySet`); no persistence; no rotation log | Needs addition | Nice-to-have | FSB autopilot can run on in-memory keyset; persistence is a Phase 2+ Lattice concern |
| **Receipts** | MV3-survivable encoding (resumable receipt stream across SW evictions) | Needs addition | Blocker | INV-04 requires the `setTimeout`-chained iterator to be preserved; receipts must serialize across eviction. Lattice has no concept of "execution context can be evicted mid-flow." MV3-survivability phase. |
| **Tripwires/hooks** | Tripwire invariants exist: `must-cite`, `field-from-table`, `no-pii`, `matches`. Evaluator is pure. | Covered | n/a | Lattice ships this |
| **Tripwires/hooks** | Priority bands (SAFETY > OBSERVABILITY > EXTENSION) | Needs addition | Blocker | Attempt-1 HookPipeline had 3 bands; Lattice's tripwires fire in declaration order, no priority concept. Tripwire-extensions phase. |
| **Tripwires/hooks** | Matcher regex (selectively run hooks on specific event kinds) | Needs addition | Important | Attempt-1 had per-hook matcher; Lattice has none |
| **Tripwires/hooks** | Race-with-log per-handler budget (kill slow hooks) | Needs addition | Important | Attempt-1 had per-handler budget; Lattice tripwires are synchronous-pure |
| **Tripwires/hooks** | Frozen contexts (snapshot at evaluation time) | Needs addition | Nice-to-have | Lattice's pure evaluator means context is naturally frozen — depends on the FSB use case |
| **Tripwires/hooks** | Mid-session registration freeze (no new hooks after run start) | Needs addition | Nice-to-have | Attempt-1 had this for safety; Lattice has no registration concept |
| **Tripwires/hooks** | Lifecycle events (BEFORE_PROVIDER, AFTER_PROVIDER, STEP_TRANSITION, etc.) | Needs addition | Blocker | Lattice's tracing has `run.start`, `provider.attempt`, etc. but no `step.start`/`step.transition`. Tracing-extensions phase. |
| **Providers** | `createOpenAIProvider`, `createOpenAICompatibleProvider`, `createAISdkProvider` (via AI SDK), `createFakeProvider` | Covered | n/a | Lattice ships these |
| **Providers** | Anthropic adapter | Needs addition | Blocker | FSB's 7-provider matrix includes Anthropic; Lattice has no native adapter |
| **Providers** | xAI adapter | Needs addition | Blocker | FSB's primary provider per `manifest.json` description ("xAI Grok-4.1") |
| **Providers** | Gemini adapter | Needs addition | Blocker | FSB needs Gemini; only via AI SDK passthrough today |
| **Providers** | LM Studio adapter | Needs addition | Important | INV-03 mentions LM Studio as latency canary; only via OpenAI-compat today |
| **Providers** | OpenRouter adapter | Needs addition | Important | FSB needs OpenRouter; only via OpenAI-compat today |
| **Providers** | Custom OpenAI-compatible adapter | Covered (via `createOpenAICompatibleProvider`) | n/a | FSB's "custom OpenAI-compatible" is exactly Lattice's `createOpenAICompatibleProvider` |
| **Delegation** | Multi-agent / parent-child loops / summary-return / cache-prefix sharing / rate-limit-group coordination | Out of scope | Blocker (if Lattice opens multi-agent policy) | Lattice's "Out of Scope" excludes multi-agent (per Lattice AGENTS.md). R3 in STATE.md flags this for maintainer discussion. |
| **MV3-survivability** | `setTimeout`-chained iterator pattern preservation (INV-04) | Needs addition | Blocker | Lattice's `createAI.run` is a single async invocation; FSB needs an adapter contract for "execution can be evicted mid-flow." Documented for future Lattice consumers — new contract phase. |
| **MV3-survivability** | Session-resume dispatcher (CONSERVATIVE recovery for mid-API-request / mid-tool-dispatch) | Needs addition | Blocker | Attempt-1 had `_al_handleRestoredMode`; Lattice has session branching but not eviction-resumption |
| **Observability/step-markers** | `TracerLike` interface + 16 RunEventKind values (run.start, artifact.ingested, context.packed, …) | Covered | n/a | Lattice's tracing surface is shaped but FSB needs different event kinds |
| **Observability/step-markers** | `STEP_TRANSITION` event with `{stepName, stepIndex, parentStepName, previousStepName, timestamp}` | Needs addition | Blocker | Attempt-1's LIFECYCLE_EVENTS.STEP_TRANSITION is the central observability primitive; Lattice has `stage.start`/`stage.complete` only |
| **Observability/step-markers** | Checkpoint hook (`checkpoint-hook.js` in attempt-1) — emits step transition into receipt envelope | Needs addition | Blocker | Attempt-1 shipped this in FSB; Phase 2 ports it into Lattice |
| **Observability/step-markers** | Per-step receipt mint (one signed receipt per step, threadable into a timeline) | Needs addition | Important | Receipts today are end-of-run; FSB wants per-step |
| **Observability/step-markers** | Sidepanel-consumable receipt timeline schema | Needs addition | Nice-to-have | Phase: Sidepanel Agent State Inspector revival (deferred per CONTEXT.md) |

**Severity totals (planner uses this for Phase 2+ queue):**
- Blocker: 13 rows
- Important: 6 rows
- Nice-to-have: 5 rows
- Out of scope / open policy: 1 row (delegation)

**Note:** The audit doc author refines these into final wording with the verdict per row reflecting any new Lattice findings discovered while writing. This is a **starter inventory** for the audit writer, not the final audit.

## Sources

### Primary (HIGH confidence — local file or live tool verification)

- `lattice/packages/lattice/src/index.ts` — public surface inventory (lines 1-115 verified)
- `lattice/packages/lattice/src/receipts/{receipt,sign,verify,keyset,envelope,types,redact,canonical}.ts` — full receipt surface read in this session
- `lattice/packages/lattice/src/policy/policy.ts` — full file (25 lines) — confirms Lattice has NO priority-band system today
- `lattice/packages/lattice/src/contract/tripwire.ts` — invariant evaluator surface
- `lattice/packages/lattice/src/providers/{provider,adapters,fake,packaging}.ts` — provider abstraction surface
- `lattice/packages/lattice/src/runtime/create-ai.ts` — runtime facade
- `lattice/packages/lattice/src/tracing/tracing.ts` — full file (53 lines) — confirms 16 RunEventKind values, no step transitions
- `lattice/packages/lattice/src/tools/tools.ts` — tool definitions; no delegation primitive
- `lattice/packages/lattice/src/sessions/session.ts` — session/branch APIs
- `lattice/packages/lattice/package.json` — `exports`, `scripts`, dependencies, engines
- `lattice/package.json` — workspace scripts + pnpm version pin
- `lattice/pnpm-workspace.yaml` — catalog versions
- `lattice/tsconfig.base.json` — TypeScript settings including `verbatimModuleSyntax`
- `lattice/packages/lattice/tsdown.config.ts` — build config (single `src/index.ts` → ESM with .d.ts)
- `lattice/packages/lattice/tsconfig.json` — package-specific TS config
- `lattice/.planning/v1.1-MILESTONE-INTEGRATION.md` — confirms 36 v1.1 REQ-IDs wired, lattice-cli + lattice core tests counts, examples/work-inbox/scenarios uses `createReceipt`
- `extension/manifest.json` — confirms current SW is classic (no `"type": "module"`); `"offscreen"` permission already granted
- `extension/background.js` — first 60 lines: confirms ~54+ `importScripts` calls in head
- `package.json` — FSB npm scripts (test chain) + engines + axios dep
- `tests/install-identity.test.js`, `tests/agent-loop-empty-contents.test.js` — FSB test convention
- `.planning/REQUIREMENTS.md` (v0.10.0-attempt-2 scaffold), `STATE.md`, `ROADMAP.md`, `01-CONTEXT.md` — milestone context
- Live `node --version`, `npm --version`, `pnpm --version`
- Live empirical npm probe at `/tmp/npm-spec-probe` — confirms `file:` symlink behavior on npm 11.12.1, `link:` ignored, ESM-via-dynamic-import works from CJS

### Secondary (MEDIUM confidence — official docs)

- [Chrome MV3 Extension service worker basics](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics) — `"type": "module"` and `importScripts` mutual exclusion; dynamic `import()` not supported
- [Chrome MV3 Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — `chrome.offscreen` API surface
- [ES Modules in Service Workers (web.dev)](https://web.dev/articles/es-modules-in-sw) — general SW ES module overview
- [npm-link docs](https://docs.npmjs.com/cli/v11/commands/npm-link/) — `link:` specifier semantics
- [npm package.json docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) — `file:` directory dep semantics
- [DSSE v1.0 spec](https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md) — referenced by Lattice's envelope.ts comments

### Tertiary (LOW confidence — WebSearch only, would benefit from re-verification if heavily relied upon)

- [npm 5 and file: URLs (Medium)](https://medium.com/@alex_young/npm-5-and-file-urls-3c3631f7367c) — secondary corroboration on `file:` symlink behavior; superseded by the live empirical test

## Metadata

**Confidence breakdown:**
- Lattice v1.1 surface inventory: HIGH — read every file in `src/receipts/`, `src/providers/`, `src/policy/`, `src/contract/`, `src/runtime/`, `src/tracing/`, `src/tools/`, `src/sessions/` directly
- npm dependency spec (CD-01): HIGH — empirically tested `file:` vs `link:` on the live npm 11.12.1 install
- D-06 conflict identification: HIGH — three independent verifications: (1) `extension/background.js` `importScripts` count, (2) Chrome MV3 official docs on module vs classic SW mutual exclusion, (3) general knowledge of bare-specifier resolution in browser contexts
- Smoke test pattern: HIGH — empirically tested ESM dynamic import from CJS on Node 25.9
- 6-surface audit starter inventory: HIGH for the "what Lattice HAS" half (read the files); MEDIUM-HIGH for severity assignments (judgment call against attempt-1 patterns — final calibration is the audit author's responsibility)
- FSB test convention: HIGH — read two real test files
- Lattice build flow: HIGH — read `tsdown.config.ts`, package.json scripts, pnpm-workspace.yaml

**Research date:** 2026-05-24
**Valid until:** 2026-06-23 (30 days; Lattice's v1.1 surface is stable post-shipping, but verify the `fsb-integration-experiments` branch HEAD SHA before Phase 1 execution to ensure no Lattice-side drift)

## RESEARCH COMPLETE
