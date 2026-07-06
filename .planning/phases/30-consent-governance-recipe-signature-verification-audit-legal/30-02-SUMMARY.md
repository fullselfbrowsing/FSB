---
phase: 30-consent-governance-recipe-signature-verification-audit-legal
plan: 02
subsystem: consent-governance
tags: [consent, audit, governance, credential-replay, chokepoint, default-off, sensitive-downgrade]
requires:
  - "FsbServiceDenylist.isDenied + FsbServiceDenylist.classify (Plan 03; typeof-guarded, degrade-when-absent)"
  - "extension/utils/capability-router.js invoke chokepoint (Phase 29)"
  - "extension/utils/redactForLog.js (shape-only redactor)"
  - "extension/utils/diagnostics-ring-buffer.js + extension/utils/agent-registry.js (clone patterns)"
provides:
  - "FsbConsentPolicyStore: per-origin Off/Ask/Auto + separate elevated mutating opt-in (default-OFF)"
  - "FsbAuditLog: append-only secret-free redacted ring (field-whitelist entry schema; export/clear)"
  - "FsbConsentGate.evaluate: the consent + sensitive + mutation gate at the single invoke chokepoint"
affects:
  - "extension/utils/capability-router.js invoke() now consent-gated for both front doors"
tech-stack:
  added: []
  patterns:
    - "versioned chrome.storage.local envelope (agent-registry clone) for per-origin consent policy"
    - "append-only FIFO ring with in-memory shadow + field-whitelist (diagnostics-ring clone) for audit"
    - "gate-as-wrapper at the single chokepoint preserving the invoke dual-field RECIPE_* return contract"
    - "typeof-guarded global collaborators with explicit degrade-when-absent posture"
key-files:
  created:
    - "extension/utils/consent-policy-store.js"
    - "extension/utils/audit-log.js"
  modified:
    - "extension/utils/capability-router.js"
decisions:
  - "Gate runs UNCONDITIONALLY on every invoke (entry may be null) so the single chokepoint is reached even on a catalog miss; the catalog-miss RECIPE_NOT_FOUND is returned only AFTER the gate allows."
  - "Internal gate degrades to 'allow' when the consent store module is NOT loaded (Phase-29 router unit harness has no store) but fails CLOSED (default-OFF) once the store is present."
  - "Audit error field reads ONLY error.name/error.message by sub-field (not via redactForLog on the whole object) so a token/bearer slipped onto an error object is structurally excluded while the message is still captured."
  - "invoke reads global.FsbConsentGate at call time and the router does NOT clobber an already-injected gate, so an injected spy (chokepoint test) is honored while the gate tests get the router's own gate."
metrics:
  duration: "~22m"
  completed: "2026-06-21"
---

# Phase 30 Plan 02: Consent Policy Store + Audit Ring + Consent Gate Summary

Per-origin default-OFF consent (Off/Ask/Auto + a separate elevated mutating opt-in), an append-only secret-free audit ring, and a consent + sensitive + mutation gate wrapping the single `FsbCapabilityRouter.invoke` chokepoint so both front doors enforce consent immediately after the upstream ownership gate, with a redacted audit entry on every outcome.

## What Was Built

### Task 1 -- `extension/utils/consent-policy-store.js` (NEW)
A versioned `chrome.storage.local` envelope `{ v:1, defaultMode:'off', policies:{ [origin]:{ mode, mutating } } }`, cloning the agent-registry lazy-chrome + `withRegistryLock` promise-chain mutex idiom over `chrome.storage.local` (D-02 -- survives browser restart, not session).
- `getConsentForOrigin(envelope, origin)` is a PURE function defaulting an unknown origin to `{ mode:'off', mutating:false }` (GOV-01).
- Off/Ask/Auto is per-origin ONLY; the envelope carries no global enable key (GOV-02).
- `setOriginMutating(origin, allowed)` is a SEPARATE elevated opt-in that leaves `mode` untouched -- read-Auto != write-Auto (GOV-03/D-04).
- Exports `getConsentForOrigin / readPolicies / setOriginMode / setOriginMutating` (+ `_reset`) on both `globalThis.FsbConsentPolicyStore` and `module.exports`; eval-free (RECIPE_PATH_ALLOWLIST).

### Task 2 -- `extension/utils/audit-log.js` (NEW)
An append-only redacted ring cloning `diagnostics-ring-buffer.js` (in-memory shadow + FIFO trim at `MAX_ENTRIES` 200 + `chrome.storage.local` get/push/trim/set), with the field-whitelist entry schema EXACTLY `{ ts, origin, slug, method, sideEffectClass, consentDecision, outcome, error? }` (D-10).
- `origin` collapses to its origin via `globalThis.redactForLog`; `error` is reduced to name+message read by sub-field so a sibling token/bearer is structurally excluded (D-11). `args/body/headers/cookies` are never referenced in the append path.
- `getEntries({clear})` exports then empties the ring (D-12).
- Exports `append / getEntries` (+ `_reset`, `STORAGE_KEY`, `PAYLOAD_VERSION`, `MAX_ENTRIES`) dual-export; eval-free (RECIPE_PATH_ALLOWLIST).

### Task 3 -- `extension/utils/capability-router.js` (MODIFIED)
Added typeof-guarded `_consentStore()/_auditLog()/_denylist()` accessors, a local `MUTATING_METHODS` set, `_deriveMethod`/`_deriveSideEffectClass`, a best-effort `_audit` append, and `FsbConsentGate.evaluate` implementing the LOCKED decision order, then wrapped `invoke` around it.
- LOCKED gate order: (1) denylist `isDenied` -> `RECIPE_CONSENT_BLOCKED`; (2) default-OFF / mode 'off' (and null origin) -> `RECIPE_CONSENT_REQUIRED`; (3) mode 'ask' -> `RECIPE_CONSENT_REQUIRED` (out-of-band, no modal); (4) SENSITIVE (`classify().sensitive`) AND mode 'auto' -> DOWNGRADE to ask: `RECIPE_CONSENT_REQUIRED` with `consentDecision:'sensitive'`, NO `executeBoundSpec` (GOV-07/D-14); (5) mutating method on non-elevated origin -> `RECIPE_CONSENT_MUTATING_REQUIRED`; (6) allow. Sensitive is enforced BEFORE mutation, so a sensitive Auto origin can never reach a mutation decision or allow without first downgrading.
- The gate runs at the SINGLE invoke chokepoint, reached identically by both front-door ctx shapes (`{origin,tabId}` and `{origin,tabId,source:'autopilot'}`); EVERY outcome (blocked + allowed) appends a redacted audit entry. The gate sits ABOVE `executeBoundSpec` -- the two-point origin-pin, INV-01, INV-04 are untouched.

## How To Verify (automated)

```
node tests/consent-policy-store.test.js        # 24/24
node tests/audit-log.test.js                   # 23/23
node tests/audit-log-no-secret.test.js         # 15/15 (no auth substring survives)
node tests/consent-gate.test.js                # 9/9 (incl. sensitive+Auto downgrade)
node tests/consent-mutation-gate.test.js       # 10/10
node tests/consent-chokepoint.test.js          # 7/7 (one gate, both doors)
node tests/capability-router.test.js           # 27/27 (Phase-29 dispatch unchanged)
node tests/capability-autopilot-parity.test.js # 10/10
node tests/agent-loop-iterator-guard.test.js   # 4/4 (INV-04 untouched)
node tests/service-denylist.test.js            # 17/17 (gate-integration now resolves)
node tests/capability-mcp-surface.test.js      # 19/19 (INV-01)
node tests/capability-head-handlers.test.js    # 54/54 (Phase-29 head)
node scripts/verify-recipe-path-guard.mjs      # exit 0 (both new modules eval-free + allowlisted)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Gate placement moved to run unconditionally (before the catalog-miss early-returns), not strictly "after catalog.resolve(entry)".**
- **Found during:** Task 3 (reconciling the four router-driving tests).
- **Issue:** `tests/consent-chokepoint.test.js` installs NO catalog yet asserts the gate is evaluated exactly once and `invoke` short-circuits with `RECIPE_CONSENT_REQUIRED`. The plan's literal "insert the gate AFTER catalog.resolve and BEFORE switch(entry.tier)" would have returned the pre-existing `catalog-unavailable` `RECIPE_NOT_FOUND` BEFORE the gate ran, so the spy would never be called.
- **Fix:** `invoke` now resolves the catalog into `entry` (tolerating null), runs the gate UNCONDITIONALLY, and only emits the catalog-miss `RECIPE_NOT_FOUND` AFTER the gate allows. This preserves the intent (gate fed by the resolved entry, one chokepoint both doors) while satisfying the no-catalog chokepoint contract. The Phase-29 `capability-router.test.js` (unknown-slug -> `RECIPE_NOT_FOUND`) stays green because the no-store internal gate allows, then the `!entry` branch returns `RECIPE_NOT_FOUND`.
- **Files modified:** extension/utils/capability-router.js
- **Commit:** (Task 3 commit below)

**2. [Rule 2 - Correctness/Security] Audit `error` field reads only `error.name`/`error.message` by sub-field instead of passing the whole error object to `redactForLog`.**
- **Found during:** Task 2.
- **Issue:** The RESEARCH snippet uses `redact(entry.error).message`, but `redactForLog` only returns `.message` for an `instanceof Error`; a plain object error `{name, message, token}` falls into the object branch (no `.message`), which would BLANK the message. Reading the whole object generically risks structurally including sibling fields.
- **Fix:** `_safeError` reads ONLY `error.name` and `error.message` by name and String()-coerces them (composing `"name: message"`), so a token/bearer slipped onto an error object is excluded by construction AND the message is preserved. `tests/audit-log-no-secret.test.js` confirms the seeded `error.token`/`error.bearer` do not survive.
- **Files modified:** extension/utils/audit-log.js
- **Commit:** (Task 2 commit)

## TDD Gate Compliance

The three plan tasks are `tdd="true"`; the Wave-0 RED contracts (`consent-policy-store`, `audit-log`, `audit-log-no-secret`, `consent-gate`, `consent-mutation-gate`, `consent-chokepoint`) were authored in Plan 01 and confirmed RED (exit 1) before implementation, then turned GREEN by the per-task commits below. The RED commits live in Plan 01; the GREEN feat commits are this plan's per-task commits.

## Known Stubs

None. Both new modules are fully wired (consent store -> gate -> audit) and the gate is live at the invoke chokepoint. The pending-consent UI surfacing (the Ask path's control-panel resolution) is explicitly Plan 04's scope per the plan's `<behavior>` ("the pending surfacing is the UI's job in Plan 04") -- the gate already returns the typed `RECIPE_CONSENT_REQUIRED` reason it consumes.

## Self-Check: PASSED
