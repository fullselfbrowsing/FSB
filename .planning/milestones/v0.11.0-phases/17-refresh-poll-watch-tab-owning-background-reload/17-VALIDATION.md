---
phase: 17
slug: refresh-poll-watch-tab-owning-background-reload
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-16
---

# Phase 17 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain Node.js scripts with `assert` / custom `check` helpers |
| **Config file** | none; root `package.json` chains individual `node tests/*.test.js` commands |
| **Quick run command** | `node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js && node tests/trigger-observe.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | Quick: ~5s; full suite: project-dependent |

---

## Sampling Rate

- **After every task commit:** Run `node tests/trigger-refresh-poll.test.js` plus the nearest touched existing test.
- **After every plan wave:** Run `node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js && node tests/trigger-observe.test.js && node tests/agent-tab-resolver.test.js && node tests/open-tab-background-default.test.js`.
- **Before `$gsd-verify-work`:** Run `npm test`; document any live-browser no-focus UAT deferral for Phase 20 if not human-run.
- **Max feedback latency:** ~5s for quick checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | WATCH-03 | T-17-03 | Sub-30s refresh intervals reject; accepted intervals respect the 30s floor and deadline-safe jitter | unit | `node tests/trigger-refresh-poll.test.js` | No W0 | pending |
| 17-01-02 | 01 | 1 | WATCH-04 | T-17-01 | Other-agent tab rejects with `TAB_NOT_OWNED` before `chrome.tabs.reload` | unit | `node tests/trigger-refresh-poll.test.js` | No W0 | pending |
| 17-02-01 | 02 | 2 | WATCH-02 | T-17-04 | Poll tick reloads `target_tab_id`, reads via `triggerRead`, stages reported value, and delegates to lifecycle | unit/integration | `node tests/trigger-refresh-poll.test.js` | No W0 | pending |
| 17-02-02 | 02 | 2 | WATCH-02 | T-17-02 | Missing element becomes `needs_attention` and does not call `evaluate()` as empty text | unit/integration | `node tests/trigger-refresh-poll.test.js && node tests/trigger-observe.test.js` | No W0 | pending |
| 17-03-01 | 03 | 3 | WATCH-02, WATCH-04 | T-17-02 / T-17-04 | Blocked/challenge/auth page becomes `blocked` or `needs_attention`; pulse is reasserted after safe reload/read | unit/integration | `node tests/trigger-refresh-poll.test.js && node tests/trigger-observe-pulse.test.js` | No W0 | pending |

*Status values: pending, green, red, flaky.*

---

## Wave 0 Requirements

- [ ] `tests/trigger-refresh-poll.test.js` -- stubs and mocks for WATCH-02, WATCH-03, WATCH-04.
- [ ] `package.json` -- add `node tests/trigger-refresh-poll.test.js` near the existing trigger tests in the root `test` chain.
- [ ] `triggerRead` missing-element coverage -- either extend `tests/trigger-observe.test.js` or cover the content-router path from `tests/trigger-refresh-poll.test.js`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real inactive-tab reload does not steal focus in installed Chrome | WATCH-04 | Deterministic Node tests can assert API call shape but cannot prove user-visible Chrome focus behavior | In Phase 20 live UAT, arm a refresh-poll trigger on a background owned tab, keep another tab foregrounded, wait for a poll tick, and confirm the foreground tab remains active while the watched tab reloads. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all MISSING references.
- [ ] No watch-mode flags.
- [ ] Feedback latency < 5s for quick checks.
- [ ] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
