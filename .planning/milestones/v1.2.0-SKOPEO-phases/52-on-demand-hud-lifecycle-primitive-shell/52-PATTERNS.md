# Phase 52: On-Demand HUD Lifecycle & Primitive Shell - Gap-Closure Pattern Map

**Mapped:** 2026-07-15
**Mode:** Verification gap closure
**Gap source:** `52-VERIFICATION.md` and `52-REVIEW.md`
**Files classified:** 11
**Analogs found:** 10 / 11

## Scope Guard

This map closes only WR-01, WR-02, WR-05, and WR-06, with bounded hardening for advisory WR-03 and WR-04. Preserve the existing Phase 52 architecture:

- one dynamically injected, top-frame `SkopeoShell` and one runtime owner;
- one explicit current-tab side-panel/command path;
- one monotonic session generation and abort-first terminal boundary;
- no Drive/Docs recognition, semantic anchors, Graphify runtime, Python, graph/vector database, server, daemon, new AI model, MCP surface, or third-party browser-test dependency.

The gap work does not require changes to `extension/manifest.json`, `extension/ui/sidepanel.html`, or `extension/ui/sidepanel.css`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `extension/content/skopeo-shell.js` | component + lifecycle owner | event-driven, geometry transform, state transition | its own Ambient prepare/commit and `extension/content/visual-feedback.js` overlay hosts | exact/role-match |
| `tests/skopeo-shell-contract.test.js` | contract test + DOM oracle | event-driven, transform | existing placement, pointer, and teardown cases in the same file | exact |
| `tests/skopeo-accessibility.test.js` | accessibility contract test | event-driven focus/keyboard | existing focus ladder in the same file | exact, mock needs browser fidelity |
| `tests/skopeo-browser-contract.test.js` (new) | browser integration test | file-I/O, process, event-driven DOM | no checked-in real-Chrome runner; `tests/lattice-public-package.test.js` supplies the child-process convention | partial |
| `extension/ui/sidepanel.js` | UI controller + tab authority adapter | event-driven, request-response | bounded Skopeo controller's captured-tab guards plus session-generation reducer | role/data-flow match |
| `tests/skopeo-sidepanel-command.test.js` | controller/integration test | request-response, reversed async completion | existing `assertSidepanelRaceIntegration()` and VM extraction harness | exact |
| `extension/content/skopeo-runtime.js` | document runtime service | event-driven, request-response, terminal cleanup | shell resource ledger plus its own terminal generation pattern | role-match |
| `extension/background.js` | service-worker controller/validator | request-response, pub-sub | `exactKeys()` and sender-derived Skopeo message validation in the same controller | exact |
| `tests/skopeo-session-lifecycle.test.js` | lifecycle/runtime test | event-driven, delayed-work races | existing abort-first and late-work cases in the same file | exact |
| `tests/helpers/skopeo-resource-ledger.js` | test utility | resource transform/accounting | its own exact eleven-category snapshot and negative controls | exact |
| `package.json` | test configuration | batch | existing `npm test` `&&` chain | exact |

## Pattern Assignments

### `extension/content/skopeo-shell.js` (component/lifecycle owner)

#### WR-01: computed host geometry

**Analog:** `extension/content/visual-feedback.js:370-388`

The established overlay host gives every cascade-critical property the same `!important` priority as its reset:

```js
this.host.style.cssText = `
  all: initial !important;
  display: block !important;
  position: fixed !important;
  inset: auto !important;
  top: 16px !important;
  right: 16px !important;
  z-index: 2147483647 !important;
  pointer-events: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: none !important;
`;
```

**Apply:** keep the Skopeo host reset, but put `position: fixed`, `inset: 0`, maximum `z-index`, `pointer-events: none`, margin/padding/border reset, and transparent background after `all` in the same `:host` rule with `!important`. The existing non-important assignments at `skopeo-shell.js:630-637` may remain as defensive inline documentation, but they are not the browser contract. Do not add a second host or couple Skopeo to `visual-feedback.js`.

The computed invariant is:

```text
getComputedStyle(host) = fixed / inset 0px / pointer-events none / z-index 2147483647
```

It must hold both while `:popover-open` and when `showPopover` is absent or throws.

#### WR-02: deep Shadow focus and verified focus postconditions

**Closest local focus policy:** `extension/content/skopeo-shell.js:813-845,1099-1164`. There is no correct deep-active-element helper elsewhere in the repository; real browser behavior is the canonical analog.

Current browser relation:

```text
document.activeElement === shell host
shell shadowRoot.activeElement === focused Skopeo control
```

Add one shell-private deep-active helper and use it consistently for `_focusedOrigin`, `_gateOrigin`, gate wrapping, destroy restoration, and any focused host-control lookup. `_safeFocus(node)` must call `focus({preventScroll:true})` and return true only when the postcondition resolves back to `node`; a non-throwing `focus()` call is not proof.

Preserve the current attention policy:

```text
Ambient/Anchored: no focus movement
Focused: capture exact origin, focus named title
Interstitial: capture exact focused trigger, focus safest action, trap only boundary wraps
Back/destroy: restore connected, visible, enabled exact origin; otherwise deterministic fallback; never force body
```

#### WR-05: atomic collision gate for Focused and Interstitial

**Analog:** the existing Ambient geometry pipeline in `extension/content/skopeo-shell.js:385-433,541-605`:

```js
function intersects(left, right, clearance) {
  const amount = Number(clearance) || 0;
  return left.left < right.right + amount &&
    left.right > right.left - amount &&
    left.top < right.bottom + amount &&
    left.bottom > right.top - amount;
}

const collides = controls.some(function (controlRect) {
  return intersects(rect, controlRect, HOST_CLEARANCE);
});
```

**Atomic-transition analog:** `prepareAmbient()`/`mountAmbient()` at `skopeo-shell.js:594-623` computes safety before committing a root.

Apply the same prepare-then-commit discipline to richer transitions:

```text
current attention + DOM + scope
  -> stage proposed owned surface
  -> obtain its real bounding rect
  -> resolve the current required non-Skopeo host control
  -> intersect with 8px clearance and viewport bounds
  -> safe: commit attention, suspend prior surface, then focus
  -> unsafe: dispose staged scope, keep prior attention/DOM/focus, announce COPY.unsafeView
```

Measure the actual proposed `.skopeo-focused-card`/`.skopeo-gate` rectangle so narrow reflow, text metrics, and zoomed CSS pixels participate. Never mutate host element styles or use selector-specific Drive/Docs logic. A failed transition returns false and must not leave a ghost layer, gate, focus hook, pointer surface, or pending render.

#### WR-04: attention-owned resource scopes

**Analogs:**

- Stable event delegation: `extension/ui/sidepanel.js:1655-1695` attaches one parent listener while children change.
- Explicit listener cleanup: `extension/ui/sidepanel.js:3692-3715` removes the exact named listeners before the surface is hidden.
- Session-wide reverse cleanup: `tests/helpers/skopeo-resource-ledger.js:102-117` releases all active handles in reverse acquisition order.

Use either one stable delegated click boundary on `_surface`, or an explicit render scope whose listener and pointer handles are released when those nodes permanently leave. If preserving the existing suspended back stack, suspend `{nodes, handles}` together and restore that scope only for the matching one-level back. `_clearSurface()` must release the outgoing scope before dropping nodes; `destroy()` must also release any active and suspended scopes.

Counts may differ by attention level, but after a complete round trip they must return to that level's first stable snapshot:

```text
Ambient baseline == Ambient after cycle 1 == Ambient after cycle 2
Anchored baseline == Anchored after repeated revisit
final destroy == exact eleven-category zero
```

The CSS halo animation at `skopeo-shell.js:202-210` is presently unaccounted. The smallest Phase 52-safe choice is to remove that nonessential animation and keep the static halo. If motion is retained, acquire/cancel its browser animation in the `animations` category and include it in the attention scope.

---

### `tests/skopeo-shell-contract.test.js` (mock-DOM contract)

**Analog:** existing collision matrix at `tests/skopeo-shell-contract.test.js:765-800` and terminal ledger checks at `689-739,885-893`.

Extend the current matrix rather than creating a second mock harness:

- Assert the generated `:host` rule contains every cascade-critical property with `!important`; retain inline assertions only as secondary evidence.
- Add Focused and Interstitial safe/unsafe cases. Unsafe must preserve the exact prior attention nodes, focus, primitive allowlist, and resource snapshot, while the live region receives `COPY.unsafeView`.
- Add top/center host-control rectangles, a `<480px` viewport, and repeated resize/transition cases.
- Add a two-cycle resource plateau assertion. Compare complete snapshots, not only `listeners` and `pointerSurfaces`.

The production-like mock must model Shadow focus retargeting. Replace the current direct assignment at `tests/skopeo-shell-contract.test.js:332-335` with the browser relation:

```js
const root = this.getRootNode();
if (root instanceof MockShadowRoot) {
  root.activeElement = this;
  this.ownerDocument.activeElement = root.host;
} else {
  this.ownerDocument.activeElement = this;
}
```

Also clear the appropriate root active element on blur/removal and make `dispatchKey()` target `shadowRoot.activeElement || document.activeElement`. This change is a negative control: the unfixed production shell must fail the gate-order/restoration assertions under the corrected mock.

---

### `tests/skopeo-accessibility.test.js` (focus/keyboard contract)

**Analog:** `testFocusedSemanticsAndOrder()` and `testInterstitialSemanticsAndTrap()` at `tests/skopeo-accessibility.test.js:141-231`.

Keep the current named-role/source-order checks and strengthen the focus oracle:

- assert the browser-shaped pair (`document.activeElement === host`, `shadow.activeElement === expected control`) for Focused and Gate states;
- prove ordinary forward Tab from the first Gate action is not prevented, while last -> first and Shift+Tab first -> last wrap exactly once;
- prove Gate back restores the exact Focused trigger and Focused back restores the exact Anchored trigger;
- force a focus failure/detachment and verify `_safeFocus` detects the failed postcondition and chooses the declared fallback;
- retain Ambient/Anchored no-focus-steal and no-body-fallback assertions.

Do not claim VoiceOver, OS contrast, or live browser zoom from this Node test; those remain deferred UAT.

---

### `tests/skopeo-browser-contract.test.js` (new real/headless Chrome seam)

**No exact analog exists.** The repository has no checked-in real-Chrome test runner. Use only Node built-ins and the existing process-test convention from `tests/lattice-public-package.test.js:13,83-87`:

```js
const { spawnSync } = require('node:child_process');
const run = spawnSync(binary, args, {
  cwd: repoRoot,
  encoding: 'utf8'
});
```

Resolve Chrome from `CHROME_BIN` first, then documented platform paths (including `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS). Do not install Puppeteer, Playwright, Selenium, a server, or a daemon. Build a temporary local HTML fixture containing the production `skopeo-shell.js`, run `--headless=new --dump-dom` with an isolated temporary user-data directory, emit a JSON result node, parse it, and remove the directory in `finally`.

Required browser assertions:

1. Popover path computed host styles are fixed/inset-zero/pointer-none/max-z and top-layer state is `0 -> 1 -> 0`.
2. Forced fallback (Popover API unavailable or throwing) has the same computed host styles.
3. Real Shadow focus retargets to host + `shadowRoot.activeElement`; Gate middle order is not trapped on the first action, boundary wraps work, and one-level backs restore their actual origins.
4. A proposed Focused/Gate rectangle colliding with the required host control fails closed; safe geometry succeeds.

This automated browser seam proves only deterministic DOM/browser mechanics. It does not replace the deferred live Chrome/Drive/Docs/VoiceOver rows.

---

### `extension/ui/sidepanel.js` (tab authority controller)

#### WR-06: monotonic authority epoch

**Closest async guard:** the existing bounded Skopeo controller at `extension/ui/sidepanel.js:226-246` captures a tab before awaiting and rechecks it afterward:

```js
var capturedTabId = positiveTabId(tabId) ? tabId : _activeTabIdSnapshot;
if (!activeTabMatches(capturedTabId)) return false;
var response = await chrome.runtime.sendMessage({
  action: 'skopeo:get-status',
  tabId: capturedTabId
});
if (!activeTabMatches(capturedTabId)) return false;
```

**Monotonic analog:** `extension/utils/skopeo-session-state.js:101-121,206-210` allocates a strictly newer generation and accepts results only when the generation still matches.

Add one module-scope tab-authority epoch shared by boot hydration, `tabs.onActivated`, and `windows.onFocusChanged`:

```text
event begins -> increment epoch synchronously -> capture epoch
async query/work resolves -> compare captured epoch with current epoch
mismatch -> no _activeTabIdSnapshot assignment and no Skopeo activation
match -> assign explicit tab id, synchronously activate the bounded controller
```

Specific ordering:

- `tabs.onActivated` increments authority before any owner-chip/history await, assigns its explicit `incomingTabId`, and invalidates older boot/window work.
- `initTabConversationStore()` captures an epoch before its active-tab query and may assign `_activeTabIdSnapshot` only if that epoch remains current. Its conversation migration can remain best-effort; do not move tab selection into the Skopeo controller.
- `windows.onFocusChanged` increments immediately, starts `tabs.query({active:true, windowId})` immediately, and must not let `refreshOwnerChip()` delay tab resolution. Check the epoch before assignment/activation and again before any authority-dependent continuation.
- `WINDOW_ID_NONE` remains a no-op and must not advance authority.

Do not perform a second active-tab query inside `FSBSkopeoSidepanelController`; it should continue accepting an explicit authoritative tab ID.

---

### `tests/skopeo-sidepanel-command.test.js` (controller and outer-event races)

**Analogs:**

- `assertSidepanelRaceIntegration()` at `tests/skopeo-sidepanel-command.test.js:823-918` uses deferred promises and resolves Tab B before late Tab A.
- `tests/sidepanel-tab-scoping-fix-redo-smoke.test.js:45-67` brace-walks a real classic-script listener body and executes it against Chrome mocks.

Keep the current controller IIFE tests, then add an outer authority harness that registers or extracts the actual boot, `tabs.onActivated`, and `windows.onFocusChanged` paths. Required reversed-resolution cases:

```text
focus Window A -> focus Window B -> resolve B -> resolve A => B remains authority
boot query starts -> tabs.onActivated(B) -> boot query resolves A => B remains authority
focus Window A query starts -> tabs.onActivated(B) -> A resolves => B remains authority
WINDOW_ID_NONE => no query, epoch, assignment, activation, or DOM write
```

For each case assert both `_activeTabIdSnapshot` and the last `skopeo:get-status`/`skopeo:toggle-tab` tab ID. Late work must perform no Skopeo row text write and must not move focus.

For WR-03, replace the three-key `ZERO_RESOURCES` fixture at line 22 with the exact eleven-key snapshot from `tests/helpers/skopeo-resource-ledger.js`. Add rejection cases for every missing key, one extra key, `null`, `false`, empty string, `NaN`, and infinities.

---

### `extension/content/skopeo-runtime.js` (document runtime cleanup)

#### WR-03: authoritative terminal certificate

**Resource analog:** `tests/helpers/skopeo-resource-ledger.js:5-17,79-86` always emits exactly eleven numeric categories.

**Terminal analog:** the runtime already sets terminal and aborts before shell destruction at `extension/content/skopeo-runtime.js:108-140`. Preserve that boundary, but move acknowledgment after all runtime-owned cleanup:

```text
terminal -> abort -> clear fixture timeout -> shell.destroy
-> unregister active key/pagehide listeners
-> unregister runtime message listener
-> delete fixture hook/flag and sentinel
-> compute combined exact eleven-key zero snapshot
-> send teardown-complete once
-> freeze/cache final snapshot
```

Account for runtime-owned resources in the same reported generation inventory: runtime message listener, keydown, pagehide, and fixture timeout. A small local runtime counter merged with the shell's eleven-key snapshot is sufficient; do not add another injected production file. `currentSnapshot()` should report the combined inventory, and completion must be impossible while any category is nonzero.

Preserve idempotency: later terminate/probe/saved-listener/timer calls return the cached terminal state and never send a second certificate.

---

### `extension/background.js` (service-worker validator)

**Analog:** `exactKeys()` at `extension/background.js:644-649`:

```js
const actual = Object.keys(object).sort();
const wanted = expected.slice().sort();
return actual.length === wanted.length &&
  actual.every((key, index) => key === wanted[index]);
```

Use exact key-set equality against all eleven `RESOURCE_KEYS`. For every value require:

```js
typeof value === 'number' && Number.isFinite(value) && value === 0
```

Do not use `Number(value) === 0`, which accepts `null`, `false`, and `""`. Retain the existing exact outer message envelope and sender-derived tab binding in `handleTeardownComplete()`.

---

### `tests/skopeo-session-lifecycle.test.js` (runtime lifecycle)

**Analog:** `testRuntimeAbortFirstAndLateWork()` at `tests/skopeo-session-lifecycle.test.js:1318-1372`.

Update the test oracle and production expectations together, but keep the test independent enough to catch ordering regressions. Assert:

- AbortSignal is aborted before shell destroy.
- Runtime listener, active listeners, and fixture timeout are removed before `teardown-complete` is emitted.
- The outbound certificate has exactly eleven finite numeric zeros.
- A saved listener, cleared timer callback, Promise continuation, second terminate, and replacement generation cannot emit another certificate or recreate a resource.
- `currentSnapshot()` includes runtime-owned listeners/timeouts while active and exact zero after termination.

The old expected order with acknowledgment before unregistering listeners must be deleted; it encoded WR-03 rather than the intended contract.

---

### `tests/helpers/skopeo-resource-ledger.js` (resource oracle)

Continue treating `CATEGORIES` and `zeroSnapshot()` at lines 5-26 as the test authority. Add a reusable exact-zero predicate only if both background and runtime tests consume it; production must not import a test helper.

The existing self-test pattern at lines 136-168 is the model: one negative control per category, reverse release, exact key order, and final deep equality. Add snapshot-shape negative controls here if the helper gains validation.

---

### `package.json` (automated gate registration)

Append the new browser contract next to the four Phase 52 tests in the existing `npm test` chain. Do not add a package. Keep the focused gap gate independently runnable as:

```bash
node tests/skopeo-session-lifecycle.test.js && \
node tests/skopeo-shell-contract.test.js && \
node tests/skopeo-sidepanel-command.test.js && \
node tests/skopeo-accessibility.test.js && \
node tests/skopeo-browser-contract.test.js
```

The browser test should fail clearly when invoked as a required Phase 52 gate and no Chrome binary is available; it must not silently report PASS after skipping the only environment-fidelity checks.

## Shared Patterns

### Fail Closed Before Mutation

**Source:** `prepareAmbient()`/`mountAmbient()` in `extension/content/skopeo-shell.js:594-623` and controller generation guards in `extension/background.js:1041-1065`.

Apply to Focused/Gate collision, tab authority, and teardown certification: validate identity/safety completely, then commit. A rejected candidate leaves prior authoritative state untouched.

### Monotonic Identity at Every Async Boundary

**Source:** `extension/utils/skopeo-session-state.js:101-121,206-210` and `extension/ui/sidepanel.js:226-246`.

Apply to boot, activation, window focus, runtime generation, and status rendering. Capture the explicit identity before the await and compare it after every await that can outlive a newer event.

### One Owner, Exact Cleanup

**Source:** shell `_acquire`/`_release` at `extension/content/skopeo-shell.js:513-539`, resource ledger reverse cleanup at `tests/helpers/skopeo-resource-ledger.js:102-117`, and top-layer demotion at `extension/content/visual-feedback.js:190-208`.

Every resource has one owner, one named cleanup, and one observable category. Cleanup is synchronous, idempotent at the public boundary, and completed before acknowledgment.

### Browser Truth Over Mock Convenience

Computed CSS and Shadow focus cannot be certified from inline style objects or a mock that assigns a shadow child directly to `document.activeElement`. Keep fast Node contracts, add faithful negative controls, and require the zero-dependency headless Chrome seam for WR-01/02/05.

## Real/Headless Chrome Verification Matrix

| Gap | Fast Node seam | Required browser seam | Deferred live seam |
|---|---|---|---|
| WR-01 host CSS | exact generated `:host` rule + fallback mock | `getComputedStyle(host)` for popover and fallback | hostile real page stacking/hit testing |
| WR-02 focus | retargeting mock + focus postcondition | real `document.activeElement`/`shadowRoot.activeElement`, Gate wrap/back | keyboard + VoiceOver |
| WR-05 collision | deterministic rect matrix and atomic rollback | actual card/gate rect at narrow viewport/zoom-equivalent CSS pixels | Drive/Docs controls at 200% zoom |
| WR-06 tab authority | reversed deferred query/event harness | optional unpacked-extension multi-window smoke; Node test is deterministic authority proof | real two-window/two-tab interaction |
| WR-03 certificate | exact eleven-key validator + teardown order | runtime resource snapshot in unpacked Chrome | live before/active/after resource evidence |
| WR-04 scopes | repeated transition plateau | browser `getAnimations()`/DOM listener behavior if motion retained | long controlled-fixture cycle |

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/skopeo-browser-contract.test.js` | browser integration test | process + real DOM | No root test currently launches Chrome. Use Node built-ins and the repository's `spawnSync` convention; do not introduce a browser framework. |

## Planner Grouping Recommendation

The repository and gap reports naturally split into two executable plans:

1. **Browser shell geometry, focus, and collision correctness:** `skopeo-shell.js`, shell/accessibility tests, and the new real-Chrome contract.
2. **Tab authority and resource evidence hardening:** `sidepanel.js`, runtime/background controller, lifecycle/side-panel/ledger tests, and test registration.

WR-04 should travel with the shell plan because render scopes are entangled with atomic Focused/Gate transitions. WR-03 should travel with the runtime/controller plan because acknowledgment ordering and exact validation form one certificate boundary.

## Metadata

**Analog search scope:** `extension/content`, `extension/ui`, `extension/utils`, `extension/background.js`, `tests`, `scripts`, and `package.json`
**Primary files inspected:** 20
**Pattern extraction date:** 2026-07-15
**Architecture constraint:** classic-script/CommonJS dual-use, Manifest V3, no new runtime or dependency
