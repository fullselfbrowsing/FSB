---
phase: 64-opencode-adapter
reviewed: 2026-07-21
status: warnings
baseline: 64-UI-SPEC.md
overall_score: "21/24"
scores:
  copywriting: 4
  visuals: 4
  color: 4
  typography: 4
  spacing: 2
  experience_design: 3
screenshots: not-captured-no-auditable-dev-server
playwright_available: false
needs_human_review: true
blockers: 0
warnings: 2
human_evidence_items: 3
---

# Phase 64 — UI Review

**Audited:** 2026-07-21

**Baseline:** approved `64-UI-SPEC.md` design contract

**Screenshots:** Not captured. No Playwright capability was available. Ports 5173 and 8080 had no responding server; port 3000 returned an unrelated/unauditable `401`, so no live extension surface was available.

**Evidence mode:** Source, DOM-harness, and deterministic test evidence. Live Chrome rendering, contrast, wrapping, keyboard behavior, screen-reader output, and cold/owned-attach parity remain human-owned.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | OpenCode compatibility, auth, billing, consent, recovery, and terminal copy is exact, provider-neutral, and source-tested. |
| 2. Visuals | 4/4 | OpenCode reuses the unchanged second provider row and the existing consent/run/feed hierarchy with no new visible DOM, CSS, logo, or renderer branch. |
| 3. Color | 4/4 | Compatibility and lifecycle states use the closed semantic-token palette, with text/icon/border redundancy and forced-colors treatments. |
| 4. Typography | 4/4 | The Providers surface remains within four inherited sizes and two weights; the side panel keeps its existing 12/14/16px hierarchy. |
| 5. Spacing | 2/4 | The roster follows the approved scale, but delegated action buttons are pinned to 36px instead of the contract's 44px minimum target. |
| 6. Experience Design | 3/4 | Authority, terminal gating, billing, hydration, and replay behavior are strong, but production can render a version-like OpenCode profile that the parity fixture deliberately removes. |

**Overall: 21/24**

There are no BLOCKER findings. Two code-contract WARNING findings should be resolved before calling the UI contract complete.

---

## Top 3 Priority Fixes

1. **Restore 44px delegated action targets** — Consent, recovery, Take control, Resume, and in-card Stop buttons currently share a 36px minimum, reducing touch/motor accessibility — change `.delegation-action` to a minimum of 44px and add a source/DOM assertion for both normal and `<=350px` layouts.
2. **Close the OpenCode profile-presentation gap** — Production persists `profileVersion` and the feed renders it as `Profile`, while the OpenCode DOM-parity fixture sets it to `null` — either redact that value from presentation or explicitly revise the contract, then test the actual controller-generated OpenCode snapshot.
3. **Complete live extension UAT** — Source tests cannot establish theme contrast, narrow wrapping, focus visibility/order, announcement timing, hydration silence, or cold/owned-attach perceptual parity — execute UAT64-01 through UAT64-03 in the disposable Chrome setup and record evidence in `64-HUMAN-UAT.md`.

---

## Findings Ledger

| ID | Pillar | Severity | Finding | needs_human_review |
|----|--------|----------|---------|--------------------|
| UI64-W01 | Spacing | WARNING | `.delegation-action` has `min-height: 36px`, although the approved UI-SPEC and Plans 11/12 require at least 44px interactive targets. | false |
| UI64-W02 | Experience Design | WARNING | The real OpenCode start path persists `profileVersion` and the generic feed displays it, but the parity fixture nulls the field; the no-version presentation lock is not proved by the current test. | false |
| UI64-H01 | Visuals / Color / Typography | HUMAN EVIDENCE | Light, dark, forced-colors, narrow-width, zoom, and dense-content rendering were not observed in a live extension. | true |
| UI64-H02 | Experience Design | HUMAN EVIDENCE | Keyboard focus, screen-reader announcement order, and hydration silence require live browser/assistive-technology verification. | true |
| UI64-H03 | Experience Design | HUMAN EVIDENCE | Genuine authenticated execution and user-visible cold versus verified-owned-attach parity require the deferred external UAT setup. | true |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — exact compatibility language.** The closed display model supplies only **Supported**, **Degraded**, and **Unsupported**, including the approved newer, stale, and recovery descriptions (`extension/ui/providers-panel.js:41-64`, `extension/ui/providers-panel.js:302-340`). The renderer writes the exact label and description through `textContent` (`extension/ui/options.js:831-857`).
- **PASS — honest account and billing language.** OpenCode renders **Not reported**, **The CLI has not reported its account type.**, **Billing not reported**, and the approved provider/Zen explanation without inferring a subscription, price, allowance, or account (`extension/ui/providers-panel.js:65-67`, `extension/ui/providers-panel.js:87-95`, `extension/ui/providers-panel.js:343-364`, `extension/ui/options.js:1047-1115`). Unknown run billing becomes exactly **Billing not reported** (`extension/ui/delegation-feed.js:491-513`).
- **PASS — provider-neutral consent and recovery.** The canonical provider label produces `Let OpenCode control this browser?`, trust, Allow, preflight, and failure copy through the shared renderer rather than an OpenCode-only string branch (`extension/ui/sidepanel.js:1448-1530`, `extension/ui/sidepanel.js:1605-1698`). The focused DOM suite locks the OpenCode consent and recovery strings (`tests/delegation-sidepanel-ui.test.js:792-807`, `tests/delegation-sidepanel-ui.test.js:1250-1261`).

### Pillar 2: Visuals (4/4)

- **PASS — unchanged roster hierarchy.** OpenCode remains the second Agent CLI row between Claude Code and Codex. Its name, evidence cluster, compatibility group/description, and one trailing native radio retain separate identities (`extension/ui/control_panel.html:164-218`, `tests/providers-panel-ui.test.js:161-177`, `tests/providers-panel-ui.test.js:250-259`).
- **PASS — unchanged side-panel composition.** The phase adds only the ordered canonical-provider helper dependency; the visible side-panel HTML and all side-panel CSS are byte-locked as unchanged (`tests/delegation-sidepanel-ui.test.js:528-540`). OpenCode and Claude normalized snapshots produce the same DOM shape with only canonical content differences (`tests/delegation-sidepanel-ui.test.js:405-430`).
- **PASS — semantic visual hierarchy.** Feed items are articles with headings, decorative semantic icons, definition lists, and native disclosures; the renderer uses text nodes rather than dynamic HTML (`extension/ui/delegation-feed.js:350-420`, `extension/ui/delegation-feed.js:423-533`, `tests/delegation-sidepanel-ui.test.js:599-610`).
- **Human evidence boundary (`needs_human_review: true`).** Byte/source equivalence proves Phase 64 introduced no structural drift, but it does not establish rendered balance, clipping, dense-feed legibility, or icon alignment in a live extension.

### Pillar 3: Color (4/4)

- **PASS — closed state palette.** Providers uses exactly three compatibility classes: supported/success, degraded/warning, and unsupported/error. Side-panel lifecycle presentation uses the six existing active, info, success, warning, danger, and neutral token mappings, rather than OpenCode branding (`extension/ui/options.css:5972-6001`, `extension/ui/sidepanel.css:1757-1813`, `extension/ui/sidepanel.css:1831-1854`).
- **PASS — no raw Phase 64 color path.** The Providers block is byte-equivalent and source-tested to reject raw hex/RGB values; selection, focus, and semantic states consume existing theme variables (`tests/providers-panel-ui.test.js:419-426`, `tests/providers-panel-ui.test.js:589-590`).
- **PASS — non-color redundancy.** Compatibility retains exact text, distinct icons, and solid/dashed/double borders in forced colors (`extension/ui/options.css:6329-6355`). Lifecycle cards retain text plus icon and left-border cues (`extension/ui/delegation-feed.js:384-420`, `extension/ui/sidepanel.css:1765-1813`).
- **Human evidence boundary (`needs_human_review: true`).** Actual contrast in light/dark themes and OS forced-colors output was not measured in a browser.

### Pillar 4: Typography (4/4)

- **PASS — declared Providers distribution.** The phase surface stays within the approved 12px metadata/badges, 14px body/row values, 16px subsection headings, and 18px roster legend, using only 400 and 600 weights (`extension/ui/options.css:5725-5765`, `extension/ui/options.css:5789-5885`, `extension/ui/options.css:6048-6124`).
- **PASS — inherited side-panel hierarchy.** Feed and consent UI retain 16px headings, 14px body/trust copy, and 12px metadata/actions with 400/600 weights; monospace is limited to machine values (`extension/ui/sidepanel.css:1856-1897`, `extension/ui/sidepanel.css:1938-2009`, `extension/ui/sidepanel.css:2024-2036`).
- **Human evidence boundary (`needs_human_review: true`).** Live font fallback, zoom reflow, and long localized/provider-derived value wrapping remain unobserved.

### Pillar 5: Spacing (2/4)

- **PASS — roster scale.** Provider layout uses the declared 4/8/12/16/24/32/64px rhythm, with a 64px row minimum, 16px row padding, 12px internal gap, a 20px native radio, and 44px refresh/detail controls (`extension/ui/options.css:5732-5751`, `extension/ui/options.css:5778-5873`, `extension/ui/options.css:6048-6130`). The `<=640px` layout stacks compatibility and controls without visual reordering (`extension/ui/options.css:6290-6327`).
- **WARNING UI64-W01 (`needs_human_review: false`).** The shared delegated button class has `min-height: 36px` (`extension/ui/sidepanel.css:2024-2037`). These are real buttons used for consent Allow/Back (`extension/ui/sidepanel.js:1209-1217`, `extension/ui/sidepanel.js:1511-1522`), preflight recovery (`extension/ui/sidepanel.js:1684-1687`), Take control/Resume (`extension/ui/sidepanel.js:1789-1827`), and Stop (`extension/ui/sidepanel.js:1918-1931`). At `<=350px` only width changes; height stays 36px (`extension/ui/sidepanel.css:2111-2133`). This conflicts with the explicit 44px minimum in `64-UI-SPEC.md:66,207` and `64-12-PLAN.md:92`.
- **Concrete remediation.** Set the shared minimum to 44px (or provide an equivalent measured hit-area wrapper), preserve the existing token padding and narrow full-width behavior, and add a test that rejects any delegated action target below 44px.

### Pillar 6: Experience Design (3/4)

- **PASS — robust state and authority coverage.** Provider compatibility fails closed, selection/dirty/API/focus state survives refresh transitions, consent remains provider-bound, hydration is silent, strictly newer events announce once, and no automatic replay action is introduced (`extension/ui/providers-panel.js:302-340`, `extension/ui/options.js:1260-1267`, `tests/providers-panel-ui.test.js:1982-2116`, `tests/delegation-sidepanel-ui.test.js:599-623`).
- **PASS — terminal truth and honest billing.** Result/summary rendering requires a completed snapshot, completed terminal, completed summary, and a result entry; candidate results are hidden (`extension/ui/delegation-feed.js:423-426`, `extension/ui/delegation-feed.js:540-570`). OpenCode unknown billing never becomes a subscription or dollar amount (`tests/delegation-sidepanel-ui.test.js:405-430`).
- **WARNING UI64-W02 (`needs_human_review: false`).** The production start event passes daemon `profileVersion` into the controller (`extension/background.js:2181-2210`), the controller and event store persist it (`extension/utils/delegation-controller.js:1207-1256`, `extension/utils/delegation-event-store.js:475-484`), and the generic init renderer displays it under **Profile** (`extension/ui/delegation-feed.js:434-444`). The OpenCode DOM-parity fixture explicitly changes that field to `null` before comparison (`tests/delegation-sidepanel-ui.test.js:228-240`), even though event-store tests use `1.14.25` for OpenCode (`tests/delegation-event-store.test.js:184-216`). Consequently, the test does not prove the UI-SPEC rule that extension presentation contain no OpenCode version/range (`64-UI-SPEC.md:189,256`).
- **Concrete remediation.** Render a real controller-produced OpenCode start snapshot in the DOM suite. If `profileVersion` is internal adapter metadata, suppress it from the user feed; if it is intentionally user-facing, revise the UI contract and label it so it cannot be mistaken for a model/provider choice or compatibility promise.
- **Human evidence boundary (`needs_human_review: true`).** UAT64-01 through UAT64-03 still own genuine authentication/tool use, exact-once kill/reclaim, keyboard focus, screen-reader behavior, themes/forced colors, and cold/owned-attach parity (`64-VERIFICATION.md:11-20`, `64-HUMAN-UAT.md`).

---

## Verification Executed

The following focused checks passed during this audit:

- `node tests/providers-panel-logic.test.js`
- `node tests/providers-panel-ui.test.js`
- `node tests/delegation-sidepanel-ui.test.js`
- `node tests/delegation-routing.test.js`

Passing tests establish the checked source/DOM contracts; they do not negate UI64-W01, UI64-W02, or the live human-evidence boundary described above.

## Audit Outcome

- BLOCKER findings: 0
- WARNING findings: 2
- Human-evidence items: 3
- Overall score: 21/24
- Human review required: yes
- Screenshots: none captured
- Registry audit: skipped; shadcn is not initialized (`components.json` is absent), and the UI-SPEC declares no third-party registry blocks
- Implementation edits made by this audit: none

## Files Audited

- `.planning/phases/64-opencode-adapter/64-CONTEXT.md`
- `.planning/phases/64-opencode-adapter/64-UI-SPEC.md`
- `.planning/phases/64-opencode-adapter/64-VERIFICATION.md`
- `.planning/phases/64-opencode-adapter/64-HUMAN-UAT.md`
- `.planning/phases/64-opencode-adapter/64-{01..13}-PLAN.md`
- `.planning/phases/64-opencode-adapter/64-{01..13}-SUMMARY.md`
- `extension/ui/control_panel.html`
- `extension/ui/options.css`
- `extension/ui/options.js`
- `extension/ui/providers-panel.js`
- `extension/ui/sidepanel.html`
- `extension/ui/sidepanel.css`
- `extension/ui/sidepanel.js`
- `extension/ui/delegation-feed.js`
- `extension/background.js`
- `extension/utils/delegation-providers.js`
- `extension/utils/delegation-controller.js`
- `extension/utils/delegation-event-store.js`
- `tests/providers-panel-logic.test.js`
- `tests/providers-panel-ui.test.js`
- `tests/delegation-sidepanel-ui.test.js`
- `tests/delegation-routing.test.js`
- `tests/delegation-controller.test.js`
- `tests/delegation-event-store.test.js`

## UI REVIEW COMPLETE
