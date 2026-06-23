---
quick_id: 260623-7xg
slug: patch-review-findings-capability-ownersh
date: 2026-06-23
status: complete
---

# Patch Review Findings

## Scope

Patch the review findings from `.context/attachments/W2Hp3q/Review request.md`:

- Agent-scoped `invoke_capability` must resolve owned tabs through the MCP agent resolver and derive origin from the resolved tab.
- T1a `sideEffectClass: "write"` handlers must require mutating consent under read-Auto.
- Count-bound discovery capture must preserve observed calls after `network-capture` self-ends the session.
- GitHub and Slack HTML token probes must inspect `text` bodies, not only parsed JSON `data`.
- `github.issues.list` must fold `args.query` into the concrete request URL.

## Verification

- `node tests/consent-mutation-gate.test.js`
- `node tests/network-capture.test.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/capability-autopilot-parity.test.js`
