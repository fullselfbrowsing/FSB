---
phase: 269
reviewed: 2026-05-14T00:00:00Z
depth: standard
status: findings_found
findings_count: 13
findings:
  blocker: 2
  major: 3
  minor: 3
  nit: 5
files_reviewed: 5
files_reviewed_list:
  - extension/utils/install-identity.js
  - extension/background.js
  - extension/ui/control_panel.html
  - tests/install-identity.test.js
  - package.json
---

# Phase 269: Code Review Report

**Reviewed:** 2026-05-14
**Depth:** medium (privacy-critical foundation code)
**Files Reviewed:** 5 (diffs only for `background.js` + `control_panel.html`; full content for the new files)
**Status:** findings_found

## Summary

The install-identity module itself is well-scoped, defensively-coded, and the test
coverage hits the IDENT-01..05 + CONS-01/CONS-02 requirements directly. The module's
storage namespace is exclusively `chrome.storage.local` (IDENT-04 grep gate holds),
the v4 regex is shape-correct, exports are identity-only (IDENT-05), and the test
harness exercises all four primary paths (mint-once, reuse, null-on-error, opt-out
round-trip + corruption re-mint).

However, the wiring that connects the module to the UI has two **runtime-blocking
defects** that will silently brick the kill-switch entirely on a real Chrome MV3
install, plus three correctness/maintainability MAJOR issues. The unit tests pass
because they target the module in isolation; they do not load `control_panel.html`
in a real browser, so they do not catch the CSP violation or the broken policy
URL. The plan-doc's "human_verification" steps 3-5 would catch BL-01 and BL-02
the first time a developer clicks the toggle.

The two BLOCKERs MUST be fixed before this code ships: CONS-02 (toggle response
within 100ms) is **structurally impossible** under MV3 CSP with the current
inline-script approach, regardless of how fast the rest of the code is.

## Blockers

### BL-01: Inline `<script>` block violates MV3 default CSP -- kill-switch never executes

**File:** `extension/ui/control_panel.html:1575-1622`

**Issue:**
The new inline `<script>` block that wires `fsbTelemetryOptOut` storage read / write
to the toggle is the **only** inline `<script>` in any extension UI HTML (verified:
`grep -nE "<script>$" extension/ui/*.html` matches only this file at line 1575;
all other 89 `<script>` tags use `src=`).

MV3's default Content Security Policy for extension pages is
`script-src 'self'; object-src 'self';` -- inline scripts are **blocked at
runtime** with a console error like `Refused to execute inline script because it
violates the following Content Security Policy directive: "script-src 'self'"`.
The extension's `manifest.json` has **no** `content_security_policy` override
(verified: `jq '.content_security_policy' extension/manifest.json` returns `null`).

**Runtime consequence:**
- `DOMContentLoaded` handler never registers -> toggle visual state on first paint
  does NOT reflect the persisted `fsbTelemetryOptOut` value. Toggle always renders
  `checked` (the static HTML default) regardless of prior opt-out.
- `change` listener never registers -> clicking the toggle has **zero effect** on
  `chrome.storage.local`. User opt-out clicks are silently discarded. The visible
  toggle position flips because that's pure browser-native checkbox behavior, but
  no storage write fires.
- CONS-02 ("toggle response within 100ms" backed by a real storage write) is
  structurally unachievable.
- The downstream collector (Phase 272) will see `fsbTelemetryOptOut === undefined`
  for **every user**, and per the module's `isTelemetryOptedOut()` default-false
  contract, telemetry will ship for users who explicitly toggled it OFF. This is
  the worst possible failure mode for a privacy kill switch -- it appears to work
  in the UI but does not actually opt the user out.

**Fix:**
Extract the inline block to `extension/ui/privacy-telemetry-toggle.js`, add the
file to the `<script src="...">` chain alongside `options.js`, and reference the
existing `globalThis.fsbInstallIdentity` API instead of duplicating the storage
key:

```html
<!-- in control_panel.html, replace lines 1575-1622 with: -->
<script src="../utils/install-identity.js"></script>
<script src="privacy-telemetry-toggle.js"></script>
```

```js
// extension/ui/privacy-telemetry-toggle.js  (NEW FILE)
(function () {
  'use strict';
  const TOGGLE_ID = 'fsbTelemetryOptOut';

  function applyAriaLabel(checked) {
    const el = document.getElementById(TOGGLE_ID);
    if (!el) return;
    el.setAttribute('aria-label', checked
      ? 'Anonymous usage data is being sent. Click to stop.'
      : 'Anonymous usage data is NOT being sent. Click to re-enable.');
  }

  async function initPrivacyToggle() {
    const el = document.getElementById(TOGGLE_ID);
    if (!el) return;
    try {
      const optedOut = await globalThis.fsbInstallIdentity.isTelemetryOptedOut();
      el.checked = !optedOut;
      applyAriaLabel(el.checked);
    } catch (_e) {
      el.checked = true;
      applyAriaLabel(true);
    }
    el.addEventListener('change', async () => {
      applyAriaLabel(el.checked);
      try {
        await globalThis.fsbInstallIdentity.setTelemetryOptOut(!el.checked);
      } catch (_e) {
        console.warn('[FSB Telemetry] opt-out write failed');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPrivacyToggle);
  } else {
    initPrivacyToggle();
  }
})();
```

This also resolves MJ-03 (storage-key duplication).

Alternative if you must keep the inline approach: add to `manifest.json`:
```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'sha256-<HASH>'; object-src 'self'"
}
```
where `<HASH>` is the SHA-256 of the inline script body. This is fragile (any
edit invalidates the hash) and not how the rest of the FSB codebase is wired --
**extract to external JS instead**.

---

### BL-02: Privacy policy link `/privacy#telemetry-disclosure` resolves to a 404 inside the extension

**File:** `extension/ui/control_panel.html:658-660`

**Issue:**
```html
<a class="setting-hint" href="/privacy#telemetry-disclosure"
   target="_blank" rel="noopener noreferrer"
   style="display:block; margin-top:8px;">Read full policy &rarr;</a>
```

The `href="/privacy#telemetry-disclosure"` is an **extension-relative absolute
path** (leading `/`). When the user clicks it from
`chrome-extension://<id>/ui/control_panel.html`, the browser resolves it to
`chrome-extension://<id>/privacy#telemetry-disclosure`. There is no
`extension/privacy` file (verified: `find extension -name "privacy*"` returns
empty). Clicking opens a blank/404 tab in the user's extension origin.

The existing canonical pattern in the SAME FILE at line 1434 uses an absolute
external URL: `href="https://full-selfbrowsing.com/privacy.html"`.

The CONTEXT.md (line 84) acknowledges "the anchor target lands in Phase 275" but
that's about the `#telemetry-disclosure` fragment -- the policy PAGE has existed
on the public site since at least the showcase Angular build. Forward-compatible
linking does not require breaking the link today.

The CONS-01 disclosure requirement explicitly cites the "Read full policy" link
as user-facing acceptance criteria. A 404 link fails that requirement.

**Fix:**
```html
<a class="setting-hint" href="https://full-selfbrowsing.com/privacy.html#telemetry-disclosure"
   target="_blank" rel="noopener noreferrer">Read full policy &rarr;</a>
```

(Phase 275 will add the `#telemetry-disclosure` anchor target on the showcase
side; until then the fragment is a benign no-op that scrolls the page to top.)

Also remove the inline `style="display:block; margin-top:8px;"` per NIT-03 and
use an existing class (e.g., `block-link` if it exists, or add to a stylesheet).

---

## Major Findings

### MJ-01: Race condition between `onInstalled` and `onStartup` -- both can mint different UUIDs concurrently on first install

**File:** `extension/utils/install-identity.js:56-81` (function), `extension/background.js:13029-13036` + `13073-13080` (callers)

**Issue:**
Both `chrome.runtime.onInstalled` and `chrome.runtime.onStartup` listeners
`await globalThis.fsbInstallIdentity.getOrCreateInstallUuid()`. Chrome runs
async listener bodies in parallel. On the very first install when both events
fire close together (a documented possibility on cold-start install scenarios
or developer reload-on-install), the following interleaving is possible:

1. Handler A (onInstalled): `await chrome.storage.local.get([KEY])` -> `{}` (miss)
2. Handler B (onStartup): `await chrome.storage.local.get([KEY])` -> `{}` (miss, still no UUID written)
3. Handler A: `crypto.randomUUID()` -> UUID-A
4. Handler B: `crypto.randomUUID()` -> UUID-B (different)
5. Handler A: `await chrome.storage.local.set({ KEY: UUID-A })`
6. Handler B: `await chrome.storage.local.set({ KEY: UUID-B })` (overwrites)
7. Handler A returns UUID-A to its caller; Handler B returns UUID-B.

The persisted value is whichever `.set` lands last (typically UUID-B). The two
seeded-uuid console logs in `background.js` will silently disagree, and ANY
telemetry call dispatched inside Handler A's continuation will use UUID-A while
storage holds UUID-B. After this transient window, every subsequent read sees
the stabilized UUID, so the impact is small but real.

The user prompt explicitly flagged this: "Race conditions between `onInstalled`
and `onStartup` (both can fire close together on first install -- verify
single-mint)." The current implementation does NOT verify single-mint.

**Fix:** Memoize the in-flight Promise at module level so both callers await the
same operation:

```js
var _mintInFlight = null;

async function getOrCreateInstallUuid() {
  if (_mintInFlight) return _mintInFlight;
  _mintInFlight = (async () => {
    try {
      // ... existing body ...
    } catch (_e) {
      return null;
    } finally {
      // Allow re-entry on subsequent SW wakes so callbacks that observed
      // null on a transient failure can retry next boot.
      _mintInFlight = null;
    }
  })();
  return _mintInFlight;
}
```

Note: the `finally { _mintInFlight = null }` matters because module state
persists across the entire SW lifetime; without it, a transient storage error
would permanently latch the null result for this SW session.

Add a unit test that fires two concurrent `getOrCreateInstallUuid()` calls
against an empty mock store and asserts:
- Both Promises resolve to the SAME UUID.
- `chrome.storage.local.set` is called exactly ONCE.

---

### MJ-02: Defensive re-mint can warn repeatedly across reads when storage `.set` keeps failing

**File:** `extension/utils/install-identity.js:65-74`

**Issue:**
```js
if (typeof existing === 'string' && !UUID_V4_REGEX.test(existing)) {
  console.warn('[FSB Telemetry] Stored install UUID failed validation; minting fresh');
}
var uuid = crypto.randomUUID();
await chrome.storage.local.set({ [FSB_INSTALL_UUID_KEY]: uuid });  // <- may reject
return uuid;
```

If `chrome.storage.local.set` rejects (enterprise policy, quota exhausted, write
contention), the outer try/catch at line 75 returns `null`. The corrupt value
remains in storage. On the NEXT call, `get` returns the same corrupt value, the
`if` triggers again, and `console.warn` fires again.

The user prompt explicitly requires: "warning log should fire at most once per
session, not on every read." The current code does NOT guarantee this in the
failed-write edge case. The unit test at line 269-297 only exercises the happy
path where `.set` succeeds.

**Fix:** Gate the warn behind a module-level boolean so it fires at most once
per SW session regardless of `.set` outcome:

```js
var _warnedCorruption = false;

async function getOrCreateInstallUuid() {
  try {
    var data = await chrome.storage.local.get([FSB_INSTALL_UUID_KEY]);
    var existing = data && data[FSB_INSTALL_UUID_KEY];

    if (typeof existing === 'string' && UUID_V4_REGEX.test(existing)) {
      return existing;
    }

    if (typeof existing === 'string' && !UUID_V4_REGEX.test(existing) && !_warnedCorruption) {
      console.warn('[FSB Telemetry] Stored install UUID failed validation; minting fresh');
      _warnedCorruption = true;
    }
    // ... rest unchanged ...
  } catch (_e) {
    return null;
  }
}
```

Add a unit test that asserts after N consecutive failed-write calls against a
corrupt store, exactly ONE warn line is emitted.

---

### MJ-03: Control panel inline script duplicates storage key instead of using the module's exported constant

**File:** `extension/ui/control_panel.html:1580-1581, 1595, 1608`

**Issue:**
The inline `<script>` block (if BL-01 is fixed and the script runs at all) reads
and writes `chrome.storage.local.fsbTelemetryOptOut` directly using a string
literal:

```js
const STORAGE_KEY = 'fsbTelemetryOptOut';
// ...
const data = await chrome.storage.local.get([STORAGE_KEY]);
// ...
await chrome.storage.local.set({ [STORAGE_KEY]: optedOut });
```

The install-identity module exports `FSB_TELEMETRY_OPT_OUT_KEY = 'fsbTelemetryOptOut'`
specifically to centralize this string (see `install-identity.js:131`). The
module is not loaded in `control_panel.html` (verified: `grep "install-identity"
extension/ui/control_panel.html` returns empty).

The string-literal duplication means a future rename (e.g., to satisfy a
REQUIREMENTS.md update or to add a versioned key like `fsbTelemetryOptOut_v2`)
must be applied in both files manually. The module also exports
`setTelemetryOptOut(value)` and `isTelemetryOptedOut()` that already do the
right thing with proper error handling.

**Fix:** When fixing BL-01 (extracting to `privacy-telemetry-toggle.js`), also
load `utils/install-identity.js` in the control-panel script chain and call
the module's API instead of direct storage access:

```html
<script src="../utils/install-identity.js"></script>
<script src="privacy-telemetry-toggle.js"></script>
```

```js
// in privacy-telemetry-toggle.js
const optedOut = await globalThis.fsbInstallIdentity.isTelemetryOptedOut();
// ...
await globalThis.fsbInstallIdentity.setTelemetryOptOut(!el.checked);
```

This is a structural fix that compounds with BL-01.

---

## Minor Findings

### MN-01: `crypto.randomUUID()` is not available on Chrome 88-91 -- below the package.json `min_chrome_version: 88.0.0`

**File:** `extension/utils/install-identity.js:72`, `package.json:105`

**Issue:**
`crypto.randomUUID()` shipped in Chrome 92 (July 2021), not Chrome 88. On Chrome
88-91 the call throws `crypto.randomUUID is not a function`, which is caught by
the outer try/catch and returns `null`. The 269-CONTEXT.md asserts "available in
MV3 service workers natively (no polyfill needed) per STACK research §3.2" --
this is correct for Chrome 92+ but wrong for the declared minimum of 88.

The practical impact is tiny (Chrome 88-91 users in 2026 are vanishingly few)
but the failure mode is silent: telemetry is permanently disabled for these
users with no console signal beyond the catch swallowing the exception.

**Fix:** Either (a) bump `min_chrome_version` to `92.0.0` in `package.json` (and
update the `engines.chrome` entry similarly), or (b) feature-detect and fall
back to a v4 polyfill via `crypto.getRandomValues`:

```js
function mintV4() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC 4122 v4 from getRandomValues
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
```

Option (a) is simpler and probably correct given Chrome 88's age.

---

### MN-02: `[FSB Telemetry] Install UUID seeded` log fires on every SW wake -- can be many times per day under MV3 eviction

**File:** `extension/background.js:13031-13033, 13075-13077`

**Issue:**
```js
const seededUuid = await globalThis.fsbInstallIdentity.getOrCreateInstallUuid();
if (seededUuid) {
  console.log('[FSB Telemetry] Install UUID seeded');
}
```

MV3 evicts the service worker after ~30 seconds of inactivity. Each wake calls
`onStartup` (which is the documented wake event for MV3 SW restart). The log
fires on every wake regardless of whether the UUID was minted (first time) or
reused (every subsequent time). Under active use the SW wakes dozens of times
per hour, spamming the console.

The codebase has a `fsbDebugMode` global (`background.js:304`) and an
`automationLogger.debug(...)` channel that respects it. Other lifecycle logs in
the same file use `automationLogger` (e.g., `logInit`, `logServiceWorker`).

**Fix:** Either downgrade to `automationLogger.debug('Install UUID seeded')` or
distinguish "minted fresh" vs "reused" -- only log on mint. The module could
return an object `{ uuid, minted: boolean }` and the caller would log only when
`minted === true`. (This is more code; the simpler fix is to just gate behind
`fsbDebugMode`.)

```js
try {
  const seededUuid = await globalThis.fsbInstallIdentity.getOrCreateInstallUuid();
  if (seededUuid && fsbDebugMode) {
    automationLogger.debug('Install UUID seeded', {});
  }
} catch (e) {
  console.error('[FSB Telemetry] Install UUID seed failed:', e && e.message);
}
```

---

### MN-03: Test isolation -- `globalThis.fsbInstallIdentity` leaks across tests and after the file exits

**File:** `tests/install-identity.test.js:131-133, 147-153`

**Issue:**
`teardownChromeMock()` deletes `globalThis.chrome` but the `freshRequire()`
helper at line 147 re-executes the module top-level code on each call, which
re-assigns `globalThis.fsbInstallIdentity = {...}`. Nothing in the test ever
deletes `globalThis.fsbInstallIdentity`.

Within this test file the leak does not break assertions because each test
freshRequires explicitly and never reads the stale global. But if `npm test`
runs another test in the same Node process that reads `globalThis.fsbInstallIdentity`
expecting it to be undefined (e.g., a future test for a module that conditionally
imports based on global presence), the leak would silently corrupt that test.

Also: `globalThis.chrome` from `setupBrokenStorage()` in Test 3 is torn down in
`finally`, but if Test 3 ever throws BEFORE entering the inner `try { ... }`
block (e.g., during `freshRequire()` itself), the teardown still fires from the
outer `finally`. So that part is robust. The `globalThis.fsbInstallIdentity`
leak is the only real concern.

**Fix:** Add to `teardownChromeMock()`:

```js
function teardownChromeMock() {
  delete globalThis.chrome;
  delete globalThis.fsbInstallIdentity;  // ensure no cross-test global leak
}
```

And put a final cleanup at the end of the test IIFE:

```js
delete globalThis.fsbInstallIdentity;
delete globalThis.chrome;
console.log('passed:', passed);
console.log('failed:', failed);
process.exit(failed > 0 ? 1 : 0);
```

---

## Nits

### NIT-01: Non-string corrupt UUIDs are silently re-minted with no warning

**File:** `extension/utils/install-identity.js:65`

If somebody hand-edits the storage value to a number, boolean, array, or object
(e.g., `fsbInstallUuid: true`), `typeof existing === 'string'` is false, the
warn branch is skipped, and the function silently re-mints. Either widen the
warn to cover "non-undefined non-v4-string" or document this as intentional.

**Fix:**
```js
if (existing !== undefined && !(typeof existing === 'string' && UUID_V4_REGEX.test(existing))) {
  if (!_warnedCorruption) {  // see MJ-02
    console.warn('[FSB Telemetry] Stored install UUID failed validation; minting fresh');
    _warnedCorruption = true;
  }
}
```

---

### NIT-02: IDENT-04 grep-gate comment-stripping is naive on string literals containing `//`

**File:** `tests/install-identity.test.js:303-310`

The stripper at lines 304-310 removes everything after the first `//` on each
line. This works today because the module has no string literals containing
`//`. If a future contributor adds `var url = 'https://...'` or similar inside
the source (e.g., a tracking URL when the collector lands in Phase 272), the
strip would mangle the line. The grep gate compares the stripped result to
`'chrome.storage.sync'`, which is benign in the current source, but the test
could either over-strip and miss a violation hidden inside a string OR
under-strip and false-positive on a comment containing `chrome.storage.sync`.

The first 4 lines of the source's JSDoc include "NEVER use chrome.storage.sync"
which the block-comment regex `/\*[\s\S]*?\*/` correctly removes. Verified.

**Fix:** Use a proper JS parser (Acorn) for the grep gate, or document the
limitation: "the gate assumes no string literals containing `//` in the module
source." Low-priority; doesn't block.

---

### NIT-03: Inline `style="display:block; margin-top:8px;"` violates the commit message's "no new CSS" claim

**File:** `extension/ui/control_panel.html:660`

The commit message for `2949a7d` explicitly states "no new CSS, no new external
JS file." The link uses inline style. Either acknowledge the inline style in the
commit message or move to a class.

**Fix:** When fixing BL-02 / refactoring per BL-01, drop the inline style and
add `.setting-hint--block { display: block; margin-top: 8px; }` to the existing
control panel stylesheet (or remove the link styling entirely; the existing
`.setting-hint` is already styled and may not need overrides).

---

### NIT-04: `setupBrokenStorage` mock throws synchronously but real `chrome.storage.local` rejects asynchronously

**File:** `tests/install-identity.test.js:115-129`

```js
get() { throw new Error('Storage area unavailable'); },
set() { throw new Error('Storage area unavailable'); }
```

The real MV3 `chrome.storage.local.get()` returns a `Promise` that rejects on
error, not a function that throws synchronously. The module's `await` handles
both via the outer try/catch, so the test still exercises IDENT-03 correctly,
but the mock is not faithful to the API. If a future maintainer relies on the
mock to characterize the failure mode (e.g., adds synchronous error logic
before the await), the test could pass under sync-throw and fail under
async-reject.

**Fix:**
```js
get() { return Promise.reject(new Error('Storage area unavailable')); },
set() { return Promise.reject(new Error('Storage area unavailable')); }
```

Or add a second `setupBrokenStorage` variant exercising both modes.

---

### NIT-05: Commit message for `2949a7d` claims "fires-and-forgets" but the code uses `await`

**File:** commit `2949a7de08771c38d5ee2a915ce59dc3af525f2a` (message) vs `control_panel.html:1604-1612`

The commit message says "chrome.storage.local.set fires-and-forgets so the UI
reflects state in well under 100ms (CONS-02)." The actual code uses `await
chrome.storage.local.set({...})`. CONS-02 still holds because the visible
toggle flip is browser-native and synchronous before the `change` event fires,
but the commit narrative is misleading. Update commit message text or drop the
`await` (and either is fine).

---

## Verification Notes

The IDENT-04 grep gate **PASSES**: zero `chrome.storage.sync` references in any
of the 5 changed files (verified via `grep -nE "chrome\.storage\.sync"
extension/utils/install-identity.js extension/background.js
extension/ui/control_panel.html tests/install-identity.test.js
package.json` -- only matches are in comments and test assertion strings).

The UUID v4 regex `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
correctly enforces v4 shape: version nibble `4` at position 13, variant nibble
`[89ab]` at position 17. Verified against RFC 4122 §4.4 + spot-checked with:
- `550e8400-e29b-41d4-a716-446655440000` -> true (v4)
- `550e8400-e29b-11d4-a716-446655440000` -> false (v1)
- `00000000-0000-4000-7000-000000000000` -> false (variant nibble 7)
- `00000000-0000-0000-0000-000000000000` -> false (version nibble 0)

`tests/install-identity.test.js` exits 0 with 23/23 passing assertions when
invoked directly.

The PII surface of the module is correct: zero DOM, fetch, clipboard, prompt,
window, navigator, or URL APIs referenced (verified via grep). Exports surface
is exactly 3 functions + 2 string constants + 1 regex.

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: medium (privacy-critical foundation code)_
