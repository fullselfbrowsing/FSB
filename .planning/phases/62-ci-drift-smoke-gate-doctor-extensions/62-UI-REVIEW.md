---
phase: 62-ci-drift-smoke-gate-doctor-extensions
reviewed: 2026-07-16
iteration: 3
status: source-needs-fixes
baseline: 62-UI-SPEC.md
overall_score: "22/24"
screenshots: not-captured-source-only
needs_human_review: true
audited_head: d005d1eb
source_actionable_findings: 2
blockers: 0
warnings: 2
---

# Phase 62 — UI Review

**Audited:** 2026-07-16
**Baseline:** approved `62-UI-SPEC.md` design contract
**Implementation boundary:** `d005d1eb` (`docs(62): update code review fix report`)
**Screenshots:** Not captured by explicit source-only scope. No browser, rendered-layout, keyboard, screen-reader, forced-colors, reduced-motion, installed-CLI, or live-daemon probe was performed.
**Evidence mode:** Code, source-contract, deterministic DOM/VM tests, and two read-only adversarial timing compositions. The three scenarios in `62-HUMAN-UAT.md` remain `human_needed`; synthetic evidence is not promoted to a human pass.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | The closed labels, details, and recovery strings remain exact; the remaining contradiction is caused by stale async ordering rather than copy mapping. |
| 2. Visuals | 4/4 | Source retains three agent-only compatibility groups, distinct details, semantic icons, trailing radios, and the specified responsive hierarchy. |
| 3. Color | 4/4 | Compatibility tones remain restricted to semantic pills/icons with text, shape, and forced-color borders as non-color cues. |
| 4. Typography | 4/4 | The approved 12/14px roles, 400/600 weights, sentence case, wrapping, and system type remain intact. |
| 5. Spacing | 4/4 | Compatibility declarations remain on the approved scale and preserve the wide, medium, and narrow divider layouts. |
| 6. Experience Design | 2/4 | Late causal storage can erase a settled manual success, and an older expiry read can overwrite a newer manual Supported result. |

**Overall source-contract score: 22/24**

All previously reported core defects are fixed in their covered orderings. Two deterministic generation-order warnings remain; there are no blockers.

---

## Final Fix Re-audit Disposition

| Boundary | Result | Evidence |
|----------|--------|----------|
| Stale badge/copy coherence | **PASS** | Failed live refreshes project retained fresh support to `Degraded / evidence_stale`; already degraded and unsupported truth remains closed and recovery copy follows the resulting model. |
| Exact-boundary passive expiry | **PASS** | Supported becomes Degraded at `>= 15 minutes`; the expiry route is cache-only and does not invoke the daemon. |
| Sequential expiry isolation | **PASS** | The new projection merge changes only validated agent compatibility fields and preserves clicked/installed/connected/live evidence, global evidence state, recommendation, focus, selection, forms, and writes. |
| Snapshot-only compatibility | **PASS** | A valid snapshot creates exactly three neutral canonical agent rows, projects Claude Supported and OpenCode/Codex Unsupported, creates no API rows, and leaves recommendation at the API fallback. |
| One compatibility live-region owner and cold silence | **PASS** | `#providerEvidenceAnnouncement` remains the sole compatibility live region; selected details are not live and cold hydration remains silent. |
| Causal event before manual settlement | **PASS** | The queued post-settlement cache hydration preserves the current success when `fsbAgentProviders` arrives while the live promise is still active. |
| Causal event after manual settlement | **WARNING** | With no active promise or durable generation token, the ordinary debounce clears the success announcement and changes `ready` to `stale` (WR-01). |
| Expiry read racing a newer manual refresh | **WARNING** | The expiry request is not registered or generation-ordered; its older Degraded result can apply after the newer manual Supported response (WR-02). |
| Focus/selection/forms/recommendation/persistence/no-authority | **PASS** | Both adversarial probes preserved the complete identity snapshot and performed no UI storage write; contract guards confirm no selection, preflight, doctor, shell, native, version, or start authority. |

---

## Top 3 Priority Fixes

1. **Persist a causal manual-refresh generation beyond promise settlement** — Associate the next matching `fsbAgentProviders` hydration with the completed manual write regardless of event delivery order. Consume it only for the corresponding or newer compatibility snapshot, retaining `ready`, the polite announcement, and non-stale evidence markers.
2. **Give manual refresh precedence over older expiry work** — Track expiry and live compatibility generations separately. A manual live refresh must still issue its live request, supersede any earlier cache projection, and cause late older results and deadlines to be ignored.
3. **Pin both adversarial schedules** — Add event-before-response and event-after-settlement fan-out tests, plus a held expiry response released after a newer manual Supported response. Assert final badge/detail/announcement agreement, deadline ownership, and unchanged focus, selection, forms, recommendation, evidence, and writes.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS:** The mapper owns exactly `Supported`, `Degraded`, and `Unsupported`, the normative details, and Claude Code's `Not reported` auth copy (`extension/ui/providers-panel.js:27-52`, `extension/ui/providers-panel.js:288-334`).
- **PASS:** Retained fresh support is projected to `Degraded / evidence_stale` before the exact cached-support failure alert. Existing degraded and unsupported projections retain truthful corresponding copy (`extension/ui/options.js:532-610`, `extension/ui/options.js:1209-1276`; `extension/background.js:192-232`).
- **PASS:** `Refresh status`, `Refreshing…`, and `Save Settings` remain exact; compatibility adds no CTA or destructive action (`extension/ui/control_panel.html:152-162`).
- **NOTE:** WR-02 can leave the exact success announcement beside a later stale badge, but that mismatch is produced by response ordering rather than an incorrect string or display-model mapping; it is scored under Experience Design.

### Pillar 2: Visuals (4/4)

- **PASS:** Exactly three agent rows retain a compatibility sibling after evidence and before the native radio; all seven API rows omit it. Each agent group has a visible micro-label, decorative semantic icon, and closed status pill (`extension/ui/control_panel.html:168-218`).
- **PASS:** Selected-agent details keep Installation, Connection, Compatibility, and Account/Auth as distinct facts (`extension/ui/control_panel.html:530-550`).
- **PASS:** Wide and medium source layouts retain inline separation; the narrow layout creates a full-width, top-divided compatibility group without reordering (`extension/ui/options.css:6247-6327`).
- **HUMAN_NEEDED:** Actual hierarchy, wrapping, divider placement, badge density, trailing-radio placement, and clipping at desktop, 641–899px, and at-most-640px widths remain deferred.

### Pillar 3: Color (4/4)

- **PASS:** Supported, Degraded, and Unsupported use the specified success, warning, and error tokens only on compatibility pills/icons (`extension/ui/options.css:5972-6000`). Selection, names, recommendation, evidence, auth, billing, and setup controls remain excluded.
- **PASS:** Visible text and distinct Font Awesome shapes accompany color. Forced-colors rules provide Canvas colors and solid/dashed/double borders; dark mode remains token-based (`extension/ui/options.css:6231-6238`, `extension/ui/options.css:6329-6355`).
- **HUMAN_NEEDED:** Real light/dark contrast and forced-colors distinguishability require milestone-end rendered review.

### Pillar 4: Typography (4/4)

- **PASS:** Compatibility uses the approved 12px metadata/badge roles and 14px detail role with only 400/600 weights (`extension/ui/options.css:5945-5969`, `extension/ui/options.css:6087-6124`).
- **PASS:** Copy is sentence case, visible beside decorative icons, and wraps without truncation.
- **HUMAN_NEEDED:** Perceived hierarchy and real-font wrapping remain deferred.

### Pillar 5: Spacing (4/4)

- **PASS:** Compatibility-specific gaps and padding stay on the 4/8/16px subset with a tokenized one-pixel divider (`extension/ui/options.css:5931-5969`).
- **PASS:** The 900px, 641–899px, and at-most-640px rules preserve two columns, one column, and stacked full-width compatibility respectively (`extension/ui/options.css:6247-6327`).
- **PASS:** Compatibility remains data-only and non-focusable; existing radio/refresh target and focus rules are unchanged (`extension/ui/options.css:5747-5755`, `extension/ui/options.css:5803-5878`).
- **HUMAN_NEEDED:** No-overflow behavior and target geometry require real rendered observation.

### Pillar 6: Experience Design (2/4)

- **PASS — original coherence and freshness fixes hold:** Failure fallback degrades retained fresh support, the exact 15-minute boundary is exclusive of Supported, and one shared compatibility live-region owner remains (`extension/background.js:175-232`; `extension/utils/mcp-agent-providers.js:398-428`; `extension/ui/control_panel.html:162`, `extension/ui/control_panel.html:521`).
- **PASS — ordinary expiry is now compatibility-only:** `refreshProviderCompatibilityProjection()` validates and merges only compatibility, renders only row/selected compatibility, and preserves unrelated evidence/recommendation state. The adversarial stock test varies clicked, installed, connected, and live cache data while proving identity (`extension/ui/options.js:552-598`, `extension/ui/options.js:905-966`, `extension/ui/options.js:1157-1206`; `tests/providers-panel-ui.test.js:2251-2361`).
- **PASS — snapshot-only startup is visible without authority:** A valid snapshot seeds only the three canonical agent rows with null evidence fields. Recommendation remains the xAI fallback and API rows are not manufactured (`extension/utils/mcp-agent-providers.js:485-521`; `tests/mcp-agent-providers-storage.test.js:500-551`).
- **PASS — favorable causal order is preserved:** When local storage changes during the active live promise, `providerEvidenceRefreshQueued` leads to `preserveSuccessfulRefresh: true`; the stock test retains `ready`, one polite announcement, and non-stale installation evidence (`extension/ui/options.js:1209-1287`; `tests/providers-panel-ui.test.js:2416-2483`).
- **WARNING WR-01 — late causal storage loses manual success:** Preservation exists only inside the active promise's queued branch. If the same local event arrives after `finally` clears `providerEvidenceRefreshPromise`, the ordinary 100ms path calls `refreshProviderEvidence()` without preservation, clears the shared region, and maps the valid cache outcome to global `stale` (`extension/ui/options.js:1218-1312`, `extension/ui/options.js:1626-1637`). The read-only VM composition observed `Provider status refreshed. Compatibility is now Supported.` / `ready` after manual settlement, then final `''` / `stale` with `Installed · Status may be stale` after one delayed cache hydration.
- **WARNING WR-02 — older expiry can win after newer manual Supported:** `refreshProviderCompatibilityProjection()` checks the manual promise only at entry but does not register its own request in shared in-flight or generation state. A manual refresh can therefore start while the expiry read is pending; the late expiry merge then overwrites newer compatibility and clears its newer deadline (`extension/ui/options.js:1157-1206`, `extension/ui/options.js:1209-1242`). The held-response VM composition observed manual final `Supported` / `Provider status refreshed.` / `ready`, then final row and detail `Degraded` while the success announcement and `ready` state remained.
- **PASS — identity and authority remain bounded:** Both adversarial compositions preserved focus, selected provider, row order, recommendation, provider kind/id, models, keys/endpoints, dirty state, auth/billing, and UI storage writes. Runtime calls stayed within cache-only `getMcpClients` and explicit `refreshMcpCompatibility`; the executable Phase 61–62 contract passes all no-authority/leakage guards (`tests/providers-panel-ui.test.js:1602-1629`; `tests/delegation-phase-contract.test.js:1060-1190`).
- **TEST GAP:** Stock coverage includes only storage-before-live-settlement and sequential expiry. It does not deliver the causal notification after settlement or release an older held expiry response after a newer live response.

---

## Deferred Human Review

These remain pending observations, not source passes:

1. **Rendered badge/layout comparison** — Supported, Degraded, and Unsupported in light/dark, desktop, compact, 641–899px, and at-most-640px layouts, including dividers, wrapping, radio placement, and horizontal overflow.
2. **Keyboard and assistive technology** — Native radio behavior, names/descriptions, focus retention, real live-region timing, forced colors, and reduced motion.
3. **Live compatibility projection** — Fresh, newer, stale, corrupt, absent, refresh-failure, and overlapping refresh states against an installed daemon/CLI without form, selection, recommendation, or persistence mutation.

---

## Verification

Executed source-only at `d005d1eb`:

- Syntax checks for `extension/ui/options.js`, `extension/utils/mcp-agent-providers.js`, and the three modified test files — PASS
- `node tests/providers-panel-logic.test.js` — PASS
- `node tests/providers-panel-ui.test.js` — PASS
- `node tests/mcp-agent-providers-storage.test.js` — PASS
- `node tests/mcp-bridge-background-dispatch.test.js` — PASS (293 assertions)
- `node tests/delegation-phase-contract.test.js` — PASS (763 assertions)
- Read-only delayed-storage composition — **REPRODUCED WR-01**: settled success/ready became empty/stale after one later cache hydration.
- Read-only expiry/manual race composition — **REPRODUCED WR-02**: older Degraded overwrote newer Supported while the success announcement remained.

The two negative compositions dynamically instrumented test source in memory; no implementation or test file was changed.

## Audit Outcome

- Source-actionable UI findings: 2 warnings
- Blockers: 0
- Previously covered core fixes verified: stale coherence, exact expiry, sequential compatibility-only merge, snapshot-only rows, favorable causal fan-out, and single live-region ownership
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
- `tests/delegation-phase-contract.test.js`
