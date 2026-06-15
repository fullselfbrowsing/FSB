# Technology Stack — v0.11.0 Trigger Tool (Reactive DOM Monitoring)

**Project:** FSB (Full Self-Browsing)
**Milestone:** v0.11.0 — `trigger` tool family (reactive DOM monitoring)
**Domain:** Reactive DOM-monitoring tool family for an AI Chrome MV3 extension + MCP server
**Researched:** 2026-06-15
**Confidence:** HIGH

> **Note:** This file supersedes the prior v0.9.69 STACK research (telemetry pipeline). The earlier
> v0.9.69 notes are recoverable from git history / the v0.9.69 milestone archive.

---

## Executive Summary

> **TL;DR — Zero new runtime dependencies.** Every capability the `trigger` tool family needs is
> already satisfied by APIs FSB ships with (MV3 platform APIs, the MCP SDK, vanilla JS) or by
> machinery FSB already built (the `run_task` lifecycle, the resume-sidecar, `chrome.alarms`, the
> Lattice survivability adapter, the orange-glow Shadow-DOM overlay). The "additions" in this
> milestone are **new source files that compose existing primitives**, not new packages.

The only genuinely new building blocks are two platform built-ins FSB does not yet use in a watcher
role — `MutationObserver` (already imported by content scripts for other purposes) and a tiny pure-JS
numeric/currency parser (`Intl.NumberFormat().formatToParts()` + regex). Neither has an install
footprint. The MCP SDK (`^1.29.0`), `zod` (`^3.24.0`), and `@full-self-browsing/lattice` (`1.3.0`)
are all already present **and current** — `npm view` confirms 1.29.0 is still `latest` as of
2026-06, so the milestone requires **no SDK upgrade** (protects INV-01). The extension runtime has
only two dependencies today (`axios`, `lattice`); this milestone keeps it that way.

The blocking-mode reporting, SW-eviction survival, and shared-registry plumbing are all
**generalizations of patterns already shipped for `run_task`** (Phase 239) and the v0.10.0 Lattice
survivability work — not new infrastructure.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Chrome MV3 platform APIs (`chrome.alarms`, `chrome.storage.session`/`local`, `chrome.tabs`, `chrome.scripting`) | Chrome >=120 (manifest declares `>=88`; the alarms-floor + SW-revival behavior is a Chrome 120 guarantee) | Survival + scheduling + tab-ownership + script-injection substrate for both watch mechanisms | Built into the runtime and **already permissioned** in `extension/manifest.json` (`alarms`, `storage`, `tabs`, `scripting`, `offscreen`). No new permission. The 30s alarm floor (Chrome 120, Dec 2023) was explicitly introduced to align with the SW idle-eviction window — it is the canonical MV3-survival timer. |
| `MutationObserver` (Web API) | Built-in (all MV3 Chrome) | `live-observe` watch mechanism — observe ONE element in place on live-updating pages (crypto ticker) with no reload | Standard, push-based (no polling CPU cost). FSB content scripts already import it (`dom-stream.js`, `dom-state.js`, `actions.js`, `visual-feedback.js`), so observe-options, teardown discipline, and isolated-world considerations are already proven in-tree. |
| `@modelcontextprotocol/sdk` | **^1.29.0 — current `latest`, NO bump** | Register `trigger`, `stop_trigger`, `get_trigger_status`, `list_triggers`; emit `notifications/progress` heartbeats in blocking mode | Already pinned in `mcp/package.json`. `npm view @modelcontextprotocol/sdk version` → `1.29.0` (latest dist-tag) as of 2026-06, so no upgrade is needed — directly protects INV-01. The blocking heartbeat + return-on-fire pattern reuses the SAME `notifications/progress` + `_meta` envelope `run_task` already emits (`mcp/src/tools/autopilot.ts`). |
| Vanilla JS (ES2021+) + JSON-Schema shared tool registry | n/a (existing convention) | Trigger tool defs live in `extension/ai/tool-definitions.js`; autopilot + MCP both consume it | INV-02 mandates one shared registry. `tool-definitions.js` is the canonical source (copied to `ai/tool-definitions.cjs` at MCP build time, bridged via `mcp/src/tools/schema-bridge.ts`). Appending tools here is purely additive and gives both surfaces parity automatically. |
| `chrome.storage.session` (+ `chrome.storage.local` only for cross-restart durability) | Built-in | Persist per-trigger state so the watcher survives SW eviction | This IS the resume-sidecar substrate FSB already uses for `run_task` (`extension/utils/mcp-task-store.js`) and the Lattice survivability adapter (`extension/ai/lattice-runtime-adapter.js`). Reuse the same versioned-envelope pattern (see Integration Points). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **(new in-tree module, 0 deps)** `extension/utils/value-extractor.js` | new file | Smart value extraction + numeric/currency parsing (`$1,234.56`, `1.234,56 €`, `₿0.05`, `45%`) → comparable numbers | New file but **no npm package**. Use `Intl.NumberFormat().formatToParts()` to *discover* locale group/decimal separators, then normalize-then-`parseFloat`. Pure JS, ~60 lines. See "Numeric/Currency Extraction." |
| `@full-self-browsing/lattice` | 1.3.0 (pinned, **do not touch** — INV-06) | `SurvivabilityAdapter<TState>` contract, step markers, Capability Receipts | Already consumed via the `lattice` alias. `createFsbLatticeRuntimeAdapter()` (`extension/ai/lattice-runtime-adapter.js`) implements the contract over `chrome.storage.session`. Trigger state *can* ride this adapter, but a thinner dedicated sidecar (clone of `mcp-task-store.js`) is the lower-coupling default — see "MV3 Survival." |
| `zod` | ^3.24.0 (installed 3.25.76 — **stay on v3**) | MCP-side input validation for the new tool params | Already in `mcp/package.json`. `schema-bridge.ts` `jsonSchemaToZod()` (which the new tools' JSON Schemas flow through automatically) uses zod-3 APIs (`z.preprocess`, `z.coerce.number().finite()`, `z.enum`). **Do NOT introduce zod 4** (4.4.3 exists) — forking the validation layer risks the byte-identical wire contract. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsc` + `esbuild` | Build the MCP server (`tsc`) and the offscreen Lattice host (`esbuild`) | No change. Extension runtime stays build-free (raw JS via `importScripts`). New trigger content logic ships as plain JS like every other content module. |
| `cp ../extension/ai/tool-definitions.js ai/tool-definitions.cjs` (existing `mcp build` step) | Propagates the shared registry into the MCP build | Already wired in `mcp/package.json` `build`. Adding trigger tools to `tool-definitions.js` flows through automatically — no new build wiring. |
| Node test harness (`node tests/*.test.js`) | Contract / lifecycle / parity tests | Mirror `tests/tool-definitions-parity.test.js` (registry parity), `tests/mcp-tool-routing-contract.test.js`, `tests/mcp-in-flight-session-lookup.test.js` (sidecar lookup), `tests/lattice-survivability-smoke.test.js`, `tests/mcp-numeric-param-coercion.test.js`. New trigger tests slot into the same `npm test` chain. |

## Installation

```bash
# Core
# (nothing — MCP SDK / zod / lattice already present AND current)

# Supporting
# (nothing — MutationObserver, chrome.alarms, chrome.storage are platform built-ins)

# Dev dependencies
# (nothing — tsc / esbuild / node-test harness already configured)

# The ONLY filesystem additions are NEW SOURCE FILES (no package.json change):
#   extension/utils/value-extractor.js     # pure-JS numeric/currency parser
#   extension/utils/trigger-store.js        # chrome.storage.session sidecar (clone of mcp-task-store.js)
#   extension/content/trigger-observer.js   # per-trigger MutationObserver wrapper, isolated world
#   mcp/src/tools/trigger.ts                # registers the 4 new MCP tools (mirrors autopilot.ts)
#   + trigger entries appended to extension/ai/tool-definitions.js (shared registry)
```

> **Net package.json delta for this milestone: ZERO.** `fsb-mcp-server` still bumps (likely
> `@0.10.0`) for the new tool surface, but its `dependencies` block is unchanged.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `MutationObserver` for `live-observe` | `setInterval` re-read of the element in the page | Only as a *fallback* when a value updates via `<canvas>` repaint or a property that fires no DOM mutation (rare). For `live-observe`, MutationObserver is correct; for `refresh-poll` the interval lives in the SW (`chrome.alarms`), not the page. |
| `chrome.alarms` (>=30s) for the refresh-poll loop | `setTimeout`/`setInterval` chain in the SW | Use `setTimeout` ONLY for sub-30s sequencing *while the SW is provably alive* (e.g. fan-out within a single alarm wake). For the standing hours-long poll loop, alarms are mandatory — `setTimeout` dies with the SW at 30s idle (exactly why `mcp-bridge-client.js:24` notes "the alarms API minimum delay is 30s"). |
| Dedicated `trigger-store.js` sidecar (clone of `mcp-task-store.js`) | Route trigger state through Lattice `createFsbLatticeRuntimeAdapter()` | Use the Lattice adapter if you also want the ResumePolicy taxonomy (`SAFE`/`ON_ERROR_*`/`RECOVERY_AMBIGUOUS`) + step markers for free. For a notify-only watcher whose "recovery" is just "re-read the element," the lighter dedicated sidecar is less coupling and matches the proven `run_task` pattern. **Recommend the dedicated sidecar; flag the adapter as an option in the roadmap.** |
| `Intl.NumberFormat().formatToParts()` separator discovery + regex normalize | A currency-parsing npm package (`currency.js`, `numeral`, `dinero.js`) | Never, this milestone — see "What NOT to Use." The built-in covers `$`, `€`, `£`, `¥`, `%`, and locale-swapped `.`/`,` grouping. Crypto glyphs (`₿`, `Ξ`) are not ISO-4217 currencies and fall to the generic symbol-strip path, not `Intl`. |
| `server.tool(name, desc, zodShape, handler)` (SDK 1.x classic signature) | `server.registerTool(name, {description, inputSchema}, handler)` (newer docs form) | The newer `registerTool` form appears in current SDK docs, but **FSB's entire MCP surface uses the classic `server.tool()` form** (`autopilot.ts`, `manual.ts`, `visual-session.ts`). Match the existing form for consistency and an additive diff. Both are supported in 1.29.0. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Any npm currency/number-parsing lib** (`currency.js`, `numeral.js`, `dinero.js`, `accounting.js`) | Violates the zero-dep bias for a ~60-line problem; adds supply-chain + weight to a runtime with only 2 deps (`axios`, `lattice`). FSB has NO existing currency helper (confirmed: no `formatToParts`/`Intl.NumberFormat` usage anywhere in `extension/`), so there is no precedent to extend. | New pure-JS `value-extractor.js` using `Intl.NumberFormat().formatToParts()` + regex. |
| **SW keepalive antipatterns** — long-lived `chrome.runtime.connect` heartbeat ports, dummy `setInterval` API pings to dodge eviction, `getPlatformInfo()` spam, "offscreen doc kept open solely to stay alive" | Google explicitly discourages these; they drain battery, can trip Web Store review, and Chrome actively closes long-lived ports. The MV3 design intent is *let the SW die and be revived by events* — FSB's `run_task` survival already proves the event-revival model works. | Let the SW die. Re-arm a `chrome.alarms` period (>=30s); the alarm event revives the SW, the handler re-reads trigger state from `chrome.storage.session`, runs one poll tick, persists, and lets the SW idle out again. |
| **`setTimeout`/`setInterval` as the *standing* watch loop in the SW** | Cleared when the SW is evicted at 30s idle — the watcher silently dies after ~30s. | `chrome.alarms` for the periodic loop; `setTimeout` only for transient within-wake sequencing. (INV-04 keeps the `agent-loop.js` setTimeout *iterator* frozen — that's a different, in-flight-only use and is untouched.) |
| **Alarm periods < 0.5 min** | Chrome 120+ ignores `periodInMinutes`/`delayInMinutes` below 0.5 and logs a warning; the alarm fires no sooner than 30s regardless. | Treat 30s as the hard floor for refresh-poll. PROJECT.md's ~60s default is well clear of it. Document the floor in the tool schema so callers don't expect 5s polling. |
| **`chrome.storage.local` for hot per-tick trigger state** | `local` persists across restart (good for the durable *definition*) but shares a 10MB quota with everything and is slower; churning per-tick heartbeats there wastes quota. | `chrome.storage.session` for live/hot state (mirrors `mcp-task-store.js`, `mcpBridgeState`, agent registry). Optionally mirror only the durable *definition* to `local` if triggers must survive a full browser restart (a roadmap decision, not a default requirement). |
| **`zod@4.x`** (4.4.3 is published) | `schema-bridge.ts` and all existing tool registrations are written against zod-3 (`z.preprocess`, `z.coerce.number().finite()`, `z.enum`). Mixing zod 4 risks number-coercion drift → INV-01 wire-contract risk. | Stay on `^3.24.0`. |
| **Re-implementing receipts / checkpoints / step-markers inside FSB** | INV-06 — those primitives belong to Lattice. | Consume `lattice-runtime-adapter.js` / the Lattice step emitter if wanted; otherwise the dedicated sidecar is sufficient. |
| **`MutationObserver` in the MAIN world for value reads** | FSB's only MAIN-world script is `canvas-interceptor.js`; a MAIN-world observer is exposed to page tampering and breaks isolation. | Run the trigger observer in the **isolated world** (default content-script world), reading `textContent`/`.value`/attribute via the same selector machinery FSB already uses. |
| **Relying on `chrome.alarms` `persistAcrossSessions: true`** | The flag is Chrome 150+ only and unsupported in other browsers. | Use the recommended pattern: recreate the trigger alarm(s) on SW startup from the persisted sidecar definitions. |

## Stack Patterns by Variant

**If watch mechanism = `live-observe` (crypto ticker, live page):**
- Inject (or reuse the already-injected) content script in the **isolated world**; create one `MutationObserver` scoped to the single resolved element (or its closest stable ancestor when the element itself gets replaced).
- `observe(target, { childList: true, characterData: true, subtree: true, attributes: <only when extract=attribute> })`. `characterData` + `subtree` is required to catch text-node value changes (a price `<span>` whose text node mutates); `attributes` only when watching an attribute, with `attributeFilter: [attrName]` to cut noise.
- **Debounce** the callback (trailing, ~150–300ms via in-page `setTimeout`) — tickers fire dozens of mutations/sec; debounce coalesces them into one value read + one fire-condition evaluation.
- On fire, message the SW (the existing content↔SW dispatcher) so the SW resolves the blocking `trigger()` call or updates the detached sidecar. **The SW, not the page, owns the trigger result** — the page can be evicted/navigated.
- **Teardown discipline (leak avoidance):** always `observer.disconnect()` on `stop_trigger`, on navigation (`pagehide`/`beforeunload`), on tab close, and when a one-shot condition fires. Track observers in a per-tab map so re-injection doesn't orphan a prior observer (mirrors `dom-stream.js`).

**If watch mechanism = `refresh-poll` (Amazon listing, static page):**
- The loop lives in the **SW driven by `chrome.alarms`** (NOT a page observer). Period default ~60s, hard floor 30s.
- On each alarm wake: resolve the trigger's **own tab** via the v0.9.60 agent-scoped tab resolver (never `tabs.query({active:true})` — must not steal focus, per PROJECT.md "Refresh-poll must own its tab"); reload that tab in the background; await load; re-read the element via the selector; evaluate the fire condition; persist the new snapshot to `chrome.storage.session`; re-arm / idle.
- Because the alarm *revives the evicted SW*, this loop survives indefinitely with zero keepalive. This is the generalization of the `run_task` SW-eviction `partial_state` pattern (Phase 239) into a standing watcher, exactly as PROJECT.md describes.

**If reporting mode = blocking (default):**
- Mirror `run_task` exactly (`mcp/src/tools/autopilot.ts`): the `trigger()` handler holds open, emits `notifications/progress` heartbeats (~30s, matching the existing cadence) carrying trigger state under `params._meta`, and returns on fire OR timeout. On SW eviction mid-watch, resolve with the documented `sw_evicted` + `partial_state` envelope read back from the sidecar (same recovery path as `run_task`).
- Apply a configurable timeout with a safety ceiling; recommend auto-suggesting detached mode beyond a few minutes (PROJECT.md guidance).

**If reporting mode = detached (opt-in):**
- Return `{ trigger_id }` immediately; the caller polls `get_trigger_status`. State lives in the sidecar so polling survives SW evictions and reconnects (mirrors `get_task_status`).

## Integration Points (where the new code attaches to existing FSB machinery)

| Need | Existing FSB asset to reuse | File |
|------|------------------------------|------|
| Shared tool registry (INV-02) | `TOOL_REGISTRY` + `withVisualSessionFields()`; tools are plain JSON-Schema objects with `_route`/`_readOnly` metadata | `extension/ai/tool-definitions.js` |
| MCP registration (INV-01 additive) | `server.tool()` calls + `jsonSchemaToZod()` auto-conversion + `PARAM_TRANSFORMS` | `mcp/src/tools/autopilot.ts` (template), `mcp/src/tools/schema-bridge.ts` |
| Blocking lifecycle + heartbeats + `sw_evicted` recovery | `run_task` onProgress → `notifications/progress` with `_meta`; `Bridge disconnected` → `mcp:get-task-snapshot` → `partial_state` | `mcp/src/tools/autopilot.ts`; `extension/ws/mcp-bridge-client.js` (30s heartbeat ticker ~line 1007) |
| SW-survivable periodic loop | `chrome.alarms.onAlarm` dispatcher with named-alarm routing (`mcpVisualDeath:<tabId>`, `fsb-telemetry-beat`, `fsb-domstream-watchdog`) | `extension/background.js:13284` |
| Per-trigger persisted state (resume sidecar) | Versioned `{v, records:{[id]:{...}}}` envelope, best-effort try/catch, empty-map-removes-key discipline | `extension/utils/mcp-task-store.js` (clone → `trigger-store.js`) |
| Optional Lattice survivability adapter | `createFsbLatticeRuntimeAdapter({sessionId})` over `chrome.storage.session`; ResumePolicy taxonomy | `extension/ai/lattice-runtime-adapter.js` |
| Own-tab resolution without focus theft | v0.9.60 agent-scoped tab resolver + background-tab default | `mcp/src/agent-scope.ts`; `extension/utils/agent-tab-resolver.js` |
| "Analyzing pulse" visual feedback | `HighlightManager` orange-glow box-shadow + Shadow-DOM overlay (`attachShadow`), `@keyframes`, reduced-motion compliance, `ViewportGlow` state machine (`state-thinking`) | `extension/content/visual-feedback.js` (glow ~line 72, keyframes ~line 552, viewport-glow states ~line 1100) |
| MCP numeric param coercion (caller passes threshold as a string) | `z.preprocess(v => v===''?NaN:v, z.coerce.number().finite())` already handles Claude-Code's stringified numbers | `mcp/src/tools/schema-bridge.ts` (covered by `tests/mcp-numeric-param-coercion.test.js`) |

## Numeric/Currency Extraction — pure-JS recipe (no dependency)

For `extract: number` (and `threshold`/`equals` auto-parse), the robust zero-dep approach:

1. **Discover locale separators** with the built-in: `new Intl.NumberFormat(locale).formatToParts(12345.6)` yields parts whose `type:'group'` value is the thousands separator and `type:'decimal'` value is the decimal separator. This disambiguates `1,234.56` (en-US: group `,`, decimal `.`) vs `1.234,56` (de-DE: group `.`, decimal `,`).
2. **Strip non-numeric noise:** remove currency symbols/letters/whitespace (`$ € £ ¥ ₿ Ξ`, `USD`/`EUR`, spaces, non-breaking spaces). Crypto glyphs are NOT ISO-4217 and won't appear in `Intl` currency parts — the generic symbol-strip catches them.
3. **Normalize to a JS-parseable form:** delete the discovered group separator, replace the discovered decimal separator with `.`, then `parseFloat`.
4. **Percentages:** detect a trailing `%`, parse the number, keep it raw (e.g. `45` for `45%`) and document it; do NOT silently divide by 100.

**Locale pitfalls to encode in tests:** ambiguous `1.234` (1234 in de-DE vs 1.234 in en-US — resolve via the trigger's locale, defaulting to the page's `document` locale or `navigator.language`); `1,234` symmetry; thin/non-breaking-space group separators (fr-FR uses `U+202F`/`U+00A0`); leading vs trailing symbol position; parenthesized negatives (`($1,234.56)`); signed deltas. For `changed`/`contains`, **do not parse** — compare raw `textContent` (PROJECT.md: raw text for `changed`/`contains`).

**Reading the element's "value" reliably (incl. after reload):**
- Read precedence by element type: form controls (`<input>`/`<textarea>`/`<select>`) → `.value`; everything else → `textContent` (trimmed); explicit `extract: attribute` → `getAttribute(name)`. Honor the `extract` override first when supplied.
- After a refresh-poll reload, **re-resolve the selector** (the prior element reference is dead post-navigation) using FSB's uniqueness-scored selector machinery before reading. Wait for load/stability (FSB already has `read_page` auto-stability + DOM-completion detection) so you don't read a pre-hydration placeholder.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@modelcontextprotocol/sdk@^1.29.0` | `zod@^3.24.0` | Current FSB pin; both stable as of 2026-06. The SDK's `server.tool()` third arg is a zod-3 shape record. Do not cross to zod 4. |
| `@modelcontextprotocol/sdk@1.29.0` | Node `>=18.20.0` (mcp pkg engine) / repo `>=24` | `schema-bridge.ts` uses `createRequire` + `fileURLToPath` fallback for Node 18 compat — already handled. |
| `chrome.alarms` 30s floor + SW revival | Chrome `>=120` | Manifest declares `chrome >= 88`, but the 30s floor + event-revival semantics are a Chrome 120 (Dec 2023) guarantee; by 2026 the install base is effectively all >=120. `persistAcrossSessions` is Chrome 150+ — do NOT rely on it; recreate alarms on SW startup. |
| `@full-self-browsing/lattice@1.3.0` | Node `>=24`, the `lattice` alias | Pinned + audited (INV-06). Not modified by this milestone. |
| New `trigger` tools in `tool-definitions.js` | autopilot loop + MCP server simultaneously | Additive-only — appending tools cannot alter existing tool schemas → satisfies INV-01. `tests/tool-definitions-parity.test.js` enforces both surfaces stay in sync. |

## Sources

- `/modelcontextprotocol/typescript-sdk` (Context7, v1.29.0) — `server.tool`/`registerTool`, `notifications/progress`, `_meta.progressToken`, long-running tool + `resetTimeoutOnProgress`/`maxTotalTimeout`. **HIGH**
- `npm view @modelcontextprotocol/sdk version` → `1.29.0`; `dist-tags.latest = 1.29.0`; `npm view zod version` → `4.4.3` — confirms FSB's SDK pin is current and zod 4 exists but is not the FSB line. **HIGH**
- https://developer.chrome.com/docs/extensions/reference/api/alarms — 30s/0.5-min minimum honored from Chrome 120; "at most once every 30 seconds but may delay"; no documented max-alarm count; `persistAcrossSessions` (Chrome 150+); "an alarm will not wake up a device." **HIGH**
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle — SW terminates "After 30 seconds of inactivity"; "Receiving an event or calling an extension API resets this timer"; "if the service worker has gone dormant, an incoming event will revive them." **HIGH**
- https://developer.chrome.com/blog/chrome-120-beta-whats-new-for-extensions — Chrome 120 lowered the alarm minimum to 30s specifically to align with the SW lifecycle. **HIGH**
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/formatToParts — `formatToParts()` exposes locale `group`/`decimal`/`currency` part types for reverse-parsing. **HIGH**
- FSB codebase (primary, authoritative for integration): `extension/ai/tool-definitions.js` (shared registry + `withVisualSessionFields`), `mcp/src/tools/autopilot.ts` (run_task lifecycle template), `mcp/src/tools/schema-bridge.ts` (JSON-Schema→zod + numeric coercion), `extension/utils/mcp-task-store.js` (resume-sidecar pattern), `extension/ai/lattice-runtime-adapter.js` (Lattice survivability adapter), `extension/background.js:13284` (alarm dispatcher), `extension/ws/mcp-bridge-client.js:24,1007` (30s heartbeat + "alarms minimum delay is 30s"), `extension/content/visual-feedback.js` (orange-glow Shadow-DOM overlay), `extension/manifest.json` (alarms/storage/scripting/offscreen already permissioned), root `package.json` (only `axios` + `lattice` runtime deps → zero-dep baseline). **HIGH**

---
*Stack research for: reactive DOM-monitoring `trigger` tool family (FSB MV3 extension + MCP server)*
*Researched: 2026-06-15*
