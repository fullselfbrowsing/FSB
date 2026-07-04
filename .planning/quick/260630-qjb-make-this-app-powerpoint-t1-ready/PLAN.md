---
quick_id: 260630-qjb
slug: make-this-app-powerpoint-t1-ready
status: in_progress
---

# Make This App PowerPoint T1-ready

## Scope

Promote the PowerPoint catalog stem from DOM/discovery-only to explicit T1 accounting:

- PowerPoint read descriptors resolve through a reviewed T1a handler pinned to `https://powerpoint.cloud.microsoft`.
- The handler uses the existing active-tab origin pin and a constrained PowerPoint page-read auth context to call Microsoft Graph read endpoints with a short-lived bearer token.
- PPTX binary parsing reads fail closed until the fetch primitive supports binary bodies.
- PowerPoint write/destructive descriptors are guarded fail-closed until live mutation-body UAT exists.

## Implementation

1. Add a PowerPoint auth-context branch to the bounded page-read primitive.
2. Add `catalog/handlers/powerpoint.js` and sync it to `extension/catalog/handlers/powerpoint.js`.
3. Wire PowerPoint into the head manifest/imports, readiness loader, origin classifier, port-contract verifier, recipe-path guard, coverage resolver, and focused tests.
4. Add guarded write evidence and update readiness/write-evidence invariants.
5. Run focused T1 gates and record results in `SUMMARY.md`.
