# Phase 49 Live Write UAT Template

Use this template before changing any guarded write from fail-closed to active. Do not record literal cookie, token, CSRF, bearer, workspace, user, or account identifiers.

## Metadata

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Operator | redacted or initials |
| Chrome version |  |
| Extension commit |  |
| Loaded extension path |  |
| Service |  |
| Capability slug |  |
| Origin |  |

## Preconditions

- The app tab is authenticated.
- The active tab origin equals the handler origin.
- The operation uses a disposable or reversible target.
- The user explicitly approves the live mutation.

## Captured Request Shape

| Field | Value |
|-------|-------|
| HTTP method |  |
| First-party path |  |
| Query shape | keys only |
| Body shape | keys and value types only |
| CSRF/token location | header/body/cookie/page state; no value |
| Cookie role | HttpOnly cookie rides same-origin / not used |
| Idempotency/retry behavior |  |

## Handler Flip Checklist

- [ ] Handler uses `ctx.executeBoundSpec` only.
- [ ] `spec.origin` is the first-party app origin.
- [ ] No direct `fetch`, `XMLHttpRequest`, `chrome.cookies`, or `chrome.webRequest`.
- [ ] No secret-bearing console/log output.
- [ ] Params schema rejects extra write fields.
- [ ] Audit log redacts request body and headers.
- [ ] Consent gate behavior is tested for standard, sensitive, and denied origins.
- [ ] Logged-out or drifted response returns a typed fallback.

## Loaded-Extension Smoke

| Step | Observed Result |
|------|-----------------|
| `search_capabilities` result |  |
| `invoke_capability` result |  |
| Created/updated object id | redacted or disposable id only |
| Verification request | method/path only |
| Audit redaction check | pass/fail |

## Outcome

- Result: pass / fail / partial
- If pass, update `catalog/write-activation-evidence.json` with the redacted method/path/body/auth/verification shape.
- If fail or partial, keep the handler guarded fail-closed.
