---
phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
reviewed: 2026-06-21T20:45:32Z
depth: deep
files_reviewed: 17
files_reviewed_list:
  - extension/utils/capability-router.js
  - extension/utils/capability-catalog.js
  - catalog/handlers/github.js
  - catalog/handlers/slack.js
  - catalog/handlers/notion.js
  - catalog/recipes/reddit-inbox.json
  - catalog/descriptors/reddit-inbox.json
  - catalog/descriptors/github-issues.json
  - catalog/descriptors/slack-message.json
  - catalog/descriptors/notion-spaces.json
  - extension/ws/mcp-tool-dispatcher.js
  - extension/ai/tool-executor.js
  - extension/ai/agent-loop.js
  - extension/background.js
  - scripts/verify-recipe-path-guard.mjs
  - scripts/package-extension.mjs
  - package.json
findings:
  blocker: 0
  high: 0
  medium: 3
  low: 4
  critical: 0
  warning: 3
  info: 4
  total: 7
status: resolved
resolution:
  resolved_at: 2026-06-21T21:05:00Z
  fixed: 6
  skipped: 1
  fixes:
    - finding: MED-01
      commit: 33d271e6
      status: resolved
    - finding: MED-02
      commit: 376aca72
      status: resolved
    - finding: MED-03
      commit: 311f0bf9
      status: resolved
    - finding: LOW-01
      commit: 2ba624cb
      status: resolved
    - finding: LOW-02
      commit: 247ff1b8
      status: resolved
    - finding: LOW-03
      commit: 247ff1b8
      status: resolved
    - finding: LOW-04
      commit: null
      status: skipped
      reason: not-applicable -- extension/catalog/recipe-index.generated.js is gitignored (.gitignore:61) and untracked, not a committed artifact; it is regenerated from catalog/ by package-extension.mjs at package time, so the MED-02/03 descriptor updates flow into it automatically. Nothing to commit.
---

# Phase 29: Code Review Report

**Reviewed:** 2026-06-21T20:45:32Z
**Depth:** deep (cross-file: router -> catalog -> handlers -> executeBoundSpec pin; both front doors; CI guard scope)
**Files Reviewed:** 17
**Status:** RESOLVED (2026-06-21) -- 6 findings fixed (MED-01/02/03, LOW-01/02/03), 1 skipped (LOW-04, not-applicable: gitignored build artifact). Full `npm test` exit 0, zero FAIL lines. See per-finding Status lines and the frontmatter `resolution:` block.

_Original status:_ issues_found (no blockers/high; 3 medium, 4 low)

## Summary

Phase 29 lands the tiered capability router (`capability-router.js`), the slug->tier catalog
(`capability-catalog.js`), three credential-bearing T1a head handlers (github/slack/notion), a
declarative T1b tail (reddit recipe + four descriptors), the internal MCP dispatcher reroute, the
autopilot front door, an additive system-prompt hint, and CI/packaging plumbing.

**The dominant security risk classes for this phase are clean.** I verified all four:

1. **Origin-pin / credential-replay (the HIGH focus):** SOLID. Every credentialed call -- both T1b
   recipes and all T1a handler specs (including the two-step CSRF/xoxc probe-then-mutate flows) --
   routes through `executeBoundSpec`, which re-asserts `origin-of(tabId) === spec.origin` BEFORE any
   `executeScript` side effect and returns a dual-field `RECIPE_ORIGIN_MISMATCH` on a mismatch with
   zero side effect (capability-fetch.js:291-298). Handler `spec.origin` is hardcoded to the
   first-party origin; it is NEVER sourced from the model-supplied `payload.origin`. The router never
   re-targets, never queries tabs, never injects. The router test proves the mismatch-with-empty-
   executeScript-recorder property directly (capability-router.test.js:294-321). No separate-origin
   API host (api.github.com / oauth.reddit.com / api.notion.com) appears in any handler.

2. **Token/secret logging (the HIGH focus):** CLEAN. Grep of all three handlers found ZERO
   console/log/diagnostic/warn/error calls -- the only matches are the word "console" appearing inside
   doc comments. Scraped CSRF/xoxc tokens flow ONLY into the bound spec (header for GitHub CSRF, body
   form-field for Slack xoxc) and never to a log line or off-device. No real token literals exist in
   source (only synthetic `*-TEST-SYNTHETIC` fixtures, in the test file).

3. **MV3 Wall-1 (eval-free):** The router + catalog are eval/new Function/import-free and ON the
   RECIPE_PATH_ALLOWLIST; the guard passes (10 files clean). The handlers are eval-free in practice.
   **BUT** the handlers live outside `extension/utils/` and are therefore NOT scanned by the CI guard
   -- see MED-01.

4. **INV-01 / INV-02 / INV-04:** All hold. The two capability tools stay out of TOOL_REGISTRY
   (`getPublicTools()` maps only the registry); the frozen non-trigger registry hash is unmoved
   (parity test GREEN). Both front doors call the SAME `globalThis.FsbCapabilityRouter` global -- one
   engine, no parallel autopilot stack. The agent-loop setTimeout iterator is byte-untouched (iterator
   guard GREEN; only an additive prompt line was added). All four new tests pass GREEN; the recipe-path
   guard passes.

The findings below are correctness/metadata/maintainability issues, not security breaks. The three
medium items are worth fixing before the head is trusted in live UAT; the most user-visible is the
descriptor intent->slug mismatch (MED-02), which routes create/postMessage/loadPage *intents* to the
wrong (read) slug.

---

## Medium

### MED-01: Credential-bearing T1a handlers are NOT covered by the eval-free CI guard (Wall-1 scope gap)

**Status:** RESOLVED (commit 33d271e6) -- added the three handler paths to RECIPE_PATH_ALLOWLIST (Check 1 now greps them) and added Check 5, a catalog/handlers/*.js disk-drift glob that fails closed on any unlisted handler. Guard re-run: PASS (13 recipe-path files clean, 3 bundled-head handlers on the allowlist). Handlers were already eval-free; no rewording needed.

**File:** `scripts/verify-recipe-path-guard.mjs:287-301` (Check 4 enumerates only `extension/utils`); affects `catalog/handlers/github.js`, `catalog/handlers/slack.js`, `catalog/handlers/notion.js`

**Issue:** The phase security charter (focus item 3) states the router, catalog, AND handlers must be
eval-free and on the allowlist. The router and catalog are correctly added to `RECIPE_PATH_ALLOWLIST`
and scanned. The handlers, however, are the most sensitive new code in the phase -- they scrape CSRF
and xoxc tokens and build credentialed mutation specs -- yet they live at `catalog/handlers/*.js`
(shipped to `extension/catalog/handlers/*.js`). The guard's "bypass-by-omission" Check 4 globs ONLY
`extension/utils/capability-*.js` (line 291: `readdirSync(CAPABILITY_DIR_ABS).filter(/^capability-.*\.js$/)`),
and Check 1 only greps the hardcoded allowlist. So **no check scans the handlers**. A future edit (or a
supply-chain modification of a handler) that introduces `eval`/`new Function`/`import()` into a
token-scraping handler would keep CI green. The handlers are eval-free *today* (verified by grep), so
this is not a live vulnerability -- it is a missing guardrail on the exact files the charter says must
be guarded.

**Fix:** Extend the guard to scan the handler directory. Add the three handler paths to
`RECIPE_PATH_ALLOWLIST` (so Check 1 greps them) AND add a second disk-drift glob covering
`catalog/handlers/*.js` so a new handler that nobody allowlists fails closed:

```js
// After the existing extension/utils glob (Check 4), add a handler-dir drift check:
const HANDLER_DIR_REL = 'catalog/handlers';
let handlerFiles = [];
try {
  handlerFiles = readdirSync(resolve(ROOT, HANDLER_DIR_REL))
    .filter((n) => n.endsWith('.js'))
    .map((n) => `${HANDLER_DIR_REL}/${n}`);
} catch (err) { /* dir may not exist pre-Plan-03; tolerate like recipes/ */ }
for (const f of handlerFiles) {
  if (RECIPE_PATH_ALLOWLIST.indexOf(f) === -1) {
    failures.push(`allowlist drift: bundled head handler '${f}' is not on the recipe-path allowlist (token-scraping code must be eval-free-scanned).`);
  }
}
// And add 'catalog/handlers/github.js' etc. to RECIPE_PATH_ALLOWLIST so Check 1 greps them.
```

### MED-02: Descriptor intent synonyms map create/postMessage/loadPage intents to the WRONG (read) slug -- wrong capability invoked

**Status:** RESOLVED (commit 376aca72) -- split each multi-slug descriptor per-slug. Added github-issues-create.json (write), slack-conversations-list.json (read), notion-load-page.json (read); narrowed the intent synonyms on github-issues.json / slack-message.json / notion-spaces.json to only the slug each carries. All six handler slugs now have a 1:1 descriptor. MiniSearch routing re-simulated over the production descriptors: 13/13 intents resolve to the correct slug (create->create, list->list, postMessage->postMessage, loadPage->loadPage). capability-recipe-schema, capability-search-eval, and capability-head-handlers tests all green.

**File:** `catalog/descriptors/github-issues.json:9-11`, `catalog/descriptors/notion-spaces.json:9-10`, `catalog/descriptors/slack-message.json` (the secondary intents)

**Issue:** Each handler module exposes TWO slugs, but only ONE descriptor per service is authored, and
that single descriptor lists intent synonyms for BOTH operations while carrying only the primary slug.
Concretely, `github-issues.json` has `slug: "github.issues.list"` (the READ slug) but its
`intentSynonyms` include `"create a github issue"`, `"open a new issue on github"`, `"file a github
issue"`. The WRITE slug `github.issues.create` has no descriptor and is therefore invisible to
`search_capabilities`. So a model handling "create a github issue" gets a search hit whose `slug` is
`github.issues.list` -- and invoking that runs a read (issue list), silently doing nothing toward
creating the issue. The same pattern mis-routes:
- Notion: "load a notion page" / "open a notion page" -> hit slug `notion.getSpaces` (lists spaces),
  never reaching `notion.loadPage`.
- Slack: "list my slack channels" / "show slack conversations" -> hit slug `slack.chat.postMessage`
  (a WRITE), never reaching `slack.conversations.list` (the read it intended).

The Slack case is the worst: a read intent ("show slack conversations") resolves to a slug classed and
behaving as a message-post write. This is a functional-correctness defect (wrong capability selected
for an explicit user intent), not a style nit.

**Fix:** Author one descriptor per slug so each operation is independently discoverable and the intent
synonyms live on the slug they actually drive. e.g. split `github-issues.json` into
`github-issues-list.json` (read; list/show synonyms) and `github-issues-create.json` (write;
create/open/file synonyms). Mirror for slack (list vs postMessage) and notion (getSpaces vs loadPage).

### MED-03: `github.issues.list` is mis-classed `sideEffectClass: "write"` in its descriptor (read surfaced as write)

**Status:** RESOLVED (commit 311f0bf9) -- github-issues.json sideEffectClass corrected to "read" (matches the handler entry github.js:89). Verified no other read slug is mis-classed as write: all six descriptor sideEffectClass values now match their handler entries (github.issues.list=read, github.issues.create=write, slack.conversations.list=read, slack.chat.postMessage=write, notion.getSpaces=read, notion.loadPage=read).

**File:** `catalog/descriptors/github-issues.json:13`

**Issue:** The descriptor for slug `github.issues.list` declares `"sideEffectClass": "write"`, but that
slug is a read (the handler entry `github.issues.list` is `sideEffectClass: 'read'`, github.js:89).
Because a T1a handler slug has no paired recipe in `_slugToRecipe`, `capability-search.js` cannot
method-derive the class and falls back to the authored value (`derived || d.sideEffectClass`,
capability-search.js:104). So `search_capabilities` will surface this read slug to the LLM and to the
Phase-30 consent gate as a state-changing "write". Over-classification is the fail-safe direction (it
over-warns rather than under-warns), so this is medium, not high -- but it is incorrect metadata that
will cause spurious write-consent prompts for a read once gating lands. (Note: this descriptor file is
entangled with MED-02; the authored "write" was presumably chosen to cover the bundled create intent.
Splitting per MED-02 resolves both.)

**Fix:** When split per MED-02, set the list descriptor to `"sideEffectClass": "read"` and the create
descriptor to `"sideEffectClass": "write"`. If kept as one file short-term, at minimum the
`actionVerb`/`sideEffectClass` must match the slug the descriptor carries (`github.issues.list` -> read).

---

## Low

### LOW-01: Router returns a falsy interpret result verbatim, which the MCP wrapper reads as success

**Status:** RESOLVED (commit 2ba624cb) -- `_runDeclarativeTier` now splits the guard: a falsy interpret result returns _err('RECIPE_NOT_FOUND', { reason: 'interpret-returned-empty' }) (a dual-field /^RECIPE_.+$/ typed error), and only a typed { success:false } object is propagated verbatim. Added three router unit assertions (falsy interpret -> dual-field RECIPE_*, never undefined; executeBoundSpec not called). capability-router.test.js: 27 passed, 0 failed.

**File:** `extension/utils/capability-router.js:116-118`

**Issue:** `_runDeclarativeTier` guards with `if (!interpreted || interpreted.success !== true) { return interpreted; }`.
The `!interpreted` arm anticipates a null/undefined interpret result, but then `return interpreted`
returns that falsy value unchanged. Downstream, `dispatchMcpMessageRoute` computes
`success = !(response && typeof response === 'object' && response.success === false)`
(mcp-tool-dispatcher.js:492), so an `undefined` response is classified `success = true` and serialized
as a spurious empty success rather than a typed error. This is reachable only if
`FsbCapabilityInterpreter.interpretRecipe` ever returns a falsy non-object; the Phase-26 interpreter
currently always returns a typed `{success:false,...}` object on failure, so the path is latent. The
router explicitly tests for `!interpreted`, so it should fail closed there.

**Fix:** Convert a falsy interpret result into a typed error instead of propagating it:

```js
if (!interpreted) {
  return _err('RECIPE_NOT_FOUND', { slug: slug, reason: 'interpret-returned-empty' });
}
if (interpreted.success !== true) {
  return interpreted;   // already a typed RECIPE_* dual-field object
}
```

### LOW-02: Dead no-op assignments in the dispatcher's origin/tabId catch block

**Status:** RESOLVED (commit 247ff1b8) -- the `if (tabId === null) { tabId = null; }` / `if (!origin) { origin = null; }` no-ops were replaced with a one-line comment explaining the catch leaves tabId/origin as-is (null) and the pin fails closed downstream.

**File:** `extension/ws/mcp-tool-dispatcher.js:2224-2227`

**Issue:** The catch block contains `if (tabId === null) { tabId = null; }` and
`if (!origin) { origin = null; }` -- each assigns a variable to a value it already holds. Dead code; no
behavioral effect. It slightly obscures intent (a reader may look for a side effect that is not there).

**Fix:** Drop the no-op body; an empty catch (or a one-line comment) is clearer:

```js
} catch (e) {
  // active-tab lookup failed; leave tabId/origin as-is (null), the pin still
  // fails closed downstream in executeBoundSpec.
}
```

### LOW-03: Dispatcher comment overstates `payload.origin` as "non-authoritative override only"

**Status:** RESOLVED (commit 247ff1b8) -- both the doc-comment block (2199-2201) and the inline comment (2212-2214) now accurately state that a model-supplied payload.origin takes precedence but BIASES catalog candidate ranking only and can NEVER select a cross-origin fetch (spec.origin is hardcoded by handlers/recipes and re-pinned to the active tab in executeBoundSpec). Behavior unchanged (comment-only); the origin-pin and INV invariants hold. mcp-tool-routing-contract (183 passed) and capability-mcp-surface (19 passed) green.

**File:** `extension/ws/mcp-tool-dispatcher.js:2199-2201, 2212-2214`

**Issue:** The comment asserts "The model NEVER supplies the authoritative origin ... payload.origin is
a non-authoritative override only." But the code at line 2214 does `let origin = payload.origin || null`
and only falls back to the active-tab origin when `payload.origin` is absent -- i.e. a model-supplied
`payload.origin` takes PRECEDENCE. The comment therefore misdescribes the data flow. This is documented
as not-exploitable here because `origin` feeds ONLY `catalog.resolve(slug, origin)` for candidate
*bias*, never the fetch target (handlers/recipes hardcode `spec.origin`, and the real pin is
`origin-of(tabId) === spec.origin`), and the live REGISTRY has no multi-candidate arrays so bias is
currently inert. Still, the comment is misleading and would invite a future author to route
`payload.origin` somewhere load-bearing under the false belief it is already ignored. (This mirrors a
pre-existing Phase-28 pattern in the search handler at line 2218, so it is not a regression -- noted for
accuracy.)

**Fix:** Align the comment with the code -- e.g. "payload.origin, when present, biases catalog candidate
ranking only; it can NEVER select a cross-origin fetch because spec.origin is hardcoded by the
handler/recipe and the credentialed fetch is re-pinned to the active tab in executeBoundSpec." If the
intent truly was "ignore a model-supplied origin," invert the precedence to resolve the active tab first.

### LOW-04: Stale committed `recipe-index.generated.js` omits the four Phase-29 descriptors (dev-tree discovery gap)

**Status:** SKIPPED (not applicable). The finding's premise is incorrect for this repo state: extension/catalog/ (including recipe-index.generated.js) is gitignored (.gitignore:61) and is NOT a committed/tracked artifact -- it does not exist in a clean checkout. It is regenerated by scripts/package-extension.mjs from the catalog/ source dirs at package time, so the MED-02/MED-03 descriptor updates (the new + corrected descriptors) flow into the generated index automatically on the next package run. There is nothing to commit. The review itself marked this OPTIONAL / non-blocking.

**File:** `extension/catalog/recipe-index.generated.js` (committed artifact; regenerated by `scripts/package-extension.mjs:72-85`)

**Issue:** The committed generated catalog snapshot still contains only `github.notifications` and does
NOT include the four new descriptors (reddit-inbox, github-issues, slack-message, notion-spaces) or the
reddit recipe. `package-extension.mjs` rebuilds this file from the full `catalog/` dirs at package time,
so a SHIPPED build is correct -- but in an unpacked dev tree (no package step), `FsbRecipeIndex` is this
stale file, so `search_capabilities` cannot discover the four new slugs in dev. `invoke_capability` is
unaffected for T1a (handlers self-register) and for the two seeded T1b recipes (catalog REGISTRY +
inline recipe), so only dev-tree search discovery is degraded. Low severity given the package step
regenerates it.

**Fix:** Regenerate and commit `extension/catalog/recipe-index.generated.js` (run the package/recipe-
index step) so the dev tree matches the packaged catalog, or document that a dev tree must run the
generate step before relying on `search_capabilities` for the new slugs.

---

## Notes (verified-clean, no action)

- **Origin-pin on the T1a probe-then-mutate flows:** Both the GitHub CSRF probe and the Slack xoxc probe
  use `origin: <first-party>` and return verbatim on `probe.success === false`, so a wrong-tab probe
  yields `RECIPE_ORIGIN_MISMATCH` and the mutation never fires (github.js:126-131, slack.js:106-109).
- **Slack split-token placement:** xoxc is placed in the form body (`token=...`), never a header; xoxd is
  left to the browser cookie. Asserted by source and by the head-handler test (slack.js:86-100).
- **T2/T3 seams:** `RECIPE_LEARN_PENDING` (T2) and `RECIPE_DOM_FALLBACK_PENDING` (T3) are returned as
  pure no-ops; the router never calls `executeTool`/`chrome.scripting` for them (router test proves the
  empty executeScript recorder, capability-router.test.js:196-216).
- **INV-04:** agent-loop.js change is a single additive system-prompt string line; the three setTimeout
  iterator lines are byte-identical (iterator guard GREEN, 4/4 callsites).
- **No hardcoded secrets** anywhere in Phase-29 source.
- **All four new tests pass GREEN** and the recipe-path guard passes (verified by running them).

---

_Reviewed: 2026-06-21T20:45:32Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
