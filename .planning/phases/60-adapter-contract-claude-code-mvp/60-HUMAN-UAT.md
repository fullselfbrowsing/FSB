---
phase: 60
status: human_needed
deferred_until: milestone-end
deferred_by: user
automated_verification: required-before-advance
results_recorded: false
---

# Phase 60 Live UAT

These checks require authenticated software, real operating-system process behavior, or a live browser. Per user instruction, all are preserved for the single milestone-end UAT gate. None has been run or marked passed during autonomous implementation.

## [ ] 1. Authenticated Claude Code 2.1.177 isolation profile

Status: `human_needed` — pending

Prerequisites: The installed Claude Code CLI is exactly 2.1.177 and is authenticated through the user's normal subscription/keychain flow. Provider API-key environment variables must not be supplied as a fallback.

Steps:

1. Run `claude --version` and record the retained native executable path and exact version.
2. Build and start the daemon with `npm --prefix mcp run build` and `node mcp/build/index.js serve`.
3. Pair an unpacked extension using a newly generated `node mcp/build/index.js pair` code.
4. Submit a benign `delegate.start` request through the authenticated extension route.
5. Inspect the normalized init event and the retained process metadata without recording the prompt or credentials.

Expected evidence: Version 2.1.177 is retained; authentication succeeds without `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`; the effective setting sources are empty; only the `fsb` static agent and FSB MCP server are present; built-in tools, plugins, hooks, slash commands, Chrome integration, and session persistence are absent.

Result: pending — no live result recorded

## [ ] 2. Real sanitized JSONL capture and contract corroboration

Status: `human_needed` — pending (`CLAUDE-03` recorded provenance)

Prerequisites: Check 1 passes and a benign task can make one harmless FSB MCP read call.

Steps:

1. Capture one genuine Claude Code 2.1.177 `stream-json` run outside the repository.
2. Remove prompt text, browser content, credentials, account data, filesystem paths, hostnames, and stable identifiers before copying any artifact.
3. Compare the sanitized type/subtype/required-field sequence with `tests/fixtures/agent-streams/claude-code-2.1.177/contract-stream.jsonl` and its manifest.
4. Run `npm --prefix mcp run build && node tests/mcp-agent-stream-fixture.test.js` against any proposed sanitized replacement.
5. If the live shape differs, record protocol drift and update the parser/tests through review; do not relabel the current schema-derived fixture as a recording.

Expected evidence: A reviewer-approved sanitized capture with honest provenance corroborates the required init, assistant/tool, retry, and result shapes, or a documented drift blocks release. The current manifest remains `human_needed` until that evidence exists.

Result: pending — no live capture claimed

## [ ] 3. Live CLI-to-loopback-MCP registration and tool call

Status: `human_needed` — pending

Prerequisites: Checks 1 and the Phase 59 live pairing checks pass; the extension owns a harmless test tab.

Steps:

1. Start `node mcp/build/index.js serve`, pair the unpacked extension, and confirm the loopback health endpoint.
2. Start one benign delegated task that requires a read-only FSB browser operation.
3. Observe the early server-minted delegation id, normalized init, FSB agent registration, and one MCP tool request/response.
4. Let the run reach its single terminal result, then issue `delegate.cancel` with the minted id to confirm the idempotent already-terminal response.
5. Inspect daemon and extension logs for task, credential, raw stdout, or raw stderr disclosure.

Expected evidence: The Claude child registers only through the private loopback MCP config, receives its server-owned browser identity, completes one read-only call, emits ordered events and exactly one terminal response, and leaks no protected content.

Result: pending — no live result recorded

## [ ] 4. POSIX descendant-tree termination

Status: `human_needed` — pending

Prerequisites: A macOS or Linux host where a controlled delegated fixture can create a child and grandchild process.

Steps:

1. Start a controlled delegation whose retained process launches identifiable, non-production descendants.
2. Record the journaled leader PID, process group, start identity, argv signature, and fingerprint without recording prompt data.
3. Cancel using the server-minted delegation id while descendants are alive.
4. Observe group `SIGTERM`, the bounded grace interval, and `SIGKILL` only if a confirmed matching tree survives.
5. Verify the leader and every matching descendant are absent before cancel resolves; confirm an unrelated Claude process is still running.

Expected evidence: Termination is limited to the strongly identified process group, cancel settles only after child close and verified tree absence, and no unrelated process receives a signal.

Result: pending — no POSIX kernel result recorded

## [ ] 5. Windows descendant-tree termination

Status: `human_needed` — pending

Prerequisites: A Windows host with the native retained Claude executable and available native process inspection/termination facilities.

Steps:

1. Start a controlled delegated fixture with identifiable child and grandchild processes.
2. Confirm the runtime can establish the required exact process identity; if evidence is partial, verify capability remains withheld and no kill is attempted.
3. For a confirmed tree, cancel with the server-minted delegation id and observe the fixed native `taskkill /pid <pid> /T /F` path.
4. Verify the entire matching tree is absent before settlement.
5. Confirm an unrelated Claude process remains alive.

Expected evidence: Confirmed trees terminate through the fixed shell-free native path; ambiguous evidence fails closed without taskkill or capability advertisement; no collateral process is terminated.

Result: pending — no Windows kernel result recorded

## [ ] 6. Crash/restart orphan recovery without collateral kill

Status: `human_needed` — pending

Prerequisites: A controlled live delegation and a separate unrelated Claude process.

Steps:

1. Start `serve`, begin the controlled delegation, and confirm its active journal record.
2. Forcefully terminate the daemon after activation while the child tree remains alive.
3. Restart `serve` and observe recovery before any `agent-spawn` capability advertisement.
4. Verify the exact journaled tree is terminated and re-inspected as absent, then confirm its journal/runtime files are removed.
5. Verify the unrelated Claude process survives. Repeat with deliberately ambiguous identity evidence and confirm the record remains, no process is killed, and spawn capability stays withheld.

Expected evidence: Recovery handles only exact journal evidence, never advertises early, removes state only after verified absence, and fails closed without collateral termination when evidence is ambiguous.

Result: pending — no crash/restart result recorded

## [ ] 7. Browser ownership, vault references, and irreversible-action handoff

Status: `human_needed` — pending

Prerequisites: Live authenticated CLI, paired unpacked extension, a harmless owned tab, test vault references, and a reversible test workflow.

Steps:

1. Run a benign read task on a tab owned by the delegated FSB agent and confirm success.
2. Attempt access to a tab owned by another agent and confirm fail-closed ownership enforcement.
3. Exercise a test credential/payment flow using only vault-reference operations; inspect messages to ensure secret values are not returned to Claude.
4. Reach—but do not complete—an irreversible or consent-required action and confirm explicit human handoff occurs before execution.
5. Review the final normalized events and terminal payload for secret, prompt, and browser-content leakage outside the approved result fields.

Expected evidence: Server-minted identity constrains tab access, vault references never disclose underlying values, and irreversible/consent-required work stops for a human decision.

Result: pending — no live browser result recorded

## Phase 61 scope boundary

Phase 60 does not claim the production side-panel delegation consent, progress feed, stop control, or persistence UX. Those checks belong to Phase 61 and remain future scope; this ledger covers only the Phase 60 daemon/adapter core and existing browser ownership/vault/consent enforcement.
