---
phase: 35-denylist-expansion-import-time-classification-gate-lands-fir
plan: 01
subsystem: security
tags: [denylist, origin-classification, consent-gate, opentabs, service-denylist, tdd]

# Dependency graph
requires:
  - phase: 30 (v0.9.99)
    provides: "FsbServiceDenylist classify()/isDenied()/load() loader + the service-denylist.json envelope (v:1, deniedReason, deniedOrigins, sensitiveOrigins) + the exact-vs-suffix _parsePattern matcher"
provides:
  - "Expanded deniedOrigins roster: brokerage/trading (robinhood, fidelity, carta) + ToS-hostile media/social (netflix, spotify, twitch, steam, youtube-music, tinder, onlyfans), classified denied:true (DENY-01)"
  - "Expanded sensitiveOrigins roster: payments (stripe, coinbase, twilio), budgeting (ynab), IG/FB/TikTok/X, and the messaging set (whatsapp/telegram/slack/discord/teams x3), classified {sensitive:true, denied:false} (DENY-02)"
  - "Exact-host origin patterns (digital.fidelity.com, dashboard.stripe.com, music.youtube.com, etc.) that match only OpenTabs' own urlPattern host scope, never the whole domain"
  - "Per-origin classify() roster assertions in tests/service-denylist.test.js, including api.stripe.com/www.youtube.com over-broadening discrimination proofs"
affects: [phase-35-plan-02-classification-gate, phase-35-plan-03-posture-b-regate, phase-36-codegen-pipeline, breadth-batches-37-39]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-only denylist expansion: the service-denylist.js loader is untouched; classification roster grows purely via service-denylist.json arrays the loader already reads"
    - "Exact-host vs subdomain-suffix pattern selection per OpenTabs urlPattern scope (anti-over-broadening: music.youtube.com NOT *.youtube.com)"
    - "RED-first roster assertions: the per-origin test block was authored to fail against the un-expanded JSON, then turned GREEN by the data commit"

key-files:
  created: []
  modified:
    - "extension/config/service-denylist.json"
    - "tests/service-denylist.test.js"

key-decisions:
  - "instagram/facebook/tiktok/x classified sensitive-not-denied (reads under Auto; writes mutating-gated by Plan 35-03 posture B) per CONTEXT — fully-denied reserved for brokerage + ToS-hostile media set"
  - "Used the EXACT-host form for fidelity (digital.fidelity.com), stripe (dashboard.stripe.com NOT api.stripe.com), carta, spotify, steam, youtube-music, twilio, ynab + several messaging origins, matching OpenTabs' own urlPatterns rather than a *.domain wildcard (T-35-03 anti-DoS)"
  - "Included the messaging set (whatsapp/telegram/slack/discord/teams x3) in sensitiveOrigins per RESEARCH A2 — their writes are mutating-gated under posture B, reads run under Auto"
  - "teams contributes three exact origins (teams.live.com, teams.microsoft.com, teams.cloud.microsoft) per its multi-origin urlPatterns"

patterns-established:
  - "Anti-over-broadening discrimination assertions: prove exact-host forms did not collapse to whole-domain wildcards by asserting a sibling origin (api.stripe.com sensitive:false, www.youtube.com denied:false) stays unclassified"

requirements-completed: [DENY-01, DENY-02]

# Metrics
duration: 2min
completed: 2026-06-24
---

# Phase 35 Plan 01: Denylist Expansion (DENY-01/02) Summary

**Expanded service-denylist.json to fully classify the named DENY-01/02 roster — 10 categorically-prohibited origins as denied and 13 allowed-but-sensitive origins as sensitive-not-denied — using OpenTabs' exact-host urlPattern forms, with per-origin classify() assertions proving no over-broadening.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-24T06:55:23Z
- **Completed:** 2026-06-24T06:57:34Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- **DENY-01:** Every categorically-prohibited roster origin (robinhood, fidelity, carta, netflix, spotify, twitch, steam, youtube-music, tinder, onlyfans) now classifies `denied:true` — the hard floor under the shipped opt-out Auto default.
- **DENY-02:** Every allowed-but-sensitive roster origin (stripe, coinbase, twilio, ynab, instagram, facebook, tiktok, x, + the whatsapp/telegram/slack/discord/teams messaging set) classifies `{sensitive:true, denied:false}` — reads run under Auto, writes will be mutating-gated by Plan 35-03 posture B.
- **No over-broadening:** Exact-host forms (digital.fidelity.com, dashboard.stripe.com, music.youtube.com, ...) match only their exact host; discrimination assertions prove `api.stripe.com` stays non-sensitive and `www.youtube.com` stays non-denied (T-35-03 self-inflicted-DoS mitigated).
- **Loader untouched + seed preserved:** This was a data-only change; `service-denylist.js` has no diff, and the existing FSB seed (chase/bofa/wellsfargo/irs.gov + mail/outlook/*.gov) is intact.
- **Suite GREEN:** `node tests/service-denylist.test.js` exits 0 with `PASS=50 FAIL=0`, including the pre-existing GOV-08 BLOCKED-checked-first path.

## Task Commits

Each task was committed atomically (TDD RED→GREEN; Task 3 is the GREEN verification half of the Task 1 RED and added no new files):

1. **Task 1: Per-origin roster assertions (RED first)** - `542e9320` (test)
2. **Task 2: Expand deniedOrigins + sensitiveOrigins (DENY-01/02)** - `9d7e6d61` (feat) — turns the Task 1 RED GREEN
3. **Task 3: Confirm GREEN + no over-broadening** - verification of `9d7e6d61` (no separate commit; no new files, no data change required — the GREEN was achieved by the Task 2 data exactly as the plan specified)

**Plan metadata:** see final docs commit.

## Files Created/Modified
- `extension/config/service-denylist.json` - Appended 10 denied roster patterns + 15 sensitive roster patterns (8 core + 7 messaging) to the existing seed arrays; extended `_comment` to note the v1.0.0 roster expansion and the exact-host rationale. `v:1` and `deniedReason` unchanged.
- `tests/service-denylist.test.js` - Added a Phase-35 assertion block (inside the existing async IIFE, after the GOV-08 checks): per-origin `classify().denied===true` over the denied roster, per-origin `{sensitive:true, denied:false}` over the sensitive roster, three exact-host discrimination assertions, negative controls (www.fidelity.com non-denied, github.com clean), and a chase-seed regression guard. The pre-existing GOV-08 assertions were extended, not replaced.

## Decisions Made
- **instagram/facebook/tiktok/x → sensitiveOrigins ONLY** (not deniedOrigins): per CONTEXT, fully-denied is reserved for the brokerage + ToS-hostile-media set; IG/FB/TikTok/X reads run under Auto and their writes are mutating-gated by posture B (Plan 35-03).
- **Exact-host forms for single-host roster apps**: fidelity (`digital.fidelity.com`), stripe (`dashboard.stripe.com`, NOT `api.stripe.com`), carta, spotify, steam, youtube-music (`music.youtube.com`, NOT `*.youtube.com` which would catch youtube proper), twilio, ynab, whatsapp, telegram, discord, teams — matching OpenTabs' own `urlPatterns` scope per RESEARCH Q2.
- **Messaging set included in sensitiveOrigins** per RESEARCH A2 (whatsapp/telegram/slack/discord/teams), with teams contributing three exact origins for its multi-origin urlPatterns.

## Deviations from Plan

None - plan executed exactly as written. The exact-host discrimination assertions for `api.stripe.com` and `www.youtube.com` were already passing at RED time (correctly — nothing over-broadened before the data landed) and remained passing after the data landed, confirming the exact-host forms did not collapse to whole-domain wildcards.

## Issues Encountered
None. The TDD cycle proceeded cleanly: baseline GREEN (21 pre-existing assertions) → RED after Task 1 (24 roster FAILs naming the un-classified origins, existing assertions still PASS) → GREEN after Task 2 (50 PASS / 0 FAIL).

## Known Stubs
None. Every roster entry is a concrete classification value verified by a per-origin assertion; no placeholders, empty arrays, or TODO-gated paths were introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The full DENY-01/02 roster is classified and consumed by `classify()`, which is what Plan 35-02's fail-closed import-time gate and Plan 35-03's posture-B sensitive-origin write re-gate both read.
- `service-denylist.js` loader is unchanged, so the data is immediately live at SW boot via the existing `load()` path.
- No blockers. The loader/matcher contract is verified LOCKED; exact-host vs suffix forms are correct per the discrimination proofs.

## Self-Check: PASSED

- FOUND: `extension/config/service-denylist.json`
- FOUND: `tests/service-denylist.test.js`
- FOUND: `.planning/phases/35-.../35-01-SUMMARY.md`
- FOUND commit `542e9320` (Task 1, test RED)
- FOUND commit `9d7e6d61` (Task 2, feat GREEN)
- `node tests/service-denylist.test.js` → `PASS=50 FAIL=0`, exit 0

---
*Phase: 35-denylist-expansion-import-time-classification-gate-lands-fir*
*Completed: 2026-06-24*
