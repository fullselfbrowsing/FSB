---
quick: 260630-mjs
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - catalog/handlers/mongodb.js
  - extension/catalog/handlers/mongodb.js
  - extension/background.js
  - extension/utils/capability-catalog.js
  - extension/utils/capability-search.js
  - scripts/verify-recipe-path-guard.mjs
  - scripts/verify-origin-classification.mjs
  - scripts/report-t1-readiness.mjs
  - scripts/verify-t1-port-contract.mjs
  - catalog/write-activation-evidence.json
  - tests/capability-head-handlers.test.js
  - tests/head-handler-upgrade.test.js
  - tests/guarded-write-failclosed.test.js
  - tests/head-handler-cap.test.js
  - tests/verify-origin-classification.test.js
  - tests/t1-terminal-states.test.js
  - tests/t1-readiness-report.test.js
requirements:
  - QT-260630-mjs
user_setup: []

must_haves:
  truths:
    - "MongoDB Atlas read descriptors resolve as T1a handler-backed capabilities on https://cloud.mongodb.com."
    - "MongoDB Atlas write/destructive descriptors resolve as guarded fail-closed T1a rows and never call ctx.executeBoundSpec."
    - "Search/readiness surfaces mark MongoDB read slugs as t1-ready and mutation slugs as t1-guarded-fail-closed."
    - "The origin-classification gate verifies FsbHandlerMongodb against the vendored mongodb-atlas first-party base, not a guessed plugin stem."
    - "The head cap/identity gate preserves the existing dirty head set and adds FsbHandlerMongodb without removing unrelated handlers."
  artifacts:
    - path: "catalog/handlers/mongodb.js"
      provides: "Canonical MongoDB Atlas T1a handler module"
      contains: "FsbHandlerMongodb"
    - path: "extension/catalog/handlers/mongodb.js"
      provides: "Extension-root copy for unpacked/dev loads"
      contains: "FsbHandlerMongodb"
    - path: "extension/utils/capability-catalog.js"
      provides: "HEAD_HANDLER_MODULES entry for FsbHandlerMongodb"
      contains: "FsbHandlerMongodb"
    - path: "extension/utils/capability-search.js"
      provides: "T1_READY_SLUGS + T1_GUARDED_FAIL_CLOSED_SLUGS MongoDB status overrides"
      contains: "mongodb.list_clusters"
    - path: "catalog/write-activation-evidence.json"
      provides: "Guarded evidence records for MongoDB mutation rows"
      contains: "mongodb.create_database_user"
  key_links:
    - from: "extension/background.js"
      to: "catalog/handlers/mongodb.js"
      via: "importScripts('catalog/handlers/mongodb.js') after capability-catalog.js"
      pattern: "catalog/handlers/mongodb\\.js"
    - from: "catalog/handlers/mongodb.js"
      to: "extension/utils/capability-catalog.js"
      via: "FsbCapabilityCatalog.registerHandler for each mongodb.* slug"
      pattern: "registerHandler\\('mongodb\\."
    - from: "scripts/report-t1-readiness.mjs"
      to: "extension/catalog/handlers/mongodb.js"
      via: "HANDLER_MODULES includes mongodb.js so readiness resolves handler proof"
      pattern: "'mongodb\\.js'"
---

<objective>
Make MongoDB Atlas T1-ready by adding one app-specific bundled head for the existing
`mongodb.*` OpenTabs descriptors.

Purpose: promote the safe same-origin Atlas reads to direct T1a execution while keeping
all mutation-capable rows inert until live mutation-body evidence exists.

Output: `FsbHandlerMongodb` handler module, service-worker/catalog/search/readiness
registration, guarded-write evidence records, and focused tests for handler behavior,
exact slug upgrade, origin classification, readiness status, and fail-closed writes.
</objective>

<execution_context>
@/Users/lakshman/.codex/get-shit-done/workflows/execute-plan.md
@/Users/lakshman/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@tests/head-handler-upgrade.test.js
@tests/guarded-write-failclosed.test.js
@tests/capability-head-handlers.test.js
@tests/head-handler-cap.test.js
@tests/t1-terminal-states.test.js
@extension/utils/capability-catalog.js
@extension/utils/capability-search.js
@extension/background.js
@scripts/verify-recipe-path-guard.mjs
@scripts/verify-origin-classification.mjs
@tests/verify-origin-classification.test.js
@scripts/report-t1-readiness.mjs
@scripts/verify-t1-port-contract.mjs
@catalog/write-activation-evidence.json
@catalog/descriptors/opentabs__mongodb__*.json
@vendor/opentabs-snapshot/plugins/mongodb-atlas/src/atlas-api.ts
@vendor/opentabs-snapshot/plugins/mongodb-atlas/src/tools/*.ts
@catalog/handlers/terraform.js
@catalog/handlers/cloudflare.js

<interfaces>
MongoDB Atlas descriptor slugs:
- Read: `mongodb.get_billing_plan`, `mongodb.get_cluster`, `mongodb.get_current_user`,
  `mongodb.get_deployment_status`, `mongodb.get_organization`, `mongodb.get_project`,
  `mongodb.get_user_security`, `mongodb.list_alert_configs`, `mongodb.list_alerts`,
  `mongodb.list_clusters`, `mongodb.list_database_users`, `mongodb.list_ip_access_list`,
  `mongodb.list_network_peering`, `mongodb.list_organization_members`,
  `mongodb.list_organization_projects`, `mongodb.list_organization_teams`.
- Guarded write/destructive: `mongodb.add_ip_access_entry`,
  `mongodb.create_database_user`, `mongodb.delete_database_user`,
  `mongodb.delete_ip_access_entry`.

Vendored Atlas API facts:
- Plugin dir: `vendor/opentabs-snapshot/plugins/mongodb-atlas`, while descriptor app
  stem is `mongodb`.
- First-party origin: `https://cloud.mongodb.com`.
- API calls are same-origin paths on cloud.mongodb.com:
  `/orgs/{orgId}`, `/orgs/{orgId}/users`, `/orgs/{orgId}/groups`,
  `/orgs/{orgId}/teams`, `/billing/plan/{orgId}`, `/nds/{groupId}`,
  `/nds/clusters/{groupId}`, `/nds/clusters/{groupId}/{clusterName}`,
  `/nds/{groupId}/users`, `/nds/{groupId}/ipWhitelist`,
  `/activity/alertConfigs/{groupId}`, `/user/shared/alerts/project/{groupId}`,
  `/nds/{groupId}/peers`, `/automation/deploymentStatus/{groupId}`,
  `/nds/{groupId}/userSecurity`.
- Atlas context/auth sources in the page bootstrap are `PARAMS.csrfToken`,
  `PARAMS.appUser`, `PARAMS.currentGroup.id`, and
  `PARAMS.currentOrganization.id`.

Current head-set fact:
- `extension/utils/capability-catalog.js` currently declares 27 head globals in this
  dirty worktree, including `FsbHandlerTumblr`.
- Add `FsbHandlerMongodb` on top of that set; do not remove or roll back unrelated
  handler rows. `tests/head-handler-cap.test.js` should expect 28 after this task.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add MongoDB Atlas handler and focused behavior tests</name>
  <files>catalog/handlers/mongodb.js, extension/catalog/handlers/mongodb.js, tests/capability-head-handlers.test.js</files>
  <behavior>
    - Test 1: every read slug exports `{ tier:'T1a', origin:'https://cloud.mongodb.com', sideEffectClass:'read', handle:function }`.
    - Test 2: reads use only ctx.executeBoundSpec with `origin:'https://cloud.mongodb.com'`, `authStrategy:'same-origin-cookie'`, and same-origin `https://cloud.mongodb.com/...` URLs.
    - Test 3: bootstrap/context extraction reads same-origin HTML/JSON fixture data for `PARAMS.appUser`, `PARAMS.currentGroup.id`, and `PARAMS.currentOrganization.id`; missing required group/org context returns `RECIPE_DOM_FALLBACK_PENDING` before any Atlas API call.
    - Test 4: guarded write/destructive slugs return byte-stable `RECIPE_DOM_FALLBACK_PENDING` with `fellBackToDom:true` and call count 0.
    - Test 5: handler source contains no `chrome.scripting`, `chrome.tabs`, direct `fetch`, `XMLHttpRequest`, `api.mongodb.com`, `cloud.mongodb.com/api/atlas`, `Authorization`, `Bearer`, `localStorage`, or `sessionStorage`.
  </behavior>
  <action>
Create `catalog/handlers/mongodb.js` as a dual-export IIFE matching the local handler
pattern in `terraform.js` and `cloudflare.js`; copy the same file to
`extension/catalog/handlers/mongodb.js` for unpacked/dev loads.

The handler must expose `global.FsbHandlerMongodb` and `module.exports = handlers`, and
self-register each slug with `FsbCapabilityCatalog.registerHandler` when available.
Use closed JSON schemas copied from the existing descriptors for parameters.

Implement the 16 read slugs with safe same-origin specs:
- `mongodb.get_current_user`: may return sanitized bootstrap user data without an API
  call if the bootstrap fixture has the user; otherwise fail closed. Do not expose
  cookies, CSRF values, or raw PARAMS.
- Org-scoped reads use org id from bootstrap:
  `get_organization -> /orgs/{orgId}`,
  `list_organization_members -> /orgs/{orgId}/users`,
  `list_organization_projects -> /orgs/{orgId}/groups`,
  `list_organization_teams -> /orgs/{orgId}/teams`,
  `get_billing_plan -> /billing/plan/{orgId}`.
- Project-scoped reads use group id from bootstrap:
  `get_project -> /nds/{groupId}`,
  `list_clusters -> /nds/clusters/{groupId}`,
  `get_cluster -> /nds/clusters/{groupId}/{cluster_name}`,
  `list_database_users -> /nds/{groupId}/users`,
  `list_ip_access_list -> /nds/{groupId}/ipWhitelist`,
  `list_alerts -> /user/shared/alerts/project/{groupId}`,
  `list_alert_configs -> /activity/alertConfigs/{groupId}`,
  `list_network_peering -> /nds/{groupId}/peers`,
  `get_deployment_status -> /automation/deploymentStatus/{groupId}`,
  `get_user_security -> /nds/{groupId}/userSecurity`.

Use a same-origin bootstrap probe to retrieve the active page HTML/data when a read
needs org/group context. Extract only shape-safe values (`csrfToken` presence, app user
id/email/name, current org id, current group id). Do not persist or return CSRF tokens.
Guard Atlas JSON responses: success must contain the expected object/array shape; Atlas
error/login/empty bodies return `RECIPE_DOM_FALLBACK_PENDING` with a MongoDB-specific
reason. Every API read must be a GET unless it is explicitly a guarded mutation row.

Register the four mutation descriptors with inert handlers only:
`mongodb.add_ip_access_entry` (`write`), `mongodb.create_database_user` (`write`),
`mongodb.delete_database_user` (`destructive`), and
`mongodb.delete_ip_access_entry` (`destructive`). Each returns the typed fallback and
does not reference ctx.executeBoundSpec in its handle body.
  </action>
  <verify>
    <automated>node tests/capability-head-handlers.test.js</automated>
  </verify>
  <done>
`catalog/handlers/mongodb.js` and `extension/catalog/handlers/mongodb.js` exist,
export `FsbHandlerMongodb`, pass source-safety assertions, execute the 16 read slugs
through same-origin bound specs, and keep all four mutation rows fail-closed.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Register MongoDB across T1 runtime and readiness surfaces</name>
  <files>extension/background.js, extension/utils/capability-catalog.js, extension/utils/capability-search.js, scripts/verify-recipe-path-guard.mjs, scripts/verify-origin-classification.mjs, scripts/report-t1-readiness.mjs, scripts/verify-t1-port-contract.mjs, catalog/write-activation-evidence.json, tests/head-handler-cap.test.js, tests/verify-origin-classification.test.js, tests/t1-terminal-states.test.js, tests/t1-readiness-report.test.js</files>
  <behavior>
    - Test 1: service worker imports `catalog/handlers/mongodb.js` after capability-catalog and before `seedHeadHandlers()`.
    - Test 2: `HEAD_HANDLER_MODULES` includes `{ global:'FsbHandlerMongodb', service:'cloud.mongodb.com', origin:'https://cloud.mongodb.com' }`.
    - Test 3: head identity tests include `FsbHandlerMongodb` and preserve the existing dirty head identities; current exact count becomes 28.
    - Test 4: origin-classification maps `FsbHandlerMongodb` to vendored app `mongodb-atlas` and verifies `https://cloud.mongodb.com` as same-origin.
    - Test 5: readiness/search/reporting lists mark 16 read slugs as t1-ready and 4 mutation slugs as t1-guarded-fail-closed.
  </behavior>
  <action>
Wire the handler into every current T1 surface.

Runtime:
- Add `try { importScripts('catalog/handlers/mongodb.js'); } catch ...` in
  `extension/background.js` beside the other handler imports.
- Add `FsbHandlerMongodb` to `HEAD_HANDLER_MODULES` in `extension/utils/capability-catalog.js`.
- Add `catalog/handlers/mongodb.js` to `RECIPE_PATH_ALLOWLIST` in
  `scripts/verify-recipe-path-guard.mjs`.

Search/readiness:
- Add all 16 read slugs to `T1_READY_SLUGS` in `extension/utils/capability-search.js`.
- Add all four mutation slugs to `T1_GUARDED_FAIL_CLOSED_SLUGS` in
  `extension/utils/capability-search.js`.
- Add the same four guarded slugs to `GUARDED_FAIL_CLOSED_SLUGS` in
  `scripts/report-t1-readiness.mjs`.
- Add `mongodb.js` to `HANDLER_MODULES` in `scripts/report-t1-readiness.mjs`.
- Add `mongodb: 'mongodb.js'` to `HANDLER_BY_APP` in `scripts/verify-t1-port-contract.mjs`.
- Add guarded evidence records to `catalog/write-activation-evidence.json` for the
  four mutation slugs. Use status `guarded-fail-closed`, failClosedReason values:
  `unverified-mongodb-add-ip-access-entry-mutation`,
  `unverified-mongodb-create-database-user-mutation`,
  `unverified-mongodb-delete-database-user-mutation`, and
  `unverified-mongodb-delete-ip-access-entry-mutation`; templateRef should match the
  existing live-UAT template path; requiredEvidence should include method, path,
  bodyShape, csrfLocation, auditRedactionProof, and loadedExtensionSmoke.

Origin/head gates:
- Add `FsbHandlerMongodb: { app: 'mongodb-atlas', fallbackBaseUrl: 'https://cloud.mongodb.com' }`
  to `HEAD_APP_MAP` in `scripts/verify-origin-classification.mjs`.
- Update `tests/verify-origin-classification.test.js` to expect and assert the
  MongoDB head. Include a real end-to-end assertion that its apiBaseUrl resolves to
  `https://cloud.mongodb.com` (or a same-origin Atlas path joined to that origin) and
  classifies sameOrigin.
- Update `tests/head-handler-cap.test.js` by appending `FsbHandlerMongodb` to
  `EXPECTED_HEAD_GLOBALS` and bumping the exact current count from 27 to 28. Do not
  remove `FsbHandlerTumblr` or any other existing dirty-worktree head.
- Update `tests/t1-terminal-states.test.js` and `tests/t1-readiness-report.test.js`
  so MongoDB read/guarded statuses are explicitly checked alongside the existing app
  status tripwires.
  </action>
  <verify>
    <automated>node tests/head-handler-cap.test.js &amp;&amp; node tests/verify-origin-classification.test.js &amp;&amp; node scripts/verify-origin-classification.mjs &amp;&amp; node scripts/verify-recipe-path-guard.mjs &amp;&amp; node tests/t1-terminal-states.test.js &amp;&amp; node tests/t1-readiness-report.test.js &amp;&amp; node scripts/verify-t1-readiness-gate.mjs &amp;&amp; node scripts/verify-t1-port-contract.mjs &amp;&amp; node scripts/verify-write-activation-evidence.mjs</automated>
  </verify>
  <done>
MongoDB is loaded in the service worker, seeded by the head manifest, recognized by
origin classification, reported by search/readiness as T1-ready or guarded
fail-closed as appropriate, and covered by the write evidence gate.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend exact-upgrade and guarded-write gates for MongoDB</name>
  <files>tests/head-handler-upgrade.test.js, tests/guarded-write-failclosed.test.js, tests/capability-head-handlers.test.js</files>
  <behavior>
    - Test 1: all 20 MongoDB descriptor slugs resolve T1a with exact descriptor.slug and origin `https://cloud.mongodb.com`.
    - Test 2: the 16 read rows expose handlers without write/destructive sideEffectClass.
    - Test 3: the four mutation rows carry write/destructive classes in upgrade coverage.
    - Test 4: the four mutation rows pass the global fail-closed recorder test with zero executeBoundSpec calls.
  </behavior>
  <action>
Extend `tests/head-handler-upgrade.test.js` by adding all 20 MongoDB slugs to the
`PORTED` array with `handlerFile: 'mongodb.js'` and origin
`https://cloud.mongodb.com`. Mark only the four mutation slugs with
`expectWrite: true`.

Extend `tests/guarded-write-failclosed.test.js` by adding the four mutation rows:
`mongodb.add_ip_access_entry`, `mongodb.create_database_user`,
`mongodb.delete_database_user`, and `mongodb.delete_ip_access_entry`, all with origin
`https://cloud.mongodb.com` and `handlerFile: 'mongodb.js'`.

Keep `tests/capability-head-handlers.test.js` focused: its MongoDB section should prove
representative read paths for org, project, cluster-by-name, list database users, and
bootstrap current user; prove failure when org/group context is missing; prove bad Atlas
envelope rejection; and prove both write and destructive guarded examples are inert.
  </action>
  <verify>
    <automated>node tests/capability-head-handlers.test.js &amp;&amp; node tests/head-handler-upgrade.test.js &amp;&amp; node tests/guarded-write-failclosed.test.js &amp;&amp; npm run validate:extension</automated>
  </verify>
  <done>
The exact slug-upgrade gate, fail-closed guarded-write gate, focused handler test, and
extension validation all include MongoDB Atlas and pass without deleting unrelated
dirty-worktree handler coverage.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Active Atlas tab -> handler | Handler reads bootstrap state from a logged-in page and must not expose auth carriers. |
| Handler -> executeBoundSpec | Bound specs perform credentialed same-origin fetches; origin and method must be constrained. |
| Search/readiness -> user | Status labels must not overstate guarded mutation rows as executable. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QT-260630-mjs-01 | Spoofing | `catalog/handlers/mongodb.js` context extraction | mitigate | Verify active/bootstrap origin is `https://cloud.mongodb.com`; fail closed on missing org/group context. |
| T-QT-260630-mjs-02 | Tampering | MongoDB mutation slugs | mitigate | Register write/destructive entries as guarded handlers returning `RECIPE_DOM_FALLBACK_PENDING` with zero `executeBoundSpec` calls. |
| T-QT-260630-mjs-03 | Information Disclosure | Bootstrap CSRF/user context | mitigate | Never return/persist CSRF token or cookies; tests grep for storage/auth-token/direct-network patterns. |
| T-QT-260630-mjs-04 | Elevation of Privilege | Head manifest and origin gate | mitigate | Add `FsbHandlerMongodb` to origin-classification mapping for `mongodb-atlas`; validate same-origin before shipping. |
</threat_model>

<verification>
Run the focused suite:

```bash
node tests/capability-head-handlers.test.js
node tests/head-handler-cap.test.js
node tests/head-handler-upgrade.test.js
node tests/guarded-write-failclosed.test.js
node tests/verify-origin-classification.test.js
node scripts/verify-origin-classification.mjs
node scripts/verify-recipe-path-guard.mjs
node tests/t1-terminal-states.test.js
node tests/t1-readiness-report.test.js
node scripts/verify-t1-readiness-gate.mjs
node scripts/verify-t1-port-contract.mjs
node scripts/verify-write-activation-evidence.mjs
npm run validate:extension
```
</verification>

<success_criteria>
- 16 MongoDB Atlas read descriptors are handler-backed T1a rows.
- 4 MongoDB Atlas mutation descriptors are guarded fail-closed T1a rows with evidence records.
- MongoDB appears in search/readiness as T1-ready for reads and guarded fail-closed for mutation rows.
- Origin classification, recipe-path guard, head cap, exact-upgrade, guarded-write, readiness, terminal-state, and port-contract gates all include MongoDB.
- No unrelated dirty-worktree handler rows are removed or reverted.
</success_criteria>

<source_audit>
GOAL Make this app MongoDB T1-ready: COVERED by Tasks 1-3.
CONTEXT MongoDB Atlas only: COVERED; no other app surfaces are introduced.
CONTEXT app-specific handler: COVERED by `FsbHandlerMongodb`.
CONTEXT exact slug upgrade: COVERED by Task 3 `head-handler-upgrade`.
CONTEXT safe reads through ctx.executeBoundSpec: COVERED by Task 1 behavior tests.
CONTEXT write/destructive entries fail closed pending live mutation-body UAT: COVERED by Tasks 1-2.
CONTEXT tests/gates updated: COVERED by Tasks 2-3.
RESEARCH vendored app stem is `mongodb-atlas` while descriptor stem is `mongodb`: COVERED by Task 2 origin map.
</source_audit>

<output>
After completion, create `.planning/quick/260630-mjs-make-this-app-mongodb-t1-ready/260630-mjs-SUMMARY.md`.
</output>
