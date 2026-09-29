# Phase 61: Delegation UX & SW-Eviction Persistence — Pattern Map

**Mapped:** 2026-07-14
**Inputs:** `61-CONTEXT.md`, `61-RESEARCH.md`, `61-UI-SPEC.md`, `61-VALIDATION.md`, and current repository source/tests

## Data Flow

```text
side-panel draft
  -> background provider/preflight route (read-only)
  -> offline / unpaired / unsupported disposition, OR one-use consent challenge
  -> background consumes the task/provider-bound challenge; provider-local trust only controls whether the consent card is shown
  -> delegation controller calls delegate.start
  -> daemon mints delegationId and spawns CLI
  -> child AgentScope adds FSB_DELEGATION_ID to agent:register
  -> dispatcher mints agentId, controller verifies the daemon-minted delegation is currently expected, then registry stamps the mapping
  -> normalized ext:event enters async observer tail
  -> projection/redaction -> serialized chrome.storage.session append
  -> only after write: controller state/watchdog + UI fanout
  -> side panel hydrates exact ledger then subscribes after sequence
  -> hold/resume/stop use delegationId -> agentId -> exact owned tabs
  -> supervisor settles process tree before registry releases exact tabs
```

The side panel never mints/consumes authority or infers terminal state. The controller never sends OS signals. The supervisor never owns Chrome tabs. Each boundary carries only the minimum closed data needed by the next tier.

## File Classification

| Target file | Role | Closest analog | Pattern to preserve |
|-------------|------|----------------|---------------------|
| `extension/utils/delegation-preflight.js` (new) | pure authoritative provider/readiness classification | `extension/ui/providers-panel.js::normalizeProviderSettings`, `extension/ws/mcp-bridge-client.js` connection snapshot | normalize stored API empty-string compatibility only at the background boundary; exact agent id, closed offline/unpaired/unsupported results, no writes/sends/tab queries |
| `extension/utils/delegation-consent.js` (new) | provider trust and one-use challenge authority | `extension/utils/consent-policy-store.js`, `extension/utils/consent-gate.js` | classic-script IIFE, exact normalization, storage-backed authority, explicit fail-closed result |
| `extension/utils/delegation-event-store.js` (new) | bounded redacted session ledger and serialized append | `extension/utils/mcp-task-store.js`, `extension/utils/agent-registry.js::_persist/hydrate` | versioned envelope, mutex/promise queue, awaited session writes, exact hydrate validation |
| `extension/utils/delegation-controller.js` (new) | sole delegation lifecycle state machine | `extension/utils/mcp-visual-session-lifecycle.js`, `extension/utils/trigger-lifecycle.js` | closed global API, idempotent transitions, persisted-before-notify ordering, injected/testable dependencies |
| `extension/ui/delegation-feed.js` (new) | pure entry/view model and DOM renderer | `extension/ui/sidepanel-message-log.js`, `extension/ui/owner-chip.js` | text nodes, bounded labels, global/CommonJS test seam where used, no lifecycle authority |
| `extension/ai/engine-config.js` | fifth delegated execution mode | existing four `EXECUTION_MODES` entries | named object, explicit UI feedback/highlight policy; no delegated `maxIterations` |
| `extension/config/config.js` | load persisted provider kind/id in background | current `Config.defaults/getAll` plus `extension/ui/options.js` defaults | exact keys, safe legacy fallback, keep agent ids out of `modelProvider` |
| `extension/ws/mcp-bridge-client.js` | ordered async observer and active heartbeat | current `_extPending`, `_handleExtFrame`, `_startPing`, reconnect state | insert pending before send, per-correlation promise tail, settle once, socket identity checks, one refcount timer |
| `extension/ws/mcp-tool-dispatcher.js` | validate/stamp registration sidecar | `handleAgentRegisterRoute` connection/client stamping | extension mints agent id, exact optional sidecar, registry stamp then closed response |
| `extension/utils/agent-registry.js` | delegation mapping and sealed hold lease | existing tab metadata, staged releases, lock, hydrate/persist | one ownership truth, immutable exact mapping, persisted deadlines, no nested lock entry |
| `extension/background.js` | authoritative preflight/start/hold/resume/stop/wake route | `handleStartAutomation`, internal dispatch bus, `armMcpBridge` | branch before legacy allocations, same-context dispatch, additive import order, coalesced promises |
| `extension/manifest.json` | Chrome 116 guarantee | current MV3 manifest | add only `minimum_chrome_version`; keep permissions and no-native invariant |
| `extension/ui/sidepanel.html` | delegation run region/live announcer/actions | current runner, composer, owner chip, status structure | visible labels, existing CSS/core imports, one polite region plus explicit alerts |
| `extension/ui/sidepanel.js` | preflight-first UI orchestration and action dispatch | current tab-aware running state/runtime listeners | preserve draft until accepted start, render snapshots/events, never infer ownership/terminal state |
| `extension/ui/sidepanel.css` | approved card/control/state styling | current token aliases and component classes | `fsb-ui-core` tokens, standard spacing/type scale, responsive/reduced-motion, color plus text |
| `mcp/src/agent-scope.ts` | optional environment-to-registration delegation sidecar | current clientInfo/platforms payload assembly | capture trusted process env once, omit absent field, never accept caller-selected authority |
| `mcp/src/agent-providers/spawn-supervisor.ts` | strict hold/resume/status/generation/recovery policy | current start/cancel strict parsers and exact-once run map | exact keys/Zod, no adapter method expansion, identity-verified run, one settlement path |
| `mcp/src/agent-providers/runtime-files.ts` | bounded generation/recovery disposition persistence | existing owner-only journal/atomic file helpers | secret-free exact envelope, atomic write, symlink/type checks, bounded pruning |
| `mcp/src/index.ts` | serve-owned generation and lifecycle wiring if needed | current supervisor construction/recover/close order | only `serve` owns capability; recovery before advertise; shutdown joins supervisor |
| `package.json` | serial Phase 61 focused gates | current long serial `test` script | add each command once; do not reorder/drop unrelated tests |
| Phase 61 tests | deterministic contract/lifecycle/UI proof | tests named in `61-VALIDATION.md` | Node assertions, VM/fake Chrome or compiled MCP output, cleanup in `finally`, no live authority |

## Concrete Existing Patterns

### 1. Classic-script global modules

`extension/utils/mcp-task-store.js` and registry-style utilities use an IIFE and publish a closed global rather than ES imports in the MV3 classic worker. New store/consent/controller modules should follow that load model and expose only their public methods:

```js
(function(root, factory) {
  var api = factory();
  root.FsbExample = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  return Object.freeze({ /* closed methods */ });
});
```

Use the actual wrapper shape from the selected analog. Keep module state private and inject/fake `chrome`, clocks, or bridge functions through a test-only constructor/factory rather than adding mutable globals.

### 2. Background import order is a dependency graph

`extension/background.js` loads registry/provider utilities before dispatcher, and dispatcher before bridge client:

```js
try { importScripts('utils/agent-registry.js'); } catch (e) { /* logged */ }
try { importScripts('ws/mcp-tool-dispatcher.js'); } catch (e) { /* logged */ }
try { importScripts('ws/mcp-bridge-client.js'); } catch (e) { /* logged */ }
```

Load redaction/store/consent before controller. Load controller only after its registry/bridge dependencies are available, or pass suppliers so evaluation order does not capture `undefined`. Search source-pin tests before changing this block.

### 3. Pending correlation lifecycle

The bridge inserts a pending record before it sends:

```js
this._extPending.set(id, {
  resolve,
  reject,
  timer,
  socket,
  onEvent: typeof options.onEvent === 'function' ? options.onEvent : null,
});
this._send({ id, type: 'ext:request', method, payload });
```

Add an initially resolved `eventTail`. For each valid `ext:event`, replace it with `eventTail.then(() => onEvent(...))`. On final response, remove/clear the public pending entry so no new frames append, then await the captured tail before resolving/rejecting. Observer rejection must win over a later successful provider result and trigger controller cancellation if the delegation id is known.

### 4. Exact strict supervisor parsers

`spawn-supervisor.ts` already checks outer and payload keys before Zod:

```ts
if (
  !isPlainRecord(request)
  || !exactKeys(request, START_REQUEST_KEYS)
  || request.method !== 'delegate.start'
  || !isPlainRecord(request.payload)
  || !exactKeys(request.payload, START_PAYLOAD_KEYS)
) throw new InvalidDelegationRequestError();
```

Create separate exact key sets/schemas for hold, resume, and status. Never accept PID, signal, grace, generation, agent id, argv, environment, or client-selected delegation id on start. Hold/resume accept only the earlier server-minted delegation id; policy constants remain supervisor-owned.

### 5. AgentScope additive registration payload

`AgentScope.ensure()` builds a local payload and conditionally adds evidence:

```ts
const payload: { clientInfo?: ClientInfo; platforms?: McpClientInventory } = {};
// sanitize suppliers, then:
await bridge.sendAndWait({ type: 'agent:register', payload }, { timeout: 10_000 });
```

Extend the type with `delegationId?: string`, populate it only from the validated `FSB_DELEGATION_ID` inherited by the spawned process, and omit it for every existing MCP client. The extension still mints `agentId`; the sidecar is correlation, not authority.

### 6. Registration stamping

`handleAgentRegisterRoute` already performs this order:

1. `registerAgent()` mints an agent id and enforces cap.
2. Derive/stamp bridge `connectionId`.
3. Sanitize/stamp client info and installed evidence.
4. Return the minted id and additive metadata.

Validate the delegation sidecar's shape before mint. After ordinary registration mints the extension agent id, call the controller's closed binding gate; it accepts only a daemon-minted delegation id that is currently expected in `starting`/`running`, performs the registry mapping while that state is authoritative, and consumes the one expected registration. If the gate rejects or races terminal settlement, roll back the new ordinary agent record and map nothing. Do not pre-register a delegation, reflect a caller value without controller authorization, or let it replace the minted agent id.

### 7. Registry lock, hydrate, and deadline recovery

`AgentRegistry` serializes mutations with `withRegistryLock`, persists versioned Maps to `chrome.storage.session`, and recovers staged connection releases during `hydrate()`. A hold lease should reuse that discipline:

- the controller queries the active tab and proves it is one of the delegation's exact owned tabs; the registry never queries active-tab UI state;
- snapshot the complete exact mapped set (agent id, delegation id, every tab id, every ownership token/metadata, and expiry) into one lease;
- compare the supplied complete snapshot to the registry's current complete mapped set, then remove all mapped tab ids from active owner maps inside the same locked turn;
- retain a separate held-tab reservation so `bindTab` rejects another claimant;
- persist before the operation resolves;
- on hydrate, cancel/expire overdue leases without restoring by guesswork;
- never call another lock-taking public method from inside the lock.

Ordinary `releaseTab` deletes an agent after its final tab. Do not use it to implement human hold.

### 8. Storage envelope validation

Follow `extension/utils/mcp-task-store.js` plus registry conventions: one version field, exact identity, arrays/records validated item by item, corrupt state fails closed, and all write promises awaited where authority/order depends on persistence. A persisted duplicate sequence is corruption even when byte-identical; only the UI may suppress a duplicate delivery of the same already-persisted `(delegationId, sequence)`. `unlimitedStorage` does not relax `storage.session`'s 10 MB quota.

Use a per-delegation append tail:

```js
tail = tail.then(async function() {
  var current = await readValidatedLedger(id);
  var next = projectAndBound(current, event);
  await chrome.storage.session.set({ [key]: next });
  return next.entries[next.entries.length - 1];
});
```

Do not catch-and-log a ledger write as best effort. This storage write is a lifecycle/security gate.

### 9. Redaction and DOM safety

Use `extension/utils/redactForLog.js` as a supporting scrubber, then apply a stricter feed allowlist. Never serialize the raw event into the ledger merely because it passed the Phase 60 normalized event schema.

`delegation-feed.js` should build elements and assign `textContent`. Do not pass tool arguments, client/model/session strings, typed errors, or technical details through `innerHTML` or the Markdown renderer. `<details>/<summary>` may be created structurally with text-only children.

### 10. Existing open-tab policy

`mcp-tool-dispatcher.js` already treats `active` as opt-in and `tests/open-tab-background-default.test.js` pins the behavior. Phase 61 should preserve this rather than add a second tab-creation path. Controller tests should assert no tab/create/bind occurs before consent and no current active tab is silently claimed.

### 11. Side-panel state and accessibility

The current HTML already has the status header, chat list, runner, composer, and Stop control. Extend the structure with one run region and one feed announcer. Follow the approved contract exactly:

- hydrated rows use the same renderer with announcements disabled;
- routine new entries use `role="status" aria-live="polite" aria-atomic="false"`;
- offline/disconnected are alerts;
- every new action has visible text;
- Stop action instances share one `aria-busy` state;
- focus changes occur only after confirmed consent/hold transitions;
- `prefers-reduced-motion` removes nonessential movement.

### 12. Same-context service-worker dispatch

The project invariant requires internal delegation actions to use `globalThis.fsbDispatchInternalMessage` or direct controller methods, not `chrome.runtime.sendMessage` expecting the same service worker to receive itself. Side-panel-to-background messages still use the runtime boundary normally.

### 13. Test harness selection

- `tests/mcp-bridge-client-lifecycle.test.js`: VM-loads the actual classic bridge with fake WebSocket/timers/storage; extend for async observer and acknowledged heartbeat.
- `tests/agent-registry.test.js`: constructs fake session storage/timers and exercises persisted ownership; extend for mappings/leases and module reload.
- `tests/agent-scope.test.js`: captures real registration payloads; add environment-sidecar omission/validation cases.
- `tests/mcp-spawn-supervisor.test.js`: imports compiled MCP output and injects child/clocks/process policy; extend rather than using live signals.
- `tests/providers-panel-ui.test.js` and side-panel smoke tests: use source/DOM-shaped assertions without adding a browser framework.
- New Phase 61 tests should execute real modules where possible, use deterministic fakes, clean temporary state in `finally`, and run through root `package.json` exactly once.

## Shared Patterns

### Exactness and authority

- Client/UI data is presentation/request input, never authority.
- The daemon mints delegation ids; the extension mints agent ids and ownership tokens.
- Optional additive fields are omitted when absent and exact-shape validated when present.
- Unknown state, mapping, generation, platform support, or storage result fails closed.

### Lifecycle settlement

- Insert pending state before external effects.
- Coalesce racing callers on one promise.
- Persist the authoritative transition before notification.
- Clear timers/maps exactly once on every terminal path.
- Never replay a browser task after topology, daemon, storage, or worker failure.

### Source-pin discipline

Before editing a shared extension file, run:

```bash
rg -n "engine-config\.js|background\.js|mcp-bridge-client\.js|mcp-tool-dispatcher\.js|agent-registry\.js|sidepanel\.(js|html|css)|manifest\.json" tests
```

Update every paired source-shape tripwire in the same task commit and run its focused sub-30-second command. Run the complete fail-safe root suite as a separate commit/wave gate from the first extension-touching implementation commit; do not place the several-minute full suite inside a task's `<automated>` command.

## Same-Wave Conflict Map

| Shared file | Single owning plan/order rule |
|-------------|-------------------------------|
| `extension/background.js` | one late integration plan after consent/store/controller/bridge contracts exist |
| `extension/utils/delegation-controller.js` | controller-core plan owns creation; integration plan depends on it and may extend sequentially |
| `extension/ws/mcp-bridge-client.js` | one bridge/heartbeat plan only |
| `extension/utils/agent-registry.js` | one mapping/hold plan only |
| `extension/ws/mcp-tool-dispatcher.js` + `mcp/src/agent-scope.ts` | one correlation plan in a single wave |
| `mcp/src/agent-providers/spawn-supervisor.ts` | one supervisor lifecycle/recovery plan only |
| `extension/ui/sidepanel.*` | one UI plan after controller snapshot/event contract stabilizes |
| `extension/manifest.json` | bridge/heartbeat plan owns Chrome 116/no-native pin |
| `package.json` | final system-contract plan adds all new test commands once |
| `61-VALIDATION.md` / UAT artifacts | final plan/checker owns status/task-id synchronization; implementation plans do not race-edit them |

Independent Wave 1 candidates are consent/routing primitives, event store/controller core, and bridge heartbeat. Correlation/registry and supervisor work may run in the next wave if their files do not overlap. Background integration waits for all lifecycle primitives; UI waits for the controller contract; root chain/UAT evidence is final.

## No Analog Found

- There is no existing provider-neutral delegation feed renderer; use `sidepanel-message-log.js` for DOM/test style and `61-UI-SPEC.md` for semantics.
- There is no existing OS process hold/resume API; use the supervisor's strict start/cancel parser and exact-once state machine plus official Node signal semantics. Do not copy an unrelated browser pause mechanism.
- There is no existing delegation-scoped sealed ownership lease; compose registry metadata/lock/hydration/staged-deadline patterns without overloading ordinary release.
- There is no existing daemon generation/recovery-disposition response; use the owner-only runtime journal pattern and Phase 59 exact additive protocol discipline.

Plans creating these interfaces must cite the relevant `61-RESEARCH.md` section and declare exact input/output/state shapes in `<interfaces>`.

## Anti-Patterns

- Do not enter `runAgentLoop` for agent-kind tasks or reuse its iteration cap.
- Do not append/clear the side-panel message before accepted delegated start.
- Do not treat `confirmed: true`, an agent id, a tab id, or a client-selected delegation id as authority.
- Do not fan out an event before its session write resolves or catch a ledger failure as best effort.
- Do not persist raw provider JSON, prompts, page text, full result bodies, secrets, PIDs, argv, or environments.
- Do not use ordinary `releaseTab` as human hold or release all tabs without exact mapping proof.
- Do not resume the OS process before ownership restoration.
- Do not infer daemon restart from WebSocket close or relay topology change.
- Do not create one heartbeat timer per panel/run.
- Do not use `chrome.runtime.sendMessage` for same-worker internal dispatch.
- Do not add `nativeMessaging`, custom doctor URL schemes, shell execution, or Phase 62/63 behavior.
- Do not modify historical byte/parity assertions to accept accidental drift.

## PATTERN MAPPING COMPLETE

Every proposed Phase 61 file now has a concrete analog or an explicit research-owned interface. The conflict map supports parallel primitive work without concurrent edits to shared lifecycle/UI/test-chain files.
