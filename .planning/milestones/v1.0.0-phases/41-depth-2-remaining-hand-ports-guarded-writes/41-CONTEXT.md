# Phase 41: Depth 2 — Remaining Hand-Ports + Guarded Writes (DEPTH-02) — Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Orchestrator-gathered (the write template + the consent gate + INV-03 are the shipped v0.9.99/Phase-40 substrate; the conservative Wall-2-preserving posture is locked by the milestone's established fail-closed default + DENY-04 posture-B). No separate user discuss — decisions follow the established conservative posture + the autonomous "accept recommended" pattern.

<domain>
## Phase Boundary

Complete the depth head with the REMAINING hand-ports **including WRITE ops**, holding every write
**fail-closed** to `RECIPE_DOM_FALLBACK_PENDING` (the shipped `github.issues.create` pattern) until a
live-captured mutation body confirms it, re-enforcing the **DENY-04 mutating opt-in on sensitive
origins**, and gating any separate-API-origin (Pattern-D) port behind a per-app **CORS / first-party-
origin verification gate** so an unverified port can never silently ship. OWNS **DEPTH-02**.

**In scope:**
1. **The CORS / first-party-origin verification gate** (NEW, the headline): a build-time classifier
   (`scripts/verify-origin-classification.mjs`) wired into `validate:extension` that, for every
   registered T1a head, asserts the handler origin is SAME-ORIGIN with the app's real API base-URL
   (read from the vendored `<app>-api.ts`). A separate-origin / per-org-subdomain head FAILS THE BUILD
   (must be demoted to T3-DOM). This is the fail-closed guarantee SC3 wants.
2. **Guarded WRITE hand-ports** on VERIFIED same-origin apps (gitlab/notion + slack): a curated set of
   high-value writes, each shipping FAIL-CLOSED (returns `RECIPE_DOM_FALLBACK_PENDING`, NEVER calls
   `executeBoundSpec`) + marked `[ASSUMED-ENDPOINT]` + recorded as a `human_needed` live-UAT; each
   UPGRADES its existing `opentabs__<app>__<op>` write descriptor dom→T1a (slug-exact, Phase-40
   mechanism). The write scaffolds the params+endpoint+gating, ready to flip to executable on one
   live-capture — without a new hand-port.
3. **SC2 proof:** a hand-ported T1a WRITE on a SENSITIVE origin honors the DENY-04 per-origin mutating
   opt-in at the invoke gate (`RECIPE_CONSENT_MUTATING_REQUIRED` without the flag; allow with it; reads
   stay open under Auto) — structurally guaranteed (the gate runs BEFORE tier dispatch) + tested.
4. **Remaining same-origin READ heads** (optional, to round out the ~7-18 remaining-heads band).
5. **INV-03** byte-stable typed reasons + the head cap (≤30) hold; the depth tests stay green.

**Out of scope (DEFERRED — explicit):**
- **Pattern-D cross-origin EXECUTION (the actual linear port).** Linear/datadog/jira/supabase/cloud-
  consoles classify SEPARATE-origin (linear→`client-api.linear.app`, datadog→`*.datadoghq.com`,
  jira→`*.atlassian.net`). Porting them would require punching a controlled hole in the NON-NEGOTIABLE
  Wall-2 origin-pin (a CORS-verified cross-origin credentialed fetch) — a deliberate Wall-2-extension
  decision that (a) needs live-capture to confirm the cross-origin cookie actually rides and (b) the
  user should bless. The CONSERVATIVE, walls-intact, SC3-compliant choice (SC3: "MAY port … or be
  demoted to T2/T3") is to **DEMOTE all separate-origin apps to T3-DOM** this milestone (they already
  serve as T3-DOM breadth descriptors — still discoverable + DOM-invocable) and DEFER the Pattern-D
  execution mechanism to a future story (v2 CLOUD-01 / a linear-CORS spike). The CORS-gate is what
  ENFORCES the demote.
- Discovery seeding of the tail → Phase 42. The authoritative scale/test gate → Phase 43.
- NO change to the consent gate, `executeBoundSpec` origin-pin, tier dispatch, or HEAL core (reuse the
  shipped substrate unchanged).
</domain>

<decisions>
## Implementation Decisions (locked by the shipped substrate + the conservative Wall-2-preserving posture)

### The CORS / first-party-origin verification gate (NEW — `scripts/verify-origin-classification.mjs`)
- A build-time classifier `classifyOriginPattern(handlerOrigin, apiBaseUrl) → {sameOrigin, separate,
  apiOrigin, reason}`: same-origin = the API base-URL host EQUALS the handler origin host (a PATH like
  `gitlab.com/api/v4`, `www.notion.so/api/v3`); separate = a different host / subdomain
  (`client-api.linear.app`) or a per-org wildcard (`*.datadoghq.com`, `*.atlassian.net`).
- The gate iterates EVERY `HEAD_HANDLER_MODULES` entry, reads each handler's `origin`, and reads the
  app's real API base-URL from the vendored `vendor/opentabs-snapshot/plugins/<app>/src/*-api.ts`
  (the same extraction the Phase-40 planner used: gitlab `gitlab.com/api/v4`, linear
  `client-api.linear.app`). Asserts SAME-ORIGIN for every shipped head → a separate-origin head FAILS
  the build with a clear `CORS_SEPARATE_ORIGIN` reason (forcing demote-to-T3). Wired into
  `validate:extension`. This is fail-closed: a future separate-origin port can NEVER silently ship.
- It does NOT enable any cross-origin call; it is a SHIPPING GATE (port-eligibility), not an executor.

### The guarded-WRITE contract (copy `github.issues.create`, fail-closed)
- Each write handler: `{ tier:'T1a', origin:<first-party>, sideEffectClass:'write', params:<closed
  schema>, async handle(args, ctx){ return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {slug,
  reason:'unverified-<app>-<verb>-mutation', fellBackToDom:true}); } }` — it NEVER calls
  `executeBoundSpec` (no mutation fires), returns the dual-field typed reason, and is marked
  `[ASSUMED-ENDPOINT]`. Behaviorally identical to its T3-DOM descriptor today (both → DOM fallback);
  the VALUE is the scaffolded params+endpoint+gating that a single live-capture flips to executable.
- **Curated write set (same-origin, high-value; verify each slug EXISTS as an `opentabs__<app>__*`
  write descriptor):** gitlab (`create_issue`, `create_merge_request`, `create_note` — POST
  `gitlab.com/api/v4`); notion (`create_page`, `update_page`, `append_block` — RPC `www.notion.so/api/v3`);
  slack (`send_message` IF distinct from the already-executable `slack.chat.postMessage` — else skip to
  avoid a redundant head). Target ~6-10 guarded writes. Claude's discretion on the exact set within the
  same-origin verified apps; do NOT hand-port a write on a SEPARATE-origin app (the CORS-gate forbids).
- **NO payment/commerce write hand-ports** (amazon/doordash/etc. stay DOM-only on sensitive origins —
  the established posture; their payment-op guard + DOM-only backing is the money-no-movement floor).

### SC2 — sensitive-origin T1a write honors the mutating opt-in
- The consent gate runs BEFORE tier dispatch (`capability-router.js:720` before `:743`), so a T1a write
  on a sensitive origin is gated IDENTICALLY to the proven DOM writes (discord/amazon). PROVE it with a
  T1a-handler-entry test through the LIVE committed roster: a write to a sensitive origin WITHOUT the
  per-origin mutating flag → dual-field `RECIPE_CONSENT_MUTATING_REQUIRED` (INV-03); WITH
  `setOriginMutating(origin,true)` → allow (the gate allows; the handler then fail-closes on
  `[ASSUMED]` — distinct concerns); a READ → allow under Auto.
- **Which sensitive origin:** prefer a REAL sensitive app the gate already classifies (check
  `service-denylist.json` — if `app.slack.com`/`*.slack.com` is sensitive, `slack.send_message` is the
  natural shipped proof; else use discord/reddit's shipped DOM write descriptor for the gate proof, OR
  a synthetic T1a-write fixture on a sensitive test origin — mirror `sensitive-write-import-gate.test.js`).
  Default: reuse the shipped descriptor + a T1a-handler fixture so NO new risky social/payment write
  head is shipped just to prove the gate.

### INV-03 + head cap + invariants
- All typed reasons flow through the central `_err`/`typedRecipeError` (`capability-router.js:61-69`,
  per-handler `typedRecipeError`) → byte-stable `code===errorCode===error`. Extend the byte-equality
  test to cover the new T1a-write fail-closed `RECIPE_DOM_FALLBACK_PENDING`. **Head cap ≤30** holds
  (writes ADD slugs to the existing gitlab/slack/notion modules — NO new modules). INV-01 (no new MCP
  tool, frozen registry hash). INV-02 (both front doors → same `router.invoke`). Wall 1 (closed-vocab
  data). Wall 2 (origin-pin UNCHANGED — the reason Pattern-D is deferred).

### Live-UAT recording (honest debt)
- Each guarded write carries an `[ASSUMED-ENDPOINT]` marker + a `human_needed` row in a UAT manifest
  (`41-HUMAN-UAT.md`, the `29-HUMAN-UAT.md` tabular format: ID|Service|op|Procedure|Expected|Status).
  The write stays fail-closed until a real authenticated-tab capture confirms the mutation body/endpoint
  (then a future flip activates it). Recorded, NOT fabricated; non-blocking for CI (headless gates pass).

### Claude's Discretion
- The exact write set (~6-10) within the same-origin verified apps; the optional remaining reads.
- The SC2 proof vehicle (shipped descriptor + T1a fixture vs a real sensitive write head) — default to
  the fixture/descriptor (no new risky write head).
- The CORS-gate's exact classifier output shape + how it reads the vendored base-URL.
</decisions>

<code_context>
## Existing Code Insights (reuse the shipped substrate unchanged)
- **Write template:** `catalog/handlers/github.js:111-123` (`github.issues.create` → fail-closed
  `RECIPE_DOM_FALLBACK_PENDING`, `[ASSUMED-ENDPOINT]` :33-38). `slack.js:307-322`
  (`slack.chat.postMessage` is ALREADY executable via `callSlackMethod` — the live-proven exception;
  new writes are fail-closed). `gitlab.js:36-39` (READ-ONLY today; writes are this phase).
- **Consent gate (DENY-04 posture B):** `capability-router.js` gate def `:359-510`, mutating re-gate
  `:453-496` (`sensitive && mutating && !mutatingAllowed → RECIPE_CONSENT_MUTATING_REQUIRED`), invoked
  `:713-728` BEFORE tier dispatch `:743`. `setOriginMutating` flag; `FsbServiceDenylist.classify` source;
  fail-closed-if-throws (MD-01 `:487-495`).
- **INV-03 dual-field:** `_err` `capability-router.js:61-69`; per-handler `typedRecipeError`
  (github.js:67-75, gitlab.js:136-144, slack.js:161-169, notion.js:94-102). Byte-equality tested:
  `tests/consent-mutation-gate.test.js:180-185`, `tests/sensitive-write-import-gate.test.js:177-182`.
- **Write descriptors to upgrade:** `catalog/descriptors/opentabs__{gitlab,notion,slack}__*.json`
  (gitlab create_issue/create_merge_request/create_note/update_issue; notion create_page/update_page/
  append_block/…; slack send_message/…) — read the EXACT `slug` + confirm `sideEffectClass` write.
- **CORS-gate data:** `vendor/opentabs-snapshot/plugins/<app>/src/*-api.ts` base-URL (gitlab-api.ts:13
  `gitlab.com/api/v4`; linear-api.ts:18 `client-api.linear.app`). Build alongside `scripts/verify-*.mjs`;
  wire into `validate:extension` (package.json). Mirror `head-handler-upgrade.test.js` for the test.
- **Live-UAT precedent:** `.planning/phases/29-…/29-HUMAN-UAT.md` (tabular manifest); `[ASSUMED-ENDPOINT]`
  markers across the handlers; Phase-40 carried-forward endpoint-correctness debt.
- **Head registration:** `capability-catalog.js` HEAD_HANDLER_MODULES (:241-245, the 4 modules),
  `registerHandler` (:213-224), resolve REGISTRY-first upgrade (:329). `tests/head-handler-cap.test.js`
  (≤30). `extension/config/service-denylist.json` sensitiveOrigins (the SC2 origin source).

## Integration Points
- New write handler → registers the EXACT opentabs write slug → resolve upgrades dom→T1a → invoke()
  → consent gate (sensitive→mutating-gated) → T1a `_runHandlerTier` → handler fail-closes
  (`RECIPE_DOM_FALLBACK_PENDING`, no mutation). The CORS-gate (build-time) asserts every head is
  same-origin → validate:extension. INV-03/head-cap/INV-01/02 tests stay green.
</code_context>

<specifics>
## Specific Ideas
- THE security keystone: writes ship FAIL-CLOSED (no mutation fires without a live-captured body) +
  the CORS-gate makes a separate-origin port a BUILD FAILURE (not a silent same-looking ship). Both
  are fail-closed — the milestone's posture.
- THE Wall-2 integrity decision: DEMOTE separate-origin (linear/datadog/jira) to T3-DOM via the
  CORS-gate; DEFER Pattern-D cross-origin execution (the Wall-2 hole) to a deliberate future story.
  Conservative, SC3-compliant ("MAY port … or demote"), and unverifiable autonomously anyway.
- THE correctness keystone (carried from Phase 40): register the EXACT opentabs write slug so the
  hand-port UPGRADES the breadth write descriptor dom→T1a instead of minting a dead duplicate.
</specifics>

<deferred>
## Deferred Ideas
- **Pattern-D cross-origin execution** (the actual linear/datadog/jira ports + the Wall-2 origin-pin
  extension for CORS-verified sibling-API origins) → a future story (needs live-capture + a user-blessed
  Wall-2 decision). The CORS-gate demotes them to T3-DOM for now.
- Live-captured write bodies on authenticated tabs (every `[ASSUMED-ENDPOINT]` guarded write) →
  carried-forward `human_needed` UAT (the writes ship fail-closed; activation awaits capture).
- GAPI-01 (Google Workspace gapi-bridge) + CLOUD-01 (cloud-console Pattern-D) → v2.
- Discovery seeding of the residual tail → Phase 42. Authoritative scale/test gate → Phase 43.
</deferred>
