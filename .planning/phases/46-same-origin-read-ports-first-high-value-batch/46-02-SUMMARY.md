# 46-02 Summary: Catalog Wiring + Origin Gates

Wired the new handlers into:

- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-t1-port-contract.mjs`

The origin classifier now treats a vendored relative API base as same-origin only by joining it to the reviewed handler fallback origin, then running the normal strict origin check. This keeps the general same-origin gate intact.
