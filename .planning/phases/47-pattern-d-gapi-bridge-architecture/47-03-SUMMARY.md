# 47-03 Summary: Gate + Verification

Added `scripts/verify-pattern-d-gapi-gate.mjs` and `tests/pattern-d-gapi-gate.test.js`.

The gate:

- Counts 337 Pattern-D candidates and 133 GAPI candidates.
- Requires bridge candidates to stay `discovery-pending`.
- Rejects handler/recipe proof on bridge candidates before an approved bridge exists.
- Runs separate-origin negative controls for Linear, Datadog, and Jira-style APIs.

The gate is wired into `npm run validate:extension`.
