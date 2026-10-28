# Phase 64: OpenCode Adapter — Pattern Map

**Mapped:** 2026-07-20  
**Phase inputs:** `64-CONTEXT.md`, `64-RESEARCH.md`, `64-UI-SPEC.md`, `64-VALIDATION.md`  
**Proposed files classified:** 54  
**Closest analog clusters:** 5

This phase should extend the Phase 60 delegation architecture, not fork it. OpenCode is the second member of the same closed provider system: the adapter still has exactly five methods, the supervisor still owns every process and secret, browser state still receives only sanitized provider identity, and terminal success still belongs to the supervisor rather than the stream parser.

Two filenames below are architectural placeholders rather than settled names:

- `mcp/src/agent-providers/protocol-drift.ts` is the inferred home for provider-neutral drift types currently embedded in `claude-stream.ts` and imported directly by `spawn-supervisor.ts`.
- `extension/utils/delegation-providers.js` is the inferred home for one immutable browser-side provider table. The planner may choose another name, but should create one canonical module rather than duplicate Claude/OpenCode conditionals.

The proposed Phase 64 runner and harness names are likewise conventional (`run-phase64-full-tests.mjs` and `phase64-full-tests-harness.test.js`). If planning chooses an equivalent root entry, keep one deterministic serial runner and one preservation-aware invocation.

## File Classification

### MCP production surface

| File | Change | Role | Data flow | Closest analog / fit |
|---|---|---|---|---|
| `mcp/src/agent-providers/adapter.ts` | Modify | model / contract | configuration → immutable process topology | Self + Phase 60 contract, exact |
| `mcp/src/agent-providers/protocol-drift.ts` | Create (name inferred) | utility / error model | parser failure → bounded supervisor diagnostic | `claude-stream.ts` drift types + `spawn-supervisor.ts` mapping, role-match |
| `mcp/src/agent-providers/opencode-detect.ts` | Create | service | PATH/process probe → retained binary identity + compatibility | `claude-detect.ts`, exact |
| `mcp/src/agent-providers/opencode-profile.ts` | Create | configuration builder | task + daemon context → private config and provider-neutral spawn topology | `claude-profile.ts`, exact role; topology differs |
| `mcp/src/agent-providers/opencode-stream.ts` | Create | streaming parser / state machine | strict JSONL bytes → normalized `AgentEvent` stream | `claude-stream.ts`, role-match because native grammar differs |
| `mcp/src/agent-providers/opencode.ts` | Create | provider composition | injected detector/parser/tree-kill → frozen five-method adapter | `claude-code.ts`, exact |
| `mcp/src/agent-providers/registry.ts` | Modify | registry | closed registrations → immutable exact two-provider lookup | Self, exact |
| `mcp/src/agent-providers/runtime-files.ts` | Modify | runtime store | process ownership transitions ↔ private journal/files | Self, exact |
| `mcp/src/agent-providers/spawn-supervisor.ts` | Modify | lifecycle service | request → owned process/server tree → buffered events → terminal settlement | Self, exact |
| `mcp/src/agent-providers/serve-delegation.ts` | Verify first; modify only if projection needs it | transport service | registry/matrix → sanitized delegation response | Self, exact and already generic |
| `mcp/src/agent-providers/compatibility.ts` | Modify | compatibility model | closed matrix + fixture manifests → runtime status | Self, exact |
| `mcp/src/client-inventory.ts` | Modify | inventory service | bounded executable probes → sanitized client availability | Claude probe branch in self, exact |
| `mcp/src/diagnostics.ts` | Verify first; modify only if a hard-coded assumption remains | diagnostics service | registry/matrix/inventory → doctor/status rows | Self, exact and mostly registry-driven |
| `mcp/src/platforms.ts` | Verification-only unless a test exposes a gap | configuration registry | platform id → MCP configuration metadata | Existing OpenCode entry, exact |

### Extension production surface

| File | Change | Role | Data flow | Closest analog / fit |
|---|---|---|---|---|
| `extension/utils/delegation-providers.js` | Create (name inferred) | immutable configuration / model | canonical id ↔ label, capabilities, display defaults | `providers-panel.js` definitions + `delegation-preflight.js` roster, role-match |
| `extension/utils/mcp-agent-providers.js` | Modify | compatibility store | sanitized MCP snapshot → immutable shipped provider rows | Self, exact |
| `extension/utils/delegation-preflight.js` | Modify | validation service | authoritative saved selection + provider snapshot → start eligibility | Self, exact |
| `extension/utils/delegation-consent.js` | Modify | security store | provider-bound challenge/trust record → one-time authorization | Self, exact |
| `extension/utils/delegation-event-store.js` | Modify | event projection store | canonical lifecycle entries → durable provider-neutral snapshots | Self, exact |
| `extension/utils/delegation-controller.js` | Modify | controller | accepted stream entry → persist → reduce → fan out | Self, exact |
| `extension/utils/agent-protocol-drift-diagnostics.js` | Modify | diagnostic utility | sanitized per-provider drift detail → throttled diagnostic | Self, exact |
| `extension/ui/delegation-feed.js` | Modify | view-model / component | stored snapshot → text-only feed rows | Self, exact |
| `extension/background.js` | Modify | authoritative coordinator | saved provider + consent + MCP events → immutable run context | Self, exact |
| `extension/ui/providers-panel.js` | Modify | component / provider catalog | compatibility row → existing Providers UI | Existing dormant OpenCode definition, exact |
| `extension/ui/options.js` | Modify | component coordinator | provider snapshot → panel rows and failure summaries | Self, exact |
| `extension/ui/sidepanel.js` | Modify | component coordinator | preflight/consent/snapshot → existing delegation surface | Self, exact |

### Tests, fixtures, and gates

| File | Change | Role | Data flow | Closest analog / fit |
|---|---|---|---|---|
| `tests/mcp-opencode-adapter.test.js` | Create | unit / contract test | native fixtures + injected deps → adapter assertions | Claude provider tests and `mcp-agent-provider-contract.test.js`, role-match |
| `tests/mcp-opencode-server-topology.test.js` | Create | lifecycle integration test | cold/attach scenarios → spawn, ownership, fallback, teardown assertions | `mcp-spawn-supervisor.test.js`, role-match |
| `tests/fixtures/agent-streams/opencode-1.14.25/manifest.json` | Create | fixture metadata | pinned provenance + expected sequence → drift contract | Claude 2.1.177 manifest, exact |
| `tests/fixtures/agent-streams/opencode-1.14.25/contract-stream.jsonl` | Create | protocol fixture | sanitized multi-step native events → parser/drift smoke input | Claude contract stream, role-match because native grammar differs |
| `tests/mcp-agent-provider-contract.test.js` | Modify | architecture contract test | source/adapter/registry → exact-surface and policy assertions | Self, exact |
| `tests/mcp-adapter-compatibility.test.js` | Modify | compatibility test | matrix/manifests → exact roster and status assertions | Self, exact |
| `tests/mcp-spawn-supervisor.test.js` | Modify | lifecycle unit test | injected children/events/timers → exact-once settlement | Self, exact |
| `tests/mcp-agent-orphan-recovery.test.js` | Modify | recovery test | journals + generation state → safe kill/recovery assertions | Self, exact |
| `tests/mcp-agent-drift-smoke.test.js` | Modify | fixture registry test | every compatibility row → native fixture → production parser | Self, exact |
| `tests/mcp-agent-stream-fixture.test.js` | Modify if shared coverage is preferable | parser fixture test | chunked/mutated JSONL → normalized sequence or drift | Self, exact |
| `tests/agent-provider-forbidden-flags.test.js` | Modify | source security gate | source tree → prohibited isolation-bypass surfaces | Self, exact |
| `tests/mcp-diagnostics-status.test.js` | Modify | diagnostics contract test | two-provider state → safe doctor/status projection | Self, exact |
| `tests/mcp-client-inventory.test.js` | Modify | inventory contract test | executable probe outcomes → bounded two-provider inventory | Self, exact |
| `tests/mcp-agent-providers-storage.test.js` | Modify | extension storage test | compatibility snapshots → closed sanitized rows | Self, exact |
| `tests/delegation-consent.test.js` | Modify | security test | two provider identities → isolated challenges/trust | Self, exact |
| `tests/delegation-event-store.test.js` | Modify | store test | OpenCode lifecycle entries → provider-stable snapshots | Self, exact |
| `tests/delegation-controller.test.js` | Modify | controller test | persisted entry ordering → exactly-once state/fanout | Self, exact |
| `tests/delegation-routing.test.js` | Modify | routing test | authoritative selection → exact adapter id at daemon boundary | Self, exact |
| `tests/delegation-phase-contract.test.js` | Modify | source architecture test | production source → closed roster/no request authority | Self, exact |
| `tests/providers-panel-logic.test.js` | Modify | view-model test | OpenCode compatibility → existing row state/copy | Self, exact |
| `tests/providers-panel-ui.test.js` | Modify | UI contract test | existing markup + OpenCode data → rendered row | Self, exact |
| `tests/delegation-sidepanel-ui.test.js` | Modify | UI contract test | OpenCode run snapshot → existing lifecycle DOM | Self, exact |
| `tests/agent-protocol-drift-diagnostics.test.js` | Modify | diagnostic test | per-provider closed reasons → safe throttled reports | Self, exact |
| `tests/fixtures/delegation-events.js` | Modify | test fixture factory | canonical provider metadata → reusable lifecycle events | Self, exact |
| `scripts/run-phase64-full-tests.mjs` | Create (name inferred) | deterministic test runner | ordered commands → one Phase 64 verdict | `run-phase60-full-tests.mjs`, exact |
| `tests/phase64-full-tests-harness.test.js` | Create if the runner adds orchestration | runner harness | injected dirty/index states → restoration assertions | `phase60-full-tests-harness.test.js`, exact |
| `.github/workflows/ci.yml` | Modify | CI gate | repository checkout → drift smoke + Phase 64 suite | Existing Phase 60 entries, exact |
| `package.json` | Modify | test manifest | root `npm test` → each relevant suite exactly once | Existing serialized test command, exact |

`mcp/package.json` does not need a new source-file entry: the package already publishes `build/` and TypeScript compiles the source graph into it (`mcp/package.json:27-38`). Do not hand-edit or add generated `mcp/build/**` files to the Phase 64 source plan.

## Pattern Assignments

## 1. Closed five-method adapter family

**Applies to:** `adapter.ts`, `opencode-detect.ts`, `opencode-profile.ts`, `opencode.ts`, `registry.ts`, `client-inventory.ts`, provider contract tests.

**Primary analogs:** `mcp/src/agent-providers/adapter.ts`, `claude-code.ts`, `claude-detect.ts`, `claude-profile.ts`, and `registry.ts`.

The public adapter boundary is intentionally tiny and must remain byte-for-byte equivalent in method count:

**`mcp/src/agent-providers/adapter.ts:124-130`**

```typescript
export interface AgentProviderAdapter {
  detect(): Promise<AdapterDetection>;
  buildSpawn(task: AgentTask, ctx: SpawnContext): Promise<SpawnSpec>;
  parseEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent>;
  kill(child: SupervisedChild, options: { grace: number }): Promise<void>;
  caps(): AdapterCapabilities;
}
```

The topology must be represented as immutable data returned by `buildSpawn`. It must not become a sixth adapter method, an OpenCode-only callback, or a supervisor import of the OpenCode module. The existing flat process fields show the seam that Phase 64 should generalize:

**`mcp/src/agent-providers/adapter.ts:57-66`**

```typescript
/** Declarative process data. User task text is intentionally not representable. */
export interface SpawnSpec {
  readonly adapterId: AgentProviderId;
  readonly profileVersion: string;
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly privateFiles: readonly string[];
  readonly fixedEnv: Readonly<Record<string, string>>;
}
```

Use a provider-neutral discriminated topology, conceptually:

```typescript
type SpawnTopology =
  | { readonly kind: 'direct'; readonly task: ProcessSpec }
  | {
      readonly kind: 'owned_server';
      readonly server: ProcessSpec;
      readonly task: ProcessSpec;
      readonly fallback: ProcessSpec;
    };
```

The exact field names are planner discretion. The invariants are not:

- The discriminator describes lifecycle/topology (`direct` versus `owned_server`), never `adapterId === 'opencode'`.
- Task text remains unrepresentable in argv, env, files, journals, or server configuration. The supervisor writes it once to only the task child's stdin and closes EOF.
- Server command, task command, private files, fixed environment, endpoint handoff, and ownership metadata are declarative and recursively frozen.
- Cold mode is the default. Attach describes only an FSB-owned server launched under this daemon generation; it must never describe or discover a user's existing OpenCode server.
- `freezeSpawnSpec` currently freezes only the flat nested collections (`adapter.ts:111-121`). When topology becomes nested, replace this with a complete defensive reconstruction/deep freeze and add mutation tests for every nested branch.

Copy the Claude composition pattern, including dependency injection and absence of process authority:

**`mcp/src/agent-providers/claude-code.ts:31-35,49-73`**

```typescript
/**
 * Compose the provider-specific policy boundary without acquiring process or
 * filesystem authority. The serve-owned supervisor supplies tree cleanup and
 * remains the only code allowed to create a child process.
 */
const detect = dependencies.detect ?? createClaudeCodeDetector().detect;
const parseEvents = dependencies.parseEvents ?? parseClaudeEvents;
const killTree = dependencies.kill;

return Object.freeze({
  detect(): Promise<AdapterDetection> { return detect(); },
  async buildSpawn(task: AgentTask, ctx: SpawnContext): Promise<SpawnSpec> {
    return buildClaudeSpawnSpec(task, ctx);
  },
  parseEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent> {
    return parseEvents(stream);
  },
  kill(child: SupervisedChild, options: { grace: number }): Promise<void> {
    return killTree(child, options);
  },
  caps(): AdapterCapabilities { return TASK_ONLY_CAPABILITIES; },
});
```

For OpenCode, adapt the provider-specific internals:

- `opencode-detect.ts` should copy the bounded, `shell:false` PATH candidate → `access`/`realpath`/`stat` → `--version` → retained-identity recheck sequence in `claude-detect.ts:86-122,194-241,243-320`. Pin compatibility to exactly 1.14.25 and keep browser-visible auth/billing unknown.
- `opencode-profile.ts` should copy task/context validation and defensive spec construction from `claude-profile.ts:123-221`, but use a private OpenCode configuration, pure mode, a static `fsb` agent with default deny and final `fsb_*` allow, no model override, and no API-key fallback. Preflight the effective merged policy before spawn.
- Do not copy Claude CLI flags into OpenCode. Native arguments and configuration keys come from the pinned OpenCode 1.14.25 research sources and the schema-derived fixture.
- The static policy must remain narrower than a mutable/user config. Any merge ambiguity, unknown permission key, model override, or inherited user config fails before process spawn.

The registry is a closed complete set, not plugin discovery:

**`mcp/src/agent-providers/registry.ts:46-55,66-95`**

```typescript
const CANONICAL_IDS = Object.freeze([CLAUDE_CODE_ADAPTER_ID] as const);

function parseRegistrationId(id: string): AgentProviderId {
  if (id.length === 0 || id !== id.toLowerCase()) {
    throw new AdapterRegistryError('invalid_adapter_id', 'Adapter id must be canonical');
  }
  if (id !== CLAUDE_CODE_ADAPTER_ID) {
    throw new AdapterRegistryError('unknown_adapter_id', 'Unknown adapter id');
  }
  return id;
}
```

Expand that exact roster to `['claude-code', 'opencode']`, require both registrations, reject duplicates/unknown/case variants, and return the same immutable order everywhere. Do not loosen the parser to “any lowercase string.”

`mcp/src/platforms.ts` already has a distinct OpenCode MCP configuration entry (`platforms.ts:292-304`). Reuse it; do not create a second platform record as part of the agent adapter.

## 2. Supervisor-owned generic process topology

**Applies to:** `adapter.ts` topology types, `spawn-supervisor.ts`, `runtime-files.ts`, `serve-delegation.ts`, orphan recovery, supervisor, and topology tests.

**Primary analogs:** the existing `DelegationSpawnSupervisor` and `AgentRuntimeFiles` lifecycle.

The existing supervisor has the right authority boundary:

- construction injects spawn, kill-tree, clocks, timers, and runtime files (`spawn-supervisor.ts:730-819`);
- one run is registered before process authority is acquired (`859-921`);
- the journal is prepared before spawn and activated only after a child identity exists (`924-1008`);
- the child is spawned with `shell:false`, receives one stdin write, and is cleaned through the verified process-tree path (`1009-1062,1242-1345`);
- cancellation/failure races converge on exact-once settlement (`1630-1733`).

Preserve this order while interpreting the new topology generically:

```text
validate request + authoritative adapter
  → detect + compatibility/policy preflight
  → build and deeply freeze topology
  → resolve cold or reusable FSB-owned-server branch
  → journal intent before each spawn
  → spawn with shell:false and activate verified identity
  → write task only to task-child stdin, then EOF
  → normalize events while retaining a result candidate
  → await child close and verify clean exit
  → terminate/verify the task tree
  → publish one authoritative result or one terminal failure
  → release server lease; bounded idle teardown when no lease remains
```

The supervisor currently publishes the parser's retained result at stream completion:

**`mcp/src/agent-providers/spawn-supervisor.ts:1152-1173`**

```typescript
if (event.type === 'result') {
  if (run.resultEvent) throw new Error('agent_protocol_drift');
  run.resultEvent = event;
} else {
  this.publishOrBuffer(run, event, payloadBytes);
}
// ...
if (!run.resultEvent) throw new Error('agent_protocol_drift');
this.publishOrBuffer(run, run.resultEvent, measureEventPayload(run.resultEvent));
```

Phase 64 must split “parser candidate” from “authoritative terminal.” Keep the first valid result candidate private through stream EOF, exit corroboration, and verified task-tree cleanup. Publish it only after a clean exit and settled tree. Non-zero exit, signal, parser error, trailing event, duplicate result, cleanup failure, timeout, or cancellation yields one failure/cancelled terminal instead.

### Owned-server lifecycle

There is no existing long-lived provider server to copy exactly, so build it from the same authority primitives:

- One server lease belongs to one daemon generation. It uses a loopback address, random port, and random Basic-auth secret minted by the supervisor; it is never supplied by wire input or taken from a user's environment.
- A fresh OpenCode session/task child is created for every delegation. Reusing the FSB-owned server does not mean reusing task/session state.
- Attach is opportunistic. Failed health/auth/ownership validation falls back to cold mode before a task child is spawned. Never retry from attach to cold after task side effects may have begun.
- Keep server state outside `activeRuns` but under the same supervisor close/recovery authority. Track lease count and bounded idle timer with injected clocks/timers so tests are deterministic.
- Kill/close order is task tree first, lease release second, idle/server tree last. Server teardown must be idempotent across close, timeout, spawn error, and daemon shutdown races.
- No supervisor branch may compare the provider id. It switches only on topology kind and process role.

### Runtime journal

`runtime-files.ts` already provides exact-key parsing, absolute-root containment, symlink/mode checks, serialized prepare/activate/remove operations, atomic writes, and generation-aware recovery (`runtime-files.ts:244-415,463-657,712-878,895-1062`). Extend that grammar rather than adding an OpenCode sidecar.

Recommended evolution:

- Version the journal and add a closed `runtimeKind: 'delegation' | 'provider_server'` (names discretionary).
- Parse legacy Phase 60 entries as `delegation` so upgrades remain recoverable.
- Keep exact keys; unknown keys, duplicate IDs, malformed identities, non-absolute paths, unsafe modes, and symlinks still fail closed.
- Add only a closed roster of files each runtime kind may own. The cleanup path currently accepts only the known `mcp-config.json` file (`runtime-files.ts:841-870`); expand it with exact OpenCode-private filenames rather than accepting arbitrary adapter paths.
- Recovery may kill a confirmed stale `provider_server` tree, but must not emit `daemon_restart_lost_run` for that server journal. Delegation entries retain current lost-run reporting.
- Same-generation ambiguity remains fail-closed. Never kill a process whose retained identity cannot be proven.

`serve-delegation.ts:172-211` and `diagnostics.ts:490-598` already iterate the registry/matrix. Plan tests first; modify them only where a single-provider literal is exposed. This avoids unnecessary branching in otherwise generic code.

## 3. Strict parser state machine and closed compatibility/fixture registry

**Applies to:** `protocol-drift.ts`, `opencode-stream.ts`, `compatibility.ts`, both OpenCode fixture files, drift smoke and stream fixture tests, supervisor drift mapping.

**Primary analogs:** `claude-stream.ts` and the Claude 2.1.177 compatibility/fixture path.

The Claude parser demonstrates the correct structural boundary:

**`mcp/src/agent-providers/claude-stream.ts:193-233`**

```typescript
class ClaudeEventNormalizer {
  private sessionId: string | null = null;
  private terminalEvent: AgentEvent | null = null;

  normalize(rawEvent: RawClaudeEvent, eventIndex: number): readonly AgentEvent[] {
    if (this.terminalEvent) {
      throw new AgentProtocolDriftError(
        rawEvent.type === 'result' ? 'duplicate_result' : 'event_after_result',
        eventIndex,
      );
    }
    // closed native-event dispatch
  }

  finish(nextEventIndex: number): AgentEvent {
    if (!this.terminalEvent) {
      throw new AgentProtocolDriftError('missing_result', nextEventIndex);
    }
    return this.terminalEvent;
  }
}
```

Its byte parser also provides fatal UTF-8 decoding, per-line/stream byte caps, strict JSON parsing, schema validation, and chunk-boundary invariance (`claude-stream.ts:312-385`). Copy those mechanics, not its Claude-native event labels.

OpenCode needs an explicit multi-step machine. A suitable planning model is:

| State | Accepted input | Effect |
|---|---|---|
| awaiting session/step | exact pinned session/step-start shape | establish immutable session identity and enter active step |
| active step | exact assistant/tool delta/use/result shapes | emit bounded normalized nonterminal events; reject session/step mismatch |
| active step | `step_finish` with tool-calls or unknown continuation reason | emit no terminal result; allow the next step |
| active step | first `step_finish` with any other schema-approved completion reason | retain exactly one normalized result candidate |
| candidate retained | EOF only | return the candidate to the supervisor; later/duplicate native events drift |
| any state | unknown type/key, invalid JSON/UTF-8, overflow, illegal transition | throw bounded `AgentProtocolDriftError` |

“Unknown continuation reason” here is the explicitly researched OpenCode continuation value, not permission to accept arbitrary strings. Raw schemas remain exact and closed. `step_finish` is not automatically terminal: tool-call/unknown continuation must allow the next step. The first other candidate is retained; success becomes authoritative only in the supervisor after clean exit and tree settlement.

Move provider-neutral drift shape/error mechanics out of `claude-stream.ts` so `spawn-supervisor.ts` no longer imports a Claude parser module (`spawn-supervisor.ts:20`). Keep provider-specific closed reason-to-expected tables either registered by canonical id or exported as immutable metadata; never use raw exception text in extension diagnostics.

The compatibility implementation already enforces descriptor-safe exact objects, dense arrays, bounded strings, a matrix-to-fixture path, and runtime status classification (`compatibility.ts:70-176,212-345,395-513`). Add one exact row:

- adapter id `opencode`;
- version/profile `1.14.25` only;
- exact capabilities from the adapter contract;
- exact normalized event sequence expected from the new schema-derived fixture;
- fixture directory `tests/fixtures/agent-streams/opencode-1.14.25/`;
- `liveCapturePending: true` until authenticated/browser evidence is completed at milestone end.

The existing manifest is the direct metadata analog:

**`tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json:1-32`**

```json
{
  "schemaVersion": 1,
  "adapterId": "claude-code",
  "profileVersion": "2.1.177",
  "provenance": {
    "sanitized": true,
    "liveCapturePending": true
  },
  "terminalEvent": "result"
}
```

Copy its exact manifest shape, sanitization declaration, pinned public source URLs, expected native/normalized sequences, and milestone capture task. Do not invent a “live” capture, credentials, or browser evidence during implementation.

`tests/mcp-agent-drift-smoke.test.js` currently assumes Claude-native `system/init` selectors and mutations (`32-57,75-153,206-332`). Replace those hard-coded fixture semantics with a closed immutable fixture-contract table keyed by exactly `claude-code` and `opencode`. Each entry owns:

- required provenance fields;
- native label extraction;
- expected native order;
- adapter-specific negative mutations;
- normalized sequence and terminal expectation.

Then assert the bijection:

```text
production registry ids
  = compatibility matrix ids
  = fixture-contract ids
  = fixture manifest ids
  = shipped extension compatibility ids
```

Do not make OpenCode pretend to emit Claude labels merely to share a test helper. Shared code should be the loop and assertions; native selectors remain closed per adapter.

## 4. Provider-neutral extension identity through the existing UI

**Applies to:** all extension production files and extension tests/fixtures in the classification tables.

**Primary analog:** the current Claude delegation pipeline, generalized around the already-present OpenCode Providers row.

`providers-panel.js` already contains an OpenCode definition and links (`providers-panel.js:13-17,58-129`). Its compatibility projection is the actual dormant gate: it currently marks non-Claude adapters unsupported (`288-327`). Promote OpenCode by changing shipped compatibility membership, not by adding a second panel or CSS branch. `platforms.ts` and the provider panel already distinguish MCP configuration metadata from delegation adapter support.

Create one descriptor-safe, deeply frozen provider metadata table for browser code, conceptually:

```javascript
const DELEGATION_PROVIDERS = Object.freeze({
  'claude-code': Object.freeze({
    id: 'claude-code',
    label: 'Claude Code',
    billingKind: 'subscription',
  }),
  opencode: Object.freeze({
    id: 'opencode',
    label: 'OpenCode',
    billingKind: 'unknown',
  }),
});
```

Exact copy and field names should follow current UI text and tests. Required behavior:

- only exact canonical IDs are accepted; case variants and arbitrary lowercase strings fail;
- OpenCode auth and billing stay unknown/“Not reported” because the daemon has no authoritative evidence;
- metadata is captured into each run at acceptance time and does not drift when settings change later;
- compatibility snapshots contain only bounded status/capability/provenance fields, never executable paths, versions not explicitly allowed by the wire contract, Basic-auth secrets, environment, argv, or raw errors.

Use this table in `delegation-preflight.js` (`4-16,27-105`), `delegation-consent.js` (`4-23,235-420`), `delegation-event-store.js` (`227-405`), `delegation-controller.js` (`90-195`), `delegation-feed.js` (`106-127,270-312`), and drift diagnostics (`6-30,127-173`). Remove duplicated single-Claude constants rather than adding adjacent OpenCode conditionals.

### Preserve authoritative routing

The start message must remain provider-free. `background.js:1559-1593` rereads the authoritative saved selection and performs preflight; `1736-1780` binds consent to that result. Keep this ordering:

```text
sidepanel supplies task/intent
  → background rereads saved provider
  → preflight validates shipped compatibility
  → consent/trust binds canonical provider + task digest
  → background sends adapterId to the local daemon
  → accepted run stores immutable provider metadata
```

Do not add an adapter id to the sidepanel request and do not trust request-side provider identity. Replace hard-coded Claude context in `background.js:1783-1826,1906-2035,2135-2170` with the authoritative metadata captured above.

### Preserve event and rendering contracts

`delegation-controller.js` documents and implements append-before-fanout (`4-10,546-591`). The event store intentionally treats a `result` as still running until an explicit terminal transition (`delegation-event-store.js:293-319`). Both properties are important now that the MCP supervisor buffers result candidates:

```text
accepted MCP event
  → append canonical durable entry
  → reduce/hydrate store state
  → notify subscribers
  → explicit completed/failed/cancelled terminal closes the run
```

Keep consent challenges one-time and provider-bound; trust records for Claude and OpenCode must be isolated. Keep drift throttling isolated per provider. Persist only canonical provider metadata, never raw server/process material.

`delegation-feed.js:303-312` already renders with `textContent`/`createTextNode`, and `sidepanel.js:1934-2085` already owns the reusable lifecycle surface. Substitute data-driven provider labels and billing copy into existing nodes. Per `64-UI-SPEC.md`:

- no new panel, renderer, layout, HTML structure, or CSS;
- no OpenCode-specific lifecycle branch;
- keep long identifiers truncated with the existing full-value affordance;
- keep status understandable through text/iconography, not color alone;
- hydrate persisted state silently and avoid replaying announcements.

`options.js:602-657` already merges all compatibility rows but reports failures through a Claude-only check. Generalize the summary over the shipped closed roster while retaining the same markup.

## 5. Guarded build and deterministic verification

**Applies to:** every implementation/test plan, `run-phase64-full-tests.mjs`, its optional harness, `package.json`, and `ci.yml`.

**Primary analogs:** `scripts/run-mcp-build-preserving-workspace.mjs` and `scripts/run-phase60-full-tests.mjs`.

The repository is dirty before Phase 64 begins. At mapping time, `git status --short` contained 403 `.planning` entries and these four non-planning paths:

- `mcp/build/index.js`
- `showcase/angular/public/llms-full.txt`
- `showcase/angular/public/llms.txt`
- `showcase/angular/public/sitemap.xml`

Those are user/pre-existing state, not cleanup targets. Plans must never use reset/checkout/clean to “prepare” the tree and must not normalize or overwrite those paths.

The existing wrapper snapshots file bytes, modes, symlinks, status, staged/unstaged patches, untracked files, and raw index entries before building (`run-mcp-build-preserving-workspace.mjs:21-65,83-137,208-323`). It runs subprocesses with `shell:false` (`369-399`), restores the build tree and unrelated dirty/index state in `finally`, and fails if identity differs (`419-573`).

All focused commands that compile MCP must go through it:

```bash
node scripts/run-mcp-build-preserving-workspace.mjs \
  --commands-json '[["node","tests/mcp-opencode-adapter.test.js"]]'
```

The full baseline gate required by `64-VALIDATION.md` remains:

```bash
node scripts/run-mcp-build-preserving-workspace.mjs \
  --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'
```

Do not run bare `npm --prefix mcp run build` as a Phase 64 verification command in this workspace. If a new Phase 64 root runner needs a build, invoke the runner as the wrapper payload or make the runner itself call the existing wrapper once; do not copy its restoration logic into another script.

`run-phase60-full-tests.mjs:476-777` is the runner analog: stable workspace/index snapshot, serial `shell:false` commands, bounded output, restoration, and one final verdict. The Phase 64 runner should add the new adapter, topology, extension, compatibility, and UI tests in deterministic order. `package.json` and CI should invoke each suite exactly once; keep the drift smoke's source pin that verifies a single CI entry.

Verification plans should explicitly include:

1. exact five-method source/shape gate and closed two-provider registry;
2. deep immutability of every topology branch;
3. private config/pure mode/default-deny + final `fsb_*` allow and forbidden-bypass source scan;
4. cold default, owned-server attach, invalid-owner/auth fallback before task spawn, per-task fresh session, lease race, idle teardown, daemon close, and orphan recovery;
5. multi-step continuation, first candidate retention, duplicate/trailing drift, chunk invariance, malformed/oversized input, non-zero exit after candidate, and exact-once terminal settlement;
6. matrix/fixture/registry/browser roster bijection for Claude 2.1.177 and OpenCode 1.14.25;
7. provider-bound consent/trust, authoritative background routing, persisted provider identity, append-before-fanout, unknown billing/auth copy, and no new UI structure;
8. guarded focused suites, guarded Phase 60 baseline, root `npm test`/CI membership, and before/after dirty-worktree identity.

Authenticated live capture and browser evidence are explicitly `human_needed` milestone-end work. A deterministic schema-derived fixture with pinned provenance and `liveCapturePending: true` is the implementation gate; lack of credentials must not block Phase 64 code/test planning.

## Shared Patterns

### Exact records and closed rosters

**Sources:** `registry.ts:46-95`, `compatibility.ts:70-176`, `mcp-agent-providers.js:25-166`  
**Apply to:** provider IDs, topology discriminators, compatibility rows, fixture contracts, drift reasons, runtime journal kinds, consent/trust records.

Accept own data properties only, reject accessors/prototype tricks/unknown keys, require dense bounded arrays, and compare complete closed sets. Never replace a one-provider literal with an open string.

### Authority stays in the supervisor/background

**Sources:** `claude-code.ts:31-35`, `spawn-supervisor.ts:730-819`, `background.js:1559-1593`  
**Apply to:** process creation, server ownership, secret minting, adapter selection, consent.

Adapters describe; the supervisor spawns/kills/journals. The sidepanel requests; the background reads authoritative settings and authorizes. This is the central boundary to preserve.

### Immutable identity at acceptance

**Sources:** `adapter.ts:111-121`, `delegation-controller.js:90-195`, `delegation-event-store.js:227-245`  
**Apply to:** SpawnSpec/topology, detection identity, compatibility rows, run provider metadata, stored snapshots.

Reconstruct and deeply freeze values at module boundaries. Do not retain mutable caller objects or recompute a run's provider from current settings.

### Candidate versus authoritative terminal

**Sources:** `claude-stream.ts:193-233`, `spawn-supervisor.ts:924-1062,1152-1173`, `delegation-event-store.js:293-319`  
**Apply to:** OpenCode parser, supervisor, controller/store.

The parser decides protocol completeness and yields one candidate. The supervisor decides process success. The browser closes only on an explicit canonical terminal entry.

### Persist before publish

**Sources:** `spawn-supervisor.ts:924-1008`, `delegation-controller.js:4-10,546-591`  
**Apply to:** process journals and browser events.

Record recoverable state before acquiring/publishing authority. Journal before spawn/activation; append before fanout.

### Bounded, sanitized failures

**Sources:** `claude-stream.ts:96-154,312-385`, `spawn-supervisor.ts:579-626`, `agent-protocol-drift-diagnostics.js:38-173`  
**Apply to:** both parsers, MCP terminal details, browser diagnostics.

Use closed reason/expected labels, bounded indices/paths, and provider id. Never forward raw native events, exception messages, paths, argv, environment, auth material, or stream fragments.

### Existing UI primitives only

**Sources:** `providers-panel.js:58-129,288-350`, `delegation-feed.js:303-312`, `sidepanel.js:1934-2085`  
**Apply to:** OpenCode Providers row and delegation lifecycle.

Data-drive existing rows and copy. Do not add markup/CSS merely because a second provider exists.

### Preservation-aware commands

**Sources:** `run-mcp-build-preserving-workspace.mjs:83-137,208-323,419-573`, `run-phase60-full-tests.mjs:476-777`  
**Apply to:** every plan verification block that compiles MCP or runs broad suites.

The command is successful only if tests pass and the pre-existing workspace/index identity is restored.

## No Analog Found

Every proposed file has at least a role-match analog. Three Phase 64 behaviors have no exact existing implementation and must follow `64-RESEARCH.md`/`64-CONTEXT.md` rather than extrapolating provider details:

| Target file/concern | Role | Data flow | Missing exact analog / planning constraint |
|---|---|---|---|
| `mcp/src/agent-providers/opencode-stream.ts` native grammar | streaming state machine | OpenCode multi-step JSON → normalized events | No OpenCode raw fixture/parser exists. Reuse Claude's strict byte/state mechanics only; derive exact native shapes and continuation semantics from pinned 1.14.25 sources. |
| `spawn-supervisor.ts` + `runtime-files.ts` owned-server lease | lifecycle/recovery | daemon-owned server ↔ per-task children | Existing runs are single task processes. Reuse supervisor/journal authority, but explicitly plan generation ownership, auth/loopback checks, lease races, idle teardown, and server-specific recovery. |
| `opencode-profile.ts` effective permission preflight | security configuration | private policy → effective deny/allow verdict | Claude has a static agent file but not OpenCode's config merge semantics. Use the researched OpenCode schema; fail closed on ambiguity and never inherit user config/model/API-key fallback. |

## Metadata

**Analog search scope:** `mcp/src/agent-providers/`, MCP diagnostics/inventory/platform registry, `extension/utils/`, `extension/ui/`, `extension/background.js`, `tests/`, `scripts/`, root package/CI configuration.  
**Representative files deeply analyzed:** 35 source, fixture, test, and runner files, plus the four Phase 64 inputs and pattern-mapper contract.  
**Pattern extraction date:** 2026-07-20  
**Coverage:** 48 files with an exact/self or sibling analog; 6 files with a role-match analog; 0 files without any analog.  
**Planner caution:** “verification-only” files should not receive speculative edits. Write a failing test or find a concrete hard-coded assumption before changing already-generic production code.
