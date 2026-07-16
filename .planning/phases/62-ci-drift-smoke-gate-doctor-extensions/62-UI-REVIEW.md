---
phase: 62-ci-drift-smoke-gate-doctor-extensions
reviewed: 2026-07-16
iteration: 1
status: source-needs-fixes
baseline: 62-UI-SPEC.md
overall_score: "21/24"
screenshots: not-captured-source-only
needs_human_review: true
audited_head: b78793bd
source_actionable_findings: 2
blockers: 0
warnings: 2
---

# Phase 62 — UI Review

**Audited:** 2026-07-16  
**Baseline:** approved `62-UI-SPEC.md` design contract  
**Implementation boundary:** `b78793bd` (`docs(62-06): complete drift closure plan`)  
**Screenshots:** Not captured by explicit source-only scope. No browser, rendered-layout, keyboard, screen-reader, forced-colors, reduced-motion, or live-daemon probe was performed.  
**Evidence mode:** Code, source-contract, and deterministic DOM/VM-test evidence only. The three rendered/live scenarios in `62-HUMAN-UAT.md` remain `human_needed`; this report does not promote synthetic evidence to a human pass.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Exact labels and recovery strings are implemented, but a `stale` outcome can announce that support is Degraded while the visible badge still says Supported. |
| 2. Visuals | 4/4 | Source structure provides separate agent-only compatibility groups, semantic icons, trailing radios, and a distinct selected-detail fact exactly as specified. |
| 3. Color | 4/4 | Semantic success/warning/error tokens are scoped to compatibility pills/icons, with text, icon shape, and forced-color border styles as non-color cues. |
| 4. Typography | 4/4 | Compatibility uses the approved 12/14px roles, 400/600 weights, sentence case, wrapping, and inherited system type. |
| 5. Spacing | 4/4 | Phase 62 compatibility declarations stay on the 4/8/16px subset and implement the specified wide, medium, and narrow divider layouts. |
| 6. Experience Design | 2/4 | Stale state can be internally contradictory, and compatibility updates occur inside a second polite live region in addition to the shared announcement region. |

**Overall source-contract score: 21/24**

No blocker was found. Two deterministic source warnings should be fixed before treating the UI source contract as complete.

---

## Top 3 Priority Fixes

1. **Make every stale fallback visually truthful** — A valid fresh cached snapshot can produce `refreshOutcome: 'stale'` while retaining a `supported` projection, and the UI runtime-error branch also retains prior supported rows. The alert nevertheless says cached support is now Degraded. Ensure background stale fallback and UI timeout/error fallback both present prior support as `Degraded` / `evidence_stale` before announcing the exact recovery copy.
2. **Restore one compatibility live-region owner** — Remove compatibility refresh/hydration updates from the broad `#agentProviderDetails[aria-live="polite"]` region, or remove that container-level live behavior and route compatibility feedback only through `#providerEvidenceAnnouncement`. Preserve the separate pairing status region for pairing actions.
3. **Add regressions for the uncovered boundaries** — Test fresh supported cache plus daemon/storage failure, prior supported UI state plus runtime timeout/error, exact badge/description/selected-detail agreement with the recovery announcement, and a source/DOM assertion that cold hydration produces no compatibility live-region update and manual refresh has one compatibility announcement owner.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **PASS:** The mapper owns the exact `Supported`, `Degraded`, and `Unsupported` labels, icons, classes, and four normative detail strings. Claude auth is exactly `Not reported` with the approved safe-read explanation (`extension/ui/providers-panel.js:27-52`, `extension/ui/providers-panel.js:288-334`).
- **PASS:** The existing action labels remain exact: `Refresh status`, `Refreshing…`, and `Save Settings`; compatibility introduces no CTA or destructive action (`extension/ui/control_panel.html:152-162`).
- **WARNING — state/copy contradiction:** The background returns `refreshOutcome: 'stale'` whenever any validated cache exists, but the merged projection degrades support only after the 15-minute age bound. A fresh cached supported row can therefore remain `Supported` while `options.js` announces `Compatibility data could not be refreshed. Cached support is now Degraded.` (`extension/background.js:121-162`, `extension/utils/mcp-agent-providers.js:398-428`, `extension/ui/options.js:1042-1063`). The same mismatch can occur after a UI-to-background runtime timeout because the catch branch retains prior clients and only changes `evidenceStatus` (`extension/ui/options.js:1066-1080`). The strings are exact, but the claim is not always truthful to the displayed state.

### Pillar 2: Visuals (4/4)

- **PASS:** Exactly three agent rows contain a dedicated compatibility sibling after evidence and before the native radio; all seven API rows omit it. Each group has the visible micro-label, decorative semantic icon, and closed badge (`extension/ui/control_panel.html:168-218`).
- **PASS:** Selected agent details retain separate Installation, Connection, Compatibility, and Account/Auth facts rather than combining their meanings (`extension/ui/control_panel.html:530-550`).
- **PASS:** Wide and medium layouts retain inline separation; the narrow layout converts compatibility to a full-width, top-divided group without CSS reordering (`extension/ui/options.css:6247-6327`).
- **HUMAN_NEEDED:** Actual hierarchy, wrapping, divider placement, badge density, trailing-radio placement, and absence of clipping at desktop, 641–899px, and at-most-640px widths require the deferred rendered comparison.

### Pillar 3: Color (4/4)

- **PASS:** Supported, Degraded, and Unsupported use the exact success, warning, and error token pairs only on their pills and icons (`extension/ui/options.css:5972-6000`). Provider rows, radios, names, recommendation badges, evidence, auth, and billing are not included in compatibility-tone selectors.
- **PASS:** Text and distinct Font Awesome shapes accompany color. Forced-colors source rules add Canvas text/background and solid/dashed/double borders, while dark mode stays token-based (`extension/ui/options.css:6231-6238`, `extension/ui/options.css:6329-6355`).
- **HUMAN_NEEDED:** Real light/dark contrast and forced-colors distinguishability remain deferred; source presence is not recorded as a rendered contrast pass.

### Pillar 4: Typography (4/4)

- **PASS:** The micro-label is 12px/400/1.5, pills are 12px/600/1.2, and selected-detail status/help use the approved 14px and 12px roles (`extension/ui/options.css:5945-5969`, `extension/ui/options.css:6087-6124`).
- **PASS:** Copy is sentence case, status remains visible beside decorative icons, and wrapping is enabled without ellipsis or text truncation (`extension/ui/options.css:5931-5970`).
- **HUMAN_NEEDED:** Perceived hierarchy and line wrapping with real system fonts remain part of the rendered milestone-end check.

### Pillar 5: Spacing (4/4)

- **PASS:** Compatibility-specific gaps and padding use only approved 4px, 8px, and 16px values, with a one-pixel tokenized divider (`extension/ui/options.css:5931-5943`, `extension/ui/options.css:5958-5969`).
- **PASS:** The explicit 900px, 641–899px, and at-most-640px rules preserve two columns, one column, and full-width stacked compatibility respectively (`extension/ui/options.css:6247-6327`).
- **PASS:** The compatibility group remains non-interactive; existing refresh and radio focus/target rules are preserved (`extension/ui/options.css:5747-5755`, `extension/ui/options.css:5803-5878`).
- **HUMAN_NEEDED:** No-overflow and usable target geometry must still be observed in the real extension rather than inferred from `overflow-x: hidden` and source rules alone.

### Pillar 6: Experience Design (2/4)

- **PASS:** The pure mapper is fail-closed for absent, malformed, accessor-bearing, inherited, unknown, and unshipped evidence; API providers receive no compatibility model (`extension/ui/providers-panel.js:266-327`).
- **PASS:** Rendering uses constant-owned models and `textContent`, keeps stable descriptions, and has no selection, persistence, recommendation, doctor, shell, native, wake, or version authority (`extension/ui/options.js:565-615`). Focus, form, dirty-state, recommendation, and storage identity are covered across synthetic status transitions (`tests/providers-panel-ui.test.js:2030-2137`).
- **WARNING — stale state is not closed end to end:** `refreshOutcome: 'stale'` does not guarantee a degraded row, and the UI catch path does not project retained support to Degraded. Badge, radio description, selected-detail fact, and assertive recovery message can disagree during precisely the failure state the contract requires to be coherent (`extension/background.js:121-162`, `extension/utils/mcp-agent-providers.js:424-428`, `extension/ui/options.js:1023-1087`).
- **WARNING — more than one compatibility announcement path:** The shared `#providerEvidenceAnnouncement` is a polite/assertive live region, but the entire selected `#agentProviderDetails` container is also `aria-live="polite"`. `renderSelectedAgentDetails()` rewrites compatibility status/help/checked text during cold hydration and every refresh, while manual refresh separately writes the shared announcement (`extension/ui/control_panel.html:162`, `extension/ui/control_panel.html:521`, `extension/ui/options.js:791-837`, `extension/ui/options.js:1030-1087`). This source structure does not satisfy silent hydration or single-owner announcement guarantees; actual duplicate speech timing remains `human_needed`.
- **TEST GAP:** The UI suite explicitly preserves the broad details live region, tests stale runtime failure without a supported compatibility row, and tests a stale outcome only when the supplied row is already degraded. It therefore passes without exercising either warning (`tests/providers-panel-ui.test.js:270-272`, `tests/providers-panel-ui.test.js:1968-1988`, `tests/providers-panel-ui.test.js:2093-2111`).

---

## Deferred Human Review

These are pending observations, not known source defects and not passes:

1. **Rendered badge/layout comparison** — Supported, Degraded, and Unsupported in light/dark, desktop, compact, 641–899px, and at-most-640px layouts, including dividers, wrapping, radio placement, and horizontal overflow.
2. **Keyboard and assistive technology** — Native radio behavior, names/descriptions, focus retention, cold-hydration silence, one-shot live-region feedback, screen-reader timing, forced colors, and reduced motion.
3. **Live compatibility projection** — Fresh, newer, stale, corrupt, absent, and refresh-failure states against an installed daemon/CLI without form, selection, recommendation, or persistence mutation.

---

## Verification

Executed at `b78793bd`:

- `node --check extension/ui/providers-panel.js` — PASS
- `node --check extension/ui/options.js` — PASS
- `node tests/providers-panel-logic.test.js` — PASS
- `node tests/providers-panel-ui.test.js` — PASS
- `git diff --check` across the six Phase 62 Providers implementation/test files — PASS

The passing focused suites validate the implemented source contracts but do not cover the two warnings above.

## Audit Outcome

- Source-actionable UI findings: 2 warnings
- Blockers: 0
- Priority fixes: 3
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

