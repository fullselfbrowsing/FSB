---
phase: 65-codex-adapter
reviewed: 2026-07-22
status: warnings
baseline: 65-UI-SPEC.md
score_total: 19
score_max: 24
score_copywriting: 3
score_visuals: 3
score_color: 4
score_typography: 3
score_spacing: 4
score_experience_design: 2
blockers: 0
warnings: 2
needs_human_review: true
human_evidence_items: 3
screenshots: not-captured-no-auditable-dev-server
playwright_available: false
---

# Phase 65 — UI Review

**Audited:** 2026-07-22

**Baseline:** approved `65-UI-SPEC.md` design contract

**Screenshots:** Not captured. No Playwright capability was available. Ports 5173 and 8080 had no responding server; port 3000 returned an unauditable `401`, so no live extension surface was available.

**Evidence mode:** Code, deterministic DOM harnesses, and focused source-contract tests only. This review makes no claim of live rendering, contrast, keyboard, screen-reader, genuine Codex account, or genuine delegated-run evidence.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Providers, consent, billing, lifecycle, and summary copy is exact, but unknown and unauthenticated Codex starts collapse to generic recovery copy instead of the two locked messages. |
| 2. Visuals | 3/4 | Codex correctly reuses the existing third row and shared run/feed hierarchy with no brand or renderer fork; rendered hierarchy and wrapping remain unobserved. |
| 3. Color | 4/4 | Compatibility and lifecycle states use the closed semantic-token palette with text, icon, and border redundancy in forced colors. |
| 4. Typography | 3/4 | Source styles retain the approved 12/14/16/18 hierarchy and 400/600 weights, but computed type, fallback, zoom, and long-value wrapping were not observed. |
| 5. Spacing | 4/4 | The provider rhythm, responsive stacks, 44px delegated actions, and 44px-square fixed Stop satisfy the source contract. |
| 6. Experience Design | 2/4 | Authority, terminal gating, hydration, and shared controls are strong, but the feed still renders `argsSummary` into the DOM and auth-specific start recovery is missing. |

**Overall: 19/24**

There are no BLOCKER findings. Two source-actionable WARNING findings must be resolved before the Phase 65 UI contract is complete.

---

## Top 3 Priority Fixes

1. **Remove tool arguments from the presentation boundary** — A validated feed snapshot can place arbitrary bounded `argsSummary` text, including secret-like content, in a visible definition row — force tool arguments/results to `null` or omit them in the event-store/view-model boundary, remove the **Arguments** row from the renderer, and invert the DOM test so such content must be absent.
2. **Preserve a closed Codex auth-failure reason through preflight** — Both `unauthenticated` and `unknown` currently become `provider_status_refresh`, leaving the side panel unable to render the two exact recovery messages — return a safe closed reason (not native auth bytes), map it to the approved heading/body copy, and add DOM tests for both states.
3. **Complete the three live UAT scenarios** — Source tests cannot establish genuine auth projection, browser delegation/process cleanup, rendered contrast/wrapping, keyboard focus, screen-reader timing, or motion behavior — perform UAT65-01 through UAT65-03 in the milestone-end sweep and record only sanitized outcomes in `65-HUMAN-UAT.md`.

---

## Findings Ledger

| ID | Pillar | Severity | Finding | needs_human_review |
|----|--------|----------|---------|--------------------|
| UI65-W01 | Copywriting / Experience Design | WARNING | Unknown and unauthenticated accepted-identity failures share `provider_status_refresh`, which renders generic start-recovery copy rather than either auth-specific UI-SPEC message. | false |
| UI65-W02 | Experience Design / Data Presentation | WARNING | The shared feed validates and visibly renders `entry.tool.argsSummary`; its DOM test explicitly proves secret-like argument text appears, contradicting the locked rule that tool arguments/results never enter DOM or accessibility output. | false |

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **PASS — exact safe Providers copy.** Codex maps the four closed auth states to **ChatGPT**, **API key**, **Not signed in**, and **Status unavailable**, with the approved help text (`extension/ui/providers-panel.js:68-85`). Its billing labels are exactly **Included with your ChatGPT plan**, **Billed to the API key stored by Codex; dollar amount not reported.**, **Sign in to Codex first.**, and **Billing not reported** (`extension/ui/providers-panel.js:86-91`). The mapper accepts only a plain safe projection and fails invalid data to `unknown` (`extension/ui/providers-panel.js:367-400`).
- **PASS — exact compatibility and provider description.** The shared closed copy for Supported, Degraded, stale evidence, and Unsupported is centralized in the existing display models (`extension/ui/providers-panel.js:41-64`). The Codex detail description and repository-owned billing link use the approved wording (`extension/ui/providers-panel.js:120-126`).
- **PASS — honest accepted-run billing.** Feed summaries derive the caption from the immutable accepted auth/billing pair and never format Codex USD; accepted snapshots reject non-null USD (`extension/ui/delegation-feed.js:331-374`, `extension/ui/delegation-feed.js:517-551`).
- **WARNING UI65-W01.** The contract requires **Codex cannot start this task** plus distinct unauthenticated and unknown-auth bodies (`65-UI-SPEC.md:182-185`). Preflight reduces any missing/invalid accepted identity to `{code: "provider_status_refresh"}` without a safe auth reason (`extension/utils/delegation-preflight.js:111-117`, `extension/utils/delegation-preflight.js:154-165`). The side panel has no branch for that code and therefore uses **Agent could not start this task** / **Keep this message in the composer, review the provider settings, and try again.** (`extension/ui/sidepanel.js:1605-1650`). Existing DOM coverage asserts offline, unpaired, and OpenCode `start_rejected`, but neither locked Codex auth state (`tests/delegation-sidepanel-ui.test.js:1384-1443`).
- **Remediation.** Add a closed, background-owned reason such as `auth_unauthenticated` or `auth_unknown` to the exact preflight failure schema; do not expose provider-native bytes. Render the two approved bodies through the shared recovery card, keep **Open provider setup** / **Back to message**, managed focus, and non-optimistic behavior, and source-test both states.

### Pillar 2: Visuals (3/4)

- **PASS — exact roster order and unchanged visual pattern.** The roster remains Claude Code, OpenCode, then Codex. The Codex row retains separate name, evidence badges, compatibility cluster/description, and one trailing native radio (`extension/ui/control_panel.html:164-218`). The canonical roster is likewise closed to those three IDs (`extension/ui/providers-panel.js:13-17`).
- **PASS — shared details and delegation hierarchy.** Codex populates the existing selected-agent facts and sections rather than adding a card, logo, profile badge, or model picker (`extension/ui/control_panel.html:521-599`, `extension/ui/options.js:1043-1125`). Consent, lifecycle, run, feed, control, and summary use the existing provider-neutral mounts and renderer (`extension/ui/sidepanel.js:1448-1529`, `extension/ui/sidepanel.js:2291-2380`).
- **PASS — no visible Profile row or Codex renderer fork.** Init renders Client, Model, Session, and Allowed tools only (`extension/ui/delegation-feed.js:461-470`). The parity suite confirms the production roster, canonical identities, identical provider-neutral feed boundary, no visible Profile definition, and no Codex-specific class/renderer branch (`tests/provider-parity.test.js:214-270`).
- **Human evidence boundary.** Source structure is coherent, but no screenshot or live extension render established optical hierarchy, icon alignment, dense-feed balance, long auth/billing wrapping, or narrow-layout clipping. That unobserved polish boundary holds Visuals at 3/4; it is not a fabricated failure.

### Pillar 3: Color (4/4)

- **PASS — closed semantic palette.** Provider compatibility maps only to supported/success, degraded/warning, and unsupported/error treatments; selected rows and focus use the existing accent rather than a Codex/OpenAI brand color (`extension/ui/options.css:5880-6000`, `extension/ui/options.css:6231-6244`).
- **PASS — provider-neutral lifecycle tones.** Shared cards map active, info, success, warning, danger, and neutral states to existing FSB tokens (`extension/ui/sidepanel.css:1728-1854`). Tool/feed headings pair color with explicit text and a decorative semantic icon (`extension/ui/delegation-feed.js:411-447`).
- **PASS — non-color redundancy.** Forced-colors mode gives compatibility states visible solid, dashed, or double border differences while retaining text and icon identity (`extension/ui/options.css:6329-6355`). No Phase 65 source introduces a raw Codex-specific color.
- **Human evidence boundary.** Actual contrast in light, dark, and OS forced-colors output remains UAT65-03; the 4/4 score is for the source contract, not a live WCAG contrast claim.

### Pillar 4: Typography (3/4)

- **PASS — approved source hierarchy.** The provider block uses the established 18px roster legend, 16px group/detail headings, 14px provider/body text, and 12px badge/help metadata with 400/600 weights (`extension/ui/options.css:5716-6215`). The side panel uses 16px/600 headings, 14px/400 body copy, and 12px definitions, disclosures, metadata, and actions (`extension/ui/sidepanel.css:1815-1881`, `extension/ui/sidepanel.css:1938-2043`).
- **PASS — machine typography remains scoped.** Monospace is confined to doctor commands and machine/session identifiers (`extension/ui/sidepanel.css:1904-1913`, `extension/ui/sidepanel.css:1957-1959`); Codex auth, billing, and provider copy use normal inherited text and wrap rather than a branded wordmark treatment.
- **Human evidence boundary.** No rendered evidence established computed font fallback, exact rasterized hierarchy, zoom reflow, or long/provider-derived value legibility. Typography remains 3/4 until UAT65-03; no extra font or weight defect was found in the audited Phase 65 source.

### Pillar 5: Spacing (4/4)

- **PASS — roster scale and responsive wrap.** Provider rows keep the approved 64px minimum, 16px exterior padding, legacy 12px internal gap, and 20px native radio while detail controls use the existing 44px target (`extension/ui/options.css:5716-5873`, `extension/ui/options.css:6037-6215`). At `<=640px`, content and compatibility stack at full width without semantic reordering (`extension/ui/options.css:6273-6327`).
- **PASS — corrected delegated targets.** Every `.delegation-action` has `min-height: 44px`; the fixed delegated Stop is explicitly 44px by 44px (`extension/ui/sidepanel.css:2024-2043`). Narrow actions remain full-width and at least 44px high (`extension/ui/sidepanel.css:2118-2152`).
- **PASS — shared rhythm and motion-safe geometry.** Run cards, feed rows, summaries, actions, and control bars use the existing 4/8/16px spacing tokens and responsive grids (`extension/ui/sidepanel.css:1714-1755`, `extension/ui/sidepanel.css:1916-2022`). The focused side-panel suite passed its target-size and responsive source tripwires.

### Pillar 6: Experience Design (2/4)

- **PASS — authority and lifecycle truth.** Feed snapshots require exact immutable accepted identity, matching provider, auth-specific billing kind, and null USD (`extension/ui/delegation-feed.js:331-374`). Result and summary stay hidden until completed snapshot, completed terminal, completed summary, and a result entry agree (`extension/ui/delegation-feed.js:579-609`). Side-panel hydration is silent and only strictly newer matching entries announce (`extension/ui/sidepanel.js:2291-2380`).
- **PASS — control accessibility at source level.** Consent and recovery use managed heading focus; Take control, Resume, and both Stop controls share visible labels, disabled states, and one action path (`extension/ui/sidepanel.js:1605-1695`, `extension/ui/sidepanel.js:1787-1825`, `extension/ui/sidepanel.js:1880-1929`). Focus-visible styles and reduced-motion suppression cover actions, disclosures, scrolling, tint, pulse, and Stop motion (`extension/ui/sidepanel.css:2068-2076`, `extension/ui/sidepanel.css:2178-2205`).
- **WARNING UI65-W02 — tool arguments enter visible DOM.** The design lock says raw MCP arguments/results never appear in normal UI or accessibility output and never enter DOM (`65-UI-SPEC.md:52-53`, `65-UI-SPEC.md:267-272`). The feed accepts `argsSummary` as a bounded nullable string and renders it as an **Arguments** definition (`extension/ui/delegation-feed.js:191-196`, `extension/ui/delegation-feed.js:471-490`). More decisively, the DOM test supplies `<svg onload=steal()>https://evil.invalid/?secret=1</svg>` and asserts that exact secret-like value is visible in `container.textContent` (`tests/delegation-sidepanel-ui.test.js:541-560`). Text-only construction prevents script execution, but inert text is still disclosure and still violates the locked presentation boundary.
- **Current Codex producer behavior does not close UI65-W02.** The Codex parser currently emits only tool id/name for `tool_use` and id/error state for `tool_result` (`mcp/src/agent-providers/codex-stream.ts:249-274`, `mcp/src/agent-providers/codex-stream.ts:317-337`). However, the shared event store still accepts and persists `argsSummary` (`extension/utils/delegation-event-store.js:505-522`, `extension/utils/delegation-event-store.js:656-671`), and the UI boundary/test explicitly permits display. Phase 65's cross-adapter lock is therefore not enforced.
- **Remediation.** Remove `argsSummary` from the presentation view model if a schema migration is acceptable; otherwise force it to `null` at projection/validation, omit the **Arguments** term/value from `renderEntry`, and change the hostile-data test to assert that argument/result strings are absent from all text, attributes, live regions, and persisted presentation snapshots. Retain safe tool name, call id, reported tab, status, and duration only if they remain approved.
- **WARNING UI65-W01 also affects recovery experience.** Unknown and unauthenticated users are correctly blocked before consent/run, but receive the same generic failure instead of state-specific next steps. The copy remediation above closes both the writing and recovery-path gap.

---

## Pending Human UAT

All three rows remain `human_needed`, `pending`, and evidence-empty. This code-only review did not promote or check any scenario.

| Scenario | Status | Result | Evidence |
|----------|--------|--------|----------|
| UAT65-01 — Genuine ChatGPT, API-key, and unauthenticated auth matrix | human_needed | pending | empty |
| UAT65-02 — Genuine Codex-to-browser delegation, cancellation, cleanup, and summary | human_needed | pending | empty |
| UAT65-03 — Keyboard, screen-reader, theme, motion, zoom, and narrow-layout behavior | human_needed | pending | empty |

The authoritative steps, sanitization rules, and milestone-end ownership remain in `65-HUMAN-UAT.md:11-87`.

---

## Verification Executed

The following focused checks passed during this audit:

- `node tests/providers-panel-logic.test.js --section codex-safe-evidence`
- `node tests/providers-panel-ui.test.js --section codex-existing-row`
- `node tests/delegation-sidepanel-ui.test.js --section codex-shared-feed`
- `node tests/provider-parity.test.js --section delegated-agent-parity` — 36 passed, 0 failed

Passing tests establish the checked source/DOM contracts. They do not negate UI65-W01; for UI65-W02, the passing hostile-data assertion is direct evidence of the contract conflict.

## Audit Outcome

- BLOCKER findings: 0
- WARNING findings: 2
- Pending human-evidence scenarios: 3
- Overall score: 19/24
- Human review required: yes
- Screenshots: none captured
- Registry audit: skipped; shadcn is not initialized and `components.json` is absent
- Implementation edits made by this audit: none
- Audit artifact created: `.planning/phases/65-codex-adapter/65-UI-REVIEW.md`

## Files Audited

- `.planning/phases/65-codex-adapter/65-CONTEXT.md`
- `.planning/phases/65-codex-adapter/65-UI-SPEC.md`
- `.planning/phases/65-codex-adapter/65-VALIDATION.md`
- `.planning/phases/65-codex-adapter/65-HUMAN-UAT.md`
- `.planning/phases/65-codex-adapter/65-{01..08}-PLAN.md`
- `.planning/phases/65-codex-adapter/65-{01..08}-SUMMARY.md`
- `extension/ui/control_panel.html`
- `extension/ui/options.css`
- `extension/ui/options.js`
- `extension/ui/providers-panel.js`
- `extension/ui/sidepanel.js`
- `extension/ui/sidepanel.css`
- `extension/ui/delegation-feed.js`
- `extension/utils/delegation-providers.js`
- `extension/utils/delegation-preflight.js`
- `extension/utils/delegation-controller.js`
- `extension/utils/delegation-event-store.js`
- `extension/utils/mcp-agent-providers.js`
- `mcp/src/agent-providers/codex-stream.ts`
- `tests/providers-panel-logic.test.js`
- `tests/providers-panel-ui.test.js`
- `tests/delegation-sidepanel-ui.test.js`
- `tests/provider-parity.test.js`
- relevant Codex provider, delegation controller, event-store, and parity tests referenced by the Phase 65 plans and summaries

## UI REVIEW COMPLETE
