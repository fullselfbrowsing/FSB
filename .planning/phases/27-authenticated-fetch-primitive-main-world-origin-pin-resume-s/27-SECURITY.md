---
phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
audited: 2026-06-20
auditor: gsd-security-auditor
status: SECURED
asvs_level: 1
block_on: high
threats_total: 14
threats_closed: 14
threats_open: 0
accepted_risks: 2
register_authored_at_plan_time: true
verification_method: per-threat grep + source-line trace + live CI gates (recipe-path guard, capability-fetch suite, built errors artifact)
---

# Phase 27 Security Audit: Authenticated Fetch Primitive (MAIN-world + Origin-Pin + Resume-Sidecar)

**Result:** SECURED. All 14 registered threats resolve to CLOSED (12 `mitigate` verified present in code, 2 `accept` recorded in the accepted-risks log below). No `mitigate` mitigation was found absent or weaker-than-declared. No unregistered attack surface was introduced (each plan's `## Threat Surface` block affirmatively declares zero new surface beyond its `<threat_model>`).

This phase ships a credential-carrying authenticated fetch primitive, so the verification is load-bearing. Every mitigation below was confirmed by an actual grep/source-line match (or a green live gate), not by documentation or intent.

## Verification posture

- **Implementation files are READ-ONLY** and were not modified. Only this file (27-SECURITY.md) was authored.
- **Live gates run during this audit (all green):**
  - `node scripts/verify-recipe-path-guard.mjs` -> PASS (7 recipe-path files clean, fixtures validated, 3 sanctioned sites excluded, 4 on-disk capability modules all allowlisted).
  - `node tests/capability-fetch.test.js` -> 26 PASS / 0 FAIL (proves T-27-07/08/09/10/11 assertions live).
  - Independent dynamic-code grep over `capability-fetch.js` + `capability-interpreter.js` (incl. comments/strings) -> zero matches.
  - `grep RECOVERY_AMBIGUOUS mcp/build/errors.js` -> present at built artifact line 52 (T-27-05 surfacing).
- **Critical-path note (informational, not a gap):** `executeBoundSpec` / `classifyOnWake` are not yet wired to any caller (the MCP router is deferred to Phase 28/29). They are exercised only by the CI suite. This bounds the live blast radius of the three prior code-review warnings (WR-01/02/03) to zero today; see the WR cross-check section.

## Threat Verification Table

| Threat ID | Category | Disposition | Verdict | Evidence (file:line) |
|-----------|----------|-------------|---------|----------------------|
| T-27-01 | Tampering | mitigate | CLOSED | `extension/utils/capability-interpreter.js:318` (5b query-fold) precedes `:348` (5c `new URL(effectiveUrl, recipe.origin)`); `:361` sets `spec.url = effectiveUrl`. Fold strictly before pin, so the pin guards the true effective target. Test: `tests/capability-interpreter.test.js` query-fold + cross-origin/protocol-relative rejection cases (51 PASS). |
| T-27-02 | EoP / Spoofing | mitigate | CLOSED | `extension/utils/capability-interpreter.js:352` `if (!resolvedTarget || resolvedTarget.origin !== recipe.origin)` -> `:353` `createRecipeError('RECIPE_ORIGIN_MISMATCH', ...)` returned BEFORE `bindAuthStrategy` and before any caller acts on the spec. Dual-field (code+errorCode+error) via `createRecipeError` (`:85-93`). |
| T-27-03 | Tampering | mitigate | CLOSED | Pin (interpreter `:348-357`) resolves `//evil.com` / `/\evil.com` to a foreign origin and rejects. Defense-in-depth schema guard: `extension/utils/capability-recipe-schema.js:95` origin `^https?://[^/?#\s]+$`, `:106` endpoint `^/(?!/)(?:[^\s]*)$` (the `(?!/)` lookahead rejects a leading `//`) plus `:107` `..`-traversal `not` guard. |
| T-27-04 | Tampering | accept | CLOSED | Accepted-risks log AR-1 below. Code comment at `extension/utils/capability-interpreter.js:318-324` + `:331` (`encodeURIComponent(qk) + '=' + built.query[qk]` -- key encoded, value NOT re-encoded because values are already `encodeURIComponent`-escaped by `buildRequest`/`fillPlacementMap(..., true)` at `:174,:207`). Data-correctness non-issue, not a vulnerability. |
| T-27-05 | Info Disclosure | mitigate | CLOSED | `mcp/src/errors.ts:71` `RECOVERY_AMBIGUOUS` in `CODE_ONLY_ERROR_KEYS`; `:137` regex passes `RECIPE_.+` verbatim; only the typed code string surfaces (no secrets/body). Built artifact: `mcp/build/errors.js:52`. INV-01-safe (no MCP tool schema touched). Live: suite asserts `mapFSBError` surfaces both codes verbatim, not `action_rejected`. |
| T-27-06 | EoP | mitigate | CLOSED | `capabilityFetchInPage` is a fixed named function (`extension/utils/capability-fetch.js:132`) injected with `func` + `args:[spec]` (`:320-325`); recipe is data via args. On the CI-guard allowlist (`scripts/verify-recipe-path-guard.mjs:94`). Independent grep + guard Check 1 confirm zero `eval`/`new Function`/`import(` in the file (incl. comments). |
| T-27-07 | Spoofing / EoP | mitigate | CLOSED | `extension/utils/capability-fetch.js:291` `if (!tabOrigin || tabOrigin !== (spec && spec.origin))` -> `:293` dual-field `RECIPE_ORIGIN_MISMATCH` returned BEFORE the `c.scripting.executeScript` call at `:320`. Live: suite asserts mismatch fires NO executeScript (recorder EMPTY). |
| T-27-08 | Info Disclosure | mitigate | CLOSED | In-page func returns ONLY `{ ok, status, finalUrl, redirected, json, text }` (`extension/utils/capability-fetch.js:208-215`). No cookie is read into the return object: the sole `document.cookie` read (`:157`) is the `from:'cookie'` CSRF branch whose value flows ONLY into an outbound header `headers[src.header]` (`:164`), never to the return. HttpOnly cookies are unreadable by JS; `credentials:'include'` (`:173`) attaches them at the network layer only. Live: `func.toString()` guard asserts NONE of jmespath/getFSB/require/importScripts/FsbMcpTaskStore/FsbCapabilityInterpreter present. |
| T-27-09 | Tampering / Repudiation | mitigate | CLOSED | `extension/utils/capability-fetch.js:228` `MUTATING_METHODS = {POST,PUT,PATCH,DELETE}`; `classifyOnWake` (`:405-428`): mutating + in-flight -> `RECOVERY_AMBIGUOUS` (`:418-420`); non-object/unknown marker -> `RECOVERY_AMBIGUOUS` (fail-safe default `:407,:427`); only GET/HEAD `BEFORE_API_REQUEST` -> re-issuable (`:422-424`). Never returns a blind-retry verdict for a mutation. Live: suite asserts POST/DELETE -> AMBIGUOUS, GET -> re-issuable, terminal -> SAFE. |
| T-27-10 | Tampering | mitigate | CLOSED | `extension/utils/capability-fetch.js:148-152`: `tag === 'input'` reads `.value`/`getAttribute('value')`; else `.content`/`getAttribute('content')`. A wrong read yields a missing/empty token, not a wrong-origin request (token only goes to a header). Live: suite proves both the meta `.content` path and the input `.value` (CAVEAT-2) path. |
| T-27-11 | DoS | mitigate | CLOSED | `extension/utils/capability-fetch.js:191` `var CAP = 256 * 1024;` -> `:198` `if (text && text.length > CAP) { text = text.slice(0, CAP); }` applied after `response.text()` (`:194`) and BEFORE `JSON.parse` (`:202`). A multi-MB body cannot stall the boundary. |
| T-27-12 | Repudiation | mitigate | CLOSED | `27-HUMAN-UAT.md:3` `status: human_needed`; UAT-27-01/02/03 carry `human_needed` status and the doc forbids treating the scenario as passed until a human records dated/environment-stamped results. No fabricated pass entered the ledger (confirmed: statuses remain `human_needed` in 27-03-SUMMARY). |
| T-27-13 | Info Disclosure | accept | CLOSED | Accepted-risks log AR-2 below. Personal supervised read-only GET on the operator's own github.com session; FSB holds no credential (auth stays local, GOV-06). Recorded in `27-03-PLAN.md` `<threat_model>` and `27-HUMAN-UAT.md`. |
| T-27-SC | Tampering | mitigate | CLOSED | Zero new dependencies across all three plans (`tech-stack.added: []` in 27-01/02/03 SUMMARY). `npm --prefix mcp run build` compiles existing source only; `package.json` change is an additive test-chain entry (`&& node tests/capability-fetch.test.js`). No npm/pip/cargo install introduced. |

## Unregistered Flags

**None.** Mode was `register_authored_at_plan_time: TRUE` -- the audit verifies the registered set rather than scanning for net-new threats. No summary carried a `## Threat Flags` heading; instead each plan's `## Threat Surface` section affirmatively declares that no new security surface beyond its `<threat_model>` was introduced:
- 27-02-SUMMARY: "No NEW security surface beyond the plan's `<threat_model>` was introduced: no new network endpoint family ... no new auth path ... no schema change, no manifest/permission change."
- 27-03-SUMMARY: "No NEW security surface beyond the plan's `<threat_model>` was introduced."

This was independently corroborated: the only network endpoint is one hardcoded `github.com` GET recipe (pure data, no executable fields), no manifest/permission change occurred, and `background.js` wiring is one additive `importScripts` line.

## Accepted Risks Log

### AR-1 (T-27-04) -- Query double-encoding: ACCEPTED
- **Category:** Tampering (data-correctness)
- **What:** During the query-fold, the interpreter encodes only the query KEY (`encodeURIComponent(qk)`), not the VALUE, because `built.query` values are already `encodeURIComponent`-escaped by `buildRequest -> fillPlacementMap(..., true)`.
- **Why accepted:** Re-encoding an already-escaped value would corrupt the data (double-percent-encoding) without adding safety. The origin-pin (T-27-01/02) operates on the post-fold effective URL, so an injected value cannot survive to re-target the origin regardless. This is a deliberate non-issue documented in-code at `capability-interpreter.js:318-324`.
- **Residual risk:** None security-relevant. A malformed value would corrupt the request to the SAME origin (a self-inflicted bad request), not enable cross-origin redirection.

### AR-2 (T-27-13) -- Self-access on the operator's own GitHub account: ACCEPTED
- **Category:** Information Disclosure
- **What:** The live FETCH-05 UAT performs a read-only GET against the operator's own authenticated github.com session.
- **Why accepted:** It is a personal, supervised, read-only GET on the operator's own session (GitHub Acceptable Use Policy defensible per 27-CONTEXT.md). No third-party data is accessed; FSB handles/stores no credential (the session rides HttpOnly cookies the browser attaches, never read by FSB). The UAT is human-gated and never auto-run.
- **Residual risk:** Bounded to the operator's own account, under the operator's direct supervision. No FSB-held secret, no cross-account access.

## Prior Code-Review Warnings cross-checked against the register (ASVS L1, block_on=high)

The phase carried a prior code review (`27-REVIEW.md`: 0 critical, 3 warnings). Each warning was re-assessed against the threat register to decide whether it constitutes an OPEN threat at this gate.

| WR | Maps to | Assessment at ASVS L1 / block_on=high | Verdict |
|----|---------|----------------------------------------|---------|
| WR-01: `capabilityFetchInPage` has no in-primitive origin guard; the `credentials:'include'` fetch trusts `spec.url` | T-27-07 (active-tab pin) | The registered mitigation for "right URL, wrong session" is the active-tab pin in `executeBoundSpec` (`:291`), which IS present and verified CLOSED. WR-01 asks for an ADDITIONAL defense-in-depth layer inside the page func for the direct-call path. The browser same-origin/CORS model already limits cross-origin credentialed reads, and the primitive is not wired to any caller (only `executeBoundSpec` is the intended entry, deferred to Phase 28/29). No declared mitigation is absent or weakened; this is a strengthening recommendation, not an open registered threat. | NOT a blocker (defense-in-depth; carry to Phase 28/29 when the router lands) |
| WR-02: resume-sidecar `taskId` uses millisecond `Date.now()` only; same-millisecond same-origin collision | T-27-09 (eviction reconciliation) | The collision degrades the FETCH-04 reconciliation contract ONLY under concurrent same-origin `executeBoundSpec` calls in the same millisecond -- which requires a wired concurrent caller that does not exist yet (router deferred). The registered T-27-09 mitigation (`classifyOnWake` never blind-retries a mutation) is present and CLOSED for the single-fetch path the phase ships. Latent correctness gap, zero live blast radius today. | NOT a blocker (latent; fix before wiring a concurrent caller in Phase 28/29) |
| WR-03: both origin-pins compare normalized `URL.origin` against the verbatim recipe `origin` string; a mixed-case `recipe.origin` fails closed | T-27-02 / T-27-07 (origin-pins) | This is a FAIL-CLOSED correctness bug (rejects a valid mixed-case-host recipe), not a fail-open security hole. It does not weaken either pin -- it makes them stricter. The shipped recipe is lowercase `github.com`, so it does not surface this phase. A fail-closed pin cannot admit a cross-origin target. | NOT a blocker (fail-closed; latent trap for future catalog authors) |

**Conclusion of cross-check:** None of WR-01/02/03 constitutes an OPEN registered threat at ASVS L1 with `block_on=high`. All three are either defense-in-depth strengthening (WR-01) or latent correctness gaps with zero live blast radius because the primitive is unwired (WR-02 fail-open-only-under-unreachable-concurrency, WR-03 fail-closed). They should be addressed in Phase 28/29 when `executeBoundSpec` is wired to the MCP router, but they do not block Phase 27.

## Audit Trail

1. Loaded all `<files_to_read>`: the 6 implementation files (capability-fetch.js, capability-interpreter.js, mcp/src/errors.ts, verify-recipe-path-guard.mjs, github-notifications.json, mcp-task-store.js), the 3 plans, the 3 summaries, and 27-REVIEW.md. Also read capability-recipe-schema.js (for the T-27-03 defense-in-depth pattern) and 27-HUMAN-UAT.md (for T-27-12).
2. Checked for project skills under `.claude/skills/` and `.agents/skills/`: neither directory exists; no project-specific security rules to apply.
3. Classified each of the 14 register entries by disposition: 12 `mitigate`, 2 `accept` (T-27-04, T-27-13).
4. Verified each `mitigate` threat by grep + source-line trace in the cited file, then corroborated the load-bearing ones with live gates (recipe-path guard PASS; capability-fetch suite 26/0; built errors artifact carries RECOVERY_AMBIGUOUS; independent dynamic-code grep clean).
5. Recorded both `accept` threats in the accepted-risks log above (satisfying their disposition's verification method).
6. Confirmed no `## Threat Flags` sections exist; corroborated the executors' affirmative no-new-surface declarations -> zero unregistered flags.
7. Cross-checked the 3 prior code-review warnings against the register at ASVS L1 / block_on=high: none is an open registered threat (all defense-in-depth / latent with nil live blast radius given the unwired primitive).
8. Confirmed implementation files were never modified; authored only this 27-SECURITY.md.

**Verdict: SECURED -- threats_open: 0.**

---
*Phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s*
*Audited: 2026-06-20 by gsd-security-auditor (ASVS L1, block_on=high)*
