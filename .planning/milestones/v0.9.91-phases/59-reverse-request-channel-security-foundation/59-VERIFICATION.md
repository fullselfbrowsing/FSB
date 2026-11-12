---
phase: 59-reverse-request-channel-security-foundation
verified: "2026-07-14T14:54:51Z"
status: human_needed
automated_status: passed
score: "10/10 observable truths verified"
requirements_score: "7/7 requirements satisfied"
artifacts_score: "15/15 declared artifacts verified"
key_links_score: "12/12 declared key links manually verified"
overrides_applied: 0
human_verification:
  - test: "Pair a live unpacked extension with serve"
    expected: "The extension reports paired only after the authenticated probe, and the credential appears only in explicit pair output and the password input."
    why_human: "Requires a real Chrome extension Origin, a running daemon, and user-mediated credential entry."
  - test: "Daemon restart invalidates the old code"
    expected: "The old browser-session code becomes expired or unpaired after serve restarts, and only the new pair output restores authority."
    why_human: "Requires observation across a real daemon and browser lifecycle."
  - test: "Chrome restart clears the session code"
    expected: "After Chrome fully restarts, the pairing input is empty and the UI does not claim that the bridge is paired."
    why_human: "Requires validating real chrome.storage.session lifetime."
  - test: "Pairing accessibility and theme smoke"
    expected: "Keyboard order, focus rings, status announcements, compact wrapping, and light/dark rendering remain understandable and readable."
    why_human: "Requires live Chrome, assistive technology, and visual judgment."
---

# Phase 59: Reverse-Request Channel & Security Foundation Verification Report

**Phase goal:** Establish the authenticated, additive extension-to-daemon reverse-request transport and its permanent security gates before any agent process-spawn implementation exists.

**Verified:** 2026-07-14T14:54:51Z  
**Status:** `human_needed`  
**Automated status:** `passed`

## Verdict

Phase 59 is automated/source green. CHAN-01 through CHAN-07 are satisfied, all declared artifacts are substantive and wired, all declared key links are manually confirmed, the post-fix root suite exits `0`, and the final security-focused code review is clean. The implementation also preserves the phase-ordering boundary: no spawn supervisor, adapter implementation, agent-provider source directory, child-process call, or production `agent-spawn` capability advertisement entered Phase 59.

The overall verifier status remains `human_needed` solely because the four real Chrome/daemon checks in `59-HUMAN-UAT.md` are pending. The user explicitly deferred those checks to the milestone-end UAT sweep. They are not automated gaps and do not block autonomous advancement under that standing decision; no live result is inferred or marked passed.

## Goal Achievement

The fourteen plan truths reduce to ten independently observable outcomes.

| # | Observable truth | Status | Evidence |
|---|---|---|---|
| 1 | `ext:request`, `ext:event`, and `ext:response` form a separate, strictly parsed family without changing the historical MCP union or relay defaults. | VERIFIED | Separate interfaces in `mcp/src/types.ts`; closed validation in `mcp/src/ext-protocol.ts`; reverse-contract and 16/16 version-parity assertions pass. |
| 2 | Credential-shaped strings are scrubbed at caller and diagnostic-sink boundaries. | VERIFIED | `redactForLog.js` and the ring-buffer fallback sanitizer use the exact token grammar; redaction and sink tests pass, including interior-substring absence checks. |
| 3 | Every MCP build runs a recursive, fail-closed forbidden-flag scan with no in-tree exemption. | VERIFIED | MCP `prebuild` invokes `scripts/verify-agent-provider-flags.mjs`; positive, missing, clean, symlink, and read-error fixtures pass. |
| 4 | Browser reverse authority requires exact loopback Host, an exact extension Origin, and the current header-only credential before registration as an authorized extension socket. | VERIFIED | Explicit HTTP `upgrade` classification precedes `handleUpgrade`; hostile/missing/duplicate headers are rejected before registration; topology suite passes 182/182. |
| 5 | Pairing state is atomically private, the session secret is 32 random bytes, Origin binding is durable until explicit reset, and secret/session rotation revokes current and future reverse authority. | VERIFIED | `bridge-auth.ts` enforces `0700` directory, `0600` file, atomic replacement, exact Origin grammar, constant-time equal-length comparison, restart rotation, and reset/rebind; auth suite passes 50/50. |
| 6 | Authorized reverse requests route locally first, otherwise to the first capable relay, otherwise to one stable offline response. | VERIFIED | Closed capability sets and deterministic insertion-order selection in `bridge.ts`; local/relay/offline and capability-omission tests pass. |
| 7 | `bridge.auth-status` is a secret-free, non-spawn authorization probe, and socket-open alone never means paired. | VERIFIED | Server handles the reserved method before capability routing; the client promotes only exact `{authorized:true}`; lifecycle tests cover configured, paired, expired, and offline states. |
| 8 | Reverse correlation is isolated, target-pinned, exact-once, cleared on topology loss, and never replayed after reconnect or promotion. | VERIFIED | Independent server and client maps delete before settlement; relay/hub/stale-socket churn tests pass, including the post-review 119/119 lifecycle suite. |
| 9 | Pairing data stays in trusted browser-session storage/memory and the WebSocket subprotocol; URLs, ext payloads, runtime messages, logs, and public bridge state remain secret-free. | VERIFIED | Direct `chrome.storage.session` write/read, fixed `ws://localhost:7225`, credential-bearing runtime-key rejection, public-state allowlist, and disclosure tests all pass. |
| 10 | Pair/remove controls are explicit and accessible in Agent CLI details, while live browser evidence remains honestly pending. | VERIFIED (source/automated) | Password input, status live region, independent pair/remove actions, Providers VM/static tests, and the four-item pending UAT ledger are present. |

**Score:** 10/10 automated/source outcomes verified.

## Requirements Coverage

| Requirement | Status | Independent evidence |
|---|---|---|
| CHAN-01 | SATISFIED | Ext interfaces and parser are outside `MCPMessageType`; valid/malformed frames pass contract tests; historical MCP types, response union, tool hashes, agent envelope, and default relay JSON pass byte-freeze tests. |
| CHAN-02 | SATISFIED | `RelayHello.capabilities` is optional and closed to `agent-spawn`; capability snapshots are removed on disconnect; routing prefers a configured local handler, then the first connected capable relay, then `agent_provider_offline`. Default production construction advertises nothing. |
| CHAN-03 | SATISFIED | Non-loopback binds fail before port use. Host and Chrome extension Origin are canonicalized and checked in the HTTP upgrade path before a WebSocket is registered. Every ext frame then revalidates the socket's private Origin/session metadata against current auth state. |
| CHAN-04 | SATISFIED | Under the locked Phase 59 interpretation, durable per-install identity is the exact bound extension Origin and the credential is a 32-byte daemon-session secret. `serve` rotates it, `pair --reset` clears Origin and rotates secret/session ID, the code travels only as a WebSocket subprotocol and session-only browser record, and every ext frame requires current authority. |
| CHAN-05 | SATISFIED | Caller-level and independent sink-level sanitizers remove exact FSB bridge tokens before memory/storage output; full and interior token checks pass. |
| CHAN-06 | SATISFIED | Named real-socket cases cover hub exit with an active reverse request, capable-relay exit mid-request, exact-once topology errors, no second-relay failover/replay, and the unchanged promotion path. |
| CHAN-07 | SATISFIED | The external scanner owns the three forbidden literals, recursively inspects all regular/symlink-resolved files under `mcp/src/agent-providers`, fails closed, and runs before every MCP build. The directory is currently absent, as required before Phase 60. |

No CHAN requirement is orphaned: all seven appear in plan frontmatter, summaries, tests, and the milestone traceability table.

## Artifact Audit

Generic artifact verification passed 4/4 declarations for Plan 01, 4/4 for Plan 02, 3/3 for Plan 03, and 4/4 for Plan 04: **15/15 declarations** across 14 unique paths.

| Artifact group | Substantive evidence | Wiring status |
|---|---|---|
| Ext contract and gates | `mcp/src/ext-protocol.ts`, reverse-contract test, forbidden-flag scanner, diagnostic sink | Parsed by bridge, invoked by MCP prebuild, and exercised from root tests. |
| Upgrade authorization | `mcp/src/bridge-auth.ts`, `mcp/src/bridge.ts`, `mcp/src/index.ts`, auth test | `serve` rotates before bridge start; `pair` reads/resets state; upgrade classification consumes current state. |
| Reverse topology | `mcp/src/bridge.ts`, topology and reverse-contract tests | Relay hello snapshots optional capability; authorized frames enter local/relay routing and return through `activeExtRequests`. |
| Extension pairing | bridge client, background reload action, Providers markup, UAT ledger | Options writes session state directly; background carries only status; client offers subprotocols and performs the authenticated probe. |

No declared artifact is missing, stubbed, hollow, or orphaned.

## Key-Link Audit

The generic key-link checker found 8/12 links automatically. Four Plan 02/03 entries use conceptual labels rather than filesystem paths; manual call-chain inspection verifies all four, for **12/12 total**:

- HTTP upgrade classification is stored in `acceptedSocketMetadata` before the connection event and is consumed by `_handleNewConnection` and per-frame `_isCurrentExtAuthority`.
- `RelayHello.capabilities` is strictly parsed and snapshotted into `relayCapabilities` at registration, then deleted on relay loss.
- An authorized extension frame passes `parseExtFrame` and `_isCurrentExtAuthority` before `_handleExtRequest` selects the local handler or first capable relay.
- Relay events/finals are accepted only from the pinned relay in `activeExtRequests`, forwarded to the originating extension socket, and the first final deletes the route before settlement.

The eight path-addressable links also pass: separate types to parser, MCP prebuild to scanner, caller redactor to sink, CLI/serve to auth store, bridge to auth store, options to session storage, background to client reload, and client protocols/frames to the server bridge.

## Security Ordering and No-Spawn Proof

The Phase 59 implementation range from `9ddc4c37` through current source was audited.

- `mcp/src/agent-providers` does not exist.
- Added production lines contain no `child_process`, `spawn`, `exec`, `SpawnSupervisor`, or adapter implementation.
- Production `new WebSocketBridge()` call sites pass no `capabilities` or `handleExtRequest`; the capability/handler seam is exercised only by tests.
- The only production `agent-spawn` occurrences define, normalize, advertise, and route the optional capability. They do not grant it to a running daemon.
- The credential does not appear in a bridge URL, ext frame, public status object, local/sync setting, or runtime reload message.

This satisfies the roadmap's non-negotiable rule that all channel security foundations be code-green before Phase 60 introduces any spawn path.

## Automated Verification

Independent focused verification on current source passed:

- Reverse-channel contract: all assertions passed.
- Bridge auth: 50 passed, 0 failed.
- Bridge topology/security/churn: 182 passed, 0 failed.
- Extension bridge lifecycle, including both stale-socket review fixes: 119 passed, 0 failed.
- Background dispatch and secret-free reload: 66 passed, 0 failed.
- Version parity: 16 passed, 0 failed.
- Redaction, diagnostic sink, forbidden-flag scanner, Providers logic/UI, and agent-grace suites: all passed.
- Declared execution/review-fix commits: 15/15 present.
- Schema drift: none detected; non-blocking.

The final post-fix root `npm test` also completed at exit `0` on the current Phase 59 source. Its MCP prebuild ran the permanent flag gate, all serial repository tests passed, and the temporary Phase 39 compatibility symlink was absent after cleanup.

## Review Closure

The initial deep review found one Critical socket-role takeover and one Warning stale-close race. Commits `48e4940f` and `7f5b1231` fixed them. A follow-up review found one remaining Warning: stale sockets retained their own reverse requests. Commit `ac3032ad` added socket-scoped rejection and a concurrent old-request/replacement-probe regression.

Current `59-REVIEW.md` is `status: clean` with zero open findings. It confirms that Origin-less/unprivileged candidates cannot displace the incumbent, old closes cannot corrupt replacement state, stale-socket work rejects exactly once, and replacement probes settle normally.

## Human Verification Required

Exactly four live checks remain pending in `59-HUMAN-UAT.md`:

1. Pair a live unpacked extension with a running `serve` daemon.
2. Observe daemon-restart invalidation and re-pairing.
3. Observe Chrome restart clearing session-only credentials.
4. Exercise keyboard/screen-reader behavior and light/dark/compact rendering.

Each entry remains `Result: pending — deferred to milestone-end`, with `deferred_by: user`. These checks require real browser/process behavior and cannot be truthfully replaced by source or VM evidence.

## Gaps Summary

There is no automated, source, artifact, wiring, review, or phase-ordering gap blocking Phase 59. The only outstanding evidence is the explicitly deferred live UAT. Therefore the correct verifier status is `human_needed` with `automated_status: passed`, and the phase is eligible for autonomous advancement under the user's milestone-end UAT policy.

---

_Verified: 2026-07-14T14:54:51Z_  
_Verifier: independent gsd-verifier agent_
