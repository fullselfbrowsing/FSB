---
phase: 65-codex-adapter
reviewed: 2026-07-22
status: source_complete
baseline: 65-UI-SPEC.md
remediation_ledger: 65-UI-REVIEW-FIX.md
remediation_commits:
  UI65-W01: 4bf359a5
  UI65-W02: 7fde3f2f
score_total: 22
score_max: 24
score_copywriting: 4
score_visuals: 3
score_color: 4
score_typography: 3
score_spacing: 4
score_experience_design: 4
blockers: 0
warnings: 0
resolved_warnings: 2
needs_human_review: true
human_evidence_items: 3
screenshots: not-captured-no-live-extension-surface
playwright_available: false
evidence_mode: code-and-deterministic-dom-only
---

# Phase 65 — UI Review

**Re-audited:** 2026-07-22

**Baseline:** approved `65-UI-SPEC.md` design contract

**Remediation reviewed:** `7fde3f2f` and `4bf359a5`, with `65-UI-REVIEW-FIX.md` as the implementation ledger

**Screenshots:** Not captured. No Playwright capability or auditable live extension surface was available during this re-audit.

**Evidence mode:** Code, canonical persistence/snapshot paths, deterministic DOM harnesses, and focused source-contract tests only. This review makes no claim of live Chrome rendering, computed contrast, keyboard behavior, screen-reader output or timing, genuine Codex account state, or genuine delegated-run/process evidence.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Providers, billing, consent, lifecycle, summary, unauthenticated recovery, unknown-auth recovery, actions, and generic fallback now match the approved closed copy. |
| 2. Visuals | 3/4 | Codex reuses the existing third row and shared run/feed hierarchy with no brand, markup, or renderer fork; live hierarchy, wrapping, and optical polish remain UAT65-03. |
| 3. Color | 4/4 | Compatibility and lifecycle states stay on the closed semantic-token palette with text, icon, and forced-colors border redundancy. |
| 4. Typography | 3/4 | Source styles retain the approved 12/14/16/18 hierarchy and 400/600 weights; computed fallback, zoom reflow, and rendered long-copy legibility remain UAT65-03. |
| 5. Spacing | 4/4 | Provider rhythm, responsive stacks, every delegated action's 44px minimum, and the 44px-square fixed Stop satisfy the source contract. |
| 6. Experience Design | 4/4 | Background-owned authority, auth-specific recovery, canonical payload-free storage/snapshots, safe DOM/announcements, hydration silence, and terminal gating are source-complete. |

**Overall code-only score: 22/24**

There are **0 BLOCKER** and **0 WARNING** findings. The two prior source warnings are closed. The two unawarded points are evidence caps tied to the already-deferred live UAT, not new source defects.

---

## Findings Ledger

No open source-verifiable findings remain.

| ID | Pillar | Prior severity | Final status | Closure |
|----|--------|----------------|--------------|---------|
| UI65-W01 | Copywriting / Experience Design | WARNING | RESOLVED | Background-owned safe auth evidence now yields exact `auth_unauthenticated` or `auth_unknown` codes; the shared recovery card renders the approved heading, body, actions, and focus behavior, while malformed/inconsistent evidence keeps the generic safe fallback. |
| UI65-W02 | Experience Design / Data Presentation | WARNING | RESOLVED | Tool arguments/results are non-representable in new persisted entries and feed snapshots; legacy `argsSummary` is discarded before validation/fan-out and rewritten out of storage; the renderer, attributes, live regions, and announcer have no payload path. |

---

## Remediation Verification

### UI65-W01 — Closed Codex auth recovery is complete

- **Background authority remains the only source.** Side-panel preflight sends only `{type, task, intentId}` and no provider/auth/billing choice (`extension/ui/sidepanel.js:3884-3888`). Background reloads saved provider configuration, reads the safe merged provider row through own-data descriptors, reduces auth to the exact four-state vocabulary, rejects accepted-identity/auth mismatches to `unknown`, and supplies that closed state to preflight (`extension/background.js:1667-1765`).
- **The codes are exact and fail closed.** Codex with no runnable identity maps `unauthenticated` to `auth_unauthenticated` and `unknown` to `auth_unknown`; invalid, inconsistent, or non-Codex identity evidence retains `provider_status_refresh` (`extension/utils/delegation-preflight.js:154-176`). No native status bytes are accepted as a recovery code.
- **The presentation is exact and shared.** The client validates a closed preflight-code allowlist and canonical provider identity (`extension/ui/sidepanel.js:635-668`). The existing recovery card renders **Codex cannot start this task**, the exact unauthenticated or unknown-auth body, **Open provider setup**, and **Back to message** (`extension/ui/sidepanel.js:1615-1675`). It clears prior state/feed content, sets `tabIndex=-1`, focuses the heading, leaves the composer non-optimistic, and creates no Codex-specific component (`extension/ui/sidepanel.js:1678-1722`).
- **The generic safe fallback remains intact.** `provider_status_refresh` renders **Agent could not start this task** and **Keep this message in the composer, review the provider settings, and try again.**, with the same two actions and focused heading (`extension/ui/sidepanel.js:1669-1675`; `tests/delegation-sidepanel-ui.test.js:1483-1496`). Malformed/native response codes fail client validation and converge to the existing bounded offline fallback without rendering the supplied bytes (`tests/delegation-sidepanel-ui.test.js:1719-1759`).
- **No client or compatibility authority was introduced.** Compatibility is checked before accepted identity but cannot mint identity, and the immediate start path re-reads background authority. Unknown/unauthenticated states cannot reach consent, controller creation, transport, or task stdin (`tests/delegation-routing.test.js:124-155`; `tests/mcp-bridge-background-dispatch.test.js:2720-2764`).

### UI65-W02 — Tool payload exclusion is complete

- **New persistence is payload-free by construction.** The canonical tool shape is exactly `callId`, `durationMs`, `name`, `status`, and `tabId`; `argsSummary` is absent from both `TOOL_KEYS` and the accepted event context (`extension/utils/delegation-event-store.js:37-87`). `_projectTool` copies only approved identity/status metadata and ignores native argument/result fields (`extension/utils/delegation-event-store.js:507-523`). A caller-provided `argsSummary` is now an unknown context field and fails before a storage write (`tests/delegation-event-store.test.js:958-968`).
- **Native Codex results cannot cross the adapter boundary.** Codex emits tool start with only id/name and tool completion with only id/error state; it validates but does not emit the native MCP result (`mcp/src/agent-providers/codex-stream.ts:249-337`). The background supplies only timestamp and immutable accepted identity to the event store (`extension/background.js:2455-2510`), so native payload data cannot be reintroduced by browser-side context.
- **Legacy persistence is sanitized before any snapshot or fan-out.** The migration recognizes only the old exact six-field tool row, never reads/stringifies/clones `argsSummary`, reconstructs the five approved fields, validates the canonical entry, and returns a normalized envelope (`extension/utils/delegation-event-store.js:740-836`). Hydration and terminal-ledger reads rewrite every migrated row before returning canonical data (`extension/utils/delegation-event-store.js:883-912`, `extension/utils/delegation-event-store.js:985-1029`); append, cleanup, and terminal paths likewise use the normalized envelope before cloning or emission.
- **Snapshots reject payload-bearing rows.** The feed validator accepts only the exact five-field tool record and rejects any `argsSummary`, `result`, or other extra key before clearing or rendering the container (`extension/ui/delegation-feed.js:190-199`, `extension/ui/delegation-feed.js:242-274`, `extension/ui/delegation-feed.js:330-374`, `extension/ui/delegation-feed.js:589-615`). Controller snapshots clone only entries already returned by the canonical store (`extension/utils/delegation-controller.js:470-484`, `extension/utils/delegation-controller.js:679-708`).
- **DOM text, attributes, accessibility output, and announcements have no payload slot.** Tool DOM contains only name, call id, reported tab, status, and duration; the **Arguments** term/value is gone (`extension/ui/delegation-feed.js:449-488`). Dynamic attributes derive only validated sequence, kind, state, and tone. The polite announcer names a tool call using only the canonical tool name, and `_renderDelegationSnapshot` announces only after full snapshot validation and a strictly newer sequence (`extension/ui/sidepanel.js:2253-2259`, `extension/ui/sidepanel.js:2317-2393`; `extension/ui/sidepanel.html:59-76`). Hydration remains silent.
- **Regression tests cover the closed chain.** The store asserts exact five-field projection, absence of the argument and result/task canaries, legacy hydration sanitization, rewritten storage, and rejection of argument context (`tests/delegation-event-store.test.js:640-700`, `tests/delegation-event-store.test.js:958-968`). The DOM suite asserts there is no **Arguments** row, payload-bearing snapshots fail validation, their canaries produce no DOM text, hostile safe metadata creates no URL/style/handler attributes, and hydration/live-sequence announcement behavior remains ordered (`tests/delegation-sidepanel-ui.test.js:358-448`, `tests/delegation-sidepanel-ui.test.js:541-574`, `tests/delegation-sidepanel-ui.test.js:2656-2727`).

---

## Detailed Six-Pillar Assessment

### 1. Copywriting (4/4)

- Exact Providers auth labels/help and billing copy remain centralized in the safe display models (`extension/ui/providers-panel.js:68-91`, `extension/ui/providers-panel.js:367-400`).
- Compatibility, description, billing-link, consent, lifecycle, Stop, and accepted-run billing language remain the approved source-owned copy (`extension/ui/providers-panel.js:41-64`, `extension/ui/providers-panel.js:120-126`, `extension/ui/delegation-feed.js:515-550`).
- UI65-W01 is resolved as documented above. Both locked recovery variants and the generic safe fallback have deterministic DOM coverage.

### 2. Visuals (3/4)

- Roster order remains Claude Code, OpenCode, Codex, with the existing evidence cluster, compatibility group/description, and one trailing native radio (`extension/ui/control_panel.html:164-218`).
- Codex reuses the selected-agent fact/detail region, consent card, lifecycle card, feed, controls, and summary. No new logo, auth card, profile badge, model picker, or provider-specific renderer exists (`extension/ui/control_panel.html:521-599`, `extension/ui/options.js:1043-1125`, `tests/provider-parity.test.js:234-269`).
- Init still shows Client, Model, Session, and Allowed tools only; no visible or announced **Profile** row exists (`extension/ui/delegation-feed.js:460-469`).
- The remaining point requires the already-owned UAT65-03 live render: optical hierarchy, dense-feed balance, icon alignment, long-copy wrapping, zoom, and clipping were not observed here.

### 3. Color (4/4)

- Selected rows and focus use the existing accent; compatibility uses only supported/success, degraded/warning, and unsupported/error tokens, with no Codex/OpenAI brand-color fork (`extension/ui/options.css:5803-6000`, `extension/ui/options.css:6231-6244`).
- Delegated lifecycle and semantic icons use the established active/info/success/warning/danger/neutral tokens (`extension/ui/sidepanel.css:1728-1854`).
- Forced-colors states retain visible text/icon identity plus solid, dashed, or double borders (`extension/ui/options.css:6329-6355`). Actual OS-rendered contrast remains part of UAT65-03, not a source warning.

### 4. Typography (3/4)

- Providers preserve the approved 18px roster legend, 16px headings, 14px names/body, and 12px metadata/help with only 400/600 weights (`extension/ui/options.css:5716-6215`).
- The side panel preserves 16px/600 headings, 14px/400 body, and 12px definitions/actions; monospace remains scoped to machine/session identifiers and doctor commands (`extension/ui/sidepanel.css:1815-2010`).
- The remaining point requires UAT65-03 observation of computed font fallback, rasterized hierarchy, zoom reflow, and long auth/billing-copy legibility.

### 5. Spacing (4/4)

- Provider rows retain the approved 64px minimum, 16px exterior padding, legacy 12px internal gap, 20px native radio, and responsive full-width compatibility stack (`extension/ui/options.css:5803-5873`, `extension/ui/options.css:6273-6327`).
- Every `.delegation-action` has a 44px minimum height; fixed delegated Stop is exactly 44px square; narrow delegated actions stay full width and at least 44px high (`extension/ui/sidepanel.css:2024-2043`, `extension/ui/sidepanel.css:2118-2152`).
- Shared cards, feed, summaries, controls, and disclosures retain the established 4/8/16px rhythm without a Phase 65 layout fork.

### 6. Experience Design (4/4)

- Accepted identity and billing remain immutable; summary/result rendering waits for authoritative completed state, terminal, summary, and result evidence (`extension/ui/delegation-feed.js:330-374`, `extension/ui/delegation-feed.js:577-615`).
- Consent/recovery keep managed heading focus, shared visible actions, disabled semantics, and non-optimistic start behavior. Live updates are sequence-deduplicated and hydration is silent (`extension/ui/sidepanel.js:1678-1722`, `extension/ui/sidepanel.js:2317-2393`).
- UI65-W01 and UI65-W02 are both resolved. No provider-specific renderer, client-selected authority, native auth/error copy, or tool argument/result presentation path remains in the audited source.

---

## Pending Human UAT

Exactly three scenarios remain `human_needed`, `pending`, and evidence-empty. This code-only re-audit did not promote, check, or supplement any scenario.

| Scenario | Status | Result | Evidence |
|----------|--------|--------|----------|
| UAT65-01 — Genuine ChatGPT, API-key, and unauthenticated auth matrix | human_needed | pending | empty |
| UAT65-02 — Genuine Codex-to-browser delegation, cancellation, cleanup, and summary | human_needed | pending | empty |
| UAT65-03 — Keyboard, screen-reader, theme, motion, zoom, and narrow-layout behavior | human_needed | pending | empty |

The authoritative prerequisites, sanitized steps, expected outcomes, and evidence policy remain unchanged in `65-HUMAN-UAT.md:11-87`.

---

## Verification Executed During Re-audit

- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/delegation-event-store.test.js"]]'` — **35 passed, 0 failed**; MCP build and workspace identity preserved.
- `node tests/delegation-sidepanel-ui.test.js` — **PASS**.
- `node tests/delegation-routing.test.js` — **PASS**.
- `node tests/mcp-bridge-background-dispatch.test.js` — **355 passed, 0 failed**.
- `node tests/providers-panel-logic.test.js --section codex-safe-evidence` — **PASS**.
- `node tests/providers-panel-ui.test.js --section codex-existing-row` — **PASS**.
- `node tests/provider-parity.test.js --section delegated-agent-parity` — **36 passed, 0 failed**.
- `node tests/phase65-full-tests-harness.test.js` — **all assertions passed**.
- `node tests/delegation-phase-contract.test.js --section phase65-validation` — **41 passed, 0 failed**.
- `node tests/delegation-phase-contract.test.js --section phase65-uat-ledger` — **10 passed, 0 failed**.
- `node tests/agent-provider-forbidden-flags.test.js` — **all assertions passed**.

The remediation ledger additionally records a successful authoritative Phase 65 full runner. This re-audit independently reran the focused source, storage, DOM, routing, background, parity, validation, and UAT-honesty gates above. None is treated as live UAT evidence.

## Audit Outcome

- Source/UI contract: complete
- BLOCKER findings: 0
- WARNING findings: 0
- Resolved prior warnings: 2
- Pending human-evidence scenarios: exactly 3
- Overall code-only score: 22/24
- Human review required: yes
- Screenshots/live extension evidence: none captured
- Registry audit: not applicable; shadcn is not initialized and `components.json` is absent
- Implementation edits made by this re-audit: none
- Audit artifact updated: `.planning/phases/65-codex-adapter/65-UI-REVIEW.md`

## Files Audited

- `.planning/phases/65-codex-adapter/65-CONTEXT.md`
- `.planning/phases/65-codex-adapter/65-UI-SPEC.md`
- `.planning/phases/65-codex-adapter/65-VALIDATION.md`
- `.planning/phases/65-codex-adapter/65-HUMAN-UAT.md`
- `.planning/phases/65-codex-adapter/65-UI-REVIEW-FIX.md`
- `extension/ui/control_panel.html`
- `extension/ui/options.css`
- `extension/ui/options.js`
- `extension/ui/providers-panel.js`
- `extension/ui/sidepanel.html`
- `extension/ui/sidepanel.js`
- `extension/ui/sidepanel.css`
- `extension/ui/delegation-feed.js`
- `extension/utils/delegation-providers.js`
- `extension/utils/delegation-preflight.js`
- `extension/utils/delegation-controller.js`
- `extension/utils/delegation-event-store.js`
- `extension/utils/mcp-agent-providers.js`
- `extension/background.js`
- `mcp/src/agent-providers/codex-stream.ts`
- the focused provider, routing, background, controller/store, DOM, parity, validation, runner, and UAT-ledger tests listed above

## UI REVIEW COMPLETE
