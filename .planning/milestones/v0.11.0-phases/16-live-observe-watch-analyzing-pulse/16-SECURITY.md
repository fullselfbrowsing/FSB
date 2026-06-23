---
phase: 16
slug: live-observe-watch-analyzing-pulse
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-16
---

# Phase 16 — Security

Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Page DOM -> content script | Untrusted watched-element text is read from the page by isolated-world content code. | Raw element text or attribute strings. |
| Content script -> service worker | Content emits value reports through `chrome.runtime.sendMessage`; the SW validates and persists bounded scalar fields. | `{ trigger_id, value: { text, attributes? } }`. |
| Service worker -> content router | The SW sends observe/read/pulse commands to a tab content script. | Trigger id, selector, extract kind, attribute name. |
| Service worker -> owned tab | Re-arm and pulse commands target only the trigger snapshot's `target_tab_id`. | Observe and pulse control messages. |
| Pulse overlay -> watched page | The pulse renders in the existing overlay host rather than mutating the watched node. | Visual overlay state only. |
| Snapshot storage | `chrome.storage.session` holds trigger snapshots and staged reported values. | Bounded scalar value text and optional bounded attribute map. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-16-01-DoS | Denial of Service | MutationObserver on busy ticker | mitigate | `stableAncestor()` observes a narrow container, never `document.body`; observe options are extract-specific; reports are trailing-debounced through `setTimeout`. Covered by `tests/trigger-observe.test.js`. | closed |
| T-16-01-TAMP | Tampering | Reported value payload | mitigate | `readValue()` emits trimmed scalar `{ text, attributes? }` only; no DOM nodes or `innerHTML`; regex evaluation stays downstream in `FsbTriggerManager`. | closed |
| T-16-01-LEAK | Denial of Service | Observer registry across nav/re-inject | mitigate | `disconnectAll()` is wired to `beforeunload` and non-persisted `pagehide`; idempotent restart disconnects prior observer; stale marker re-arm regression fixed in `87403c77`. | closed |
| T-16-01-SC | Tampering | Package supply chain | mitigate | Phase 16 added no packages or install steps. | closed |
| T-16-02-SELFTRIG | Tampering / DoS | Analyzing pulse vs observer | mitigate | `showPulse()` uses the existing `ActionGlowOverlay` surface, not inline style on the watched node; the observer watches the page node, not the overlay host. | closed |
| T-16-02-JANK | Denial of Service | Pulse animation | mitigate | `@keyframes fsb-trigger-pulse` animates `opacity` and `transform` only; `tests/trigger-observe-pulse.test.js` source-checks the keyframe. | closed |
| T-16-02-STUCK | Denial of Service / UX | Stuck pulse after teardown | mitigate | `clearPulse()`, `destroy()`, `beforeunload`, and non-persisted `pagehide` clear the pulse; persisted BF-cache pagehide is preserved. | closed |
| T-16-02-CONTRACT | Tampering | Overlay-state object | mitigate | `overlay-state.js` adds `mode` through a spread-guarded additive field; `tests/test-overlay-state.js` asserts existing fields are unchanged. | closed |
| T-16-02-SC | Tampering | Package supply chain | mitigate | Phase 16 added no packages or install steps. | closed |
| T-16-03-INJECT | Tampering | Selector handling in content router | mitigate | `triggerRead` and `triggerPulseStart` resolve through `FSB.querySelectorWithShadow`; router cases do not eval or assign message fields into HTML. | closed |
| T-16-03-OVERLAY | Denial of Service / UX | Pulse vs run_task glow collision | mitigate | `triggerPulseStart` reuses the single `actionGlowOverlay` and rejects ownership while action glow is active for acting/writing/switching_tab unless mode is already `trigger-watch`. | closed |
| T-16-03-THROW | Denial of Service | Missing module / resolution failure | mitigate | Every new content router case is wrapped in async try/catch and returns structured `{ success:false, error }` on missing modules or selector failure. | closed |
| T-16-03-SC | Tampering | Package supply chain | mitigate | Phase 16 added no packages or install steps. | closed |
| T-16-04-SPOOF | Spoofing | Value-report onMessage case | mitigate | New cases live under the existing `sender.id !== chrome.runtime.id` guard; value reports with mismatched `target_tab_id` are ignored. | closed |
| T-16-04-V5 | Information Disclosure / DoS | Untrusted value text in storage | mitigate | SW validates `typeof value.text === 'string'`, slices to `FSB_TRIGGER_REPORTED_TEXT_MAX`, and copies at most 50 string attributes with the same per-value cap. | closed |
| T-16-04-DUPFIRE | Tampering | Fire-path storage I/O | mitigate | Background writes staged report fields then calls `FsbTriggerLifecycle.handleTriggerAlarm`; only `trigger-lifecycle.js` writes `status = 'fired'`. Covered by lifecycle source invariant and fire tests. | closed |
| T-16-04-REARM | Tampering | Full-reload re-arm targeting | mitigate | `fsbTriggerRearmLiveObserversForTab()` filters armed live-observe snapshots by owned `target_tab_id`, then calls `ensureContentScriptInjected(tabId)` before `triggerObserveStart`. | closed |
| T-16-04-WATCHDOG | Denial of Service | Watchdog alarm overload | mitigate | Separate recurring `fsbTriggerObserveWatchdog:<id>` alarm re-arms only when stale and clears itself when the snapshot is no longer an armed live-observe trigger. | closed |
| T-16-04-SC | Tampering | Package supply chain / schema drift | mitigate | No dependencies or public tool schemas were added; schema-drift check returned `drift_detected:false`. | closed |

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-16 | 19 | 19 | 0 | Codex inline security audit |

---

## Evidence

- `extension/content/trigger-observe.js` implements narrow observation, scalar report shape, teardown, stale selector re-query, and fresh-context re-arm after stale DOM markers.
- `extension/content/visual-feedback.js` implements trigger pulse mode on `ActionGlowOverlay`, reduced-motion handling, and teardown cleanup.
- `extension/content/messaging.js` implements guarded observe/read/pulse router cases with try/catch and single-overlay ownership checks.
- `extension/background.js` implements sender-guarded value-report ingress, value/attribute caps, lifecycle seam delegation, owned-tab re-arm, and watchdog clear/re-arm behavior.
- `extension/utils/trigger-lifecycle.js` remains the sole terminal fire writer and now preserves reported attributes through the existing reportedValue contract.
- `npm test` passed on 2026-06-16, including trigger, overlay-state, schema-lock, and prior regression suites.
- `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" verify schema-drift 16` returned `drift_detected:false`.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-16
