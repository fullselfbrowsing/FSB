---
phase: 41
slug: depth-2-remaining-hand-ports-guarded-writes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 41 — Validation Strategy

> Guarded WRITE hand-ports (fail-closed to `RECIPE_DOM_FALLBACK_PENDING` until live-captured) + the
> DENY-04 mutating opt-in on sensitive origins + a per-app CORS / first-party-origin verification gate
> (same-origin → port, separate-origin → demote). Source of truth: 41-CONTEXT.md. Owns DEPTH-02.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node scripts (`PASS=/FAIL=`, `process.exit(1)`); catalog/router/fetch + the gate scripts load in Node |
| **Quick run command** | `node tests/<name>.test.js` / `node scripts/verify-origin-classification.mjs` |
| **Full suite command** | `npm test` (CI gate) |
| **Build** | `node scripts/package-extension.mjs` → `npm run validate:extension` (now incl the CORS-gate) |
| **Estimated runtime** | per-suite < ~5s; full `npm test` several minutes |

---

## Sampling Rate

- **After each write handler (or extend):** the guarded-write test (no executeBoundSpec call) + the dom→T1a upgrade assertion + `node tests/head-handler-cap.test.js`
- **After the CORS-gate lands:** `node scripts/verify-origin-classification.mjs` (every head same-origin; a synthetic separate-origin head FAILS) + `npm run validate:extension`
- **After each wave:** `node tests/capability-router.test.js` (gate-before-dispatch + INV-02) + `node tests/consent-mutation-gate.test.js` (mutating opt-in)
- **Before `/gsd-verify-work`:** `npm test` exits 0
- **Max feedback latency:** ~5 s per suite

---

## Per-Task Verification Map

| Requirement / SC | Correct Behavior | Test/Gate | Status |
|------------------|------------------|-----------|--------|
| SC1 — remaining heads ship; every WRITE fails closed to `RECIPE_DOM_FALLBACK_PENDING` (github.issues.create pattern) until a live-captured body is confirmed; each `[ASSUMED-ENDPOINT]` carries a recorded `human_needed` live-UAT | Each guarded write `handle()` returns the dual-field `RECIPE_DOM_FALLBACK_PENDING` and NEVER calls `ctx.executeBoundSpec` (no mutation fires — a guarded write never stamps success for an unverified mutation); each write slug UPGRADES its `opentabs__<app>__<op>` write descriptor dom→T1a; `[ASSUMED-ENDPOINT]` markers + a `41-HUMAN-UAT.md` row exist | a NEW `tests/guarded-write-failclosed.test.js` (handler returns RECIPE_DOM_FALLBACK_PENDING + the executeBoundSpec stub recorder stays EMPTY) + `tests/head-handler-upgrade.test.js` extended (write slugs resolve T1a, descriptor preserved) + a `[ASSUMED]`/UAT-manifest presence assert | ⬜ pending |
| SC2 — a WRITE to a sensitive origin honors the DENY-04 per-origin mutating opt-in (posture B); reads stay fully-open under Auto | Through the LIVE committed roster: a T1a write on a sensitive origin WITHOUT the per-origin mutating flag → dual-field `RECIPE_CONSENT_MUTATING_REQUIRED` (the gate runs BEFORE dispatch); `setOriginMutating(origin,true)` → gate allows; a READ on the same origin → allow under Auto | `node tests/consent-mutation-gate.test.js` + a Phase-41 case (T1a-write-on-sensitive-origin) in `tests/sensitive-write-import-gate.test.js` (dual-field code===errorCode===error, INV-03) | ⬜ pending |
| SC3 — a per-app CORS / first-party-origin gate precedes any separate-API-origin (Pattern-D) port: same-origin may port; separate / per-org-subdomain origins are demoted to T3-DOM (or blocked) | `scripts/verify-origin-classification.mjs` reads every `HEAD_HANDLER_MODULES` head's origin + the vendored `<app>-api.ts` base-URL → asserts SAME-ORIGIN for every shipped head; a synthetic separate-origin head (e.g. linear→client-api.linear.app) FAILS the gate (`CORS_SEPARATE_ORIGIN`); linear/datadog/jira confirmed NOT shipped as heads (stay T3-DOM) | `node scripts/verify-origin-classification.mjs` (+ a negative-control fixture) wired into `npm run validate:extension` | ⬜ pending |
| SC4 — head cap holds; INV-03 typed reasons byte-stable; depth tests green | `HEAD_HANDLER_MODULES` ≤ 30 (writes add slugs to existing modules, NO new module); the new T1a-write `RECIPE_DOM_FALLBACK_PENDING` has byte-identical `code===errorCode===error`; INV-01 frozen registry hash; INV-02 router parity | `node tests/head-handler-cap.test.js` + the INV-03 byte-equality assert (extended) + `node tests/capability-autopilot-parity.test.js` + full `npm test` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/guarded-write-failclosed.test.js` — the fail-closed proof harness: each guarded write
      handler returns `RECIPE_DOM_FALLBACK_PENDING` AND the `ctx.executeBoundSpec` recorder stays EMPTY
      (no mutation fires). A handler that calls executeBoundSpec for an `[ASSUMED]` write FAILS. This is
      the SC1 security keystone and must exist before any write handler lands.
- [ ] `scripts/verify-origin-classification.mjs` — the CORS-gate classifier + a negative-control
      fixture (a synthetic separate-origin head MUST fail) — must exist + be wired into validate:extension
      before the phase closes.
- [ ] the INV-03 byte-equality assert extended to the new T1a-write fail-closed reason.

*Reuses the shipped consent gate + the Phase-40 head-handler/upgrade harnesses; only the guarded-write
harness + the CORS-gate + the byte-equality extension are new.*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Live-captured mutation body for each `[ASSUMED-ENDPOINT]` guarded write (the exact write endpoint + payload that succeeds on a real authenticated tab) | Requires a logged-in session + an actual mutation per app; the writes ship FAIL-CLOSED (return `RECIPE_DOM_FALLBACK_PENDING`, never fire a mutation) so NOTHING is mutated without verification — only activation awaits the capture | For each guarded write: on an authenticated tab, capture the real mutation request (method/path/body) via the network-capture path; record the observed shape (redacted) + date + Chrome version + commit in `41-HUMAN-UAT.md`; a future flip activates the handler. **Carried-forward user-gated debt** (the milestone does NOT block on it; headless gates pass). |

*All SECURITY + MECHANISM behaviors (fail-closed write, mutating-opt-in gating, the CORS-gate, INV-03, head-cap) are fully automated above; only the live mutation-body capture is human_needed — and the writes are inert until then.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency (live mutation-capture is the sole, documented human_needed item; the writes are fail-closed until then)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the fail-closed harness + the CORS-gate + the INV-03 extension
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
