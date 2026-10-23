---
phase: 65-codex-adapter
plan: "06"
subsystem: delegation-authority-provider-ui
tags: [codex, auth-projection, billing, consent, preflight, providers-ui]

requires:
  - phase: 65-codex-adapter
    plan: "05"
    provides: Complete Codex adapter, byte-safe auth detector, compatibility profile, and accepted identity
provides:
  - Exact schema-v2 three-row browser-safe compatibility and auth projection
  - Fresh Codex auth-to-billing identity bound through preflight, consent, daemon start, and controller acceptance
  - Exact four-state Codex Account/Auth and Billing presentation in the existing third Providers row
affects: [65-07, 65-08, delegation-feed, phase65-runner, human-uat]

tech-stack:
  added: []
  patterns:
    - Keep the public provider table byte-stable while storing non-public accepted-identity policy in closure-owned metadata
    - Treat auth and compatibility as separate UI facts while invalidating both through the same stale safe-evidence projection
    - Compare the consent-bound accepted identity at every pre-start authority boundary before controller or task stdin

key-files:
  created: []
  modified:
    - mcp/src/agent-providers/compatibility.ts
    - mcp/src/agent-providers/serve-delegation.ts
    - extension/utils/mcp-agent-providers.js
    - extension/utils/delegation-providers.js
    - extension/utils/delegation-preflight.js
    - extension/background.js
    - extension/ui/providers-panel.js
    - extension/ui/options.js
    - tests/mcp-agent-providers-storage.test.js
    - tests/mcp-bridge-background-dispatch.test.js
    - tests/providers-panel-ui.test.js

key-decisions:
  - "Bump only the browser-safe compatibility/auth wire envelope to schema v2; retain compatibility-matrix schema v1 and accept only the exact historical two-row v1 snapshot as read-only stale migration input."
  - "Publish authState as exactly chatgpt, api_key, unauthenticated, or unknown; derive subscription/api billing only inside the shared canonical accepted-identity policy."
  - "Render Codex auth directly from the safe projected enum, independently of compatibility; stale projection itself replaces auth with unknown and removes accepted identity."
  - "Keep control_panel.html and all seven API-provider storage/request contracts unchanged."

patterns-established:
  - "Safe-wire roster: daemon and browser agree on the exact ordered Claude Code, OpenCode, Codex projection with no version, path, credential, billing, profile, or identity fields."
  - "TOCTOU closure: provider-free browser commands consume one exact five-field identity and reject any auth/billing/profile mismatch before run state or task bytes."

requirements-completed: [MULTI-04, MULTI-05, MULTI-06]

duration: 40m
completed: 2026-07-22
---

# Phase 65 Plan 06: Safe Codex Authority and Providers UI Summary

**Codex is now the stable third selectable agent: an exact safe auth projection drives canonical billing, fail-closed consent/start authority, and the existing shared Providers details without new markup or API-provider changes.**

## Performance

- **Duration:** 40m
- **Started:** 2026-07-22T13:26:59Z
- **Completed:** 2026-07-22T14:06:37Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Promoted the safe browser wire contract to schema v2 with the exact ordered Claude Code, OpenCode, and Codex rows and the four-state auth enum, while leaving the compatibility matrix at schema v1.
- Added exact legacy-v1 migration, stale/failure projection, hostile-record handling, and accepted-identity derivation so only fresh supported or newer-degraded evidence can authorize a start.
- Bound the immutable Codex auth/billing identity through provider-free preflight, consent, trust/replay handling, daemon start, immediate echo comparison, controller persistence, and run context.
- Activated the existing third Providers row with exact ChatGPT, API key, unauthenticated, and unknown Account/Auth and Billing copy; no markup, Codex-only renderer, version logic, profile row, or dollar estimate was added.
- Preserved row/focus order, recommendation, checked/dirty state, refresh behavior, provider kind/id, all seven API values, storage writes, links, themes, and accessibility contracts.

## Task Commits

Each implementation task was committed atomically:

1. **Promote safe Codex evidence through canonical preflight, consent, and background authority** — `3334e8f5` (feat)
2. **Drive the existing third Providers row from exact Codex auth and billing evidence** — `8038983e` (feat)

One test-only follow-up aligned pre-promotion broad-suite expectations after the full unsectioned regression run:

- **Align broad Codex promotion coverage** — `48cbd4a6` (test)

## Files Created/Modified

- `mcp/src/agent-providers/compatibility.ts` and `serve-delegation.ts` — Exact schema-v2 safe roster and daemon-owned auth reduction.
- `extension/utils/mcp-agent-providers.js` — Strict v2 replacement, exact v1 migration, stale projection, and fresh accepted identity.
- `extension/utils/delegation-providers.js` — Canonical Codex policy with private profile/auth-to-billing metadata and unchanged public metadata shape.
- `extension/utils/delegation-preflight.js` and `extension/background.js` — Fresh identity comparison across preflight, consent, trust, transport, daemon echo, and controller acceptance.
- `extension/ui/providers-panel.js` and `extension/ui/options.js` — Exact four-state shared Account/Auth and Billing mapping from the selected safe row.
- The eight modified test files — Safe-wire, storage, routing, consent, background authority, hostile input, stale projection, exact copy, DOM invariance, and refresh coverage.

## Decisions Made

- Kept compatibility and auth independent in the presentation mapper. The trusted safe projection owns staleness: it changes auth to `unknown`, strips accepted identity, and degrades runnable compatibility to `evidence_stale` before the UI maps either fact.
- Mapped `chatgpt` to `subscription` and `api_key` to `api`; `unauthenticated` and `unknown` remain non-runnable. The unauthenticated Billing value is the approved exact copy: **Sign in to Codex first.**
- Preserved the provider-free browser request boundary. Saved background settings select the provider; caller messages cannot supply provider, auth, billing, identity, or trust authority.
- Accepted only own-data, bounded daemon auth values. Detector failures, accessors, prototype-bearing records, unknown values, roster mismatches, stale evidence, and malformed snapshots reduce to `unknown` without leaking raw data.

## Verification

- Exact Task 01 preservation-wrapper command — **PASS**, including the TypeScript build, source/compiled native-host checks, adapter compatibility, bridge topology, storage, routing, consent, and Codex start-authority sections.
- Exact Task 02 command — **PASS**; `providers-panel-logic` and the complete provider-panel static/runtime UI suite passed.
- Unsectioned `delegation-routing` and `delegation-consent` suites — **PASS**.
- Unsectioned `mcp-bridge-background-dispatch` suite — **355 passed, 0 failed**.
- `agent-provider-forbidden-flags` — **PASS**.
- `control_panel.html` remained unchanged; the existing ten provider radios, stable third Codex row, and seven API providers were preserved.
- No live Codex/account/browser/model call, login mutation, credential read, or external task was performed.
- The inherited 402 planning deletions and four unrelated dirty artifacts stayed unstaged. Preservation hashes remained:
  - `mcp/build/index.js`: `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`
  - `showcase/angular/public/llms-full.txt`: `664347e0e6a30c276bdbdfea8bb2bfdf1242bd7d61fb6493de870fccd4ddd38e`
  - `showcase/angular/public/llms.txt`: `c69ed23d415f8f9f097ec386e789372a3a8a71b011b4d4420bf09ee949587e76`
  - `showcase/angular/public/sitemap.xml`: `826aa8f8b2bc828c423572a6b9697d0666a94a830b7aebbdf1812501e88c3bea`

## Deviations from Plan

### Broad regression alignment

- The exact focused commands passed, but the additional unsectioned background suite still contained six pre-promotion expectations: Codex was treated as dormant/unsupported, stale auth was omitted, newer runnable compatibility remained runnable after refresh failure, and Codex trust clearing was rejected.
- These were test-only expectations contradicted by the approved Plan 06 contract. They were updated in `48cbd4a6`, then the complete 355-assertion suite passed. No production behavior changed in the follow-up.

**Total deviations:** one test-only broad regression follow-up; no scope or authority expansion.

## Issues Encountered

- The UI copy review caught that unauthenticated Billing must say **Sign in to Codex first.**, not reuse the API-key billing sentence. Production constants and both UI test layers were corrected before the Task 02 commit.
- Automatic compatibility expiry originally rerendered only the compatibility fields. It now rerenders the shared selected-agent details so a safe projected auth change also updates Account/Auth and Billing without adding a Codex-specific renderer.

## User Setup Required

None - no account, login, browser, credential, daemon, or external service action is required for this implementation boundary.

## Next Phase Readiness

- Plan 65-07 can render durable Codex runs from the accepted identity and normalized event feed while keeping USD null and omitting profile data.
- Plan 65-08 can close source/security/runner validation and preserve the three genuine scenarios as pending human UAT.
- Genuine ChatGPT/API-key/unauthenticated account-state evidence and real Codex-to-browser execution remain deliberately deferred to milestone-end human UAT.

## Self-Check: PASSED

- The exact two task commands and broader authority/UI regressions pass.
- Only the declared production/test paths and this summary were committed; inherited deletions and unrelated artifacts remain untouched.
- The safe wire, canonical identity, stale projection, provider-free request, exact UI copy, and unchanged-markup/API-provider contracts all hold.

---
*Phase: 65-codex-adapter*
*Completed: 2026-07-22*
