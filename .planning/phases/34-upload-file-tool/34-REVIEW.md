---
phase: 34-upload-file-tool
reviewed: 2026-06-23T00:00:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - extension/utils/upload-path-denylist.js
  - extension/background.js
  - extension/ws/mcp-tool-dispatcher.js
  - extension/ai/tool-executor.js
  - extension/ai/tool-definitions.js
  - extension/site-guides/utilities/file-upload.js
  - tests/upload-path-denylist.test.js
  - tests/tool-definitions-parity.test.js
  - tests/capability-mcp-surface.test.js
  - tests/recipe-schema-lock.test.js
  - tests/visual-session-schema-lock.test.js
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 34: upload_file Tool -- Code Review Report

**Reviewed:** 2026-06-23
**Depth:** deep (cross-file: both front doors, audit chokepoint, parity hashes, CDP chain)
**Files Reviewed:** 11 (Phase 34 scope only; Phase 33 media + pre-existing dashboard/ws drift excluded)
**Status:** issues_found (no blockers; 3 warnings, 5 nits)

## Summary

The implementation is solid and the security architecture is sound. The core design goal -- ONE shared background chokepoint (`executeUploadFile`) reached by BOTH front doors so the denylist + audit cannot be bypassed by one path -- is correctly realized. I verified:

- **Both front doors converge on `executeUploadFile`** and the denylist is checked BEFORE any side effect (before `chrome.debugger.attach`). MCP: `handleUploadFileRoute` (mcp-tool-dispatcher.js:1301) -> `globalThis.executeUploadFile`. Autopilot: `executeBackgroundTool` `case 'upload_file'` (tool-executor.js:402) -> `globalThis.executeUploadFile`. Order inside the helper is correct: input validation -> absolute-path gate -> `denylist.classify` block+audit (background.js:14548-14555) -> attach.
- **`globalThis.executeUploadFile` resolves reliably.** `background.js` is a classic MV3 service worker with NO top-level `'use strict'`, so the top-level `async function executeUploadFile` declaration binds to `self`/`globalThis` -- the same mechanism every other cross-importScripts global in this file relies on. Concern #3 is clear.
- **Audit record does NOT leak the disk path.** The `rec` built at background.js:14528 carries only `{ts, origin, slug, method, sideEffectClass, consentDecision, outcome, error?}`, and `FsbAuditLog.append` (audit-log.js:159-175) re-applies a strict field whitelist with no `path` key. Concern #1c is clear.
- **CDP resolution chain is correct.** `DOM.getDocument{depth:0}` -> `querySelector` -> `describeNode` attribute parse (the flat `[name,val,...]` loop at background.js:14592 is correct, no off-by-one) -> uppercase `nodeName === 'INPUT'` check (correct for CDP) -> descendant `input[type="file"]` fallback (nodeId reassigned at :14600, used at :14608) -> `setFileInputFiles`. `nodeId === 0` is handled by the falsy `if (!nodeId)` guards. Debugger detach happens on the success path, the catch path (via finally), and the attach-failure path. Concern #2 is clear.
- **INV-01 hash moved cleanly.** New hash `6354d788...` is consistent across all FOUR files (tool-definitions-parity, capability-mcp-surface, recipe-schema-lock, capability-autopilot-parity). The old `ad6efb8c...` survives only inside one stale doc-comment header (recipe-schema-lock.test.js:16), not an active assertion. All 5 lock/parity tests pass (260/19/3/17/344, 0 failed). The entry is purely additive (`withVisualSessionFields`), no existing schema changed. Concern #4 is clear.
- **The denylist unit test is meaningful** (real denied vs allowed, case-insensitivity, reason tokens, absolute-path gate, cross-platform basename) and is wired into the `npm test` chain. 28/28 pass.

The remaining items are denylist backstop gaps (the denylist is explicitly a backstop, not a sandbox, but two of these are trivially fixable) and minor polish.

## Warnings

### WR-01: Denylist basename/suffix gates are bypassed by trailing whitespace (and trailing dots on Windows)

**File:** `extension/utils/upload-path-denylist.js:44-51, 59-78`
**Issue:** `basenameOf` strips only trailing slashes, and `classify` matches sensitive basenames by exact `===` and suffixes by `endsWith` against the raw (only-lowercased) basename. A trailing space or dot defeats both gates for any secret NOT also protected by a directory segment. Verified live:
```
allow  /Users/me/proj/credentials      (trailing space)   -- baseline DENYs
allow  /Users/me/proj/secrets.json     (trailing space)
allow  /Users/me/proj/server.key       (trailing space)   -- suffix endsWith fails
allow  C:\proj\id_rsa                   (trailing space)
allow  C:\proj\credentials.             (trailing dot)
```
On Windows this is a genuine exfiltration bypass: the NTFS/Win32 layer strips trailing dots and spaces, so `C:\proj\id_rsa ` and `C:\proj\credentials.` resolve to the REAL secret files, which CDP `setFileInputFiles` will happily read -- but the denylist saw `id_rsa ` / `credentials.` and allowed them. On POSIX the trailing-space name is a distinct file (lower practical risk, but still a hole if such a file is staged). The `.ssh`/`.aws`/etc. directory secrets stay protected because the dir-segment match still fires; only basename-only and suffix-only rules leak.
**Fix:** Strip trailing dots and spaces in `basenameOf` before matching (mirrors Win32 filename normalization), and run the suffix check against the trimmed basename:
```js
function basenameOf(p) {
  var s = normalize(p).replace(/\/+$/, '');
  var parts = s.split('/');
  var base = parts[parts.length - 1] || '';
  return base.replace(/[ .]+$/, '');   // Win32 strips trailing dots/spaces
}
```
Then `classify` should derive `baseLower` from this trimmed basename (it already calls `basenameOf`, so this single change closes both the basename and suffix gates). Re-add a couple of trailing-space/dot cases to `tests/upload-path-denylist.test.js` to lock it.

### WR-02: Well-known secret stores missing from the denylist (no documentation of the gap)

**File:** `extension/utils/upload-path-denylist.js:17-38`
**Issue:** The denylist omits several extremely common secret locations that an agent could be socially-engineered into uploading. None are caught (verified live -- all `allow`):
- `/proc/self/environ` and `/proc/<pid>/environ` (Linux -- full process env incl. injected secrets)
- `~/.git-credentials` (plaintext git tokens)
- `~/.docker/config.json` is covered by `/.docker/`, but `~/.dockercfg` (legacy, basename) is not
- `~/.kube/config` is covered by `/.kube/`, but a copied `kubeconfig` basename is not
- `/var/run/secrets/kubernetes.io/serviceaccount/token` (k8s SA bearer token; basename `token` is not in `DENY_BASENAMES`)
- `~/.bash_history` / `~/.zsh_history` (frequently contain pasted secrets)
- `~/.config/git/credentials`, `~/.subversion/auth`
The header comment states the denylist is a backstop "NOT a complete sandbox," which is the right framing, but the *specific* known gaps are not enumerated anywhere a future maintainer or auditor would see them.
**Fix:** Add the cheap string wins (`'/.git-credentials'`/`'.git-credentials'`, `'.dockercfg'`, `'/proc/'` segment or `environ` basename, `'.bash_history'`, `'.zsh_history'`, k8s `token` is risky as a bare basename due to false positives -- prefer the `/secrets/kubernetes.io/` segment). Where a value is deliberately excluded (e.g. bare `token`/`config` basenames are too false-positive-prone), add a one-line comment in the file saying so. This keeps the backstop honest and the gaps reviewable.

### WR-03: A `chrome.debugger.detach` failure on the success path is misreported as an upload failure

**File:** `extension/background.js:14608-14621`
**Issue:** `DOM.setFileInputFiles` (the actual upload) completes at :14608. The code then `await chrome.debugger.detach(...)` at :14610 BEFORE building the success result. If that detach rejects (it can -- the tab may have navigated/closed in the microtask gap), control jumps to the catch at :14617, which audits `outcome:'error'` and returns `{success:false, error:'upload_file failed: ...'}` -- even though the file WAS set and the page already fired input/change. The caller sees a false negative and may retry, re-attaching and re-setting the file (double upload) or giving up on a completed action.
**Fix:** Capture success before detaching and let the `finally` own the detach. Build/return the success result immediately after `setFileInputFiles`, set a `succeeded` flag, and drop the inline detach at :14610-14611 (the `finally` at :14622 already detaches when `debuggerAttached` is true). Detach failure then degrades to a best-effort swallow in `finally` instead of masking a successful upload.

## Info

### IN-01: Stale registry hash in a doc-comment header

**File:** `tests/recipe-schema-lock.test.js:16`
**Issue:** The header comment still reads "The frozen TOOL registry hash (ad6efb8c...) re-assertion can pass TODAY". The active constant on line 45 is correctly the new `6354d788...`; only the comment is stale. Harmless but misleading to a reader grepping for the current hash.
**Fix:** Update the comment to `6354d788...` (or make it hash-agnostic).

### IN-02: Legacy-surface MCP path cannot auto-resolve tabId, but the tool description promises it can

**File:** `extension/ws/mcp-bridge-client.js:812` (interaction with `handleUploadFileRoute` background.js path) / `extension/ai/tool-definitions.js:1390`
**Issue:** `handleUploadFileRoute` requires `p.tabId` to be finite (mcp-tool-dispatcher.js:1303). For the normal agent path this is fine -- `_handleExecuteAction` runs `resolveAgentTabOrError` and injects `tabId` into `routeParams` (mcp-bridge-client.js:771,812), so the "auto-resolves otherwise" contract holds. BUT for `legacy:*` surfaces `resolved.skipGate === true`, so line 812 (`...(resolved.skipGate ? {} : { tabId })`) deliberately omits `tabId`; a legacy surface routing upload_file through the MCP dispatcher would then hit the `mcp_route_invalid_params` "requires a resolved tab" reject. The schema `tab_id` description says "Single-tab agents and legacy popup/sidepanel/autopilot do not need to pass this." In practice legacy/autopilot use the `executeTool` path (which passes a concrete tabId), so this is a narrow theoretical mismatch, not a live break.
**Fix:** Either tighten the schema description (drop the "legacy ... do not need to pass this" clause, since for the MCP dispatcher path they effectively do), or have `handleUploadFileRoute` fall back to the active tab when `tabId` is absent. Documentation tweak is sufficient for v1.

### IN-03: Path-traversal `..` and symlinks are not resolved by the string denylist (acceptable backstop limitation, worth an inline note)

**File:** `extension/utils/upload-path-denylist.js:40-79`
**Issue:** `/Users/me/Documents/../.ssh/id_rsa` is correctly DENIED (the literal `/.ssh/` segment survives traversal), and `/Users/me/.ssh/../Documents/ok.pdf` is over-denied (false positive -- harmless). But a symlink (`/Users/me/safe-link` -> `~/.ssh`) or a hardlink cannot be detected by any string policy, and `..` segments that land on a sensitive dir whose *name* differs from a denylisted segment slip through. This is inherent to a pure-string backstop and is the right tradeoff for v1 (the real defense is the absence of a consent bypass + the audit trail), but the limitation is only implied by "NOT a complete sandbox."
**Fix:** Add one sentence to the header comment naming the two un-closable gaps (symlinks/hardlinks, and non-canonical `..` paths) so the next maintainer does not mistake the backstop for full path canonicalization. No code change.

### IN-04: `DENY_DIR_SEGMENTS` requires a trailing slash, so a bare sensitive directory passed as the path is not classified

**File:** `extension/utils/upload-path-denylist.js:17-22, 66-67`
**Issue:** Segments like `/.ssh/` need both delimiters, so `classify('/Users/me/.ssh')` (no trailing slash) returns `allow`. This is benign for upload_file because a directory is not a valid file input target and CDP `setFileInputFiles` would fail anyway, but if `classify` is ever reused for directory-scoped checks it would under-match.
**Fix:** None required for upload_file. If the helper is generalized later, also test the bare-dir basename against the directory names.

### IN-05: `_setForTest` cannot override `DENY_ABS_PREFIXES` or `DENY_BASENAME_PREFIXES`

**File:** `extension/utils/upload-path-denylist.js:96-101`
**Issue:** The test seam only swaps `dirSegments`, `basenames`, `suffixes`. `DENY_ABS_PREFIXES` (system secret stores) and `DENY_BASENAME_PREFIXES` (`.env.`) have no override path, so a future test cannot isolate those branches. Minor test-ergonomics gap; current tests do not need it.
**Fix:** Add `absPrefixes` and `basenamePrefixes` arms to `_setForTest` if/when those branches need isolated coverage.

---

_Reviewed: 2026-06-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
