# Phase 5: MV3-survivability adapter contract + bundler infra + hybrid offscreen Lattice host - Context

**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Gathered:** 2026-05-24 (assumptions mode -- autonomous + user-confirmed Phase 5 path)
**Status:** Ready for planning

<domain>
## Phase Boundary

**User selected Hybrid Offscreen path** (analyzer-recommended) -- Phase 5 has 4 substantive deliverables:

1. **MV3-survivability adapter CONTRACT** on Lattice. New module `lattice/packages/lattice/src/runtime/survivability.ts` exporting `SurvivabilityAdapter<TState>` interface + a thin `createNoopSurvivabilityAdapter()` reference implementation + companion vitest cases. Audit doc Blocker rows for MV3-survivability domain flipped to Covered.

2. **Bundler infrastructure** for FSB extension build. New esbuild config + `package.json` `scripts.build` invocation + `extension/dist/` output tree. Per-entrypoint bundles (NOT a single mega-bundle): SW, content-scripts, sidepanel, offscreen, options page each get their own bundle. ZERO behavior change at this stage (bundler installed but no consumer yet flips to use it).

3. **Hybrid offscreen Lattice host**. `background.js` STAYS CLASSIC (zero changes to the 153 `importScripts()` chain). New offscreen-document `extension/offscreen/lattice-host.html` + `extension/offscreen/lattice-host.js` declares `<script type="module">`; bundler emits the offscreen bundle (with Lattice bare-specifier rewritten by esbuild). SW <-> offscreen message bus via `chrome.runtime.sendMessage` carries step-transition events from the SW to the offscreen Lattice host; the host invokes Phase 3's `createCheckpointHook` + Phase 2's bands pipeline + mints v1.1 receipts; receipts post back to SW for `chrome.storage.session` storage.

4. **FSB-side standalone MV3-survivability adapter** (`extension/ai/lattice-runtime-adapter.js`) implementing Lattice's `SurvivabilityAdapter<TState>` contract over `chrome.storage.session`. Feature flag (`FSB_LATTICE_RUNTIME_ADAPTER_ENABLED`, default `false`) gates whether the adapter is wired to anything; default-off keeps production-critical paths byte-identical. Node-side smoke `tests/lattice-survivability-smoke.test.js` exercises the contract end-to-end (mint + serialize + deserialize + verify round-trip).

**Explicitly NOT in this phase** (deferred):
- SW classic-to-module migration. `background.js` 153 `importScripts()` chain stays untouched. Future phase (if ever) handles SW migration as its own scoped concern.
- `agent-loop.js` modifications. INV-04 setTimeout iterator at lines 1824/2418/2487/2497 is load-bearing; Phase 5 keeps it byte-frozen. CONSERVATIVE recovery wiring (`_al_handleRestoredMode` pattern from attempt-1) is deferred to a follow-on phase.
- Direct in-SW Lattice import. Lattice loads in offscreen iframe only. SW never imports `'lattice'`.
- Hot-reload during development beyond what esbuild's `--watch` offers.
- Mainline PR back into Lattice (v0.11.0+).
- Delegation primitive (Phase 6).

**The scope anchor:** Phase 5 ships infrastructure (bundler + offscreen host + survivability contract) that ENABLES future autopilot rewiring. It does NOT itself rewire the autopilot to use any of it. Production code paths remain on the classic SW + `importScripts` chain + Node-smoke validation. Phase 5 closes the audit-doc MV3-survivability Blocker rows by providing the contract + reference impl + FSB-side wiring, but the autopilot integration (CONSERVATIVE recovery, `_al_handleRestoredMode`) is a follow-on milestone.

</domain>

<decisions>
## Implementation Decisions

### Bundler Choice + Integration

- **D-01 Bundler: esbuild.** Single-binary, npm-resolvable, no toolchain shift. Matches Lattice's tsdown family. Mature for MV3 (CRXJS, esbuild-plugin-chrome-extension).

- **D-02 Per-entrypoint bundles, NOT mega-bundle.** Chrome MV3 manifest declares distinct entrypoints (`background.js`, content scripts, sidepanel, offscreen, options page). Each gets its own bundle output. Avoids Lattice duplication + content-script context contamination.

- **D-03 Output topology: `extension/dist/`.** New gitignored directory. Bundler emits there; `manifest.json` paths reference there OR (preferred) `--outbase extension` keeps existing tree paths working. **CD-A:** Final topology choice (single `extension/dist/` vs co-located `.bundled.js` siblings) deferred to planner; pick whatever minimizes `manifest.json` churn.

- **D-04 Source-map strategy:** external `.js.map` sidecars for SW + sidepanel + offscreen bundles; sourcemaps disabled for content-script bundles to keep injection payload lean.

- **D-05 `scripts.build` becomes a real esbuild invocation.** Replaces `package.json:15` echo. Chained before tests if any test consumes the bundled output. **CD-B:** Whether `scripts.test` requires a build first is planner's call (default: no, tests stay Node-only).

- **D-06 Bundler-installed-not-wired in Wave 1.** Plan 05-01 ONLY adds the bundler infra (config + scripts + dist/ output + smoke that bundler produces expected files). NO consumer migrates to dist/ yet. ZERO `manifest.json` changes. ZERO behavior change. This keeps Plan 05-01 atomic + reversible.

### Lattice-side MV3-Survivability Adapter Contract

- **D-07 New Lattice module: `lattice/packages/lattice/src/runtime/survivability.ts`** (sibling to `create-ai.ts` which has no MV3 concept today).

- **D-08 Interface shape: `SurvivabilityAdapter<TState>` with 4 methods:**
  - `serialize(state: TState): SerializedSnapshot` — convert in-memory state to a string-encodable snapshot
  - `deserialize(snapshot: SerializedSnapshot): TState` — inverse
  - `onEviction(hook: EvictionHook<TState>): UnsubscribeFn` — register a pre-eviction callback that the host CAN attempt to call but MAY NOT be able to (MV3 eviction has no synchronous signal)
  - `resume(snapshot: SerializedSnapshot): Promise<ResumePolicy>` — post-restore reconstruction; returns CONSERVATIVE policy (SAFE / RECOVERY_AMBIGUOUS / ON_ERROR_SW_EVICTION_MID_REQUEST per attempt-1 taxonomy)

- **D-09 Composes with Phase 2's bands.** Documented convention: `onEviction` hook registers in `BAND.SAFETY` band so it runs FIRST per Phase 2's priority ordering. Phase 5 does NOT modify `bands.ts`.

- **D-10 Composes with Phase 3's checkpoint hook.** `serialize(state)` body MAY include the latest checkpoint receipt envelope; `deserialize` reconstructs session + step-marker fields from the receipt body (Phase 2's v1.1 schema). Same `sessionId` / `runId` / `stepIndex` identifiers.

- **D-11 Thin reference implementation: `createNoopSurvivabilityAdapter()`.** Records eviction events but doesn't persist (analog to `createFakeProvider`). Lets Lattice's vitest cover the contract surface before FSB consumes it.

- **D-12 Vitest coverage ~12-15 cases:** factory identity, serialize/deserialize round-trip, onEviction hook lifecycle, resume() returns ResumePolicy, ResumePolicy taxonomy stable, type-level discriminated union for ResumePolicy, etc.

- **D-13 Public surface re-exports** from `lattice/packages/lattice/src/index.ts`: `createNoopSurvivabilityAdapter` + 4 types (`SurvivabilityAdapter`, `SerializedSnapshot`, `ResumePolicy`, `EvictionHook`).

- **D-14 Audit-doc rows 65 + 72 (MV3-survivability domain) flip to Covered** with backlink SHAs.

### FSB-side Offscreen Lattice Host (hybrid path)

- **D-15 New offscreen page: `extension/offscreen/lattice-host.html` + `extension/offscreen/lattice-host.js`.** HTML declares `<script type="module" src="lattice-host.js">`. JS imports `'lattice'` bare specifier (bundler rewrites to relative path at build).

- **D-16 SW <-> offscreen message bus.** SW posts `chrome.runtime.sendMessage({type: 'lattice-step-transition', payload: {...}})` when a step needs to be marked. Offscreen page listens via `chrome.runtime.onMessage`; invokes `createCheckpointHook` + minted receipt envelope; posts back via `chrome.runtime.sendMessage({type: 'lattice-receipt-minted', payload: envelope})`. SW stores in `chrome.storage.session`.

- **D-17 Background.js BYTE-FROZEN.** Zero changes to the 153 `importScripts()` chain. The SW <-> offscreen message bus is added via NEW code paths gated by the feature flag (D-19). When flag is off, no new SW behavior fires.

- **D-18 Manifest.json minimal change.** Only adds the offscreen page declaration if not already present. The existing `"offscreen"` permission is already granted (verified at `manifest.json:19`). **CD-C:** Whether to add `lattice-host.html` as a `web_accessible_resources` entry depends on whether SW needs to programmatically open the offscreen page (yes, almost certainly).

### FSB-side Standalone Survivability Adapter

- **D-19 New module: `extension/ai/lattice-runtime-adapter.js`.** Implements `SurvivabilityAdapter<TState>` over `chrome.storage.session`. STANDALONE — does NOT modify `agent-loop.js`, `runAgentLoop`, or any existing iterator. Feature-flag gated: `FSB_LATTICE_RUNTIME_ADAPTER_ENABLED` defaults `false`.

- **D-20 Feature flag default-off until milestone UAT passes.** Production-critical paths remain on the classic SW + classic `agent-loop.js` + classic persistence. The flag flip to default-on is a v0.11.0+ concern after Phase 5's adapter is battle-tested through the milestone UAT cycle.

- **D-21 Node-side smoke: `tests/lattice-survivability-smoke.test.js`.** Real-runtime mint + serialize + deserialize + verify round-trip. ~25 PASS assertions. Mirrors Phase 1-4 smoke convention. Appended to `package.json` `scripts.test` chain. Phase 1+2+3+4 smokes BYTE-FROZEN.

- **D-22 CONSERVATIVE recovery dispatcher EXPLICITLY OUT OF SCOPE.** Phase 5 ships the adapter contract + standalone adapter; wiring into `runAgentLoop` for actual SW-eviction recovery is a follow-on milestone (post-v0.10.0-attempt-2 close). This keeps INV-04 (setTimeout iterator preservation) trivially preserved -- `agent-loop.js` untouched in Phase 5.

### Plan Decomposition + Safety Rails

- **D-23 Six atomic plans across 4 waves:**
  - **W1 Plan 05-01:** Bundler scaffolding (esbuild config + `scripts.build` + `extension/dist/` output + smoke). Behavior-free. (FSB-side only.)
  - **W1 Plan 05-02:** Lattice-side `SurvivabilityAdapter` interface + `createNoopSurvivabilityAdapter()` + 12-15 vitest cases. (Lattice-side only; parallel-safe with 05-01.)
  - **W2 Plan 05-03:** Lattice-side public-surface re-export + audit-doc closure + LATTICE-PIN bump preview (final SHA bump comes in W4).
  - **W3 Plan 05-04:** FSB offscreen Lattice host (HTML + module bundle + SW <-> offscreen message bus); manifest.json offscreen registration; bundler emits the offscreen bundle.
  - **W3 Plan 05-05:** FSB-side standalone runtime adapter (`extension/ai/lattice-runtime-adapter.js`) + feature flag + Node smoke (`tests/lattice-survivability-smoke.test.js`); `scripts.test` chain extension.
  - **W4 Plan 05-06:** Final ceremony — `.planning/LATTICE-PIN.md` SHA bump + Phase 5 row; `.planning/REQUIREMENTS.md` LSDK-19..N + FINT-NN entries; ONE atomic FSB commit `feat(05): ...` with Ref footer.

- **D-24 Strict sequential between waves.** W2 depends on W1's outputs (Lattice public-surface needs the survivability.ts file to re-export). W3 depends on W1 (needs bundler) + W2 (needs Lattice survivability API published). W4 depends on all prior waves.

- **D-25 Lattice commit ceremony continues (D-14 carryforward).** Conventional commits + `Ref: FSB v0.10.0-attempt-2 Phase 5` footer. No `git push`.

### Claude's Discretion (resolved during planner research)

- **CD-A Final bundler output topology** (extension/dist/ vs co-located .bundled.js siblings).
- **CD-B Whether `scripts.test` requires a build first.** Default: no.
- **CD-C `web_accessible_resources` entries** for the offscreen page.
- **CD-D Whether feature-flag value lives in code or in `chrome.storage.local`.** Default: in code (`extension/ai/engine-config.js` or similar); runtime-switchable via storage may be a follow-on enhancement.
- **CD-E `ResumePolicy` exact discriminated-union shape.** Default per attempt-1 02-04-PLAN.md taxonomy: `SAFE` / `RECOVERY_AMBIGUOUS` / `ON_ERROR_SW_EVICTION_MID_REQUEST` / `ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH`.

</decisions>

<canonical_refs>
## Canonical References

### FSB-side milestone scope
- `.planning/ROADMAP.md` -- Phase 5 detail line
- `.planning/REQUIREMENTS.md` -- LSDK + FINT categories; Phase 5 populates LSDK-19..N + first concrete FINT-NN entries beyond FINT-01 (Phase 1 wiring) + FINT-02 (Phase 2 smoke)
- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `.planning/LATTICE-PIN.md` -- Lattice HEAD `f1c943bd` pre-Phase-5

### Phase 1-4 outputs (BINDING)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-CONTEXT.md` -- Phase 1 reconciliation; Option B carryforward ending here (Phase 5 introduces in-extension Lattice via offscreen)
- `.planning/phases/01-lattice-gap-survey-scaffold/01-RESEARCH.md` lines 118-160 -- 3-option D-06 reconciliation table; Phase 5 effectively executes "Option B with a bundler"
- `.planning/phases/02-lattice-tripwire-receipt-extension/02-CONTEXT.md` -- bands.ts pipeline being consumed
- `.planning/phases/03-observability-step-markers-extension/03-CONTEXT.md` -- checkpoint hook being consumed
- `.planning/phases/04-provider-adapter-alignment/04-VERIFICATION.md` -- Phase 4 baseline must not regress

### Phase 1 audit doc (rows being closed)
- `lattice/docs/fsb-integration-gaps.md` MV3-survivability domain rows (line 65 area)

### Lattice surfaces being extended
- `lattice/AGENTS.md` -- conventions
- `lattice/packages/lattice/src/runtime/create-ai.ts` -- runtime module sibling (Phase 5 adds survivability.ts next to it)
- `lattice/packages/lattice/src/contract/bands.ts` -- Phase 2 BAND.SAFETY where the eviction-hook registers
- `lattice/packages/lattice/src/contract/checkpoint.ts` -- Phase 3 CheckpointHook; serialize() includes checkpoint envelopes
- `lattice/packages/lattice/src/receipts/types.ts` -- Phase 2 v1.1 schema used by serialize/deserialize
- `lattice/packages/lattice/src/index.ts` -- Phase 5 adds re-exports
- `lattice/packages/lattice/src/sessions/session.ts` -- existing SessionStore for reference

### FSB-side files being touched (Phase 5)
- `package.json` -- scripts.build becomes esbuild; scripts.test gains the survivability smoke
- NEW `esbuild.config.js` (or `build.mjs`) -- bundler configuration
- NEW `extension/dist/` -- bundler output (gitignored)
- `extension/manifest.json` -- minimal offscreen page registration
- NEW `extension/offscreen/lattice-host.html` -- offscreen entry HTML
- NEW `extension/offscreen/lattice-host.js` -- ESM module that imports 'lattice'
- NEW `extension/ai/lattice-runtime-adapter.js` -- standalone SurvivabilityAdapter implementation
- NEW `tests/lattice-survivability-smoke.test.js` -- Node smoke
- `.planning/LATTICE-PIN.md` -- bump
- `.planning/REQUIREMENTS.md` -- LSDK-19..N + FINT-NN entries
- `.gitignore` -- add `extension/dist/`

### FSB-side files EXPLICITLY BYTE-FROZEN
- `extension/background.js` (153 importScripts chain untouched)
- `extension/ai/agent-loop.js` (INV-04 setTimeout iterator at lines 1824/2418/2487/2497 untouched)
- All other `extension/*` source files (only manifest.json minimal offscreen reg + new files added)
- `extension/agents/agent-{executor,manager,scheduler}.js` (INV-05)
- `extension/ai/tool-definitions.js` (INV-01 / INV-02)
- All Phase 1+2+3+4 Lattice source files (only `src/index.ts` re-export additions allowed)
- All Phase 1-4 FSB smokes (`tests/lattice-smoke.test.js`, `tests/lattice-tripwire-smoke.test.js`, `tests/lattice-checkpoint-smoke.test.js`, `tests/lattice-providers-smoke.test.js`)

### Hard invariants
- INV-01 MCP wire UNTOUCHED
- INV-03 Provider parity preserved (Phase 4 achievement)
- INV-04 setTimeout iterator preserved (8 grep count)
- INV-05 deprecated modules frozen
- INV-06 Lattice primitives in Lattice (SurvivabilityAdapter contract lives in Lattice)
- Phase 1-4 audit-doc rows already Covered stay Covered (no row regressions)
- Option B carryforward CONTINUES (no SW classic-to-module migration; offscreen is the in-extension host)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Lattice's Phase 2 `bands.ts` BAND.SAFETY** -- where the eviction-hook registers
- **Lattice's Phase 3 `createCheckpointHook`** -- the offscreen page invokes per step-transition message
- **Lattice's Phase 2 v1.1 receipt schema** -- serialize/deserialize uses these fields
- **Existing `extension/offscreen/stt.html`** -- proof that offscreen pages work in FSB
- **`"offscreen"` permission already granted** in `manifest.json:19`
- **`chrome.runtime.sendMessage` + `onMessage`** -- existing FSB messaging primitive

### Established Patterns
- **FSB test convention** (raw node, manual counters, `process.exit(failed > 0 ? 1 : 0)`)
- **Lattice commit ceremony** (Ref footer; no push) — Phase 5 continues
- **Audit-doc row flip ceremony** — Phase 5 flips MV3-survivability rows

### Integration Points
- `package.json` scripts.build/test (modified)
- `extension/manifest.json` (offscreen registration)
- `extension/dist/` (NEW gitignored directory)
- `extension/offscreen/lattice-host.html` + `.js` (NEW)
- `extension/ai/lattice-runtime-adapter.js` (NEW)
- `tests/lattice-survivability-smoke.test.js` (NEW)
- `lattice/packages/lattice/src/runtime/survivability.ts` + `.test.ts` (NEW)
- `lattice/packages/lattice/src/index.ts` (re-exports)
- `lattice/docs/fsb-integration-gaps.md` (rows flipped)
- `.planning/LATTICE-PIN.md` (Phase 5 row)
- `.planning/REQUIREMENTS.md` (LSDK-19..N + FINT-NN)
- `.gitignore` (add extension/dist/)

</code_context>

<specifics>
## Specific Ideas

- **Hybrid offscreen path** is the analyzer's recommendation; user confirmed. Phase 5 ships in-extension Lattice consumption via offscreen iframe, NOT via SW migration.
- **Bundler choice: esbuild** locked. Per-entrypoint bundles. `extension/dist/` output.
- **Feature flag default-OFF** is paramount. Production paths stay on the classic SW + classic agent-loop + Node smoke validation. The flag flip is a v0.11.0+ concern post-milestone-UAT.
- **CONSERVATIVE recovery wiring deferred** to a follow-on milestone. Phase 5 ships the contract + adapter; the autopilot integration is post-v0.10.0-attempt-2.
- **INV-04 trivially preserved** because `agent-loop.js` is byte-frozen in Phase 5.
- **6 plans, 4 waves.** Plans 05-01 + 05-02 parallel-safe (FSB-side bundler vs Lattice-side contract); subsequent waves strictly sequential.

</specifics>

<deferred>
## Deferred Ideas

These came up during scoping but belong outside Phase 5:

- **SW classic-to-module migration** (153 importScripts → ES imports). Defer to a future phase or v0.11.0+.
- **CONSERVATIVE recovery wiring in `agent-loop.js`.** Defer to a follow-on milestone.
- **Feature flag default-on flip.** Post-milestone-UAT.
- **In-SW Lattice import** (vs offscreen-host bridge). Defer.
- **Delegation primitive** (Phase 6 -- contingent).
- **Mainline PR back into Lattice** (v0.11.0+).
- **Lattice's tracing module extensions** for survivability events. Not in Phase 5 scope.
- **Sidepanel UI consumption of survivability state.** Separate UI-consumption phase later.

</deferred>

---

*Phase: 05-mv3-survivability-bundler*
*Context gathered: 2026-05-24 via assumptions mode (autonomous; user confirmed hybrid offscreen path; UAT deferred per user directive)*
