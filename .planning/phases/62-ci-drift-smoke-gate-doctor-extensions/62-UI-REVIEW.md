---
phase: 62-ci-drift-smoke-gate-doctor-extensions
reviewed: 2026-07-16
iteration: 2
status: source-needs-fixes
baseline: 62-UI-SPEC.md
overall_score: "22/24"
screenshots: not-captured-source-only
needs_human_review: true
audited_head: 98727bf3
source_actionable_findings: 2
blockers: 0
warnings: 2
---

# Phase 62 — UI Review

**Audited:** 2026-07-16
**Baseline:** approved `62-UI-SPEC.md` design contract
**Implementation boundary:** `98727bf3` (`docs(62): add code review fix report`)
**Screenshots:** Not captured by explicit source-only scope. No browser, rendered-layout, keyboard, screen-reader, forced-colors, reduced-motion, installed-CLI, or live-daemon probe was performed.
**Evidence mode:** Code, source-contract, deterministic DOM/VM tests, and two read-only composition probes. The three scenarios in `62-HUMAN-UAT.md` remain `human_needed`; this report does not promote synthetic evidence to a human pass.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Exact labels, detail text, and failure copy are closed and now agree with the visible stale/unsupported projection. |
| 2. Visuals | 4/4 | Source structure retains three agent-only compatibility groups, distinct details, semantic icons, trailing radios, and the specified responsive hierarchy. |
| 3. Color | 4/4 | Compatibility tones remain limited to semantic pills/icons with text, shape, and forced-color borders as non-color cues. |
| 4. Typography | 4/4 | The approved 12/14px roles, 400/600 weights, sentence case, wrapping, and system type remain intact. |
| 5. Spacing | 4/4 | Compatibility declarations remain on the approved scale and preserve the wide, medium, and narrow divider layouts. |
| 6. Experience Design | 2/4 | Manual success feedback is erased by its causal storage hydration, and the compatibility-expiry timer can mutate unrelated connection and recommendation state. |

**Overall source-contract score: 22/24**

The two original UI warnings are resolved, but two deterministic composition warnings remain. There are no blockers.

---

## Fix Re-audit Disposition

| Boundary | Result | Evidence |
|----------|--------|----------|
| Stale badge/copy coherence | **PASS** | Failed live refreshes project retained fresh support to `Degraded / evidence_stale`; already degraded and unsupported truth is preserved, and recovery copy is selected from the resulting closed model. |
| Exact-boundary passive expiry | **PASS with side-effect warning** | Supported becomes Degraded at `>= 15 minutes`, and the timer uses cache-only `getMcpClients` rather than a daemon refresh. The whole-view refresh it invokes is still too broad (WR-02). |
| One compatibility live-region owner | **PASS** | `#agentProviderDetails` is no longer live; `#providerEvidenceAnnouncement` is the sole compatibility announcement owner. The pairing status remains a separate action-specific region. |
| Silent cold hydration | **PASS** | Non-announcing cache hydration leaves the shared region empty/hidden and the focused suites pin this behavior. |
| Manual announcement across storage fan-out | **WARNING** | The compatibility write queues a cache hydration that clears the just-written success announcement and changes `ready` to `stale` (WR-01). |
| Expiry-only recommendation/connection identity | **WARNING** | The expiry callback replaces the full client map and recomputes recommendation, so changed non-compatibility inputs leak into an expiry-only transition (WR-02). |
| Focus/selection/form/persistence/no-authority invariants | **PASS within the audited paths** | Ordinary compatibility transitions preserve focus, selection, row order, inputs, dirty state, auth/billing, and storage; renderer/refresh source has no doctor, shell, native, version, selection, preflight, or persistence authority. |

---

## Top 3 Priority Fixes

1. **Preserve the manual refresh generation through causal storage fan-out** — Suppress/coalesce the `fsbAgentProviders` notification produced by the in-flight compatibility replacement, or make its queued hydration preserve the manual result, `ready` state, and one polite announcement.
2. **Make expiry compatibility-only** — Merge only the background-validated `.compatibility` projection at the authoritative deadline. Preserve current clicked/installed/connected/live rows, evidence state, recommendation, selection, focus, and form state.
3. **Close the composed regression gaps** — Extend the causal fan-out test through final settlement and assert one retained announcement with no stale evidence markers; make the expiry test deliberately vary unrelated client evidence and assert that only compatibility changes.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS:** The mapper owns exactly `Supported`, `Degraded`, and `Unsupported`, the normative detail strings, and the Claude Code `Not reported` auth copy (`extension/ui/providers-panel.js:27-52`, `extension/ui/providers-panel.js:288-334`).
- **PASS:** Manual failure after retained fresh support now visibly projects `Degraded / evidence_stale` before using `Compatibility data could not be refreshed. Cached support is now Degraded.` Existing degraded and unsupported states retain truthful corresponding copy (`extension/ui/options.js:532-570`, `extension/ui/options.js:1131-1183`; `extension/background.js:192-232`).
- **PASS:** The action labels remain exactly `Refresh status`, `Refreshing…`, and `Save Settings`; compatibility adds no CTA or destructive action (`extension/ui/control_panel.html:152-162`).

### Pillar 2: Visuals (4/4)

- **PASS:** Exactly three agent rows retain a dedicated compatibility sibling after evidence and before the native radio; the seven API rows omit compatibility. Each agent group has a visible micro-label, decorative semantic icon, and closed status pill (`extension/ui/control_panel.html:168-218`).
- **PASS:** Selected-agent details keep Installation, Connection, Compatibility, and Account/Auth as distinct facts (`extension/ui/control_panel.html:530-550`).
- **PASS:** Wide and medium source layouts retain inline separation; the narrow layout creates a full-width, top-divided compatibility group without DOM or CSS reordering (`extension/ui/options.css:6247-6327`).
- **HUMAN_NEEDED:** Actual hierarchy, wrapping, divider placement, badge density, trailing-radio placement, and clipping at desktop, 641–899px, and at-most-640px widths remain deferred.

### Pillar 3: Color (4/4)

- **PASS:** Supported, Degraded, and Unsupported use the specified success, warning, and error tokens only on compatibility pills/icons (`extension/ui/options.css:5972-6000`). Provider selection, names, recommendation, evidence, auth, billing, and setup controls are excluded from compatibility-tone selectors.
- **PASS:** Visible text and distinct Font Awesome shapes accompany color. Forced-colors rules provide Canvas colors and solid/dashed/double borders; dark mode remains token-based (`extension/ui/options.css:6231-6238`, `extension/ui/options.css:6329-6355`).
- **HUMAN_NEEDED:** Real light/dark contrast and forced-colors distinguishability require milestone-end rendered review.

### Pillar 4: Typography (4/4)

- **PASS:** Compatibility uses the approved 12px metadata/badge roles and 14px detail role with only 400/600 weights (`extension/ui/options.css:5945-5969`, `extension/ui/options.css:6087-6124`).
- **PASS:** Copy is sentence case, status text remains visible beside decorative icons, and long copy wraps without truncation.
- **HUMAN_NEEDED:** Perceived hierarchy and real-font wrapping remain deferred.

### Pillar 5: Spacing (4/4)

- **PASS:** Compatibility-specific gaps and padding stay on the 4/8/16px subset, with a tokenized one-pixel divider (`extension/ui/options.css:5931-5969`).
- **PASS:** The 900px, 641–899px, and at-most-640px rules preserve two columns, one column, and stacked full-width compatibility respectively (`extension/ui/options.css:6247-6327`).
- **PASS:** Compatibility is data-only and non-focusable; existing radio/refresh target and focus rules remain unchanged (`extension/ui/options.css:5747-5755`, `extension/ui/options.css:5803-5878`).
- **HUMAN_NEEDED:** No-overflow behavior and target geometry require real rendered observation.

### Pillar 6: Experience Design (2/4)

- **PASS — stale coherence restored:** Background failure fallback and UI timeout fallback both degrade retained fresh support while preserving already degraded/unsupported truth. Row badge, stable radio description, selected detail, and recovery alert now agree (`extension/background.js:192-232`; `extension/ui/options.js:532-570`, `extension/ui/options.js:1160-1183`).
- **PASS — exact boundary restored:** Fresh support exposes one authoritative expiry deadline; `>= 15 minutes` projects `degraded/evidence_stale`; the UI timer performs a cache-only call and does not invoke the daemon (`extension/utils/mcp-agent-providers.js:398-428`; `extension/background.js:133-142`, `extension/background.js:175-189`; `extension/ui/options.js:1107-1128`).
- **PASS — single owner and cold silence restored:** `#agentProviderDetails` has no role/live attributes, while `#providerEvidenceAnnouncement` remains the sole compatibility live region. Initial non-announcing hydration leaves it hidden and empty (`extension/ui/control_panel.html:162`, `extension/ui/control_panel.html:521`; `extension/ui/options.js:1091-1098`, `extension/ui/options.js:1131-1165`).
- **WARNING WR-01 — causal hydration erases manual success:** `replaceCompatibility()` completes before the live response and emits `fsbAgentProviders`. The storage listener schedules another non-announcing whole-view refresh; that call clears the live region at entry and maps every valid cache read to `stale`. A read-only composed assertion observed the final announcement as `''` instead of `Provider status refreshed.` (`extension/background.js:133-142`, `extension/background.js:244-260`; `extension/ui/options.js:1131-1195`, `extension/ui/options.js:1201-1219`, `extension/ui/options.js:1534-1545`). The stock causal test proves bounded request/write/read counts but does not assert final feedback or evidence state (`tests/providers-panel-ui.test.js:2359-2401`).
- **WARNING WR-02 — expiry refresh is not compatibility-only:** The timer calls generic `refreshProviderEvidence()`, which rereads merged provider inventory, replaces `providerPanelState.clients`, sets global evidence state, and recomputes recommendation. A read-only fake-clock probe changed only the second response's unrelated evidence and observed recommendation move from Claude Code to Codex and selected connection move from `Connected now` to `Not connected` while compatibility aged to Degraded (`extension/background.js:113-142`; `extension/ui/options.js:1113-1151`). The stock expiry test supplies identical non-compatibility rows on both reads, so its snapshot cannot expose this (`tests/providers-panel-ui.test.js:2244-2304`).
- **PASS — remaining observational/authority boundaries:** Ordinary transitions preserve radio, focus, row order, form values, dirty state, storage, auth/billing, and recommendation. Compatibility rendering contains no selection setter, storage writer, preflight/start bypass, doctor, shell/process, native messaging, daemon wake, version parser, or CLI constant (`tests/providers-panel-ui.test.js:2065-2304`; `extension/ui/options.js:642-728`, `extension/ui/options.js:868-925`).

---

## Deferred Human Review

These are pending observations, not source defects and not passes:

1. **Rendered badge/layout comparison** — Supported, Degraded, and Unsupported in light/dark, desktop, compact, 641–899px, and at-most-640px layouts, including dividers, wrapping, radio placement, and horizontal overflow.
2. **Keyboard and assistive technology** — Native radio behavior, names/descriptions, focus retention, real live-region timing, forced colors, and reduced motion.
3. **Live compatibility projection** — Fresh, newer, stale, corrupt, absent, and refresh-failure states against an installed daemon/CLI without form, selection, recommendation, or persistence mutation.

---

## Verification

Executed source-only at `98727bf3`:

- `node --check extension/background.js` — PASS
- `node --check extension/ui/options.js` — PASS
- `node --check extension/ui/providers-panel.js` — PASS
- `node --check extension/utils/mcp-agent-providers.js` — PASS
- `node tests/providers-panel-logic.test.js` — PASS
- `node tests/providers-panel-ui.test.js` — PASS
- `node tests/mcp-agent-providers-storage.test.js` — PASS
- `node tests/mcp-bridge-background-dispatch.test.js` — PASS (293 assertions)
- Read-only composed manual-refresh/storage-fan-out assertion — **REPRODUCED WR-01**: final live-region text was empty.
- Read-only exact-expiry probe with deliberately changed unrelated evidence — **REPRODUCED WR-02**: recommendation changed Claude Code → Codex and connection changed Connected now → Not connected.

The negative probes dynamically instrumented test source in memory; no implementation or test file was changed.

## Audit Outcome

- Source-actionable UI findings: 2 warnings
- Blockers: 0
- Original UI warnings resolved: 2 of 2
- Human review required: yes — all three `62-HUMAN-UAT.md` scenarios remain pending
- Screenshots: none captured
- Registry audit: skipped; `components.json` is absent and `62-UI-SPEC.md` declares no shadcn or third-party registry blocks

## Files Audited

- `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-CONTEXT.md`
- `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-UI-SPEC.md`
- `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-{01..06}-PLAN.md`
- `.planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-{01..06}-SUMMARY.md`
- `extension/ui/providers-panel.js`
- `extension/ui/options.js`
- `extension/ui/control_panel.html`
- `extension/ui/options.css`
- `extension/shared/fsb-ui-core.css`
- `extension/utils/mcp-agent-providers.js`
- `extension/background.js`
- `tests/providers-panel-logic.test.js`
- `tests/providers-panel-ui.test.js`
- `tests/mcp-agent-providers-storage.test.js`
- `tests/mcp-bridge-background-dispatch.test.js`
