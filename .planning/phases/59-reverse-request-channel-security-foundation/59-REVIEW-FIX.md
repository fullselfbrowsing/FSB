---
phase: 59
status: all_fixed
findings_in_scope: 2
fixed: 2
skipped: 0
iteration: 1
---

# Phase 59 Code Review Fixes

## Fixed Findings

### Critical: Unprivileged socket could displace the active extension

- Commit: `48e4940f` (`fix(59): enforce authoritative socket roles`)
- Origin-less sockets now receive only a bounded, closed-schema `relay:hello` classification path and close on an immediate invalid frame or handshake timeout.
- Browser-Origin sockets are classified as extension candidates from immutable upgrade metadata. A candidate may replace an incumbent only while its Origin/session metadata remains currently authorized.
- Real-socket coverage proves Origin-less immediate/timeout attempts and absent/wrong-token browser attempts do not change the incumbent socket, connectivity, extension/relay registration counts, or legacy MCP request ownership.

### Warning: Late close from a replaced socket corrupted replacement state

- Commit: `7f5b1231` (`fix(59): ignore stale bridge socket closes`)
- A stale socket close now performs only socket-local waiter notification after replacement tracking cleanup. Only the current socket can mutate connectivity, pairing, ping, reconnect, agent-grace, or reverse-pending state.
- Lifecycle coverage forces the pairing-close timeout, opens a replacement with an in-flight auth probe, then delivers the old socket's late close. The replacement remains connected, the probe remains pending, and the authenticated result settles once as `paired`.

## Verification

- `npm --prefix mcp run build` — pass
- `node tests/mcp-bridge-topology.test.js` — 182 passed, 0 failed
- `node tests/mcp-bridge-client-lifecycle.test.js` — 115 passed, 0 failed
- `node tests/mcp-bridge-background-dispatch.test.js` — 66 passed, 0 failed
- `node tests/mcp-client-identity-integration.test.js` — pass
- `node tests/agent-grace.test.js` — pass
- `node tests/run-task-heartbeat.test.js` — 17 passed, 0 failed
- `node tests/mcp-dispatcher-client-label.test.js` — 51 passed, 0 failed
- `node tests/mcp-lifecycle-smoke.test.js` — 13 passed, 0 failed

All Critical and Warning findings from `59-REVIEW.md` are fixed. No Info findings were present.
