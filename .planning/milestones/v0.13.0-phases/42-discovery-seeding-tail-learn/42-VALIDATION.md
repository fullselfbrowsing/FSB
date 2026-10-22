---
phase: 42
slug: discovery-seeding-tail-learn
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 42 — Validation Strategy

> Seed the tail (`discovery-seeds.json` + endpoint hints) into the Phase-31 network-capture path so a
> seeded origin learns a T2 on first authenticated visit (consent-gated, promote-after-replay; a hint
> never executes), and extend + verify the structural redactor against the 119-app field universe (no
> auth substring leaks). Source of truth: 42-CONTEXT.md. Owns DSEED-01/02.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node scripts (`PASS=/FAIL=`, `process.exit(1)`); the capture/redactor/catalog/store load in Node; the harvester under node/tsx |
| **Quick run command** | `node tests/<name>.test.js` / `node scripts/harvest-discovery-seeds.mjs` |
| **Full suite command** | `npm test` (CI gate) |
| **Build** | `node scripts/harvest-discovery-seeds.mjs` → `node scripts/package-extension.mjs` → `npm run validate:extension` |
| **Estimated runtime** | per-suite < ~5s; full `npm test` several minutes |

---

## Sampling Rate

- **After the harvester + seeds:** `node scripts/harvest-discovery-seeds.mjs` + a seed-load test (network-capture reads it, no-throw, no manifest change)
- **After the resolve seed→T2 branch:** `node tests/learned-t2-outranking.test.js` + a seed→T2 resolve test
- **After the redactor extension:** `node tests/network-capture-redaction.test.js` + `node tests/audit-log-no-secret.test.js` (the 119-app no-leak)
- **After each wave:** `npm run validate:extension`
- **Before `/gsd-verify-work`:** `npm test` exits 0
- **Max feedback latency:** ~5 s per suite

---

## Per-Task Verification Map

| Requirement / SC | Correct Behavior | Test/Gate | Status |
|------------------|------------------|-----------|--------|
| SC1 — OpenTabs origins (+ endpoint hints) seed the Phase-31 capture via `discovery-seeds.json`; network-capture reads the hints (NO manifest/permission change); a seeded origin learns a T2 via promote-after-replay (consent-gated) — a hint only biases recognition, never executes, until a real captured + replayed call promotes it | `scripts/harvest-discovery-seeds.mjs` emits `extension/config/discovery-seeds.json` (origin → hints) from the vendored `*-api.ts`; the network-capture loader reads it no-throw; `manifest.json` host_permissions UNCHANGED; a fixture proves a hint raises synthesizer confidence but NEVER triggers a fetch (execution still gated on a real captured+replayed call; fail→DISCARD) | a NEW `tests/discovery-seeds-load.test.js` (seeds load, no-throw, manifest diff empty) + `tests/learned-promote-after-replay.test.js` (CASE A/B/C: clean replay promotes, failed replay discards — the hint never executes) | ⬜ pending |
| SC2 — a descriptor whose origin has a seed resolves to T2 (learn-pending); a learned T2 recipe outranks the descriptor-T3 on the next visit; `RECIPE_LEARN_PENDING` surfaces as an actionable "open the site to learn it" affordance, not a silent no-op | `resolve(slug, origin)` returns `tier:'T2'` for a seeded-origin descriptor that would otherwise be T3 (and stays T3 for an unseeded origin); the existing LEARN-04 makes a learned T2 outrank the descriptor; the router T2-no-learned-recipe branch returns `RECIPE_LEARN_PENDING` with additive `actionable:true`/`message` fields AND the byte-stable `code===errorCode===error` | a NEW `tests/seed-resolve-t2.test.js` (seeded→T2, unseeded→T3) + `node tests/learned-t2-outranking.test.js` (learned T2 outranks) + a `RECIPE_LEARN_PENDING`-affordance assert (actionable fields + INV-03 dual-field unchanged) | ⬜ pending |
| SC3 — the capture-time structural redactor is extended + verified against the 119-app field universe so NO auth substring (stripe `session_api_key`, instagram `csrftoken`, linear `linear-client-id`, token-shape patterns) is persisted into any learned-recipe envelope, audit entry, or diagnostic ring at scale — capture reads structure only, never a header value/body/query | the `AUTH_CARRIER_DENYLIST` (+ header-name token-shape patterns) covers the full 119-app auth-carrier universe; `redactRequest`→`{method,path,origin,headerNames}` / `redactResponse`→`{status,mimeType}` (structure-only, names never values); AND token-shaped URL PATH SEGMENTS (JWT `eyJ…\.` / stripe `sk_live_…` / github `gho_…` / slack `xox…-` / aws `AKIA…` / google `ya29.…` / the vendored Microsoft Graph `u!` share-id) are scrubbed to a `:tok` placeholder in `_shapeUrl` BEFORE the path is persisted — closing the SC3 sink-#1 leak where a path-segment token would otherwise survive `u.pathname` verbatim + the synthesizer's keep-literal-on-separator rule into the learned-recipe `endpoint`/`descriptor.description` — while a BENIGN hyphenated slug (`/orgs/my-long-organization-name`, org/repo names) survives LITERAL (a PRECISE distinctive-prefix set, NOT a broad separator rule, so no false-positive breaks a legitimate recipe template on replay); so a hostile request carrying every app's auth carrier as a header NAME, a header VALUE, a query param, AND a URL PATH SEGMENT + a token-shaped value leaves ZERO auth/path-token substring across ALL 3 sinks (learned-recipe envelope, audit entry, diagnostic ring) | `node tests/network-capture-redaction.test.js` (the master no-leak, EXTENDED to the 119-app universe + the path-token-in-segment hostile case + a benign-slug negative case) + `node tests/audit-log-no-secret.test.js` (the ring) + a diagnostic-ring no-leak assert | ⬜ pending |
| (invariants) — no manifest change; consent gate + capture core unchanged; INV-03 byte-stable; INV-01 catalog shape | host_permissions diff empty; `_runGate` + the capture→promote core unchanged; `RECIPE_LEARN_PENDING` code byte-stable; the resolve seed-branch is additive | `git diff` on manifest.json + the capture core + full `npm test` + `npm run validate:extension` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/harvest-discovery-seeds.mjs` + `extension/config/discovery-seeds.json` — the seed
      generation from the vendored `*-api.ts` (provenance-stamped, SHA-pinned).
- [ ] `tests/discovery-seeds-load.test.js` — the seed loader reads the file no-throw + the manifest
      host_permissions are byte-unchanged (the no-new-permission keystone).
- [ ] `tests/network-capture-redaction.test.js` EXTENDED to the 119-app auth-carrier field universe
      AND the token-shaped URL PATH SEGMENT vector (incl the vendored `u!` share-id), plus a benign-slug
      negative case (the master no-leak must stay non-vacuous — a hostile request with every carrier in
      every position leaves zero substring across all 3 sinks, while a benign slug survives literal).
      This is the DSEED-02 security keystone and lands first.

*Reuses the Phase-31 capture/redactor/promote/learned-store harnesses; only the harvester + seeds +
the resolve seed-branch + the redactor-universe extension (denylist + path-segment scrub) + the
affordance are new.*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Live first-authenticated-visit capture per seeded origin (a real logged-in tab where the discovery session captures + replays + promotes a T2 recipe) | Requires a logged-in browser session + debugger-attach on a real tab (no live auth in the autonomous run); the seed→T2 resolve + promote-after-replay (clean/fail) + the redactor are ALL proven headless with fixtures, and a hint NEVER executes — so nothing learns/leaks without the consent-gated real capture | For a seeded origin: open an authenticated tab, run the discovery session (consent-gated), confirm a captured+replayed call promotes a T2 recipe that then outranks the descriptor-T3, and that the learned envelope/audit/diagnostic sinks carry zero auth substring. **Carried-forward user-gated debt** (the milestone does NOT block on it; headless gates pass). |

*All MECHANISM + SECURITY behaviors (seed load, seed→T2 resolve, promote-after-replay logic, the 119-app no-leak across all sinks incl path-segment tokens, the affordance, the no-manifest-change keystone) are fully automated above; only the live capture is human_needed.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency (live capture is the sole, documented human_needed item)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the harvester+seeds + the loader/no-manifest test + the redactor-119 no-leak extension (incl path-segment tokens + benign-slug negative)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
