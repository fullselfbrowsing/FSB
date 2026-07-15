---
phase: 61-delegation-ux-sw-eviction-persistence
reviewed: 2026-07-15
status: needs-attention
baseline: 61-UI-SPEC.md
overall_score: "16/24"
screenshots: not-captured
needs_human_review: true
---

# Phase 61 — UI Review

**Audited:** 2026-07-15  
**Baseline:** approved `61-UI-SPEC.md` design contract  
**Screenshots:** Not captured. No dev server responded on ports 3000, 5173, or 8080, Playwright-MCP was unavailable, and the user deferred all live browser/visual UAT.  
**Evidence mode:** Code, DOM-test, and source-contract evidence only. Every visual, focus, screen-reader, contrast, density, and responsive judgment that requires a rendered extension remains `needs_human_review` / pending; this review claims no live visual pass.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Exact consent, lifecycle, recovery, summary, and unknown-value copy is implemented and source/DOM tested without forbidden marketing claims. |
| 2. Visuals | 2/4 | The full-width card/feed hierarchy exists, but the current-run card omits elapsed time and Phase 61 semantic states have no contract-required icon treatment or distinct active-run marker. |
| 3. Color | 2/4 | Shared light/dark tokens are reused, but every summary receives the success marker—including failed/restart-lost summaries—and the primary accent is permanently assigned to every tool-call row. |
| 4. Typography | 4/4 | Phase additions stay within the approved 12/14/16px subset and use only the approved 400/600 weights with the existing system and permitted monospace stacks. |
| 5. Spacing | 2/4 | Core card/grid spacing uses 4/8/16px, but repeated 12px and 18px layout spacing violates the approved scale's explicit “Exceptions: none” rule. |
| 6. Experience Design | 2/4 | State authority, hydration, errors, focus-after-command, and no-optimism behavior are strong, but the second Stop location, lifecycle/control announcements, and per-tool disclosure contract are missing. |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **Wire both Stop locations to the same delegated action** — The existing input-cluster Stop remains hidden/legacy-wired during a delegated run, removing the contract's persistent redundant kill switch. Multiplex `stopBtn` to `_stopDelegation` whenever the selected canonical snapshot is active, share pending/disabled state with the run-card button, and restore the legacy handler on terminal/API state.
2. **Drive terminal tone, icons, and one-shot announcements from canonical state** — A failed or restart-lost summary can look successful, and `Starting`, `Take control available`, held, and stopping transitions do not reach the single announcer when `announceSequence` is `null`. Add closed state/tone attributes and `aria-hidden` icons, then deduplicate lifecycle/control announcements separately from persisted-entry announcements while preserving silent hydration.
3. **Restore long-run scanability** — The current-run card omits elapsed time and each six-field tool call is always expanded. Derive elapsed presentation from canonical persisted timestamps, and render each tool call as a meaningful native `<details>/<summary>` disclosure with call id, arguments, tab, status, and duration in its expanded body.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- Ready-state copy is exact (`extension/ui/sidepanel.js:887-914`); consent, trust, safety, and Back copy is exact (`extension/ui/sidepanel.js:1020-1092`); offline/unpaired/unsupported copy is exact (`extension/ui/sidepanel.js:1112-1186`); and running, held, stopped, failure, disconnect, and restart-loss copy is exact (`extension/ui/sidepanel.js:1215-1223`, `extension/ui/sidepanel.js:1369-1502`).
- Summary copy is honest and closed: `Included in your subscription`, real API USD only, and `Not reported` for unavailable values (`extension/ui/delegation-feed.js:313-327`, `extension/ui/delegation-feed.js:386-425`).
- Providers exposes the exact authority-reducing `Restore confirmation for Claude Code` action and explicit pending/success/failure copy (`extension/ui/options.js:379-450`).
- The exact-copy and forbidden-claim source gate passes (`tests/delegation-sidepanel-ui.test.js:356-425`), including the ban on `faster mode`, `free`, and `unlimited`.
- Executed evidence: `node tests/delegation-sidepanel-ui.test.js`, `node tests/sidepanel-tab-aware-smoke.test.js`, `node tests/owner-chip.test.js`, and `node tests/providers-panel-logic.test.js` all passed during this audit.

### Pillar 2: Visuals (2/4)

- The implementation establishes the intended focal hierarchy: the delegation section is first inside the message stream (`extension/ui/sidepanel.html:56-69`), stretches to full width, and places the state card before the chronological feed (`extension/ui/sidepanel.css:1714-1755`). Action controls are visible-text buttons, and narrow/wide layouts stack or split appropriately (`extension/ui/sidepanel.css:1921-1942`, `extension/ui/sidepanel.css:2015-2042`).
- The approved current-run card requires provider, state, **elapsed time**, and the background-tab statement (`61-UI-SPEC.md:63-76`). `_renderDelegationRunHeader` renders provider/state/background copy and actions but no elapsed value or timer (`extension/ui/sidepanel.js:1369-1502`).
- The approved color semantics require an icon plus explicit text (`61-UI-SPEC.md:137-153`). The Phase 61 feed and run-card builders create headings, paragraphs, definition lists, details, and buttons, but no semantic icon nodes (`extension/ui/delegation-feed.js:333-425`, `extension/ui/sidepanel.js:1369-1502`). Text prevents color-only meaning, but the explicit icon contract remains unmet.
- The contract reserves an orange leading marker for the active run (`61-UI-SPEC.md:145-153`), but the state card has no canonical state class/data attribute and no active-run marker. Orange is instead assigned to each tool-call row (`extension/ui/sidepanel.css:1728-1763`).
- `needs_human_review`: rendered focal strength, card density, control-bar overlap, long-string wrapping, and visual distinction at narrow/wide sizes cannot be judged without loading the extension UI.

### Pillar 3: Color (2/4)

- The Phase 61 block consistently uses shared surface, text, information, warning, success, danger, border, shadow, and focus tokens, including a token-backed dark-theme override (`extension/ui/sidepanel.css:1728-1776`, `extension/ui/sidepanel.css:1821-1834`, `extension/ui/sidepanel.css:1944-1973`, `extension/ui/sidepanel.css:2006-2013`).
- `_validSummary` permits `completed`, `failed`, `stopped`, and `restart_lost` (`extension/ui/delegation-feed.js:217-235`), but `renderSummary` emits the same unqualified `.delegation-summary` class for all of them (`extension/ui/delegation-feed.js:394-406`). CSS then gives every summary a success-green leading border (`extension/ui/sidepanel.css:1770-1773`). Failed and restart-lost outcomes can therefore present with the completed-result color.
- The primary accent is contractually limited to consent/start, Resume, active-run marker, and focus (`61-UI-SPEC.md:145-153`), yet `.delegation-entry-tool-call` permanently uses `var(--fsb-primary)` (`extension/ui/sidepanel.css:1761-1763`). This spends the accent repeatedly in long feeds while the required active marker is absent.
- Primary-button foreground is literal `white` instead of the available theme-aware inverse text token (`extension/ui/sidepanel.css:1944-1948`; token source `extension/shared/fsb-ui-core.css:40`, `extension/shared/fsb-ui-core.css:128`).
- `needs_human_review`: computed contrast, tinted-surface balance, and the actual 60/30/10 distribution remain pending without rendered light/dark screenshots.

### Pillar 4: Typography (4/4)

- The approved additions allow 11/12/14/16px and only 400/600 weights (`61-UI-SPEC.md:120-133`). The Phase 61 CSS uses 12/14/16px and only 400/600; it introduces no unapproved size or weight (`extension/ui/sidepanel.css:1779-1813`, `extension/ui/sidepanel.css:1821-1829`, `extension/ui/sidepanel.css:1862-1877`, `extension/ui/sidepanel.css:1908-1915`, `extension/ui/sidepanel.css:1929-1942`).
- Heading, body, label/button, and definition-list line heights match their declared roles. Sentence case is used throughout, and monospace is confined to doctor/machine values (`extension/ui/sidepanel.css:1836-1846`, `extension/ui/sidepanel.css:1881-1884`, `extension/ui/sidepanel.css:1893-1906`).
- The existing system stack remains inherited; no new font dependency or typography fork was introduced.
- `needs_human_review`: actual legibility, truncation, zoom behavior, and font rendering remain pending.

### Pillar 5: Spacing (2/4)

- The main layout correctly uses the declared scale for 4px metadata gaps, 8px feed/control gaps, and 16px card padding/section spacing (`extension/ui/sidepanel.css:1714-1755`, `extension/ui/sidepanel.css:1804-1813`, `extension/ui/sidepanel.css:1848-1860`, `extension/ui/sidepanel.css:1921-1942`).
- The approved scale allows only 4/8/16/24/32/48/64px and declares no exceptions (`61-UI-SPEC.md:102-116`). New Phase 61 layout declarations repeatedly introduce 12px spacing in inline errors, doctor blocks, technical details, and control padding (`extension/ui/sidepanel.css:1821-1845`, `extension/ui/sidepanel.css:1893-1900`, `extension/ui/sidepanel.css:1975-1984`).
- The pinned control bar also uses an off-scale 18px horizontal margin (`extension/ui/sidepanel.css:1975-1984`). These are repeated design-token deviations, not an isolated optical adjustment.
- Responsive structure itself is present: actions and metric grids stack at 350px, while result/permission grids become two-column at 500px (`extension/ui/sidepanel.css:2015-2042`).
- `needs_human_review`: card rhythm, bottom clearance above the composer, and narrow-panel density remain pending.

### Pillar 6: Experience Design (2/4)

- Strong source evidence covers the difficult state behavior: hydrate-before-subscribe and silent history (`extension/ui/sidepanel.js:940-1001`), explicit pending/disabled consent (`extension/ui/sidepanel.js:1020-1092`), exact active-tab eligibility (`extension/ui/sidepanel.js:1253-1311`), no optimistic hold/resume rendering (`extension/ui/sidepanel.js:1611-1633`, `extension/ui/sidepanel.js:1747-1809`), idempotent Stop (`extension/ui/sidepanel.js:1811-1836`), and canonical snapshot validation/fanout (`extension/ui/delegation-feed.js:182-293`, `extension/ui/sidepanel.js:1530-1608`).
- Empty, pending, error, offline, disconnected, restart-lost, stopped, retry, and restored-history states are all represented. Alerts are deduplicated, and only strictly newer persisted entries reach the one polite announcer (`extension/ui/sidepanel.js:1225-1251`, `extension/ui/sidepanel.js:1561-1595`). Interaction tests exercise focus retention, no optimism, trust ordering, hydration silence, interleaved ids, duplicate Stop, and alert dedupe (`tests/delegation-sidepanel-ui.test.js:464-1020`).
- The contract requires Stop in both the input action cluster and run card, sharing one idempotent action (`61-UI-SPEC.md:47-53`, `61-UI-SPEC.md:209-218`). The run card creates `_stopDelegation` (`extension/ui/sidepanel.js:1324-1335`), but the fixed input button starts hidden (`extension/ui/sidepanel.html:121-123`) and is permanently wired to legacy `stopAutomation` (`extension/ui/sidepanel.js:2794-2797`). Its only show path is the legacy `setRunningState` flow (`extension/ui/sidepanel.js:3172-3203`), which delegated starts do not enter.
- The single announcer is updated for doctor-copy feedback and newly persisted entry sequences, not for canonical lifecycle/control-only transitions (`extension/ui/sidepanel.js:1099-1109`, `extension/ui/sidepanel.js:1581-1595`). `Starting`, newly available `Take control`, held confirmation, and stopping can arrive with `announceSequence:null`, leaving the UI-SPEC's one-shot announcement requirements unimplemented (`61-UI-SPEC.md:81-98`, `61-UI-SPEC.md:209-218`).
- The tool-call inventory requires a native disclosure (`61-UI-SPEC.md:70-76`). Each tool row currently renders all six fields in an always-open `<dl>` (`extension/ui/delegation-feed.js:350-359`); the only `<details>` is the aggregate run-summary tool-count breakdown (`extension/ui/delegation-feed.js:408-425`). This makes a long delegated feed substantially denser than the approved interaction model.
- `needs_human_review`: keyboard traversal, focus visibility, screen-reader announcement timing, reduced motion, clipboard feedback, and genuine extension panel behavior remain pending.

---

## Audit Outcome

- Contract-level priority fixes: 3
- Minor recommendations: 3 (normalize spacing tokens, reserve the accent for declared roles, and replace literal primary-button foreground with the inverse text token)
- Automated UI/source suites executed: 4, all passing
- Human review required: yes — all live visual/browser/accessibility checks remain pending
- Screenshots: none captured

## Files Audited

- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-01-PLAN.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-01-SUMMARY.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-02-PLAN.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-02-SUMMARY.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-03-PLAN.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-03-SUMMARY.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-04-PLAN.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-04-SUMMARY.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-05-PLAN.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-05-SUMMARY.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-06-PLAN.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-06-SUMMARY.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-07-PLAN.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-07-SUMMARY.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-08-PLAN.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-08-SUMMARY.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-CONTEXT.md`
- `.planning/phases/61-delegation-ux-sw-eviction-persistence/61-UI-SPEC.md`
- `extension/ui/delegation-feed.js`
- `extension/ui/sidepanel.html`
- `extension/ui/sidepanel.js`
- `extension/ui/sidepanel.css`
- `extension/ui/options.js`
- `extension/shared/fsb-ui-core.css`
- `extension/background.js`
- `extension/utils/delegation-controller.js`
- `tests/delegation-sidepanel-ui.test.js`
- `tests/sidepanel-tab-aware-smoke.test.js`
- `tests/owner-chip.test.js`
- `tests/providers-panel-logic.test.js`

