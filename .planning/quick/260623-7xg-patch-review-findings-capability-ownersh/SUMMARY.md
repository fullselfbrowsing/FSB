---
quick_id: 260623-7xg
slug: patch-review-findings-capability-ownersh
date: 2026-06-23
status: complete
---

# Summary

Patched all review findings from `.context/attachments/W2Hp3q/Review request.md`.

## Changes

- `mcp:capabilities-invoke` now resolves non-legacy agents through `resolveAgentTabOrError`, fetches the resolved tab, derives origin from that tab, and rejects supplied-origin mismatches before router dispatch.
- Consent gating now treats `sideEffectClass: "write"` and related mutating labels as mutating even when the method defaults to `GET`.
- `network-capture` now preserves calls from a count-bound self-ended session via `_getLastEndedCalls`; `discovery-session` uses that snapshot when the live and explicit end paths are empty.
- GitHub and Slack HTML probes now parse token carriers from `probeResult.text`.
- `github.issues.list` now folds `args.query` into the concrete `/issues?q=...` URL.

## Verification

- `node tests/consent-mutation-gate.test.js` PASS
- `node tests/network-capture.test.js` PASS
- `node tests/capability-head-handlers.test.js` PASS
- `node tests/capability-autopilot-parity.test.js` PASS
- `git diff --check` PASS
