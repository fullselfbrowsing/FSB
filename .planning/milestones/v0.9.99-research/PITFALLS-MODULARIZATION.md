# Domain Pitfalls: Content Script Modularization and Tech Debt Cleanup

**Domain:** Splitting a 13,429-line Chrome Extension content script into modules; removing dead code; making hardcoded values configurable
**Researched:** 2026-02-21
**Confidence:** HIGH (based on direct codebase analysis of content.js + Chrome Extension API documentation + community patterns)

---

## Critical Pitfalls

Mistakes that cause the extension to stop working entirely, produce silent regressions, or create bugs that are extremely difficult to diagnose.

---

### Pitfall 1: The Re-Injection Guard Wraps Everything in a Single if/else Block

**What goes wrong:** The entire content.js (all 13,429 lines) is wrapped in a single `if/else` block:
```javascript
if (window.__FSB_CONTENT_SCRIPT_LOADED__) {
  // Already loaded - skip re-injection
} else {
  window.__FSB_CONTENT_SCRIPT_LOADED__ = true;
  // ... ALL 13,420 lines of code ...
} // End of re-injection guard else block
```
When splitting into multiple files, each file inherits the shared execution context (content scripts listed in `files:[]` share the same global scope). But the guard only protects the FIRST file. If you split `tools.js` and `dom-serializer.js` out of `content.js`, those files will execute EVERY time the script is injected, even on re-injection. This causes:
- Duplicate `chrome.runtime.onMessage.addListener()` calls (if moved to a sub-file)
- Re-initialization of MutationObservers (creating duplicates)
- Re-assignment of global singletons (`elementCache`, `domStateManager`, `progressOverlay`)

**Why it happens:** The re-injection guard is a single `if/else` in content.js. When code moves to separate files, the guard no longer protects those files. Each file needs its own guard, or the guard must be restructured.

**Consequences:**
- Double/triple message handlers responding to the same message (the first response wins, the rest are silently ignored by Chrome, but the SIDE EFFECTS of all handlers still run)
- Multiple MutationObservers watching the same DOM tree, causing performance degradation
- Memory leaks from orphaned observers and event listeners
- "Maximum call stack exceeded" if re-injection triggers initialization code that references itself

**Prevention:**
1. Move the re-injection guard into its own file that loads FIRST and sets `window.__FSB_CONTENT_SCRIPT_LOADED__`. All other files check this flag at their top level and bail out immediately.
2. Alternatively, restructure each module file to be idempotent: check if its specific global (e.g., `window.__FSB_TOOLS__`) already exists before defining it. This is more robust than a single flag.
3. The current `handleBackgroundMessage` is registered as a named function reference: `chrome.runtime.onMessage.addListener(handleBackgroundMessage)`. Chrome deduplicates identical function references, so this specific pattern is safe ONLY if the exact same function reference is used. If a new file defines a different function and registers it, both will fire.

**Warning signs (detect early):**
- After splitting, console shows `[FSB Fallback]` warnings on every page refresh (the `automationLogger` fallback is being used in a file that loaded before `automation-logger.js`)
- Messages are handled twice: `automationLogger.logComm` appears in pairs in the debug console
- Performance degrades noticeably on pages with frequent DOM mutations

**Phase to address:** Phase 1 -- Must be solved BEFORE any code is moved out.

---

### Pitfall 2: Load Order Dependencies Between Split Files via chrome.scripting.executeScript

**What goes wrong:** FSB injects content scripts programmatically, NOT via manifest `content_scripts`:
```javascript
// background.js line 1636
await chrome.scripting.executeScript({
  target: { tabId, frameIds: [0] },
  files: ['utils/automation-logger.js', 'content.js'],
  world: 'ISOLATED',
  injectImmediately: true
});
```
There is a documented dependency: `automation-logger.js` MUST load before `content.js` (see background.js comment at line 1631-1634). When content.js is split into multiple files, EVERY file that references `automationLogger` (167 call sites), `elementCache`, `domStateManager`, `tools`, `refMap`, or any other shared object must be listed AFTER the file that defines it.

The `files:[]` array in `chrome.scripting.executeScript` executes files in the order listed. But there is a second injection path at background.js line 8104:
```javascript
await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ['content.js']  // ONLY content.js, no automation-logger.js!
});
```
This path does NOT include `automation-logger.js`. After modularization, this path must also include ALL new module files in the correct order.

**Why it happens:** There are MULTIPLE injection points in background.js that inject content scripts. When you add new files to the array in one place, you must find and update ALL injection sites. Missing one creates an intermittent failure that only manifests in specific navigation flows (new tab opens, page refreshed via user action, etc.).

**Consequences:**
- `ReferenceError: automationLogger is not defined` crashes the content script before the message handler is registered, causing ALL automation to fail silently
- Background script health checks (`healthCheck` message) timeout because no message handler is listening
- The error is intermittent: it only occurs when the secondary injection path is used (e.g., opening a new tab during automation)

**Prevention:**
1. Search background.js for ALL `executeScript` calls: there are currently FOUR (lines 1636, 5689, 8104, 8376). Each must be updated with the full file list in the correct order.
2. Create a constant array of content script files in background.js: `const CONTENT_SCRIPT_FILES = ['utils/automation-logger.js', 'content/core.js', 'content/tools.js', ...]` and use this constant in ALL injection sites.
3. Write a manual smoke test: after splitting, verify that automation works in (a) normal page load, (b) new tab opened by automation, (c) page navigated by automation, (d) page refreshed during automation. These test all four injection paths.
4. Note: the injection at line 5689 uses `world: 'MAIN'` (not ISOLATED) for credential filling -- this is a different injection type and should NOT include the content script modules.

**Warning signs (detect early):**
- Automation works on the first page but fails after navigation to a new tab
- Background script logs show `healthCheck` timeouts after page navigation
- Console errors appear only on certain pages or navigation flows, not consistently

**Phase to address:** Phase 1 -- Must create the constant array and update all injection sites.

---

### Pitfall 3: Duplicate Function Names That Silently Shadow Each Other

**What goes wrong:** content.js currently has TWO `generateSelector()` function definitions:
- Line 2986: Full implementation with ARIA-first strategy, role-based selectors, unique attribute matching (57 lines)
- Line 10759: Simpler implementation with basic ID/testid/aria-label/class fallback (50 lines)

In a single file, the SECOND definition (line 10759) silently shadows the first. JavaScript function declarations are hoisted, and the last definition wins. The code currently works only because everything downstream happens to call the second definition or uses the separate `generateSelectors()` (plural) function at line 9609.

When splitting into modules, each function moves to a separate file. Now which file gets `generateSelector`? If the simpler one (line 10759) goes to `dom-serializer.js` and the complex one (line 2986) goes to `selector-utils.js`, and `selector-utils.js` loads after `dom-serializer.js`, the complex one shadows the simple one. But if the load order is reversed, the simple one shadows the complex one. Either way, callers that depended on a specific version get the wrong one.

**Why it happens:** The duplicate was never caught because JavaScript does not warn about function redeclaration in non-strict mode. In a single file, it was a latent bug. Modularization turns it into an active bug.

**Consequences:**
- Selector generation behavior changes unpredictably depending on file load order
- If the wrong `generateSelector` wins, selectors become less reliable (the simpler version lacks ARIA-first strategy), causing action failures
- Debugging is extremely difficult because both functions have the same name and similar signatures

**Prevention:**
1. Before splitting, audit ALL function names for duplicates. Run: `grep -n '^function ' content.js | awk '{print $2}' | sort | uniq -d`. Currently `generateSelector` is the known duplicate, but there may be others.
2. Resolve the duplicate: determine which implementation is correct, remove the other, and rename if both are needed (e.g., `generateBasicSelector` vs `generateRobustSelector`). Note: there is already a `generateBasicSelector` at line 10526 and a `generateSelectors` (plural) at line 9609. The naming is confused and needs to be untangled.
3. After resolving, add `'use strict';` to each new module file. Strict mode prevents accidental global variable creation and makes some shadowing issues throw errors.

**Warning signs (detect early):**
- After splitting, selector-based actions (click, type) start failing on pages that previously worked
- The `generateSelector` function in the debugger shows a different implementation than expected
- Action failure logs show selectors in a different format than before (e.g., simple tag+class selectors instead of ARIA-based selectors)

**Phase to address:** Phase 1 (audit and resolve) -- Before any file splitting begins.

---

### Pitfall 4: Message Handler Registration Race Condition During Module Loading

**What goes wrong:** The message handler `handleBackgroundMessage` is registered at line 13108:
```javascript
chrome.runtime.onMessage.addListener(handleBackgroundMessage);
```
This is near the END of the 13,429-line file. It depends on everything defined above it: the `tools` object (line 5546-9252, 3,700+ lines), `getStructuredDOM()` (line 11772), `handleAsyncMessage()` (line 12248), `elementCache` (line 728), `progressOverlay` (line 1360), `viewportGlow` (line 1676), `actionGlowOverlay` (line 1899), and many more.

If modularization puts the message handler registration in an early-loading file while the tools or DOM functions are in a later-loading file, background.js could send a message BEFORE the tools are defined. The message handler would fire, reach `tools[tool]` at line 12340, find it `undefined`, and return `{ success: false, error: 'Unknown tool: click' }`.

**Why it happens:** Background.js sends a `contentScriptReady` message as soon as any content script file sends the ready signal (content.js line 13352). It then immediately starts the automation loop which sends `getDOM` and `executeAction` messages. If the ready signal fires from an early module but tools are not yet defined (waiting for a later module to load), the race begins.

The ready signal is currently sent at line 13336-13380 via an IIFE that runs immediately. If this code moves to a module that loads before the tools module, the background script receives "ready" before tools are actually ready.

**Consequences:**
- First few actions of every automation session fail with "Unknown tool" errors
- `getDOM` returns undefined/error because `getStructuredDOM` is not yet defined
- Background script's stuck detection kicks in, wastes 3-5 iterations retrying
- Appears intermittent because it depends on how fast the browser loads each file

**Prevention:**
1. The ready signal (lines 13336-13380) and the message handler registration (line 13108) must be in the LAST file loaded. They are the "entry point" and must not fire until all dependencies are available.
2. Alternatively, the message handler can check if dependencies exist before using them:
   ```javascript
   if (!tools || !tools[tool]) {
     sendResponse({ success: false, error: 'Content script still initializing', retryable: true });
     return;
   }
   ```
   And background.js should handle the `retryable: true` flag by waiting and re-sending.
3. Each module file should define its exports on a namespace object (e.g., `window.__FSB__.tools = tools;`) rather than using bare globals. The message handler file reads from this namespace, making dependency checking explicit.

**Warning signs (detect early):**
- "Unknown tool: click" errors appear in logs only for the FIRST action of a session
- The error rate is higher on slow pages (more time between file loads = wider race window)
- `contentScriptReady` message arrives at background.js, but `healthCheck` fails a moment later

**Phase to address:** Phase 2 -- When restructuring the message handler and ready signal.

---

### Pitfall 5: chrome.storage.local Async Gap When Making Hardcoded Values Configurable

**What goes wrong:** Several values in content.js are currently hardcoded constants used synchronously:
- `ElementCache.maxCacheSize = 100` (line 619)
- `DOMStateManager.config.maxUnchangedElements = 50` (line 181)
- `DOMStateManager.config.textTruncateLength = 100` (line 186)
- `_ELEMENT_INDEX_TTL = 2000` (line 874)
- `MAX_RECONNECT_ATTEMPTS = 5` (line 13255)

Making these configurable via `chrome.storage.local` means they become asynchronous. `chrome.storage.local.get()` returns a Promise. Content scripts run synchronously at injection time -- the `ElementCache` constructor runs immediately, and `this.maxCacheSize = 100` must be a concrete value RIGHT NOW, not a promise.

The naive fix `chrome.storage.local.get('maxCacheSize').then(v => this.maxCacheSize = v)` creates a window where the cache operates with the default value (100) until the storage read completes (~2-10ms on fast systems, potentially 50-200ms on slow systems). During this window, if a DOM analysis runs, it uses the wrong cache size.

**Why it happens:** `chrome.storage.local.get()` is asynchronous. Content script initialization is synchronous. There is no way to synchronously read from chrome.storage. The official Chrome documentation recommends: "Cache data retrieved from storage by storing the asynchronous get operation in a variable, then await that initialization Promise before executing event handlers that depend on the data."

But FSB's content script does not have a single async entry point that everything awaits. The MutationObserver starts immediately, `elementCache.initialize()` runs at lines 13191/13204, and the message handler is registered synchronously.

**Consequences:**
- Configuration values are ignored for the first few milliseconds of script execution
- If the user sets `maxCacheSize = 500` in options, the ElementCache starts with 100 and only switches to 500 after an async read completes. If cache eviction happens in that window, entries are needlessly evicted.
- The race window is small for most values, but for timing-sensitive values like `_ELEMENT_INDEX_TTL`, even a brief wrong value can cause stale element lookups.
- Worse: if `chrome.storage.local.get()` fails (extension context invalidated during page navigation), the callback never runs, and the value stays at the hardcoded default forever for that session.

**Prevention:**
1. Use a two-phase initialization pattern:
   - Phase A (synchronous): Define all modules with hardcoded defaults (keep current behavior as fallback).
   - Phase B (async): Read from `chrome.storage.local`, update the configuration, and ONLY THEN register the message handler and send the ready signal.
   This means the ready signal (lines 13336-13380) must await the config load.
2. For values that are not timing-critical (maxCacheSize, maxUnchangedElements), the async gap is acceptable. Document which values tolerate the gap and which do not.
3. Listen for `chrome.storage.onChanged` to update values at runtime when the user changes settings in the options page. This is already a pattern in background.js but not in content.js.
4. Never await `chrome.storage.local.get()` in a MutationObserver callback or a message handler's synchronous path. Cache the value in a module-level variable and update it asynchronously.

**Warning signs (detect early):**
- Options page changes do not take effect until the page is refreshed (missing `onChanged` listener)
- ElementCache evicts entries it should not (default maxCacheSize is too small for the configured value)
- Configuration values appear correct in logs but wrong in behavior (the async read completed after the first use)

**Phase to address:** Phase 3 -- When converting hardcoded values to configurable settings.

---

## Moderate Pitfalls

Mistakes that cause degraded behavior, intermittent failures, or technical debt that compounds over time.

---

### Pitfall 6: Shared Mutable State Across Module Files Without Explicit Contracts

**What goes wrong:** content.js has 30+ mutable global variables that are read and written by functions scattered across the file:
- `currentSessionId` (line 40): Written by `handleBackgroundMessage` (line 12807), read by 128 call sites throughout the file
- `previousDOMState` (line 867): Written by `getStructuredDOM()`, read by the incremental diff system
- `domStateCache` (line 868): Shared Map between DOM serialization and tools
- `_elementIndexes` and `_elementIndexTimestamp` (lines 872-873): Written by `getElementIndexes()`, invalidated by `invalidateElementIndexes()`
- `lastNotificationTime`, `accumulatedChanges`, `significantChangeTimeout` (lines 13111-13113): Written by the MutationObserver callback
- `backgroundPort`, `reconnectAttempts` (lines 13253-13254): Connection state
- `lastActionStatusText` (line 1363): UI state

When these move to different files, the variable lives in one file but is accessed in another. In Chrome Extension content scripts (without a build system), files share the global scope in the ISOLATED world. But the variable declaration style matters:
- `var` declarations are function-scoped and become true globals accessible via `window.varName`. Inside the current `else` block, `var` still hoists to the function/global scope (since `var` ignores block scoping).
- `let` and `const` declarations are block-scoped. Currently they live inside the `else` block. When the `else` block is removed during modularization, they become script-level declarations that ARE accessible across files in the same execution context (but NOT via `window.varName`).

The real danger is when File A defines a `let` variable and File B writes to it. If File B accidentally re-declares it with its own `let`, it creates a NEW variable in File B's script scope, shadowing the one in File A. Writes in File B do not affect File A's variable.

**Consequences:**
- `currentSessionId` is undefined in some module files, causing all logging to show `sessionId: null`
- `previousDOMState` is defined in the DOM module but needed by the tools module for context, creating a circular dependency
- State changes in one module are invisible to another module because they reference different variables (if accidentally re-declared with `let`)

**Prevention:**
1. Create a shared state module (`content/state.js`) that loads first and defines all shared mutable state on a namespace object:
   ```javascript
   window.__FSB_STATE__ = {
     currentSessionId: null,
     previousDOMState: null,
     domStateCache: new Map(),
     // ... etc
   };
   ```
   All other modules read/write via `window.__FSB_STATE__`. This makes dependencies explicit and avoids scope ambiguity.
2. Catalog every mutable global variable before splitting. For each variable, document which functions READ it and which WRITE it. This creates an explicit dependency map.
3. Avoid `let`/`const` at the top level of module files for shared state. Use a namespace object on `window` to make cross-file sharing intentional rather than accidental.

**Warning signs (detect early):**
- `sessionId: null` in automation logs even though the session is active
- DOM diff always shows "initial" (previousDOMState is always null because it is defined in the wrong module)
- Changing a variable in one module has no effect (it was accidentally re-declared in the other module)

**Phase to address:** Phase 1 -- State inventory must happen before splitting.

---

### Pitfall 7: MutationObserver and Event Listener Duplication After Re-Injection

**What goes wrong:** content.js creates three MutationObservers:
1. `DOMStateManager.initMutationObserver()` (line 193-218): Tracks DOM changes for incremental diffing
2. `ElementCache.initialize()` (line 625-643): Invalidates the selector cache on structural changes
3. Global observer (line 13148-13180): Detects significant DOM changes and notifies background.js

Plus event listeners:
4. `window.addEventListener('error', ...)` (line 13383)
5. `window.addEventListener('unhandledrejection', ...)` (line 13412)
6. Google SPA detection: `window.addEventListener('popstate', ...)` (line 13241)
7. `history.pushState` and `history.replaceState` monkey-patching (lines 13221-13238)

If any of these move to module files that lack re-injection guards, they will be created AGAIN on every re-injection. MutationObservers are NOT deduplicated by the browser. Adding the same observer config twice creates two observers, each firing callbacks independently. This doubles the callback frequency, doubles the memory usage, and doubles the message volume to background.js.

The `history.pushState` monkey-patching is especially dangerous: re-patching wraps the already-patched function, creating a chain where `originalPushState.apply(this, args)` calls the previously-patched version, which calls the one before that, and so on -- an ever-growing call chain that degrades performance and can overflow the stack.

**Consequences:**
- DOM mutation callbacks fire N times (where N = number of re-injections)
- Background.js receives N `domChanged` messages for every significant DOM change, causing unnecessary re-analysis
- `history.pushState` call chain grows with each re-injection, potentially causing stack overflow on Google SPA pages
- Memory leaks from orphaned MutationObserver instances that are never disconnected
- Performance degradation that worsens with each re-injection

**Prevention:**
1. Each observer/listener must be guarded with its own flag:
   ```javascript
   if (!window.__FSB_GLOBAL_OBSERVER__) {
     window.__FSB_GLOBAL_OBSERVER__ = new MutationObserver(...);
     window.__FSB_GLOBAL_OBSERVER__.observe(document.body, ...);
   }
   ```
2. For history monkey-patching, check if the function is already patched:
   ```javascript
   if (!history.pushState.__fsb_patched) {
     const original = history.pushState;
     history.pushState = function(...args) { ... original.apply(this, args); };
     history.pushState.__fsb_patched = true;
   }
   ```
3. Store all observer/listener references on a cleanup namespace (`window.__FSB_CLEANUP__`) so they can be explicitly disconnected on extension update or unload.

**Warning signs (detect early):**
- `domChanged` messages appear in pairs or triplets in background.js logs
- Memory usage climbs steadily on long-running tabs
- Stack overflow errors on Google search pages after multiple re-injections

**Phase to address:** Phase 2 -- When moving observers to their own module.

---

### Pitfall 8: Removing Dead Code That Has Hidden Runtime References

**What goes wrong:** `waitForActionable()` (line 4425, ~80 lines) appears to be dead code -- no callers reference it within content.js. However:
1. Background.js could reference it via `chrome.scripting.executeScript({ func: ... })` dynamically.
2. The `tools` object at line 4469 references `tools.detectLoadingState` from WITHIN `waitForActionable`, meaning this function has a dependency on the tools object. If someone later re-enables it, the dependency must still be valid.
3. The AI prompt engineering in `ai-integration.js` may reference `waitForActionable` as a tool name. If the AI generates `{ tool: "waitForActionable", params: {...} }`, the `tools[tool]` lookup at line 12340 would look for it.

More generally, dead code in a Chrome Extension is harder to identify than in a regular application because:
- The background script can call ANY function in the content script's global scope via `chrome.scripting.executeScript({ func: ... })`
- The AI can generate tool names dynamically based on the system prompt
- Third-party sites cannot access the isolated world, but the extension's popup/sidepanel CAN via messaging

**Consequences:**
- Removing a function that IS referenced (just not via grep-able calls) breaks a specific code path
- The break is intermittent because it only occurs when the AI chooses that tool or the background script uses that execution path
- The error appears as "Unknown tool" or "function is not defined" in production, not in testing

**Prevention:**
1. Before removing dead code, check ALL possible callers:
   - `grep -r "waitForActionable" .` across the entire codebase (not just content.js)
   - Check the AI system prompt in `ai-integration.js` for references to the function name
   - Check the `tools` object keys to see if it was ever a registered tool
   - Check `chrome.scripting.executeScript({ func: ... })` calls in background.js
2. For `waitForActionable` specifically: it is NOT in the `tools` object (line 5546-9252), NOT referenced in background.js via `executeScript({ func })`, and NOT referenced in ai-integration.js prompts. It IS safe to remove. But this verification must be done for EACH piece of dead code.
3. Instead of deleting dead code in the first pass, comment it out with a `// DEAD CODE - remove after v9.1 if no regressions` tag. After one release cycle with no issues, delete it.

**Warning signs (detect early):**
- After removing a function, the AI occasionally generates a tool call that references it
- An action that "used to work" starts failing intermittently after cleanup
- Error logs show "function is not defined" on specific pages or task types

**Phase to address:** Phase 2 -- During dead code removal, with a verification checklist for each removal.

---

### Pitfall 9: Shadow DOM Overlay Classes Lose Their Host ID Coordination

**What goes wrong:** Four classes in content.js create Shadow DOM elements for visual overlays:
- `ProgressOverlay` (line 1100-1360): Creates `#fsb-progress-host` with shadow DOM
- `ViewportGlow` (line 1378-1676): Creates `#fsb-viewport-glow-host` with shadow DOM
- `ActionGlowOverlay` (line 1685-1899): Creates `#fsb-action-glow-host` with shadow DOM
- `ElementInspector` (line 1908-2095): Creates `#fsb-inspector-overlay` with shadow DOM

These are coupled to:
- The `FSB_HOST_IDS` Set (line 118-125) which lists all overlay host IDs
- The `isFsbElement()` function (line 127-141) which checks `FSB_HOST_IDS` to exclude FSB's own elements from DOM analysis
- The DOM serialization pipeline (`getStructuredDOM()`, `getFilteredElements()`) which calls `isFsbElement()` to skip FSB overlays

If the overlay classes move to a `content/overlays.js` module but `FSB_HOST_IDS` stays in a different module, changes to overlay host IDs must be synchronized across files. More critically, if `isFsbElement()` loads before the overlays module and uses `FSB_HOST_IDS`, that set must be complete at load time. Any overlay host ID added by a later-loading module will not be in the set, causing FSB's own overlay elements to appear as interactive DOM elements in the AI's page analysis.

**Consequences:**
- AI tries to click on FSB's progress overlay because it appears as an interactive element
- DOM analysis includes FSB's glow elements, inflating the element count and wasting tokens
- If overlay singletons are re-created on re-injection (see Pitfall 7), duplicate overlays appear on screen

**Prevention:**
1. Keep `FSB_HOST_IDS` and `isFsbElement()` in the same module as the overlay classes, or in a shared constants module that loads before both the overlay module and the DOM analysis module.
2. If overlays move to a separate file, the host IDs must be defined in a constants file that loads before both the overlay module and the DOM analysis module.
3. Test that `getStructuredDOM()` never returns elements with IDs matching FSB's overlay host IDs. Add this as an assertion in the DOM serialization code.

**Warning signs (detect early):**
- DOM snapshot includes elements with `id: 'fsb-progress-host'` or similar
- Element count is higher than expected (FSB elements appearing in the count)
- AI generates actions targeting FSB overlay elements

**Phase to address:** Phase 2 -- When extracting overlay code to a separate module.

---

### Pitfall 10: The tools Object References Functions Defined Throughout the 13K-Line File

**What goes wrong:** The `tools` object (lines 5546-9252, approximately 3,700 lines) contains tool functions that reference utility functions defined both BEFORE and AFTER the tools object in the file:

Functions defined BEFORE the tools object and used by tools:
- `querySelectorWithShadow()` (line 3179)
- `generateSelector()` (line 2986)
- `elementCache.get()/set()` (line 728)
- `highlightManager` (line 1024)
- `actionRecorder` (line 5269)
- `captureActionState()` (line 4764)
- `verifyActionEffect()` (line 4948)
- `generateDiagnostic()` (line 5102)

Functions defined AFTER the tools object and referenced by tools (if they call these at runtime):
- `getFilteredElements()` (line 11490)
- `detectSearchNoResults()` (line 10992)
- `extractErrorMessages()` (line 11065)
- `detectCompletionSignals()` (line 11119)

In a single file, this works because `function` declarations are hoisted throughout the enclosing scope. When modularized, functions in a later-loading file ARE accessible from an earlier file as long as:
1. They are `function` declarations (hoisted within their own script's scope)
2. They are at global scope level
3. The calling function is invoked AFTER all files have loaded (not at definition time)

Since tool functions are arrow functions inside an object literal, they are only invoked when a message arrives (well after all files load). So cross-file references work IF the referenced functions are `function` declarations. But if they are `const` or `let` (not hoisted), or if some tool initialization code runs at definition time, references to later-file functions will be `undefined`.

**Consequences:**
- Tool function calls that reference functions from other modules throw `ReferenceError` at runtime
- The error only appears when the specific tool is invoked, not at load time
- Works in quick testing, fails when a rarely-used tool is called

**Prevention:**
1. Audit which functions the tools object calls. Create an explicit dependency list.
2. Use `function` declarations (not `const`/arrow) for utility functions that must be available across modules, since `function` declarations at global scope are hoisted within each script.
3. Better: pass dependencies explicitly. Instead of the tools object referencing global `querySelectorWithShadow`, have the tools module receive it as a parameter:
   ```javascript
   function createTools(deps) {
     const { querySelectorWithShadow, elementCache, highlightManager } = deps;
     return { click: async (params) => { ... }, ... };
   }
   ```
4. At minimum, verify that all referenced functions use `function` declaration syntax (not `const fn = ...` or `let fn = ...`), since those are NOT hoisted across scripts.

**Warning signs (detect early):**
- `ReferenceError: detectSearchNoResults is not defined` when AI invokes the `searchGoogle` tool
- Tools work fine in isolation tests but fail in actual automation (timing-dependent)
- Only some tools fail; others work (depending on which cross-file references they have)

**Phase to address:** Phase 2 -- When extracting the tools object to its own module.

---

## Minor Pitfalls

Mistakes that cause annoyance, minor bugs, or code quality issues but are recoverable.

---

### Pitfall 11: memory-extractor.js Constructor Arguments Mismatch

**What goes wrong:** The `MemoryExtractor` class in `lib/memory/memory-extractor.js` has a parameterless constructor:
```javascript
class MemoryExtractor {
  constructor() {
    this._provider = null;
  }
}
```
If there is an instantiation somewhere that passes constructor arguments (e.g., `new MemoryExtractor(provider, config)`), those arguments are silently ignored. JavaScript does not throw on extra constructor arguments. The provider is lazily loaded via `_getProvider(context)` instead.

This is not a modularization pitfall per se, but it is a tech debt item that should be verified during cleanup. If other callers expect the constructor to accept a provider, they will silently create a non-functional instance.

**Consequences:**
- Provider passed to constructor is ignored; memory extraction falls back to local extraction
- No error thrown, no warning logged -- the failure is completely silent
- Memory extraction quality degrades without any visible signal

**Prevention:**
1. Search for all `new MemoryExtractor(` calls across the codebase and verify they match the constructor signature.
2. Add parameter validation: if arguments are passed to the constructor, either use them or warn that they are being ignored.

**Warning signs (detect early):**
- Memory extraction always uses "local fallback extraction" even when an AI provider is configured
- Memory quality is lower than expected (generic memories instead of AI-extracted ones)

**Phase to address:** Phase 3 -- During constructor argument fixes.

---

### Pitfall 12: Implicit Dependency on the else Block for Variable Scoping

**What goes wrong:** Without a build system, Chrome Extension content scripts rely on file ordering for variable availability. The current content.js uses `var` for `automationLogger` (line 12) and `currentSessionId` (line 40), which have `var`'s function-scope behavior (ignoring the `else` block scope). But it uses `const` for singletons like `elementCache` (line 728) and `let` for mutable state like `previousDOMState` (line 867), which are block-scoped to the `else` block.

When the `else` block wrapper is removed during modularization, all `var` declarations become true global declarations accessible via `window`. `let` and `const` declarations, however, do NOT go on `window` -- they are script-scoped. This creates an inconsistency:
- `var automationLogger` in file A is accessible as `window.automationLogger` in file B
- `const elementCache` in file A is NOT accessible as `window.elementCache` in file B (though it IS accessible as bare `elementCache` if both files share the same execution context in the ISOLATED world)

This inconsistency can cause confusion during modularization:
- Some variables work when accessed as `window.X` and some do not, depending on declaration keyword
- Adding `'use strict';` to module files changes scoping behavior
- If any module accidentally re-declares a variable with `let` that was previously shared via `var`, it creates a new variable instead of sharing the original

**Consequences:**
- Subtle bugs where a variable appears to have the correct value in one module but is undefined in another
- `window.elementCache` is undefined (because it was `const`), but bare `elementCache` works -- leading to confusion when debugging
- A `let` re-declaration in one file shadows the shared variable, causing silent state divergence

**Prevention:**
1. Standardize on one approach for all cross-file shared variables: either always use `window.__FSB__` namespace (explicit, works with any declaration keyword) or rely on the shared execution context (implicit, but requires understanding Chrome Extension content script scoping).
2. Recommended: Use the `window.__FSB__` namespace approach. It is explicit, works in strict mode, and makes cross-file dependencies obvious in the code.
3. After splitting, verify that no module file re-declares a variable that should be shared. Search each new file for `let` or `const` declarations of known shared variable names.

**Warning signs (detect early):**
- `typeof elementCache === 'undefined'` in a later-loading module even though it was defined in an earlier-loading module
- Inconsistent behavior between `var` and `const` globals when accessed via `window`
- Strict mode errors (`Assignment to undeclared variable`) after adding `'use strict';`

**Phase to address:** Phase 1 -- Decide on the scoping strategy before splitting.

---

### Pitfall 13: The Second executeScript Injection Path Omits Dependencies

**What goes wrong:** Background.js line 8104 injects content scripts into new tabs:
```javascript
await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ['content.js']
});
```
This does NOT inject `automation-logger.js` first. After modularization, this path would need to inject ALL module files. But this is also a pre-existing bug: even now, if this path is triggered, `content.js` loads without `automationLogger`, falls back to the console-based stub (line 12-33), and operates with degraded logging.

Post-modularization, this bug becomes critical: the single `content.js` file may no longer exist (or may be renamed/split). If it is split into `content/core.js`, `content/tools.js`, `content/dom.js`, etc., the injection at line 8104 injects a file that does not exist, or injects only a partial content script.

**Consequences:**
- New tabs opened by automation have no content script at all (file not found)
- Or they have only a partial content script (if `content.js` still exists as an entry point but no longer contains the tools)
- Automation fails silently on the new tab

**Prevention:**
1. Create the `CONTENT_SCRIPT_FILES` constant (see Pitfall 2 prevention) and use it in ALL injection sites, including this one.
2. Better: Create an `injectContentScripts(tabId, options)` helper function in background.js that encapsulates the injection logic (file list, world, frameIds), and call this function from all injection sites. This eliminates the risk of forgetting to update one site.
3. Search for `files: ['content.js']` across the entire codebase after splitting. Every instance must be updated.

**Warning signs (detect early):**
- Automation works on the initial page but fails completely on new tabs
- Console shows "Could not find file 'content.js'" errors in the extension's service worker

**Phase to address:** Phase 1 -- Must be addressed as part of the injection path update.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Severity |
|---|---|---|---|
| Setting up module structure | #1: Re-injection guard only protects one file | Extract guard to shared module; make all files idempotent | CRITICAL |
| Setting up module structure | #12: var/let/const scoping inconsistencies | Standardize on `window.__FSB__` namespace | MODERATE |
| Setting up module structure | #6: Shared mutable state without contracts | Create state inventory; define shared state module | MODERATE |
| Updating injection paths | #2: Multiple executeScript call sites | Create `CONTENT_SCRIPT_FILES` constant; `injectContentScripts()` helper | CRITICAL |
| Updating injection paths | #13: Second injection path only injects content.js | Include in `CONTENT_SCRIPT_FILES` update | CRITICAL |
| Resolving naming conflicts | #3: Duplicate generateSelector definitions | Resolve before splitting; rename or remove duplicate | CRITICAL |
| Moving tools to separate file | #10: Tools reference functions from other modules | Audit cross-references; ensure function declarations (not const) | MODERATE |
| Extracting overlays module | #9: FSB_HOST_IDS out of sync with overlay classes | Keep IDs and overlay classes co-located or in shared constants | MODERATE |
| Extracting observers | #7: MutationObserver/listener duplication on re-injection | Guard each observer with its own flag; store on namespace | MODERATE |
| Message handler restructure | #4: Race between ready signal and dependency loading | Message handler + ready signal must be in LAST loaded file | CRITICAL |
| Dead code removal | #8: Hidden runtime references to "dead" code | Verify across ALL callers including AI prompts and dynamic calls | MODERATE |
| Making values configurable | #5: chrome.storage.local async initialization gap | Two-phase init; ready signal waits for config load | CRITICAL |
| Constructor fixes | #11: MemoryExtractor constructor mismatch | Verify all call sites; add parameter validation | MINOR |

---

## Recommended Phase Ordering Based on Pitfalls

The pitfalls above create a natural dependency chain for safe modularization:

**Phase 1: Pre-Split Preparation (must happen before any files are created)**
1. Resolve duplicate function names (#3) -- audit all, rename/remove duplicates
2. Create shared state inventory (#6) -- catalog every mutable global with readers/writers
3. Decide on scoping strategy: `window.__FSB__` namespace (#12) -- standardize before code moves
4. Create `CONTENT_SCRIPT_FILES` constant and `injectContentScripts()` helper (#2, #13) -- all injection sites use one constant
5. Design the re-injection guard strategy for multiple files (#1) -- each file guards itself or uses shared flag

**Phase 2: File Extraction (actual splitting)**
1. Extract shared state module (loads first)
2. Extract utility functions module (selector generation, DOM queries)
3. Extract overlay classes module (with FSB_HOST_IDS, #9)
4. Extract tools object module (with dependency audit, #10)
5. Extract DOM serialization module
6. Extract MutationObserver/event listener module (with individual guards, #7)
7. Keep message handler + ready signal in entry point file (loads last, #4)
8. Remove confirmed dead code with verification (#8)

**Phase 3: Tech Debt Cleanup (after splitting is stable)**
1. Fix memory-extractor.js constructor (#11)
2. Convert hardcoded values to chrome.storage.local with two-phase init (#5)
3. Add `chrome.storage.onChanged` listener for runtime config updates

This ordering ensures that no phase introduces a pitfall that a later phase would need to fix.

---

## Sources

- Direct codebase analysis: `content.js` (13,429 lines), `background.js` (executeScript injection sites at lines 1636, 5689, 8104, 8376), `lib/memory/memory-extractor.js`
- [Chrome Content Scripts Documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) -- execution worlds, load order: "Files are injected in the order they appear in this array"
- [Chrome Scripting API Documentation](https://developer.chrome.com/docs/extensions/reference/api/scripting) -- executeScript file array behavior
- [Chrome Storage API Documentation](https://developer.chrome.com/docs/extensions/reference/api/storage) -- async initialization patterns, race conditions, onChanged events
- [Chrome Message Passing Documentation](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) -- multiple listener behavior: "only the first to call sendResponse() for a particular event will succeed"
- [Chromium Extensions Group: Duplicate Message Listeners](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/bz-9H09dqWE) -- addListener creates duplicates, does not replace
- [Chromium Extensions Group: Avoiding Duplicate Injections](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/uNXEDCsrgHc) -- re-injection guard patterns, documentId approach
- [Chromium Extensions Group: Concurrent Storage Updates](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/y5hxPcavRfU) -- Storage API has no transaction support
- [Chromium Extensions Group: Loading Multiple JS Files](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/f-R0FHr0izY) -- multiple file content script ordering
- [Chrome Manifest content_scripts Reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts) -- file array injection order guarantee
