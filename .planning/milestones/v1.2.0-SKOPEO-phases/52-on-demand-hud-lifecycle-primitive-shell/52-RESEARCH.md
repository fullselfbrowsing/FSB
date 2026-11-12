# Phase 52: On-Demand HUD Lifecycle & Primitive Shell - Research

**Researched:** 2026-07-14
**Scope:** Planning evidence for HUD-01 through HUD-05, HUD-07, and HUD-08
**Overall confidence:** High for repository architecture and browser APIs; medium for live Drive/Docs focus and shortcut coexistence until Chrome UAT

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Invocation surface
- **D-01:** Skopeo starts off. Arbitrary pages do not activate it automatically, and no dormant in-page launcher, rail, mark, or other Skopeo residue remains while it is off.
- **D-02:** Put a dedicated Skopeo toggle inside the existing FSB side panel and expose a configurable Chrome command for direct invocation. The existing extension-toolbar click continues to open FSB's side panel; Phase 52 must not repurpose it.
- **D-03:** Invocation and active state are scoped to the current tab. The design reference's `Option+Space` gesture is the preferred shortcut where Chrome's command constraints permit it; planning may select and document a valid fallback while preserving configurability.

#### Primitive shell and visual priority
- **D-04:** Implement one shared contract for all six primitives: anchor mark, entity chip, halo, rail, ghost layer, and gate. Capability packs compose these primitives rather than introducing pack-specific chrome.
- **D-05:** Normal invocation initially renders only a compact ambient lens/edge-rail surface. The shell must not display all six primitives at once merely to demonstrate availability.
- **D-06:** Apply four attention levels: ambient, anchored, focused, and interstitial. Anchor marks and entity chips belong to anchored context; ghosting is temporary and focused; halos are scarce anomaly signals; gates are reserved for explicitly consequential moments.

#### Dismissal and universal kill
- **D-07:** A visible close control or a single `Escape` dismisses the topmost Skopeo surface and returns to the prior active attention level. Dismissing the ambient root returns the tab to off.
- **D-08:** Toggling Skopeo off or pressing `Escape` twice is the universal kill action for the current tab. It aborts in-flight Skopeo work, tears down the complete Skopeo session, and does not affect Skopeo sessions in other tabs or unrelated FSB automation.
- **D-09:** Kill establishes a monotonic terminal boundary for the ended session. Late async results, queued messages, timers, or observers from that session cannot recreate the HUD; a later explicit invocation starts a new session generation.

#### Accessibility and host integrity
- **D-10:** Use one dynamically injected Skopeo Shadow DOM shell with one lifecycle owner. Do not create a persistent host per primitive or extend an always-loaded page layer.
- **D-11:** The shell's outer geometry layer is viewport-fixed/top-layer-capable and pointer-transparent; only visible Skopeo controls accept pointer input. Render geometry overlays instead of applying persistent inline styles or layout mutations to host elements.
- **D-12:** Ambient and anchored states do not steal focus. Focused and interstitial surfaces manage focus deliberately, provide visible focus, and restore focus to the originating control or host target when closed.
- **D-13:** Hidden primitives leave both the rendered page and accessibility tree. Every supported state must expose usable names/roles, keyboard operation, screen-reader behavior, sufficient contrast, supported zoom behavior, and a reduced-motion treatment that removes nonessential effects.
- **D-14:** Teardown is idempotent and removes every Skopeo root, listener, observer, timer, animation, focus hook, pointer interceptor, temporary style, and pending render path without disturbing supported Drive/Docs controls or unrelated FSB state.

### The agent's Discretion
- Exact valid Chrome shortcut fallback and command naming when the preferred `Option+Space` chord cannot be declared by Manifest V3.
- Exact FSB-token-derived spacing, type scale, focus-ring geometry, motion timing, and reduced-motion substitutions, provided the supplied HUD reference and scarcity rules remain intact.
- Internal file/module boundaries, lifecycle state representation, and session-generation mechanism.
- The minimal demonstration fixtures used to prove each primitive and attention transition before semantic anchors arrive in Phase 53.

### Deferred Ideas (OUT OF SCOPE)
- Drive/Docs genre routing, semantic identity, and resilient content anchoring — Phase 53.
- Permission-scoped corpus enrollment and Drive source access — Phase 54.
- The bundled Chrome-local Graphify-style knowledge layer and all contract-specific intelligence — Phases 55-59.
- Cross-person notification delivery and additional webpage capability packs — future milestone scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research support |
|----|-------------|------------------|
| HUD-01 | Explicit stable-control or shortcut invocation; never automatic activation | Standard `chrome.commands` event plus side-panel control, on-demand `chrome.scripting.executeScript`, and a default-off per-tab controller |
| HUD-02 | Surface dismissal and a universal kill that cancels work and prevents resurrection | Per-tab monotonic generation, `AbortController`, terminal-state checks on both message endpoints, and idempotent teardown |
| HUD-03 | No visual, layout, listener, observer, focus, or interaction residue while off | One owned Shadow root, resource registry, no host mutation, and zero-residue contract tests |
| HUD-04 | Drive/Docs controls remain usable without shift, obstruction, or unrelated interception | Fixed top-layer geometry, `pointer-events: none` on the shell envelope, scoped event handling, and live host-control UAT |
| HUD-05 | Keyboard, screen reader, focus, zoom, contrast, and reduced-motion support | Semantic primitive roles, attention-specific focus policy, WCAG 2.2 checks, media-query behavior, and manual assistive-tech UAT |
| HUD-07 | One six-primitive FSB grammar for capability packs | A single primitive registry and normalized render contract owned by the shell, not six independent hosts |
| HUD-08 | Ambient, anchored, focused, and interstitial attention budgets | An explicit state-policy table that rejects illegal primitive combinations before render |
</phase_requirements>

## Executive Recommendation

Implement Phase 52 as a small, separately owned Skopeo runtime injected into the top frame only after an explicit command. Keep the service worker authoritative for current-tab session generation and status; keep one content-side `SkopeoShell` authoritative for all DOM resources. Every control or async result carries the generation that created it. Kill increments/terminates that generation before aborting work and removing the shell, so late completions fail closed.

Do not add a library, another content script that loads on every page, a new MCP surface, or any graph/document intelligence. Existing FSB code already provides the patterns needed: dynamic script injection, Shadow DOM overlays, top-layer promotion, per-tab session storage, overlay-version rejection, accessibility helpers, and standalone Node/VM tests.

## Browser Platform Findings

### Commands and invocation

- A standard Manifest V3 command is the correct shortcut surface. Do **not** use the reserved `_execute_action` command: it invokes the extension action and would therefore preserve the toolbar's side-panel behavior rather than provide an independent Skopeo event.
- Chrome supports `Space` as a command key and `Option` as a macOS modifier. A practical suggested mapping is `Option+Space` on macOS and `Ctrl+Shift+Space` elsewhere, with `chrome://extensions/shortcuts` as the user-remapping surface.
- Chrome permits at most four suggested shortcuts, and OS/browser shortcuts can win conflicts. `chrome.commands.getAll()` can reveal an unassigned/collided shortcut, but should not overwrite an intentional user choice after install.
- A commands shortcut is an explicit user gesture and grants `activeTab`; `chrome.scripting.executeScript()` can then inject into the command's tab. FSB already declares `activeTab`, `scripting`, and `<all_urls>`, so Phase 52 needs no new permission.
- The command listener receives the invoking `tabs.Tab` when available. Use that tab directly; do not perform a second active-tab query that can race a tab switch.
- The side-panel toggle should resolve its currently selected tab through the side panel's established tab-aware path, then message the service worker with an explicit tab id. The existing toolbar `chrome.action.onClicked` listener remains byte-behaviorally unchanged.
- Restricted URLs and injection failures must return a stable unavailable state to the side panel without creating a partial session record or page residue.

Primary sources:
- [Chrome commands API](https://developer.chrome.com/docs/extensions/reference/api/commands)
- [Chrome activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)

### Dynamic loading and tab lifecycle

- `chrome.scripting.executeScript({target: {tabId}, files})` supports runtime file injection into the main frame. That is a better match than statically declaring Skopeo under `content_scripts` or appending it to the automation runtime's always-loaded file list.
- Inject a tiny ordered bundle whose entrypoint is idempotent. A repeated explicit invoke must detect the existing runtime and dispatch a new-generation activation rather than attach another root or another global listener.
- Treat top-frame navigation/reload as terminal for the active generation. Do not silently re-inject Skopeo onto the next document; explicit invocation is the consent boundary.
- `chrome.storage.session` is appropriate for the trusted per-tab generation/tombstone ledger because it survives MV3 service-worker suspension but clears on extension reload/update/disable and browser restart. It is not exposed to content scripts by default.
- Remove the per-tab ledger on `chrome.tabs.onRemoved`. While the tab exists, retain only the minimum `{generation, status, updatedAt}` terminal record needed to reject stale messages; this is extension state, not host-page residue.

Primary source:
- [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)

### Top layer and focus

- The HTML popover API places a shown element in the top layer. `popover="manual"` neither light-dismisses nor responds to generic close requests, which fits an explicit Skopeo lifecycle and avoids unexpected interaction with host popovers.
- Hiding a popover removes it from the top layer and applies `display: none`; removing the host after hiding gives a deterministic teardown.
- Browser-provided popover focus behavior is not sufficient for the four custom Skopeo attention states. The shell must record the actual origin focus, focus only focused/interstitial content, and restore focus if the original node is still connected and focusable; otherwise fall back without scrolling or throwing.
- Existing `visual-feedback.js` top-layer promotion is the closest local precedent and already supplies a safe fallback for environments where promotion fails.

Primary source:
- [WHATWG HTML popover standard](https://html.spec.whatwg.org/multipage/popover.html)

## Recommended Architecture

### 1. Two authorities, one session identity

Use two cooperating owners rather than one cross-context object:

1. **Service-worker session controller** — authoritative for `{tabId, generation, status}`, injection, command/side-panel routing, abort, navigation/tab cleanup, and stale message rejection.
2. **Content-side shell owner** — authoritative for one host, one Shadow root, attention stack, primitive instances, focus origin, listeners/observers/timers, and synchronous idempotent teardown.

Both validate the same `{tabId, generation}` envelope. Neither accepts a bare render/update message.

Recommended state transitions:

```text
OFF --explicit invoke--> STARTING --shell ready--> AMBIENT
AMBIENT --pack request--> ANCHORED --focus request--> FOCUSED
FOCUSED --consequence request--> INTERSTITIAL
INTERSTITIAL --Escape/close--> FOCUSED --Escape/close--> ANCHORED
ANCHORED --Escape/close--> AMBIENT --Escape/close--> OFF
ANY ACTIVE --toggle off / Escape Escape / navigation--> TERMINATING --> OFF
```

`TERMINATING` is monotonic for that generation. A later invocation increments the generation and starts a fresh session.

### 2. Generation-first cancellation

The safe kill order is:

1. Mark the current generation terminal/increment the tab generation in the service worker.
2. Abort its `AbortController` and reject new work for the old generation.
3. Send a generation-specific teardown request to the content runtime.
4. Content runtime marks itself disposed before removing resources.
5. Hide/remove the popover host, restore focus when appropriate, and return a teardown inventory.
6. Service worker records off only after teardown acknowledgement or a bounded best-effort fallback.

Every Promise continuation checks both `signal.aborted` and `generation === currentGeneration` before it sends or renders. This dual check protects against APIs that cannot be truly cancelled.

### 3. One shell and one primitive contract

Use one Shadow host and an internal primitive registry. A useful normalized shape is:

```js
{
  generation,
  attention: 'ambient' | 'anchored' | 'focused' | 'interstitial',
  primitives: {
    anchor: [],
    chip: [],
    halo: [],
    rail: null,
    ghost: null,
    gate: null
  }
}
```

The attention policy validates before render:

| Level | Default visible set | Explicit restrictions |
|-------|---------------------|-----------------------|
| Ambient | Compact rail/lens | No host dimming, speculative anchors, modal focus, halo decoration, or gate |
| Anchored | Anchor marks, entity chips, optional rail; rare anomaly halo | No ghost layer or gate; ambient/anchored surfaces do not steal focus |
| Focused | Temporary ghost layer plus focused panel/rail and relevant anchors | Ghost layer is session-owned, nonsemantic, and removed on exit |
| Interstitial | One consequence gate, with only context needed to decide | Gate is never used for ordinary reading or informational placeholders |

Invalid combinations should fail closed in development/tests and withdraw the invalid primitive in production rather than degrade into all-primitives-on-screen noise.

### 4. Host-integrity boundary

- Create one extension-owned host as a direct document child; put all Skopeo style and markup inside its Shadow root.
- Give the fixed outer envelope `pointer-events: none`; opt visible controls back into `pointer-events: auto` individually.
- Do not change `body`/host overflow, position, padding, transform, filter, `inert`, `aria-hidden`, class names, or inline styles.
- Geometry overlays may read target rectangles but must not wrap, reparent, or style host nodes. Semantic anchor resolution itself is Phase 53.
- Register global keyboard listeners only while the session is active. Ignore IME composition and key-repeat events. Remove the exact listener references during teardown.
- Avoid broad event suppression. Prevent/stop only the Skopeo command actually consumed, and include Drive/Docs Escape and pointer pass-through in live UAT.
- Treat all future host text as untrusted: use `textContent`, typed attributes, and a trusted action/citation registry; never inject page strings as HTML.

### 5. Accessibility contract

- Ambient/anchored surfaces expose a named `region` or status surface without moving focus. Announcements use a small, throttled `aria-live="polite"` node only for meaningful state changes.
- Anchor marks and entity chips that perform actions are native buttons/links with accessible names; informational marks are not put in the tab order.
- Focused surfaces use an appropriate named dialog/region and deliberately focus their first meaningful control or heading. Interstitial consequence gates use `role="alertdialog"` only when immediate acknowledgement is genuinely required.
- Trap focus only inside a visible modal/interstitial gate, never in ambient or anchored states. `Escape` and a visible close action always provide a keyboard exit.
- Hidden primitive nodes are removed, or receive both `hidden` and non-focusable state before removal; CSS opacity alone is insufficient.
- Use `:focus-visible` with a high-contrast outline that remains visible against both the dark shell and host content.
- Meet WCAG 2.2 AA minimums relevant here: full keyboard operation, no keyboard trap, meaningful focus order, visible/unobscured focus, text/non-text contrast, 200% text resize/reflow, and at least 24-by-24 CSS-pixel pointer targets or equivalent spacing.
- `prefers-reduced-motion: reduce` removes sweep, breathing, parallax, pulse, and nonessential transitions; state remains legible without motion. Forced-colors behavior needs live inspection.

Primary sources:
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [W3C Focus Visible guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)
- [W3C Target Size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C Non-text Contrast guidance](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html)

## Repository Integration Map

| Existing path | Finding | Planning implication |
|---------------|---------|----------------------|
| `extension/manifest.json` | Has `activeTab`, `scripting`, `storage`, `<all_urls>`, `action`, and `side_panel`; no `commands` | Add one standard Skopeo command; add no permission; preserve action block |
| `extension/background.js` | `chrome.action.onClicked` has careful gesture-critical side-panel logic; `CONTENT_SCRIPT_FILES` is the automation bundle | Leave action handler alone; add an independent command/session controller; do not append Skopeo to the always-loaded automation list |
| `extension/ui/sidepanel.html` / `.css` / `.js` | Existing FSB control surface and tab-aware behavior | Add the discoverable current-tab toggle and status without creating a second app surface |
| `extension/content/visual-feedback.js` | Shadow DOM, top-layer promotion, pointer isolation, reduced-motion CSS, synchronous `destroy()` methods | Reuse implementation techniques, not automation overlay ownership or always-loaded instances |
| `extension/utils/overlay-state.js` | Token/version ordering rejects stale visual updates | Mirror monotonic generation semantics for Skopeo; keep namespace and state separate |
| `extension/utils/mcp-visual-session-lifecycle.js` | Per-tab `storage.session`, alarm cleanup, idempotent clear patterns | Reuse storage/error-handling conventions; do not couple Skopeo to MCP sessions |
| `extension/content/lifecycle.js` | SPA hooks, mutation observer, unload cleanup in automation runtime | Skopeo must own/remove only its resources and coexist without modifying this lifecycle |
| `extension/content/accessibility.js` | Existing accessibility utilities | Reuse safe helpers where signatures fit; audit assumptions about host-page elements |
| `extension/content/badge-combine.js` | Existing sparse badge collision behavior | Useful precedent for later coexistence, but Phase 52 does not implement semantic anchor placement |
| `tests/test-overlay-state.js` | Fast pure state ordering tests | Model generation/terminal-state cases here |
| `tests/overlay-content-audit.test.js` | Node VM Shadow DOM, reduced-motion, overlay content audit | Extend its harness patterns for shell semantics and teardown inventory |
| `tests/overlay-stability-cadence.test.js` | VM-based overlay lifecycle checks | Reuse timer/listener instrumentation |
| `tests/sidepanel-*.test.js` | Source-level and sandboxed side-panel contracts | Pin toggle markup, message envelopes, tab scoping, and unchanged toolbar behavior |
| `tests/extension-content-script-files-completeness.test.js` | Pins the automation injection list | Add a negative assertion that Skopeo is not in the always-loaded list |

Recommended new module boundary (planner may refine names without changing responsibilities):

```text
extension/utils/skopeo-session-state.js   pure generation/state reducer
extension/content/skopeo-runtime.js       idempotent injected entrypoint + message gate
extension/content/skopeo-shell.js         one Shadow root, primitive registry, focus/teardown
extension/content/skopeo-shell.css.js     bundled style text/tokens if project conventions favor JS
background.js                             command + per-tab controller integration
ui/sidepanel.*                            current-tab Skopeo toggle/status
```

No new package or build step is required; classic IIFE/global namespace modules match the repository's direct-JavaScript constraint and existing content-runtime conventions.

## Threat Model Inputs for Planning

| Ref | Threat | Severity | Required mitigation/evidence |
|-----|--------|----------|------------------------------|
| T-52-01 | A late Promise/message resurrects a killed HUD | High | Generation-first terminal transition, abort, two-sided generation checks, stale-result test after kill and reinvoke |
| T-52-02 | Overlay intercepts host clicks/keyboard or obscures required controls | High | Pointer-transparent envelope, scoped listeners, no host mutation, Drive/Docs pass-through UAT |
| T-52-03 | Host-controlled text becomes executable/privileged HUD markup | High | `textContent`/typed render inputs only, no host HTML execution, hostile-string test |
| T-52-04 | Focus is trapped, lost, or restored into a detached/hidden host node | Medium | Attention-specific focus policy, connectivity/focusability checks, no-scroll fallback, keyboard UAT |
| T-52-05 | Repeated injection creates duplicate roots/listeners | Medium | Idempotent entrypoint, single-owner sentinel, duplicate-invoke resource-count test |
| T-52-06 | Unsupported/restricted tab leaves partial active state | Medium | Preflight URL/injection result, fail-closed rollback, restricted-tab test |
| T-52-07 | Side-panel message toggles the wrong tab after focus changes | Medium | Explicit tab id, tab-aware side-panel resolution, command event tab use, race test |

The phase planner must include a `<threat_model>` block in each plan because project security enforcement defaults on and blocks at high severity.

## What Not to Build

- No Graphify runtime, graph schema, contract extraction, Drive folder enrollment, semantic anchors, citation retrieval, alerts, or AI calls.
- No static Skopeo content script and no persistent in-page launcher.
- No second extension action and no repurposing `_execute_action` or `chrome.action.onClicked`.
- No host-page CSS reset, body padding/overflow change, DOM wrapping, or global `inert`/`aria-hidden` mutation.
- No per-primitive Shadow roots and no direct reuse of automation overlay singleton instances.
- No new UI framework, accessibility library, MCP tool, server, daemon, or storage dependency.

## Validation Architecture

### Test infrastructure

| Property | Value |
|----------|-------|
| Framework | Standalone Node tests using `assert`, VM sandboxes, and repository DOM/Chrome mocks |
| Existing patterns | `test-overlay-state.js`, `overlay-content-audit.test.js`, `overlay-stability-cadence.test.js`, side-panel smoke tests |
| Quick command | `node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js` |
| Phase suite | `node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-shell-contract.test.js && node tests/skopeo-sidepanel-command.test.js && node tests/skopeo-accessibility.test.js && node tests/test-overlay-state.js && node tests/overlay-content-audit.test.js` |
| Full regression | `npm test` plus `npm run validate:extension` before phase verification |
| Expected quick latency | Under 30 seconds; target under 10 seconds on the existing local Node setup |

### Requirement-to-test map

| Requirement | Automated proof | Live/manual proof |
|-------------|-----------------|-------------------|
| HUD-01 | Manifest declares one standard command; toolbar handler unchanged; command/side-panel messages carry explicit tab id; Skopeo absent from static/automation script lists; repeated invoke creates one runtime | Command is registered/remappable; preferred macOS chord works or collision is surfaced; arbitrary pages remain visually off before invoke |
| HUD-02 | Unit state matrix covers close/back, double Escape kill, generation increment, abort, late result rejection, and reinvoke with a new generation | Kill during visible async placeholder; no HUD returns after completion; unrelated FSB and another tab remain active |
| HUD-03 | Instrument root/listener/observer/timer/focus-hook counts before/after kill; teardown twice is no-op; no host attribute/style diff; navigation cleanup | DevTools inspection on Drive and Docs after dismiss, kill, reload, and navigation |
| HUD-04 | Pointer-hit tests show only visible controls opt in; shell never mutates host layout properties; unrelated events are not prevented | Drive row/menu/open controls and Docs editing/selection remain usable at normal and zoomed layouts |
| HUD-05 | Roles/names/tab order/focus restoration/reduced-motion CSS/token contrast calculations; hidden primitives absent/nonfocusable | Keyboard-only, VoiceOver, 200% zoom/reflow, forced colors/high contrast, reduced motion, visible focus not obscured |
| HUD-07 | Primitive registry exposes exactly six named primitives under one shell; duplicate host count stays one | Visual inspection of controlled demonstration states against UI-SPEC/design reference |
| HUD-08 | Policy table accepts legal and rejects illegal primitive/attention combinations; halo/ghost/gate scarcity cases | Visual and keyboard walkthrough of ambient → anchored → focused → interstitial → back/off |

### Wave 0 test gaps

- [ ] `tests/skopeo-session-lifecycle.test.js` — pure per-tab generation reducer, cancellation ordering, late-result rejection, tab isolation, navigation/restricted-tab rollback.
- [ ] `tests/skopeo-shell-contract.test.js` — one-root invariant, six-primitive registry, attention allowlist, pointer envelope, idempotent teardown, no host mutation, hostile text rendering.
- [ ] `tests/skopeo-sidepanel-command.test.js` — manifest command contract, unchanged action-side-panel path, explicit-tab routing, toggle state, and negative assertion against always-loaded injection.
- [ ] `tests/skopeo-accessibility.test.js` — names/roles, tab-order policy, focus capture/restore, hidden-state exclusion, focus-visible styles, target-size tokens, reduced-motion behavior.
- [ ] A reusable resource-ledger fixture that records listeners, observers, timers, animation frames, roots, popover state, and focus hooks so zero-residue assertions are non-vacuous.

These tests should land before or with the first implementation tasks, not be deferred to a final cleanup plan.

### Sampling cadence

- After the session-state/controller task: run `node tests/skopeo-session-lifecycle.test.js`.
- After shell or primitive tasks: run `node tests/skopeo-shell-contract.test.js && node tests/skopeo-accessibility.test.js`.
- After manifest/background/side-panel integration: run `node tests/skopeo-sidepanel-command.test.js && node tests/sidepanel-tab-aware-smoke.test.js`.
- After each plan wave: run the phase suite.
- Before `$gsd-verify-work`: run `npm run validate:extension && npm test`, then complete the live Chrome UAT matrix.
- Maximum automated feedback latency between implementation tasks: 30 seconds.

### Manual-only verification

| Behavior | Why manual | Minimum test |
|----------|------------|--------------|
| Real Chrome shortcut registration/collision and user remapping | OS and installed-extension shortcut ownership are not faithfully modeled in Node | Reload unpacked extension; inspect `chrome://extensions/shortcuts`; invoke preferred and fallback mappings on macOS |
| Drive/Docs host interaction and stacking | Google surfaces are virtualized, canvas-heavy, and frequently change | Exercise representative Drive folder/menu controls and Docs editing, selection, menus, scroll, and native Escape behavior while each Skopeo attention level is visible |
| VoiceOver/browser accessibility tree | VM DOM mocks cannot prove assistive-technology announcements or Shadow DOM traversal | VoiceOver walkthrough: invocation announcement, tab order, focused/gate state, close/kill, focus return, hidden content absent |
| 200% zoom, reflow, forced colors, reduced motion | Computed layout and OS preferences need a real renderer | Test 200% browser zoom, narrow viewport, macOS increased contrast/Chrome forced colors where available, and reduced motion; no clipped required control or motion-only meaning |
| Kill during real asynchronous completion | Requires actual extension/service-worker scheduling | Trigger a delayed fixture, kill immediately, allow completion, suspend/wake service worker, confirm no root or stale status returns |

## Planning Risks and Resolutions

1. **Do not confuse zero host residue with deleting the generation tombstone.** A minimal service-worker/session-storage terminal record is required to reject late work; HUD-03 concerns host-page residue.
2. **Do not use the existing automation injection list for convenience.** That would make the runtime present before consent and violate D-01/D-10 even if it renders nothing.
3. **Do not rely on `AbortController` alone.** Some completed/queued work can still resolve; generation equality at send and render is the resurrection barrier.
4. **Do not use automation overlay helpers that force `aria-hidden="true"` for interactive content.** Reuse top-layer and teardown patterns, not incompatible semantics.
5. **Do not claim accessibility from source scans alone.** Automated checks are necessary but live keyboard, VoiceOver, zoom, contrast, and reduced-motion UAT remain phase gates.
6. **Do not let the shell demo become Drive anchoring.** Phase 52 may use controlled internal fixtures to prove primitive states; real identity/placement begins in Phase 53.

## Open Questions (RESOLVED)

- **Side-panel control** — RESOLVED by `52-UI-SPEC.md`: place one 64px-minimum Skopeo row directly below `.sidepanel-header`, with exact off/starting/active/unsupported/error hierarchy and current-tab copy.
- **Ambient placement and zoom** — RESOLVED by `52-UI-SPEC.md`: use a preferred 240×40px lens with a 4px rail and deterministic corner collision order; below 480 CSS px or when the full lens is unsafe, use the 88×40px compact lens, and fail closed when neither fits.
- **Controlled focused/interstitial semantics** — RESOLVED by `52-UI-SPEC.md`: richer states exist only behind a shell-owned non-production fixture; Focused moves focus to its titled region, Interstitial uses `role="alertdialog"`, and exiting restores the captured host focus when still valid.
- **Shortcut collision** — RESOLVED by `52-UI-SPEC.md`: prefer `Option+Space` on macOS, expose the configured shortcut in the side panel, and direct users to Chrome shortcut settings when the preferred chord is unavailable or remapped; never assume ownership.

These resolutions preserve the approved lifecycle architecture and are now locked inputs to executable planning.

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Command and dynamic injection architecture | High | Current official Chrome MV3 docs and existing manifest/background permissions align |
| Per-tab generation/cancellation | High | Existing FSB overlay/session patterns plus deterministic pure-state testing |
| One-shell primitive contract | High | Locked context and mature local Shadow DOM overlay precedents |
| Zero-residue automation | High | Resource ledger and VM instrumentation can prove owned resources and host diffs |
| Live Drive/Docs host coexistence | Medium | Requires representative current Google surfaces in Chrome UAT |
| VoiceOver, zoom, forced colors, shortcut collision | Medium | Platform/browser state cannot be fully simulated headlessly |

---

*Research complete for Phase 52 planning. No production code or later-phase Skopeo intelligence is included.*
