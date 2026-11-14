---
phase: 42-discovery-seeding-tail-learn
plan: 01
subsystem: testing
tags: [discovery-seeds, redactor, network-capture, security, harvester, opentabs]

requires:
  - phase: 31-network-capture-discovery
    provides: network-capture-redactor.js (structure-only redactRequest/redactResponse), the master 7-substring no-leak test
  - phase: 39.5-opentabs-augment
    provides: vendored plugins/<app>/src/*-api.ts (129 apps) + the importer readPluginMeta urlPatterns parse
provides:
  - "scripts/harvest-discovery-seeds.mjs -- build-time harvester (origin + endpoint hints from the vendored *-api.ts)"
  - "extension/config/discovery-seeds.json -- 128 origins, 255 hints, provenance-stamped + SHA-pinned (vendorSha 4b170216)"
  - "tests/discovery-seeds-load.test.js -- seed-load no-throw + the no-manifest-change keystone (host_permissions byte-unchanged)"
  - "tests/network-capture-redaction.test.js EXTENDED -- the 119-app auth-carrier no-leak + path-segment token vector + benign-slug negative (RED-first)"
  - "package.json registers the 3 new Phase-42 tests (single owner)"
affects: [42-02-redactor-extension, 42-03-seed-resolve, 42-04-affordance, 42-05-battery]

tech-stack:
  added: []
  patterns:
    - "Build-time static-text harvester: extract op/path/method hints from *-api.ts WITHOUT executing app code (regex scan over ENDPOINT consts, fetch paths, /vN & /_graphql literals, exported op names, method literals)"
    - "RED-first security keystone: the no-leak proof is APPENDED to the existing test and fails loud against the not-yet-extended redactor; the negative (benign-slug) case is GREEN throughout"

key-files:
  created:
    - scripts/harvest-discovery-seeds.mjs
    - extension/config/discovery-seeds.json
    - tests/discovery-seeds-load.test.js
  modified:
    - tests/network-capture-redaction.test.js
    - package.json

key-decisions:
  - "Origin derived EXACTLY like the importer's readPluginMeta (urlPatterns[0].match(/:\\/\\/([^/]+)\\//), strip *., prefix https://) so seeds key on the same bare origin the catalog/resolve use"
  - "vendorSha read from vendor/opentabs-snapshot/_provenance.json (.sha); resolved to 4b170216 (pinned), with an unpinned+warn fallback (never throw)"
  - "75 of 128 origins are origin-only (no static path hint) -- recognition keys on origin alone, which is sufficient per SC1 (a hint only biases recognition)"

patterns-established:
  - "Pattern: discovery-seeds.json shape { <origin>: { hints:[{op,method,path}], provenance:{app,source} }, _meta:{generator,vendorSha,generatedAt,originCount,hintCount} }"
  - "Pattern: the path-token-in-segment hostile vector + a benign-slug negative pin the redactor's path scrub to a PRECISE distinctive-prefix set (no broad separator rule)"

requirements-completed: [DSEED-01, DSEED-02]

duration: 4min
completed: 2026-06-26
---

# Phase 42 Plan 01: Discovery-Seed Harvester + 119-App Redaction Keystone (RED-first) Summary

**Build-time harvester emits a 128-origin / 255-hint provenance-stamped discovery-seeds.json from the vendored *-api.ts, plus the DSEED-02 119-app auth-carrier no-leak test EXTENDED (header NAMES + VALUES + query + token-shaped PATH SEGMENTS incl the MS Graph `u!` share-id) with a benign-slug negative case, landed RED-first so Plan 02's denylist + path-scrub extension turns it GREEN.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-26T19:34:31Z
- **Completed:** 2026-06-26T19:39Z
- **Tasks:** 4
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `scripts/harvest-discovery-seeds.mjs`: reads each vendored `plugins/<app>/src/*-api.ts` via a static text scan (no app-code execution), deriving the bare origin from `package.json.opentabs.urlPatterns` and endpoint hints from ENDPOINT/API_BASE consts, fetch-target paths, `/vN` & `/_graphql` path literals, exported op names, and method literals. Emits `extension/config/discovery-seeds.json`: **128 origins, 255 hints**, provenance-stamped + SHA-pinned to `4b17021637d2cac12b8d84d21c40e765aa7b85e9`.
- Seed-load + no-manifest-change keystone test (13/13 GREEN): seeds load no-throw, every non-`_meta` key is a bare https origin, and `manifest host_permissions === ["<all_urls>"]` byte-for-byte (the SC1 no-new-permission guard).
- The 119-app redaction no-leak EXTENSION, RED-first: PASS=80 FAIL=50. The 50 RED assertions are the exact GREEN target for Plan 02.

## Task Commits

1. **Task 1: Harvester + discovery-seeds.json** - `84f3440f` (feat)
2. **Task 2: Seed-load + no-manifest-change keystone test** - `4532a53c` (test)
3. **Task 3: 119-app redaction no-leak extension (RED-first)** - `12865055` (test)
4. **Task 4: Register 3 new tests in package.json** - `09e23f66` (chore)

## Files Created/Modified
- `scripts/harvest-discovery-seeds.mjs` - build-time seed generation from the vendored `*-api.ts` (static scan; metadata only, no fetch right)
- `extension/config/discovery-seeds.json` - 128-origin / 255-hint seed map, provenance-stamped
- `tests/discovery-seeds-load.test.js` - seed-load no-throw + the manifest host_permissions byte-unchanged keystone
- `tests/network-capture-redaction.test.js` - APPENDED the 119-app universe + path-token + benign-slug blocks (existing 33 assertions unchanged)
- `package.json` - registered discovery-seeds-load, seed-resolve-t2, recipe-learn-pending-affordance

## The exact RED assertions (Plan 02's GREEN target)

**Header carrier NAMES surviving (26 assertions, the denylist gaps to close):**
`session_api_key`, `csrf_token`, `csrftoken`, `linear-client-id`, `organization`, `x-amz-security-token`, `x-amz-date`, `x-session-token`, `x-airtable-application-id`, `x-airbnb-api-key`, `x-ig-app-id`, `x-modhash`, `x-thd-customer-token`, `x-booking-csrf-token`, `x-stripe-csrf-token`, `x-dd-csrf-token`, `x-twitter-auth-type`, `x-notion-active-user-header`, `x-restli-protocol-version`, `x-org`, `sessionid`, `auth-token`, `xsrftoken`, `access_token`, `id_token`, `refresh_token`.

**Path-segment tokens surviving (24 assertions = 8 cases x 3, the `_shapeUrl` path-scrub target):**
JWT (`eyJ...\.`) in OAuth callback + reset paths, stripe `sk_live_`, github `gho_`, slack `xoxb-`, aws `AKIA`, google `ya29.`, MS Graph `u!` share-id (`/shares/u!.../driveItem`). Each needs masking to `:tok`.

**Already GREEN (must STAY GREEN after Plan 02):**
- The structure-only VALUE-exclusion floor (a token-shaped value in an UNKNOWN-name header never appears -- names-only loop).
- The benign-slug NEGATIVE cases: `my-long-organization-name`, `my-document-title-2024`, `/v1/charges` survive LITERAL (no false-positive).
- The existing 33 Phase-31 baseline assertions.

## Decisions Made
- Origin parse mirrors the importer exactly so seeds key on the same bare origin the resolve()/synthesizer use (no key-shape mismatch downstream).
- vendorSha sourced from `_provenance.json` (the existing vendored provenance pin), not a `.git` HEAD (the vendored snapshot has no `.git`).
- Origin-only seeds (75/128) are intentional and sufficient: a hint biases recognition; origin presence alone makes resolve() upgrade to T2 (Plan 03).

## Deviations from Plan
None - plan executed exactly as written. (>=50 origin gate met with 128; the harvester found more origins than the floor, recorded per the deviation protocol.)

## Issues Encountered
None.

## Next Phase Readiness
- Wave 1 (Plans 02/03/04) can run in parallel against this Wave-0 substrate.
- Plan 02's GREEN target is precisely the 50 RED assertions above (denylist extension + `_shapeUrl` path-segment scrub).
- The benign-slug negative case is the guard rail Plan 02 must not break (PRECISE distinctive-prefix set, not a broad separator rule).
- `npm test` will FAIL until Plans 03/04 create seed-resolve-t2 + recipe-learn-pending-affordance (the intended RED gate).

---
*Phase: 42-discovery-seeding-tail-learn*
*Completed: 2026-06-26*

## Self-Check: PASSED

All created files exist; all 4 task commits (84f3440f, 4532a53c, 12865055, 09e23f66) present in git history.
