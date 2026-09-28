---
phase: 42-discovery-seeding-tail-learn
plan: 05
status: human_needed
created: 2026-06-26
---

# Phase 42 Human UAT: Live First-Authenticated-Visit Capture per Seeded Origin

This is the sole live slice of Phase 42 (Discovery Seeding + Tail Learn, DSEED-01/02). It was
NOT executed in the autonomous, no-live-browser run (the autonomous run has no live auth) and
must NOT be treated as passed until a human records the observed result. It is recorded here as
`human_needed` live-UAT, matching the Phase 29/40/41 posture: the live half is documented debt,
NOT a fabricated pass, and it does NOT block the headless CI gate (every mechanism + security
property below is fully proven headless).

## Why this is human_needed (not CI-provable)

Everything the milestone SHIPS is proven HEADLESS with fixtures:

- **Seed -> T2 resolve** (`tests/seed-resolve-t2.test.js`): a seeded would-be-T3 descriptor
  resolves T2 (learn-pending) with NO recipe; an unseeded origin stays T3; the LEARN-04
  learned-first check still outranks. GREEN.
- **Promote-after-replay (clean + fail)** (`tests/learned-promote-after-replay.test.js`, CASE
  A/B/C): a clean replay promotes a T2; a failed replay DISCARDS. GREEN — and a hint NEVER
  executes (the seed only biases the synthesizer's recognition; `tests/recipe-synthesizer.test.js`
  proves the recipe vocab is byte-identical with vs without a seed and synthesize is pure).
- **The 119-app redactor no-leak** (`tests/network-capture-redaction.test.js`,
  `tests/audit-log-no-secret.test.js`, the diagnostic ring): a hostile request carrying every
  app's auth carrier as a header NAME, a header VALUE, a query param, AND a token-shaped URL
  PATH SEGMENT (incl the vendored Microsoft Graph `u!` share-id) leaves ZERO auth/path-token
  substring across all 3 sinks; a benign hyphenated slug survives literal. GREEN.
- **The affordance** (`tests/recipe-learn-pending-affordance.test.js`): RECIPE_LEARN_PENDING
  surfaces the actionable "open the site to learn it" message with the INV-03 byte-stable code.
  GREEN.
- **The no-manifest-change keystone** (`tests/discovery-seeds-load.test.js` + `git diff --quiet
  -- extension/manifest.json`): host_permissions byte-unchanged from `["<all_urls>"]`. GREEN.

The ONE class of property CI cannot prove is the irreducibly-live one: that on a REAL
authenticated tab for a seeded origin, the consent-gated discovery session actually captures +
replays + promotes a T2 recipe from the user's OWN traffic, that the promoted T2 then OUTRANKS
the descriptor-T3 on the next visit, and that the three sinks (learned-recipe envelope, audit
ring, diagnostic ring) carry ZERO auth substring for that real capture. This requires real
credentials in a live authenticated tab + debugger-attach on a real tab, which cannot ship to
CI (forbidden, GOV-06).

Crucially: a hint NEVER executes, so NOTHING learns or leaks without the consent-gated real
capture. The seed is metadata (recognition bias); a seeded origin becomes invocable ONLY after a
real captured + replayed call promotes a T2 (consent-gated, fail -> DISCARD). This is therefore
**carried-forward, user-gated UAT debt**, consistent with the prior live-UAT posture, and is
**NON-blocking for CI** (the headless gates pass).

## Setup

1. Load `extension/` as an unpacked Chrome extension (drive these via the FSB MCP browser tools
   per the project browser-automation policy).
2. For each seeded origin: sign in to that service's web app in a normal `https://` tab and keep
   that tab ACTIVE (the same-origin pin requires the active-tab origin to equal the seeded
   origin; the consent gate runs BEFORE any debugger attach).
3. Run the consent-gated discovery session on that tab (the existing Phase-31 capture ->
   synthesize -> interpret -> execute -> promote path; fail -> DISCARD). A seeded origin resolves
   T2-no-recipe first, surfacing the RECIPE_LEARN_PENDING affordance; the live capture is what
   produces the real T2.
4. NEVER record or paste a real token/CSRF/cookie value into this file — record ONLY the
   token/CSRF LOCATION/shape (logged-in vs logged-out, header vs body vs cookie vs path),
   redacted (GOV-06).

## Required Scenarios (live first-authenticated-visit capture)

| ID | Seeded origin | Sensitivity | Procedure | Expected | Status |
|----|---------------|-------------|-----------|----------|--------|
| UAT-42-01 | `https://linear.app` | non-sensitive | On an authenticated Linear tab, run the consent-gated discovery session while you perform a read (e.g. list issues). Confirm a captured `POST /graphql` call replays cleanly and PROMOTES a T2 recipe; on the next visit confirm `resolve()` returns the learned T2 (it OUTRANKS the descriptor-T3). Inspect the learned-recipe envelope, the audit ring, and the diagnostic ring and confirm ZERO auth substring (the `linear-client-id` / `organization` carriers + any token shape are absent — redacted to shape, never the literal value). Record redacted observation + date + Chrome version + commit. | A real captured+replayed call promotes a T2 that outranks the descriptor; all 3 sinks carry zero auth substring. | human_needed (a hint never executes; nothing learns/leaks without this consent-gated capture) |
| UAT-42-02 | `https://app.todoist.com` | non-sensitive | On an authenticated Todoist tab, run the consent-gated discovery session during a read. Confirm a captured same-origin call replays cleanly and promotes a T2 that then outranks the descriptor-T3 on the next visit; confirm the 3 sinks carry zero auth substring (the session/CSRF carriers redacted to shape). Record redacted observation + date + Chrome version + commit. | A real captured+replayed call promotes a T2 that outranks the descriptor; all 3 sinks carry zero auth substring. | human_needed (a hint never executes; nothing learns/leaks without this consent-gated capture) |
| UAT-42-03 | `https://dashboard.stripe.com` | SENSITIVE | On an authenticated Stripe Dashboard tab, run the discovery session. Because Stripe is a SENSITIVE origin, confirm the consent gate requires the `confirmedSensitive` step (RECIPE_CONSENT_SENSITIVE_UNCONFIRMED until confirmed) BEFORE any capture. After confirming, confirm a captured `/v1/*` call replays cleanly and promotes a T2 that outranks the descriptor; confirm the 3 sinks carry ZERO auth substring (the `session_api_key` / `x-stripe-csrf-token` carriers + the `Bearer` value redacted to shape — NEVER the literal key). Record redacted observation + date + Chrome version + commit. | The sensitive consent step gates the capture; a confirmed real captured+replayed call promotes a T2 that outranks the descriptor; all 3 sinks carry zero auth substring. | human_needed (sensitive: requires confirmedSensitive; a hint never executes) |

## Recording Results

When executed, replace each `human_needed` status with `pass`, `fail`, or `partial`, and add the
date, Chrome version, extension commit, and a short observed-outcome note (the observed
captured method/path, whether the T2 promoted and outranked the descriptor on the next visit,
and the auth-carrier placement — redacted to shape, never the literal token/CSRF/cookie). Before
recording, re-verify the app's web behavior at run time, since these frontends change. Do NOT
mark a seeded origin "learned" until a real captured+replayed call promotes its T2 AND the 3
sinks are confirmed zero-auth-substring for that capture. The headless CI gate does NOT depend on
this step (a hint never executes; the seed->T2 resolve + promote-after-replay + the redactor
no-leak are all fixture-proven).
