---
phase: 40
slug: depth-1-top-read-hand-ports
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 40 — Validation Strategy

> Hand-port ~8–12 top READ ops as T1a heads via the shipped `github.js` contract (first-party origin,
> `executeBoundSpec`-only, tokens never logged), each UPGRADING its existing `opentabs__<app>__<op>`
> breadth descriptor `dom`→`T1a`. Source of truth: 40-CONTEXT.md. Owns DEPTH-01.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node scripts (`PASS=/FAIL=`, `process.exit(1)`); the catalog/router/fetch load in Node via the existing test harnesses |
| **Quick run command** | `node tests/<name>.test.js` |
| **Full suite command** | `npm test` (CI gate) |
| **Build** | `node scripts/package-extension.mjs` (copies `catalog/handlers/*` → `extension/catalog/handlers/`) → `npm run validate:extension` |
| **Estimated runtime** | per-suite < ~5s; full `npm test` several minutes |

---

## Sampling Rate

- **After each handler module (or extend):** `node tests/capability-head-handlers.test.js` + `node tests/head-handler-cap.test.js` + the dom→T1a upgrade assertion
- **After each wave:** `npm run validate:extension` (recipe-path-guard + classification-gate + crosscheck + no-dead-entry + no-dup-stem + no-orphan) + `node tests/capability-router.test.js` (INV-02 parity + origin-pin)
- **Before `/gsd-verify-work`:** `npm test` exits 0
- **Max feedback latency:** ~5 s per suite

---

## Per-Task Verification Map

| Requirement / SC | Correct Behavior | Test/Gate | Status |
|------------------|------------------|-----------|--------|
| SC1 — ~8–12 READ heads ship as T1a via the `github.js` contract; each UPGRADES its existing opentabs slug `dom`→`T1a`; new modules in `HEAD_HANDLER_MODULES` + `background.js importScripts` | Each new/extended handler self-registers the EXACT `opentabs__<app>__<op>` slug → `resolve(slug, origin)` returns `tier:'T1a'` with the descriptor attached (was `T3`/dom); 8–12 such slugs upgraded; modules loaded | `node tests/capability-head-handlers.test.js` (new per-app sections: tier='T1a', sideEffectClass='read', `handle` calls `executeBoundSpec` once) + a NEW `tests/head-handler-upgrade.test.js` (asserts each ported slug resolves T1a not T3, descriptor preserved, slug-exact) + `node tests/head-handler-cap.test.js` (count + expected globals updated) | ⬜ pending |
| SC2 — `executeBoundSpec`-ONLY; first-party origin (no separate `api.`-subdomain); scraped tokens never logged | Each handler source contains NO `api.<app>` host + NO `chrome.(scripting|tabs)`; `handle` calls `ctx.executeBoundSpec` exactly once; the origin-pin rejects a mismatched origin (`RECIPE_ORIGIN_MISMATCH`, no executeScript); no scraped token reaches a `console.*`/log line | `node tests/capability-head-handlers.test.js` (source-scan asserts per app) + `node tests/capability-fetch.test.js` (origin-pin → dual-field `RECIPE_ORIGIN_MISMATCH` before executeScript) + a no-token-logging assertion (token only in the bound spec, never logged) | ⬜ pending |
| SC3 — both front doors hit the SAME `FsbCapabilityRouter.invoke` (INV-02); router-parity + head-handler tests green; head cap (~15–30) enforced on `HEAD_HANDLER_MODULES` | T1a dispatch routes to `handler.handle(args, ctx)` identically from MCP + autopilot; `HEAD_HANDLER_MODULES` count ≤ 30; INV-01 (no new MCP tool, frozen registry hash) | `node tests/capability-router.test.js` (CAT-01/02 tier dispatch + INV-02 parity + origin-pin) + `node tests/head-handler-cap.test.js` (≤30) + `npm run validate:extension` + full `npm test` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/head-handler-upgrade.test.js` — the dom→T1a upgrade assertion harness (load the catalog,
      seed the heads, assert each ported `opentabs__<app>__<op>` slug now `resolve()`s `T1a` with its
      descriptor preserved and the slug byte-exact — a wrong/duplicate slug FAILS). This is the
      correctness keystone and must exist before any handler lands.
- [ ] `tests/head-handler-cap.test.js` updated to the new expected module count + globals while
      KEEPING `CAP = 30` (a module over cap FAILS; the count assertion tracks the real set).
- [ ] no-token-logging assertion extended to the new token-scrape handlers (a scraped token on a log
      line FAILS) — mirror the slack xoxc pattern.

*Reuses the shipped head-handler + router + fetch test harnesses; only new per-app sections + the upgrade harness are added.*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Live endpoint-correctness (the exact first-party internal API path returns the expected READ shape on a real authenticated tab) | Requires a logged-in browser session per app (no live auth in the autonomous run); the handlers ship **fail-closed** (wrong origin → `RECIPE_ORIGIN_MISMATCH`; wrong path / logged-out 200 → HEAL → `RECIPE_DOM_FALLBACK_PENDING`) so security holds regardless — only live correctness is unproven | For each ported app: open an authenticated tab on the first-party origin, invoke the read via `search_capabilities`→`invoke_capability`, confirm a real (non-logged-out) payload + that the `expectedShape`/extract guard rejects a logged-out body. **Carried-forward user-gated debt** (consistent with prior phases). |

*All SECURITY + MECHANISM behaviors (registration, dom→T1a upgrade, origin-pin, no-token-log, router-parity, head-cap) are fully automated above; only live endpoint correctness is human_needed.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency (live correctness is the sole, documented human_needed item)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the upgrade-assertion harness + cap update + no-token-log extension
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
