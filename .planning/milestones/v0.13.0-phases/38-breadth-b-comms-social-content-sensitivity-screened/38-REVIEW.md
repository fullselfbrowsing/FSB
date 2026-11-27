---
phase: 38-breadth-b-comms-social-content-sensitivity-screened
reviewed: 2026-06-25T00:00:00Z
depth: deep
scope: security-relevant (per-app sensitivity screening; NOT bulk vendored metadata)
files_reviewed: 11
files_reviewed_list:
  - extension/config/service-denylist.json
  - docs/LEGAL.md
  - scripts/import-opentabs-catalog.mjs
  - scripts/verify-classification-gate.mjs
  - scripts/lib/side-effect-class.mjs
  - extension/utils/service-denylist.js
  - extension/utils/capability-router.js
  - tests/sensitive-write-import-gate.test.js
  - tests/breadth-batch-gate.test.js
  - tests/dom-only-default.test.js
  - catalog/descriptors/opentabs__discord__*.json + opentabs__reddit__*.json (spot-check)
findings:
  blocker: 0
  high: 0
  medium: 2
  low: 2
  total: 4
status: clean
fixed_at: 2026-06-25
fixed:
  MED-01: fixed
  MED-02: fixed
  LOW-01: fixed
  LOW-02: fixed
fix_commits:
  MED-01: 2cff6faa
  MED-02: 14624ec4
  LOW-01: f31624aa
  LOW-02: 068803d3
---

# Phase 38: Code Review Report -- Breadth B (Comms/Social/Content, sensitivity-screened)

**Reviewed:** 2026-06-25
**Depth:** deep (cross-file: importer -> classify gate -> denylist -> consent gate; live execution verification)
**Files Reviewed:** 11 (security-relevant screening surface)
**Status:** clean (no blocker/high; 2 medium + 2 low defense-in-depth findings)

## Summary

This review targets the Phase-38 per-app sensitivity SCREENING, not the bulk vendored
metadata. The screening contract holds end-to-end and every focus-area question
resolves in favor of the conservative posture:

- **Every imported social/messaging WRITE origin classifies sensitive** -> its writes
  are posture-B (DENY-04) mutating-gated. Verified by loading the live denylist:
  `chatgpt.com / claude.ai / bsky.app / mastodon.social / www.threads.net /
  discord.com` all return `{ sensitive:true, denied:false }`. The 6 emitted write ops
  (chatgpt/claude.send_message, bsky.create_post, mastodon.create_status,
  threads.create_thread, discord.send_message) are all `sideEffectClass:write`; the 2
  destructive ops (discord.delete_message, bsky/mastodon.delete_*) are `destructive`.
  The router's `_isMutatingSideEffect()` treats write AND destructive as mutating, so
  all 8 are re-gated for a sensitive origin without the per-origin mutating flag.
- **reddit is genuinely read-only -> "safe" is defensible.** The vendored reddit slice
  exposes exactly 3 ops (get_post, list_subreddit_posts, search_posts), all `read`
  (httpMethod GET, read verbs). No reddit write op exists to emit, so leaving
  reddit.com unclassified (reads run under Auto) is correct TODAY. See MED-01 for the
  forward-looking fragility.
- **The threads STEM_OVERRIDE is secure.** The emitted descriptor's `service` field is
  `www.threads.net` (the EXACT origin classified sensitive). The vendored urlPattern is
  `*://www.threads.net/*`, so the importer can only ever derive that host. The override
  `threads:'threads'` re-canonicalizes only the slug/filename (opentabs__threads__*,
  NOT opentabs__www__*) -- confirmed no `opentabs__www__*` file exists on disk. The
  emitted origin == the screened origin. The change is a one-line, purely-additive
  DATA-MAP entry; no logic/control-flow/IIFE change, so INV-01 holds (the build script
  references no djb2/hashing at all).
- **The sensitive-write proof is genuine, not a tautology.** It loads the REAL emitted
  `opentabs__discord__send_message.json` from disk, loads the REAL committed denylist
  roster (`Denylist.load()`, asserts `classify('https://discord.com').sensitive===true`),
  re-points the live `FsbConsentGate` at the real module, and routes the descriptor's
  REAL `sideEffectClass` through the real `_evaluateConsent` path. The write-with-no-flag
  returns `RECIPE_CONSENT_MUTATING_REQUIRED`; the per-origin flag elevates it to allow;
  the read op allows under Auto. All paths exercise live modules. Test passes (16/16).
- **DENY-01 set stays denied + zero descriptors.** netflix/spotify/twitch/steam/
  youtube-music/tinder/onlyfans all classify `denied:true` (non-enableable) and have 0
  emitted descriptors. Phase-35 origins (IG/FB/TikTok/X/WhatsApp/Telegram/Slack) all
  still classify sensitive.

**Regression gates all green:** classification-gate (15/15), consent-mutation-gate
(28/28), no-dead-entry (9/9), dom-only-default (6/6), breadth-batch-gate (13/13),
verify-catalog-crosscheck (94 descriptors, no understated mutating op -- the discord
destructive/write + threads/bsky/mastodon write classes INDEPENDENTLY re-derived),
verify-classification-gate CLI (102 corpus + 23 roster origins all classified),
verify-recipe-path-guard (clean -- the build-script's `await import()` comments do not
trip Wall-1).

The two MEDIUM findings are defense-in-depth gaps in the SAFETY NET (not in the current
shipped state, which is correct); the two LOW findings are minor data-quality and
consistency notes.

## Blocker Issues

None.

## High Issues

None.

## Medium

### MED-01: The classification-gate heuristic provides NO backstop for 5 of the 6 new comms/social write origins -- the explicit denylist line is a single point of failure

**RESOLVED (commit 2cff6faa):** Widened the `social/messaging` axis vocabulary in
`scripts/verify-classification-gate.mjs` with brand-specific tokens
(`chatgpt|claude|ai-assistant|bluesky|bsky|mastodon|threads|fediverse|microblog`),
verified against the full corpus to trip ALL 6 social write origins with NO
false-positive on benign dev apps. A bare `post`/`feed`/`dm` was deliberately
REJECTED because reddit's READ descriptors ("reddit post", "posts in a subreddit")
would have falsely tripped -- reddit stays safe-by-default. Added a `(g)` block to
`tests/classification-gate.test.js` asserting `sensitivityHeuristic` flags all 6 real
emitted write descriptors `social/messaging` while reddit reads stay safe (classification-gate.test.js: 15 -> 30 checks).

**File:** `scripts/verify-classification-gate.mjs:71-104` (AXES), `extension/config/service-denylist.json:44-48`

**Issue:** The whole point of `verify-classification-gate.mjs` (per its own header) is that
"a gap in the service-denylist.json array is indistinguishable from an allow decision,"
and the gate turns that gap into a build failure via the `sensitivityHeuristic`. But the
heuristic's `social/messaging` axis vocabulary is `instagram|facebook|tiktok|twitter|
whatsapp|telegram|messenger|snapchat|discord|linkedin|direct-message|slack|signal` --
it does NOT include chatgpt, claude, bsky/bluesky, mastodon, threads, or any AI-chat /
microblog token. Verified directly against the full `host + slug + description` haystack
of each emitted write descriptor:

```
chatgpt.send_message    -> suspect=false
claude.send_message     -> suspect=false
bsky.create_post        -> suspect=false
mastodon.create_status  -> suspect=false
threads.create_thread   -> suspect=false
discord.send_message    -> suspect=true [social/messaging:discord]   <- only this one
```

So for 5 of the 6 new write origins, the ONLY thing preventing writable-under-Auto is
the explicit `sensitiveOrigins` line. If any one of those 5 lines were accidentally
deleted/typo'd in a future edit, the classification gate would PASS (the heuristic finds
nothing), the descriptor would emit, and that app's `send_message`/`create_post`/
`create_status`/`create_thread` would silently become writable-under-Auto -- the exact
"gap == allow" failure mode the gate exists to prevent, on the most sensitive category.
The current state is correct (all 6 are classified, tests prove it); this is a hole in
the *safety net*, not a current defect.

**Fix:** Widen the `social/messaging` axis vocabulary so the heuristic backstops this
category. Per the module's own fail-closed policy ("a benign false-positive is fixed via
SAFE_ALLOWLIST, NEVER by weakening the heuristic"), widening is the sanctioned direction:

```js
// scripts/verify-classification-gate.mjs, social/messaging axis
re: /\b(instagram|facebook|tiktok|twitter|whatsapp|telegram|messenger|snapchat|discord|linkedin|direct-message|slack|signal|chatgpt|claude|bluesky|bsky|mastodon|threads|fediverse|microblog)\b/i,
```

Add an `ai/assistant` axis if a separate label is preferred for chatgpt/claude. reddit
remains safe-by-default (not in any axis) which is intended. This restores the build
failure for an accidentally-dropped classification on this category.

### MED-02: reddit "safe" is correct only because the vendored slice happens to contain no write op -- a re-vendor that adds a reddit write would emit a writable descriptor under an UNSCREENED origin with no gate to catch it

**RESOLVED (commit 14624ec4):** Added `checkReadOnlySafeOrigins()` to
`scripts/verify-catalog-crosscheck.mjs` asserting every emitted descriptor whose
`service` is in a curated `READ_ONLY_SAFE_SERVICES` set (`reddit.com`,
`www.reddit.com`) is `sideEffectClass:'read'`; wired into the CLI over the full
committed corpus (runs under `validate:extension`). A non-read op for one of these
origins now FAILS the build, forcing an explicit re-classification to sensitive rather
than shipping it writable-under-Auto. Proven by a new hypothetical reddit-write fixture
(`catalog/descriptors/_fixtures/safe-origin-write.fixture.json` -> gate fails) plus the
3 real reddit reads (gate passes); `tests/catalog-crosscheck.test.js` gained the
`(h)/(i)/(j)` cases (20 -> 26 checks).

**File:** `scripts/import-opentabs-catalog.mjs:104-130` (enumerateBatchApps), `docs/LEGAL.md:180-181`

**Issue:** The importer ENUMERATES every vendored plugin dir (no hardcoded op list).
reddit is classified "safe" (deliberately absent from sensitiveOrigins) on the rationale
that reddit usage is read-only content browsing. That holds today: the vendored reddit
slice has exactly 3 read ops. But the safety of "reddit=safe" is coupled to the *content
of the vendored snapshot*, not enforced anywhere. If a future snapshot re-vendor adds a
reddit write op (submit_post / reply / vote / send_message / compose), the enumerator
would emit it under `service: reddit.com`, which:
  (a) classifies NOT sensitive (safe) -> writes run under Auto with no mutating re-gate, and
  (b) is NOT caught by the classification gate -- `sensitivityHeuristic('reddit.com', 'reddit.submit_post', 'Submit a post to reddit')` returns `suspect=false` (reddit is in
      no axis, and "submit"/"post" are not axis keywords).
So a reddit write would ship writable-under-Auto silently. The DOM-only backing
(`invocable=false`) mitigates the *confident-invoke* path but the descriptor still
carries `sideEffectClass:write` and the consent gate would allow it under Auto for the
safe origin. This is the same class of latent fragility as MED-01 but for the
"intentionally safe" origin.

**Fix:** Two options, ideally both: (1) Add a guard in the importer (or a dedicated test
over the committed corpus) asserting that any descriptor whose `service` is in a curated
"safe-only-because-read-only" set (reddit.com) has `sideEffectClass==='read'` for ALL its
emitted ops -- emit-fail otherwise, forcing a re-classification decision. (2) Widen the
classification-gate heuristic with reddit + generic post/submit tokens scoped so a reddit
WRITE trips it (while reddit reads stay safe). This makes the "reddit is read-only"
assumption a checked invariant instead of a snapshot coincidence.

## Low

### LOW-01: `www.threads.net` uses EXACT-host classification while every other apex-bearing social origin is canonical-host or `*.`-wildcarded -- the bare `threads.net` apex is unscreened

**RESOLVED (commit f31624aa):** Broadened the threads classification in
`extension/config/service-denylist.json` from the exact `https://www.threads.net` to
the `https://*.threads.net` subdomain-wildcard (apex + www + any subdomain), consistent
with the `*.`-form used for the other apex-bearing social brands. The importer stays
pinned to `www.threads.net` for slug derivation (the emitted descriptor's `service`
field is unchanged and still classifies sensitive). Added LOW-01 assertions to
`tests/service-denylist.test.js` proving the bare apex `threads.net`, `www`, and an
arbitrary subdomain all classify `{ sensitive:true, denied:false }` (55 -> 59 checks);
updated the config `_comment`.

**File:** `extension/config/service-denylist.json:48`

**Issue:** The denylist classifies `https://www.threads.net` (exact). Confirmed that the
bare apex `https://threads.net` therefore classifies `{ sensitive:false, denied:false }`.
This is internally consistent with the importer (the vendored pattern is
`*://www.threads.net/*`, so no apex descriptor can be emitted, and there is no
`opentabs__www__*` or apex threads descriptor on disk), so it is NOT a catalog-level
bypass. The concern is purely defense-in-depth: the consent gate's posture-B re-gate keys
on `classify(origin).sensitive` of the *active-tab origin* at DOM-execution time. If a
threads write op were ever DOM-driven while the active origin were the bare `threads.net`
apex (Threads does serve/redirect both), the sensitive re-gate would not fire for that
origin. By contrast IG/FB/TikTok use `https://*.<domain>` (apex + all subdomains) and
chatgpt/claude/bsky/mastodon/discord are the canonical bare hosts -- threads is the lone
exact-`www.` entry, leaving its apex uncovered.

**Fix:** Classify the Threads brand at the domain level to remove the asymmetry:
`https://*.threads.net` (matches apex + www + any subdomain), consistent with the
`*.`-wildcard form used for the other apex-bearing social brands. Keep the importer
pinned to `www.threads.net` for slug derivation. This makes the screened origin set a
superset of any origin the user could be on for that brand, not exactly the one host the
importer emits.

### LOW-02: discord intentSynonyms contain a degenerate self-duplicated phrase ("send a message in discord in discord")

**RESOLVED (commit 068803d3):** In `synthSynonyms()` (`scripts/import-opentabs-catalog.mjs`),
strip a trailing ` in <stem>` (case-insensitive) from the op summary before re-appending
exactly one ` in <stem>`, so a summary already ending in the app-tagged form no longer
double-tags. Re-ran `import-opentabs-catalog.mjs` + `package-extension.mjs`: the only
descriptor changes are the removed degenerate phrases for chatgpt/claude/discord
`send_message` (the threads/bsky/mastodon summaries end in "to <brand>", not "in <stem>",
so they never had the exact "in X in X" doubling). The eval seed +
`recipe-index.generated.js` snapshot regenerated to match (3 insertions, 6 deletions --
no structural drift; INV-01 IIFE shape intact). breadth-search-return + capability-search-eval stay green.

**File:** `catalog/descriptors/opentabs__discord__send_message.json:9` (also delete_message:11, threads/bsky/mastodon equivalents)

**Issue:** `synthSynonyms()` appends a `${summary} in ${stem}` phrase (import script line
445); when the op summary already ends in the stem-tagged form, the result double-tags:
`"send a message in discord in discord"`, `"delete a discord message permanently in
discord"`, `"post a new thread in threads"` etc. The stem-guard + dedup in `push()` do not
catch a trailing-stem duplication because the strings differ. This is data-quality only
(not a screening or security issue) -- it slightly dilutes the search index with an
ungrammatical phrase and is cosmetically poor in a shipped descriptor. Out of the
declared security scope but worth a cheap cleanup since these are the headline
sensitive-category descriptors.

**Fix:** In `synthSynonyms()`, before pushing `${summary} in ${stem}`, strip a trailing
` in ${stem}` (case-insensitive) already present in `summary`, or skip the summary phrase
when `stemRe` already matches `summary`. Re-run the importer to regen the affected
descriptors. (Verify breadth-search-return.test.js still passes -- it asserts no bare
verb+stem+digit filler, which this change does not affect.)

---

_Reviewed: 2026-06-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
