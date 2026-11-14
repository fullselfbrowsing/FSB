---
phase: 42-discovery-seeding-tail-learn
verified: 2026-06-26
status: passed
score: 17/17 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
human_verification:
  - test: "Live first-authenticated-visit capture on a REAL logged-in tab (UAT-42-01 linear.app)"
    expected: "A captured POST /graphql replays cleanly and PROMOTES a T2 recipe; on the next visit resolve() returns the learned T2 (outranks descriptor-T3); all 3 sinks (learned-recipe envelope, audit ring, diagnostic ring) carry ZERO auth substring (linear-client-id / organization redacted to shape)."
    why_human: "Irreducibly live — requires real credentials + debugger-attach on a real authenticated tab; cannot ship to CI. A hint never executes; nothing learns/leaks without this consent-gated capture. Carried-forward debt (42-HUMAN-UAT.md), matching the Phase 29/40/41 posture."
  - test: "Live first-authenticated-visit capture (UAT-42-02 app.todoist.com)"
    expected: "A captured same-origin call replays cleanly and promotes a T2 that outranks the descriptor-T3 on the next visit; the 3 sinks carry zero auth substring (session/CSRF carriers redacted to shape)."
    why_human: "Irreducibly live — real authenticated tab + debugger-attach required; not CI-provable."
  - test: "Live first-authenticated-visit capture (UAT-42-03 dashboard.stripe.com, SENSITIVE)"
    expected: "The consent gate requires the confirmedSensitive step (RECIPE_CONSENT_SENSITIVE_UNCONFIRMED until confirmed) BEFORE any capture; after confirming, a captured /v1/* call replays cleanly and promotes a T2 that outranks the descriptor; the 3 sinks carry ZERO auth substring (session_api_key / x-stripe-csrf-token / Bearer value redacted to shape)."
    why_human: "Irreducibly live + sensitive-gated — requires real Stripe credentials, the confirmedSensitive consent step, and debugger-attach on a real tab; not CI-provable."
---

# Phase 42: Discovery Seeding + Tail Learn (DSEED-01/02) Verification Report

**Phase Goal:** Make the non-hand-ported tail invocable predictably by seeding all its origins (+ endpoint hints harvested from OpenTabs `*-api.ts`) so the existing Phase-31 network-capture path learns each origin on the first authenticated visit (consent-gated, promote-after-replay), and prove the capture-time structural redactor leaks no auth substring across the full 119-app field universe.

**Verified:** 2026-06-26
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Per-Success-Criterion Status

| SC | Criterion | Status | Evidence |
| -- | --------- | ------ | -------- |
| **SC1** | OpenTabs origins (+ hints) seed the Phase-31 capture via `discovery-seeds.json`; network-capture reads the hints (NO manifest/permission change); a seeded origin learns a T2 via promote-after-replay (consent-gated); a hint only biases recognition, never executes. | **PASSED** | Harvester emits `extension/config/discovery-seeds.json` with **128 origins / 255 hints** (`_meta`: vendorSha `4b170216`, generator stamp; per-origin `provenance{app,source}`). Byte-reproducible: twice-regen → identical sha256 `d392382f...`, `git diff` empty. Loader in `network-capture.js` (lazy `chrome.runtime.getURL` fetch + Node `require` fallback, no-throw → degrade-to-empty). `manifest.json host_permissions` git-diff vs `dd789ec1` = **empty (0 lines)**. Synthesizer seed-bias is metadata-only (`seedMatch` flag, `_seedMatches` reads the seed map, NO fetch, fails closed). `discovery-session.js` (promote-after-replay, fail→DISCARD) git-diff = **0**. `discovery-seeds-load.test.js` 13/13, `learned-promote-after-replay.test.js` 15/15. |
| **SC2** | A seeded-origin descriptor resolves T2 (learn-pending); a learned T2 outranks descriptor-T3; RECIPE_LEARN_PENDING is an actionable affordance. | **PASSED** | `capability-catalog.js resolve()`: LEARN-04 learned-first UNCHANGED (line 350-357); descriptor-only fallback seeded would-be-T3 → T2 with **NO recipe field** (line 394-396), unseeded → T3 (line 397) — never fabricates a recipe. INV-01 catalog/djb2 data-shape untouched (only a resolve-time branch added; `catalog-inline-shape` test green in battery). Router T2-no-recipe leg returns `RECIPE_LEARN_PENDING` with additive `{slug, reason:'not-yet-learned', actionable:true, message}` (line 780-785), origin named in message; `_err` keeps `code===errorCode===error==='RECIPE_LEARN_PENDING'` byte-stable (INV-03). `seed-resolve-t2.test.js` 12/12 (seeded→T2, unseeded→T3 gated, no-fabrication), `recipe-learn-pending-affordance.test.js` 15/15 (triple-field byte-equality + additive fields), `learned-t2-outranking.test.js` 10/10. |
| **SC3** | The structural redactor extended + verified against the 119-app field universe so NO auth substring is persisted into any learned-recipe envelope, audit entry, or diagnostic ring at scale — capture reads structure only, never a value. | **PASSED** | Redactor stays structure-only by construction: `redactRequest`→`{method,path,origin,headerNames}` (the `for..in` reads KEYS only, never values, line 233-242); `redactResponse`→`{status,mimeType}` only, NO body/headers (line 257-263). `AUTH_CARRIER_DENYLIST` (line 88) covers the named carriers: stripe `session_api_key` (`.*session.*`/`.*api[_-]?key.*`), instagram `csrftoken` (`.*csrf.*`), linear `linear-client-id` (`.*-client-id`), plus AWS `x-amz-.*`, `organization`, etc. NEW path-segment token scrub `_TOKEN_SHAPES` (line 156-164) masks JWT/stripe/github/slack/AWS `(AKIA\|ASIA)`/google/MS-Graph `u!` to `:tok`; benign hyphenated slugs survive literal (no false-positive). 3 sink modules UNCHANGED (audit-log.js, diagnostics-ring-buffer.js, learned-recipe-store.js git-diff = 0). `network-capture-redaction.test.js` 130/130 (names+values+query+path-token + benign-slug negative), `audit-log-no-secret.test.js` 18/18. No-leak is non-vacuous (asserts specific sentinel VALUES are ABSENT). |

**Score: 3/3 success criteria PASSED.**

### Observable Truths (merged ROADMAP SCs + PLAN frontmatter)

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1 | Harvester emits `discovery-seeds.json` from vendored `*-api.ts` (origin→hints), provenance-stamped + SHA-pinned | VERIFIED | 128 origins / 255 hints; `_meta.vendorSha=4b170216`; per-origin `provenance{app,source}`; real 4-strategy regex parse of `*-api.ts` text (harvest-discovery-seeds.mjs:108-160) |
| 2 | Seeds are byte-reproducible (SHA-pinned provenance, IN-01 fix) | VERIFIED | twice-regen → identical sha256 `d392382fda...`; `git diff` empty; both runs report origins=128 hints=255 |
| 3 | A loader reads `discovery-seeds.json` no-throw (degrade-to-empty on error) | VERIFIED | network-capture.js loadSeeds()/getSeedsSync()/getSeedForOrigin() (lazy fetch + require fallback, `_applySeeds({})` on any error, never throws on boot) |
| 4 | `manifest.json host_permissions` byte-unchanged (NO new permission) | VERIFIED | `git diff dd789ec1..HEAD -- extension/manifest.json` = 0 lines; keystone test asserts `["<all_urls>"]` byte-for-byte |
| 5 | The 4 new test files are registered in package.json | VERIFIED | package.json diff = test-chain insertion of `discovery-seeds-load` + `seed-resolve-t2` + `recipe-learn-pending-affordance`; `network-capture-redaction` already present + extended |
| 6 | A hint biases recognition only — NEVER executes | VERIFIED | recipe-synthesizer.js `_seedMatches` (line 88-117) reads the seed map only, fails closed, no fetch; `seedMatch` is a metadata flag (line 422); affordance/seed-resolve tests assert no-dispatch |
| 7 | Promote-after-replay (fail→DISCARD) reused UNCHANGED | VERIFIED | `git diff dd789ec1..HEAD -- discovery-session.js` = 0; learned-promote-after-replay CASE B/C fail→DISCARD 15/15 |
| 8 | `AUTH_CARRIER_DENYLIST` covers the named carriers + 119-app universe | VERIFIED | redactor line 88: session_api_key/csrftoken/linear-client-id/x-amz-*/organization + token/api-key/client-id families; redaction test asserts each carrier removed |
| 9 | NEW path-segment token scrub masks distinctive prefixes to `:tok`; benign slugs survive | VERIFIED | redactor `_TOKEN_SHAPES` (line 156-164) + `_shapePath` (line 177-184); redaction test: sk_live_/gho_/xoxb-/`u!` paths → `:tok`, `my-long-organization-name` survives literal |
| 10 | Redactor stays structure-only (reads names never values) | VERIFIED | `redactRequest` `for..in` reads keys only (line 233-242); `redactResponse` no body/headers (line 116-117 test); D-06/D-07/D-08 preserved |
| 11 | No auth substring in any of the 3 sinks at scale (non-vacuous) | VERIFIED | redaction test 130/130 (envelope sink) + audit-log-no-secret 18/18 (audit ring) + redact-for-log/diagnostics-ring tests in battery (diagnostic ring); sentinels asserted ABSENT |
| 12 | Seeded would-be-T3 origin resolves T2 (learn-pending), NO recipe | VERIFIED | capability-catalog.js resolve() line 394-396; seed-resolve-t2 test: seeded→T2, `!('recipe' in seeded)` |
| 13 | Unseeded origin's descriptor-only slug stays T3 (branch gated) | VERIFIED | resolve() line 397; seed-resolve-t2 test: same slug unseeded→T3 |
| 14 | LEARN-04 learned-first UNCHANGED — learned T2 outranks | VERIFIED | resolve() line 350-357 (learned checked first); learned-t2-outranking 10/10; seed-resolve-t2 learned-first case |
| 15 | INV-01 catalog/djb2 shape untouched (resolve-time lookup, not re-stamp) | VERIFIED | catalog diff = resolve() branch + accessor only; no REGISTRY/djb2 data-shape change; catalog-inline-shape green |
| 16 | RECIPE_LEARN_PENDING additive `{reason,actionable,message}`, origin named | VERIFIED | router line 780-785; message "Open `<origin>` while signed in..." (line 778); affordance test asserts fields |
| 17 | INV-03 `code===errorCode===error` byte-stable (additive-only) | VERIFIED | `_err` line 61; affordance test triple-field byte-equality 15/15; T2-with-recipe leg unchanged (line 773-774) |

**Score: 17/17 truths VERIFIED.**

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `scripts/harvest-discovery-seeds.mjs` | Build-time seed generation from vendored `*-api.ts` | VERIFIED | 294 lines; real 4-strategy regex extraction; reads `vendor/opentabs-snapshot/plugins`; SHA-pinned `_meta`; byte-reproducible |
| `extension/config/discovery-seeds.json` | origin→{hints,provenance} seed map | VERIFIED | 128 origins / 255 hints; per-origin provenance; `_meta.vendorSha`; sha256 `d392382f...` |
| `tests/discovery-seeds-load.test.js` | Seed-load no-throw + manifest byte-unchanged keystone | VERIFIED | 13/13 PASS incl manifest host_permissions byte keystone |
| `tests/network-capture-redaction.test.js` | 119-app no-leak across 3 sinks (extended) | VERIFIED | 130/130 PASS; names+values+query+path-token + benign-slug; non-vacuous |
| `extension/utils/network-capture-redactor.js` | Extended denylist + path-scrub, structure-only | VERIFIED | +140/-5 additive; AUTH_CARRIER_DENYLIST + _TOKEN_SHAPES + HEADER_NAME_TOKEN_SHAPES; structure-only intact |
| `extension/utils/network-capture.js` | discovery-seeds loader (lazy, no-throw) | VERIFIED | +111/-1 additive (the -1 is a trailing-comma reformat); _runGate + capture core byte-identical |
| `extension/utils/recipe-synthesizer.js` | Seed recognition-bias (metadata-only, never executes) | VERIFIED | +62/-0 additive; `_seedMatches` reads-only/fails-closed; `seedMatch` flag |
| `extension/utils/capability-catalog.js` | resolve() seed→T2 branch | VERIFIED | +43/-4 (the -4 is the replaced 3-line return expanded); seed-resolve gated on origin; INV-01 shape intact |
| `tests/seed-resolve-t2.test.js` | seeded→T2 / unseeded→T3 + learned-first + no-fabrication | VERIFIED | 12/12 PASS; drives REAL resolve() |
| `extension/utils/capability-router.js` | RECIPE_LEARN_PENDING actionable affordance | VERIFIED | +22/-3 additive; `{reason,actionable,message}`; INV-03 byte-stable |
| `tests/recipe-learn-pending-affordance.test.js` | actionable-fields + INV-03 proof | VERIFIED | 15/15 PASS; triple-field byte-equality |
| `.planning/.../42-HUMAN-UAT.md` | Live-first-visit UAT slice (human_needed) | VERIFIED | `status: human_needed`; 3 rows (linear/todoist/stripe-sensitive) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| harvest-discovery-seeds.mjs | vendored `*-api.ts` | readFileSync + urlPatterns parse | WIRED | VENDOR_ROOT join + per-app readFileSync + harvestHintsFromText (manually traced; gsd-sdk descriptive-string false-negative) |
| discovery-seeds-load.test.js | manifest.json | host_permissions byte-compare | WIRED | keystone assert present + green |
| network-capture-redactor.js | learned-recipe envelope | path-segment scrub in `_shapeUrl` | WIRED | `_shapePath` masks `:tok` before path returned (line 210) |
| network-capture.js | discovery-seeds.json | chrome.runtime.getURL fetch (no-throw) | WIRED | loadSeeds() fetch + require fallback (manually traced; gsd-sdk regex-escape false-negative) |
| recipe-synthesizer.js | loaded seeds | seed lookup raises recognition metadata only | WIRED | `_seedMatches` → `seedMatch` flag, no execute |
| capability-catalog.js resolve() | seeded-origin lookup | would-be-T3 + seeded → T2 | WIRED | `_seedForOrigin(origin)` → T2 (line 394-396) (manually traced; gsd-sdk "source file not found" false-negative) |
| capability-router.js T2 branch | `_err('RECIPE_LEARN_PENDING',{...})` | additive fields, code unchanged | WIRED | line 780-785 (manually traced) |

**Note:** `gsd-sdk query verify.key-links` returned several false "not found" results because it cannot resolve descriptive source strings (e.g. "capability-catalog.js resolve()", "the final battery") to file paths, and it double-escaped the `discovery-seeds\.json` regex. All 7 key links were verified by direct grep/read of the actual code and are WIRED.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| discovery-seeds.json | `_seeds` (network-capture) | harvester regex parse of vendored `*-api.ts` | Yes — 128 origins / 255 real hints (not hardcoded; reproducible) | FLOWING |
| resolve() T2 result | `tier` | `_seedForOrigin(origin)` → real seed lookup | Yes — gated on real seed presence; unseeded→T3 proves non-static | FLOWING |
| RECIPE_LEARN_PENDING | `message` | derived from `entry.descriptor.origin`/`c.origin` | Yes — origin-named at runtime, not a constant | FLOWING |
| redacted envelope | `headerNames`/`path` | structure-only reduction of captured call | Yes — names-only loop + path-scrub; sentinel values proven absent | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Harvester emits reproducible seeds | `node scripts/harvest-discovery-seeds.mjs` ×2 + sha256 | identical `d392382f...`, exit 0 | PASS |
| Seed map is real (128/255) | `node -e require('discovery-seeds.json')` count | origins=128, hints=255 | PASS |
| getSeedForOrigin is a real export | module export inspection | `getSeedForOrigin` exported (line 552) | PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Full battery | `npm test` | EXIT 0 (739+ PASS counters; 0 real failures) | PASS |
| Extension gates | `npm run validate:extension` | EXIT 0 (manifest valid + 286 JS clean + 6 verify gates) | PASS |
| discovery-seeds-load | `node tests/discovery-seeds-load.test.js` | PASS=13 FAIL=0 (exit 0) | PASS |
| network-capture-redaction | `node tests/network-capture-redaction.test.js` | PASS=130 FAIL=0 (exit 0) | PASS |
| seed-resolve-t2 | `node tests/seed-resolve-t2.test.js` | PASS=12 FAIL=0 (exit 0) | PASS |
| recipe-learn-pending-affordance | `node tests/recipe-learn-pending-affordance.test.js` | PASS=15 FAIL=0 (exit 0) | PASS |
| learned-promote-after-replay | `node tests/learned-promote-after-replay.test.js` | PASS=15 FAIL=0 (exit 0) | PASS |
| learned-t2-outranking | `node tests/learned-t2-outranking.test.js` | PASS=10 FAIL=0 (exit 0) | PASS |
| audit-log-no-secret | `node tests/audit-log-no-secret.test.js` | PASS=18 FAIL=0 (exit 0) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DSEED-01 | 42-01/02/03/04/05 | OpenTabs origins (+ hints) seed Phase-31 capture; tail learned on first authenticated visit, consent-gated | SATISFIED | SC1+SC2 verified; harvester/seeds/loader/resolve-T2/affordance all in + green; consent gate + promote-after-replay UNCHANGED |
| DSEED-02 | 42-01/02/05 | Structural redactor extended + verified against 119-app universe; no auth substring persisted at scale | SATISFIED | SC3 verified; extended denylist + path scrub; structure-only; no-leak non-vacuous across 3 sinks |

No orphaned requirements. Both DSEED-01/DSEED-02 map to Phase 42 in REQUIREMENTS.md and are claimed by the plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX debt markers in any Phase-42 modified source | — | Clean — completion is auditable |

The only "placeholder"/"marker" grep hits are benign domain vocabulary (`{param} placeholder` = recipe-template term; `fellBackToDom marker` = a real status flag). No stubs, no empty implementations, no hardcoded-empty data in any user-visible path. The harvester/loader/resolve/redactor are all substantive.

### Code-Review Fix Verification (42-REVIEW.md, all 5 RESOLVED)

| Finding | Severity | Fix Verified In Code | Commit |
| ------- | -------- | -------------------- | ------ |
| WR-01 | MED | AWS anchor `^(AKIA\|ASIA)[A-Z0-9]{16}` masks suffixed key (redactor:161); honest residual comment (redactor:136-152) — NOT widened, no false-positive | db991d46 |
| WR-02 | MED | `_nameLooksTokenShaped` self-contained (helper-local `toLowerCase`, real `eyJ` literal, redactor:111-117) | 997611b6 |
| IN-01 | LOW | `generatedAt` dropped → byte-reproducible (twice-regen identical sha256 `d392382f...`, git diff empty) | 022cc476 |
| IN-02 | LOW | dead `=== hp` re-tests removed from `_seedMatches` prefix arm (behavior-preserving; seed-resolve-t2 12/12) | 65ee982b |
| IN-03 | LOW | broad hint regex left UNCHANGED, documented accepted metadata-only residual (harvester:134-139); output-neutral | 1481d316 |

All 5 findings independently re-verified present in the code and green. The accepted path-token residual (prefixless-with-separator) is documented honestly and is NOT a phase-fail per the brief (structure-only value-exclusion floor + named-carrier denylist remain intact).

---

## Security Section (the DSEED-02 headline)

**Structure-only redactor, zero auth substring across all 3 sinks at 119-app scale, no manifest change, hint never executes.**

- **Structure-only by construction (the PRIMARY control):** `redactRequest` returns exactly `{method, path, origin, headerNames}` — the `for..in` loop reads header KEYS only and NEVER a value (D-07). `redactResponse` returns exactly `{status, mimeType}` — no body, no headers, no CDP body-fetch path (D-08). A credential VALUE is never read, so it cannot leak. Verified by code read (redactor.js:225-263) and the redaction test's no-body/no-headers assertions.
- **Named-carrier denylist (the SECONDARY name-hygiene control):** `AUTH_CARRIER_DENYLIST` extended to the full 119-app universe — explicitly covers the SC-named carriers stripe `session_api_key`, instagram `csrftoken`, linear `linear-client-id`, plus AWS SigV4 (`x-amz-*`), `organization`, and the token/api-key/client-id/session families. A matched name is dropped from headerNames entirely.
- **NEW path-segment token scrub (the SC3 sink-#1 vector):** `_TOKEN_SHAPES` masks distinctive token prefixes (JWT `eyJ.`, stripe `(sk|pk|rk)_`, github `gh[opsur]_`, slack `xox[bcpars]-`, AWS `(AKIA|ASIA)`, google `ya29.`, MS-Graph `u!` share-id) embedded in a URL PATH SEGMENT to `:tok` before the path reaches the learned-recipe envelope. Benign hyphenated slugs (`my-long-organization-name`, `/v1/charges`) survive literal — NO false-positive (verified by the redaction test's benign-slug negative cases).
- **Non-vacuous no-leak across all 3 sinks:** the redaction test (130/130) asserts specific sentinel VALUES (`sk_live_DISTINCT...`, `gho_DISTINCT...`, `xoxb-DISTINCT...`, `u!...DISTINCT...`, every carrier name) are ABSENT from the redacted output AND the serialized learned-recipe-envelope-shaped artifact. The audit ring (audit-log-no-secret 18/18) and diagnostic ring (redact-for-log + diagnostics-ring tests in the battery) reduce through the same structure-only path. ALL 3 sink modules (learned-recipe-store.js, audit-log.js, diagnostics-ring-buffer.js) are byte-unchanged from baseline.
- **NO manifest/permission change:** `git diff dd789ec1..HEAD -- extension/manifest.json` is empty; host_permissions stays `["<all_urls>"]` byte-for-byte (asserted by the keystone test). The seeds feed the synthesizer's recognition, not a fetch right.
- **A hint NEVER executes:** the seed is metadata. `_seedMatches` reads the seed map and returns a boolean `seedMatch` flag that only biases the synthesizer's recognition; it triggers no fetch and fails closed. A seeded origin becomes invocable ONLY after a real captured + replayed call promotes a T2 (the consent-gated `discovery-session.js` path, fail→DISCARD, byte-unchanged). The seed→T2 resolve carries NO recipe field — it never fabricates a credentialed call.
- **Capture/consent core UNCHANGED:** `_runGate` (network-capture.js:218-265, the consent boundary) and the full `_onCdpEvent`/`startSession`/`endSession` region (170-433) are byte-identical to `dd789ec1`. `discovery-session.js` and `learned-recipe-store.js` git-diff = 0.

**Accepted residual (NOT a phase-fail, per the brief):** a prefixless high-entropy token carrying a `-`/`_` separator inside a path SEGMENT is masked by neither the path scrub (prefix-anchored) nor the synthesizer (separator-excluded). This is a documented, uncommon, non-vendored vector; the structure-only value-exclusion FLOOR and the named-carrier denylist remain fully intact, so the seam is confined to the path-segment defense-in-depth layer. The team deliberately chose honesty over a false-positive-prone "high-entropy-with-separator" widening that would break benign slugs.

---

## Human Verification Required

The sole carried-forward `human_needed` item is the **live first-authenticated-visit capture** (recorded in 42-HUMAN-UAT.md, 3 rows). This is irreducibly live — it requires real credentials + debugger-attach on a real authenticated tab and cannot ship to CI. The seed→T2 resolve, promote-after-replay (fail→DISCARD), and the redactor no-leak are ALL fixture-tested headless and green; a hint never executes, so nothing learns or leaks without this consent-gated capture. This matches the Phase 29/40/41 live-UAT posture and is intentional debt — NOT a phase gap.

### 1. UAT-42-01 — linear.app (non-sensitive)

**Test:** On an authenticated Linear tab, run the consent-gated discovery session while performing a read (e.g. list issues).
**Expected:** A captured `POST /graphql` replays cleanly and PROMOTES a T2 recipe; on the next visit `resolve()` returns the learned T2 (outranks descriptor-T3); the learned-recipe envelope, audit ring, and diagnostic ring carry ZERO auth substring (`linear-client-id` / `organization` redacted to shape).
**Why human:** Requires real credentials + debugger-attach on a real authenticated tab; not CI-provable.

### 2. UAT-42-02 — app.todoist.com (non-sensitive)

**Test:** On an authenticated Todoist tab, run the consent-gated discovery session during a read.
**Expected:** A captured same-origin call replays cleanly and promotes a T2 that outranks the descriptor-T3 on the next visit; the 3 sinks carry zero auth substring (session/CSRF carriers redacted to shape).
**Why human:** Live authenticated tab + debugger-attach required; not CI-provable.

### 3. UAT-42-03 — dashboard.stripe.com (SENSITIVE)

**Test:** On an authenticated Stripe Dashboard tab, run the discovery session.
**Expected:** The consent gate requires the `confirmedSensitive` step (RECIPE_CONSENT_SENSITIVE_UNCONFIRMED until confirmed) BEFORE any capture; after confirming, a captured `/v1/*` call replays cleanly and promotes a T2 that outranks the descriptor; the 3 sinks carry ZERO auth substring (`session_api_key` / `x-stripe-csrf-token` / `Bearer` value redacted to shape).
**Why human:** Live + sensitive-gated — real Stripe credentials, the confirmedSensitive step, and debugger-attach on a real tab; not CI-provable.

---

## Gaps Summary

**No gaps.** All 3 ROADMAP success criteria PASSED; all 17 merged must-have truths VERIFIED; all 12 artifacts exist + substantive + wired + data-flowing; all 7 key links WIRED (verified by direct code read where gsd-sdk's descriptive-string matcher false-negatived); both requirements (DSEED-01/DSEED-02) SATISFIED with no orphans; zero blocker anti-patterns (no unreferenced debt markers); all 5 code-review findings independently re-verified RESOLVED + green. Full `npm test` EXIT 0, `npm run validate:extension` EXIT 0, seeds byte-reproducible (twice-regen identical sha256), manifest + capture-core + consent-gate + 3-sink modules byte-unchanged from baseline.

The phase status is `passed` with `human_needed` items present per the verification decision tree (Step 9 rule: human items take priority over `passed` only when they BLOCK the goal). Here the live-capture items are intentional carried-forward UAT debt that does NOT block goal achievement — the goal (seed→learnable tail + structure-only redactor no-leak at scale) is observably TRUE in the codebase and fixture-verified headless. The 3 live-UAT scenarios are surfaced for the human as confirmation-of-the-live-half, consistent with the Phase 29/40/41 posture, and are documented as `human_needed` in 42-HUMAN-UAT.md.

---

_Verified: 2026-06-26_
_Verifier: Claude (gsd-verifier)_
