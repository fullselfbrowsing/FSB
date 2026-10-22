---
phase: 41-depth-2-remaining-hand-ports-guarded-writes
plan: 05
status: recorded-debt
created: 2026-06-26
---

# Phase 41 Deferral: Pattern-D Cross-Origin Execution (the Wall-2 hole) → a future story

This records the conservative, Wall-2-preserving decision Phase 41 (DEPTH-02) made about the
SEPARATE-origin apps. It is **recorded debt, NOT a gap** — the CORS-gate ENFORCES the demote,
so the decision is a checked build invariant, not a hope.

## (1) Pattern-D cross-origin EXECUTION is DEFERRED

Several high-value apps classify **separate-origin**: their real API lives on a different
subdomain / per-org wildcard than the web app the user authenticates on. Source-verified
evidence (the vendored, pinned-SHA `<app>-api.ts`):

| App | Web app origin | API origin (separate) | Evidence |
|-----|----------------|------------------------|----------|
| linear | `https://linear.app` | `https://client-api.linear.app/graphql` | `vendor/opentabs-snapshot/plugins/linear/src/linear-api.ts:18` (the CORS comment at :12-14 documents `access-control-allow-origin: https://linear.app`) |
| datadog | `https://app.datadoghq.com` | `https://api.*.datadoghq.com` (per-org subdomain) | datadog plugin api module (per-org wildcard host) |
| jira | `https://*.atlassian.net` | `https://*.atlassian.net` per-org cloud-id REST | atlassian plugin (per-org `*.atlassian.net` host) |
| supabase / cloud-consoles | per-project / per-region hosts | per-project API hosts | each plugin's api module (per-project/per-region host) |

Porting any of these as a T1a head would require a **CORS-verified cross-origin credentialed
fetch** — which punches a controlled hole in the **NON-NEGOTIABLE Wall-2 origin-pin**
(`executeBoundSpec` rejects `spec.origin !== activeTabOrigin` with `RECIPE_ORIGIN_MISMATCH`
before any side effect). That is a deliberate Wall-2-EXTENSION decision that:
- (a) needs **live-capture** to confirm the cross-origin session cookie actually rides the
  sibling-API origin (the CORS `access-control-allow-credentials` + cookie `SameSite` behavior
  is not safe to assume), and
- (b) the **user should bless** (extending Wall 2 is a security-posture change, not a routine
  port).

Neither (a) nor (b) is satisfiable in an autonomous, no-live-auth run. So Pattern-D
cross-origin execution — the actual linear/datadog/jira/supabase/cloud-console ports + the
Wall-2 origin-pin extension for CORS-verified sibling-API origins — is **DEFERRED**.

## (2) The conservative, SC3-compliant choice: DEMOTE to T3-DOM

SC3 explicitly allows it: a separate-origin app "MAY port … **or be demoted to T2/T3**." The
walls-intact, SC3-compliant choice is to **DEMOTE all separate-origin apps to T3-DOM** this
milestone. They are NOT lost: they remain **discoverable + DOM-invocable breadth descriptors**
(their `opentabs__<app>__*.json` descriptors still ship `backing:'dom'`, still resolve T3, and
the DOM-fallback floor serves them). They simply do not get a credentialed same-origin head.

## (3) The CORS-gate (`scripts/verify-origin-classification.mjs`) ENFORCES the demote

The demote is not a manual promise — it is a **checked build invariant**:
- The gate iterates every `HEAD_HANDLER_MODULES` head and asserts SAME-ORIGIN with its vendored
  API base-URL. A **separate-origin head FAILS THE BUILD** (`CORS_SEPARATE_ORIGIN`), wired into
  `validate:extension`. So an unverified separate-origin port can **NEVER silently ship** — it
  reds the gate first.
- The **negative-control fixture** (a synthetic linear head `https://linear.app` vs
  `https://client-api.linear.app/graphql`) proves the failure path actually fires — the gate is
  not a no-op.
- It is a **SHIPPING GATE, NOT an executor**: it enables no cross-origin call. The runtime
  origin-pin (`RECIPE_ORIGIN_MISMATCH`) remains the separate EXECUTION gate. Both intact;
  neither extended for cross-origin this milestone.

## (4) The deferred follow-on

Pattern-D cross-origin execution → a **future user-blessed story** (e.g. **v2 CLOUD-01** /
a **linear-CORS spike**): a controlled, CORS-verified, live-capture-confirmed Wall-2 extension
for sibling-API origins. Until then, the separate-origin apps serve as T3-DOM breadth.

## Cross-references

- The Wall-2 integrity decision + the Out-of-scope / Deferred Ideas sections:
  `.planning/phases/41-depth-2-remaining-hand-ports-guarded-writes/41-CONTEXT.md`.
- The carried-forward live-capture debt for the 7 guarded writes (a separate, orthogonal
  human-needed item): `41-HUMAN-UAT.md`.
- The enforcing gate: `scripts/verify-origin-classification.mjs` (run in `validate:extension`).
