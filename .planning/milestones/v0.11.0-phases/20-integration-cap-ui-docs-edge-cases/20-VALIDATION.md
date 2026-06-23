---
phase: 20
slug: integration-cap-ui-docs-edge-cases
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 20 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain Node scripts plus MCP TypeScript build |
| **Config file** | none - focused tests are executable Node scripts |
| **Quick run command** | `node tests/trigger-tool-dispatcher.test.js && node tests/trigger-refresh-poll.test.js && node tests/trigger-cap-settings-ui.test.js` |
| **Full suite command** | `npm test && npm run test:mcp-smoke:tools && npm run ci` |
| **Estimated runtime** | ~180-300 seconds |

---

## Sampling Rate

- **After every task commit:** Run the focused command for the changed surface.
- **After every runtime/background task commit:** Run `node tests/trigger-blocking-reporting.test.js` in addition to the focused trigger test.
- **After every plan wave:** Run `node tests/trigger-tool-dispatcher.test.js && node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js && node tests/trigger-manager.test.js && node tests/trigger-blocking-reporting.test.js`.
- **Before `$gsd-verify-work`:** Run the full suite, MCP build/smoke/parity gates, and confirm generated showcase timestamp churn is reverted unless intentionally changed.
- **Max feedback latency:** < 5 minutes for automated feedback; manual browser UAT remains explicitly recorded as human-needed if no live browser session is available.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-W0-01 | 01 | 0 | Integration/composition | T20-01 | Cap UI clamps tampered storage/input and ignores malformed registry records | source-shape/unit | `node tests/trigger-cap-settings-ui.test.js` | No - Wave 0 creates | pending |
| 20-W0-02 | 01 | 0 | Integration/composition | T20-04 | Human UAT evidence is captured without fabricated proof | manual artifact | `test -f .planning/phases/20-integration-cap-ui-docs-edge-cases/20-HUMAN-UAT.md` | No - Wave 0 creates | pending |
| 20-01-01 | 01 | 1 | Integration/composition | T20-01 | Trigger cap UI persists `fsbTriggerCap`, clamps 1..64, resets to 8, and never throws on counter reads | source-shape/unit | `node tests/trigger-cap-settings-ui.test.js` | No - Wave 0 creates | pending |
| 20-01-02 | 01 | 1 | Integration/composition | T20-01 | Active trigger counter counts `armed`, `needs_attention`, and `blocked`; excludes `fired`, `timed_out`, `stopped`, and malformed records | source-shape/unit | `node tests/trigger-cap-settings-ui.test.js` | No - Wave 0 creates | pending |
| 20-02-01 | 02 | 1 | Integration/composition | T20-02 | Opposite watch mode on same target tab returns `TRIGGER_TAB_WATCH_CONFLICT` before read, persist, observer, or pulse work | VM/unit | `node tests/trigger-tool-dispatcher.test.js` | Yes - extend existing | pending |
| 20-02-02 | 02 | 1 | Integration/composition | T20-02 | Same watch mode co-location remains allowed and owner filtering remains intact | VM/unit | `node tests/trigger-tool-dispatcher.test.js` | Yes - extend existing | pending |
| 20-03-01 | 03 | 2 | Integration/composition | T20-03 | Same-tab due refresh-poll triggers share one `chrome.tabs.reload`; other-tab triggers reload separately | VM/unit | `node tests/trigger-refresh-poll.test.js` | Yes - extend existing | pending |
| 20-03-02 | 03 | 2 | Integration/composition | T20-03 | Coalescing preserves ownership, blocked-page attention, terminal status, and pulse reassertion semantics | VM/unit | `node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js` | Yes - extend existing | pending |
| 20-04-01 | 04 | 3 | Integration/composition | T20-05 | MCP metadata, build output, package lock, docs, and server metadata all report 0.10.0 without dependency upgrades | build/parity | `npm --prefix mcp run build && node tests/mcp-version-parity.test.js` | Yes | pending |
| 20-04-02 | 04 | 3 | Integration/composition | T20-05 | Trigger tool schemas stay shared-registry compatible and public docs do not overclaim notifications or server monitoring | smoke/parity/source-shape | `node tests/mcp-tool-smoke.test.js && node tests/tool-definitions-parity.test.js && node tests/visual-session-schema-lock.test.js` | Yes | pending |
| 20-05-01 | 05 | 4 | Integration/composition | T20-04 | Phase 16 deferred live-browser checks and Phase 20 composed trigger checks are either recorded with evidence or left explicitly human-needed | manual/UAT | `grep -n "human_needed\\|passed\\|blocked" .planning/phases/20-integration-cap-ui-docs-edge-cases/20-HUMAN-UAT.md` | No - Wave 0 creates | pending |
| 20-05-02 | 05 | 4 | Integration/composition | T20-05 | Final release-readiness gates are recorded and generated crawler timestamp churn is not left unintentionally dirty | full suite | `npm test && npm run test:mcp-smoke:tools && npm run ci` | Yes | pending |

---

## Wave 0 Requirements

- [ ] `tests/trigger-cap-settings-ui.test.js` - source-shape/unit coverage for Trigger Concurrency card markup, `options.js` cache/load/save/reset/listener behavior, and active counter helper semantics.
- [ ] `.planning/phases/20-integration-cap-ui-docs-edge-cases/20-HUMAN-UAT.md` - runbook/results artifact for Phase 16 deferred live-observe checks and Phase 20 composed trigger UAT.
- [ ] Explicit package-lock handling - either update `mcp/package-lock.json` to `0.10.0` without dependency upgrades or document a deliberate no-change rationale in the version/docs plan.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live ticker no-reload fire | Integration/composition | Requires a live browser extension session and visual confirmation that live-observe fires without reload | Record URL, trigger spec, fire event, and no-reload observation in `20-HUMAN-UAT.md` |
| BF-cache / SPA re-arm timing | Integration/composition | Requires live browser navigation lifecycle behavior | Record navigation steps, observer re-arm evidence, and absence of duplicate fire in `20-HUMAN-UAT.md` |
| Busy ticker frame budget | Integration/composition | Requires runtime/visual observation under rapid DOM mutation | Record test page, mutation cadence, observed responsiveness, and any degradation in `20-HUMAN-UAT.md` |
| Pulse visual and reduced-motion behavior | Integration/composition | Requires visual inspection and user/system motion preference behavior | Record screenshots or notes for normal and reduced-motion cases in `20-HUMAN-UAT.md` |
| Composed trigger E2E flow | Integration/composition | Requires local MCP/extension/browser integration beyond source-shape tests | Record blocking fire, detached status, timeout, rearm still armed, refresh-poll focus retention, conflict, coalesced reload, and owner cleanup in `20-HUMAN-UAT.md` |

---

## Threat References

| Ref | Threat | Mitigation Expected in Plans |
|-----|--------|------------------------------|
| T20-01 | Storage tampering with `fsbTriggerCap` or malformed `fsbTriggerRegistry` records | Clamp on input/load/save/runtime; ignore malformed records; never throw into options page |
| T20-02 | Cross-agent or cross-watch-mode trigger leakage/conflict | Background-only conflict check with owner/tab context before persistence/startup; minimal typed conflict response |
| T20-03 | Background reload storms from co-located refresh-poll triggers | Per-tab due batch/lock with one reload per same-tab batch and independent per-trigger evaluation |
| T20-04 | Fabricated or stale UAT evidence | Human UAT artifact with explicit `passed`, `blocked`, or `human_needed` status and concrete evidence fields |
| T20-05 | Version/package/docs drift and notification overclaims | Update metadata/build/docs together; run parity/smoke/schema gates; document local/browser-open notify-only limits |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5 minutes for automated gates
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-17
