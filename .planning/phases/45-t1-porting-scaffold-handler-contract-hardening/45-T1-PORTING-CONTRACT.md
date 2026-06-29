# Phase 45 T1 Porting Contract

This is the required workflow for future T1 ports in the v1.1.0 milestone. It is a tooling and review contract, not an extension runtime API.

## Scaffold Command

Generate a checklist before writing a new handler or recipe:

```bash
node scripts/scaffold-t1-port.mjs --slug <capability.slug>
node scripts/scaffold-t1-port.mjs --slug <capability.slug> --type same-origin-read
node scripts/scaffold-t1-port.mjs --slug <capability.slug> --type same-origin-write
node scripts/scaffold-t1-port.mjs --slug <capability.slug> --type guarded-write
node scripts/scaffold-t1-port.mjs --slug <capability.slug> --type separate-origin-candidate
```

Default output is stdout. Use `--out .context/t1-port-<slug>.md` for local working notes.

## Required Proofs

Every new executable T1 port needs evidence for:

- First-party origin pin: bound specs target the app runtime origin and origin mismatch fails before execution.
- `executeBoundSpec` only: no `chrome.scripting`, `chrome.tabs`, direct `fetch`, XHR, cookie APIs, or dynamic code in the handler.
- Closed params: schemas use `additionalProperties:false`.
- Logged-out/body-shape guard: app auth-error, redirect, or wrong-envelope bodies cannot become successful results.
- No secret logging: tokens/cookies/CSRF values stay inside the bound spec and do not enter logs, audits, or diagnostics.
- Consent compatibility: denylisted origins remain blocked; sensitive origins remain flagged/audited under current invoke behavior.
- Router parity: the exact existing descriptor slug resolves through `capability-catalog.resolve()` and both MCP/autopilot front doors use the router.
- Byte-stable fallback: fallback returns `code === errorCode === error === "RECIPE_DOM_FALLBACK_PENDING"` where applicable.
- MCP surface unchanged: no app-specific tool is added.
- Wall 1 unchanged: no OpenTabs runtime/plugin code ships.

## Write Rule

Writes and destructive operations have exactly two safe states:

- `guarded-fail-closed`: handler returns the byte-stable DOM fallback and never calls `executeBoundSpec`.
- `active`: live UAT records the method/path/body shape and token/CSRF carrier location with secrets redacted, plus audit redaction proof.

An active write without recorded UAT evidence fails `scripts/verify-t1-port-contract.mjs`.

## Separate-Origin Rule

Separate-origin candidates are non-executable until Phase 47 proves Pattern-D/GAPI or rejects the route. The checklist must record the decision, and a negative-control test must prove the candidate cannot bypass the origin wall.

## Verification

Run these for each new port:

```bash
node tests/capability-head-handlers.test.js
node tests/head-handler-upgrade.test.js
node tests/guarded-write-failclosed.test.js
node tests/t1-port-contract.test.js
node tests/t1-port-contract-gate.test.js
node scripts/verify-t1-port-contract.mjs
npm run validate:extension
```

The new verifier is wired into `validate:extension`.
