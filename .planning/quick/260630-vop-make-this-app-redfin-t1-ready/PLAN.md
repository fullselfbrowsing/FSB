---
quick_id: 260630-vop
slug: make-this-app-redfin-t1-ready
status: complete
created: 2026-07-01T03:48:51.336Z
---

# Make Redfin T1-ready

## Scope

Promote Redfin's safe same-origin GET API surface from catalog-tail DOM backing to reviewed T1a handler backing.

## Plan

1. Inspect the vendored Redfin OpenTabs plugin and adjacent T1a app ports.
2. Add a Redfin handler that uses only same-origin bound GET specs, passes the `RF_AUTH` cookie through `x-rf-secure`, strips Redfin's JSON prefix, validates response envelopes, and returns typed fail-closed fallback errors for auth/shape problems.
3. Wire the handler into the extension background loader, capability catalog head manifest, readiness/port-contract scripts, and path/eval allowlists.
4. Add focused tests for Redfin handler success/fail-closed behavior, resolver seeding, and T1 readiness.
5. Run focused verification gates and record the summary.
