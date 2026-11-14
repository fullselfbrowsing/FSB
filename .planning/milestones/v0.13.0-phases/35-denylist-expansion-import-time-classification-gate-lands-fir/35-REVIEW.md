---
phase: 35-denylist-expansion-import-time-classification-gate-lands-fir
reviewed: 2026-06-24T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - extension/utils/capability-router.js
  - scripts/verify-classification-gate.mjs
  - extension/config/service-denylist.json
  - catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json
  - catalog/descriptors/_fixtures/_provenance.json
  - vendor/opentabs-snapshot/PIN.md
  - vendor/opentabs-snapshot/_provenance.json
  - docs/LEGAL.md
findings:
  blocker: 0
  high: 0
  medium: 3
  low: 3
  total: 6
status: resolved
resolution:
  resolved_at: 2026-06-24T00:00:00Z
  fixed: [MD-01, MD-02, MD-03, LO-01, LO-02]
  skipped: [LO-03]
  skipped_reason: "LO-03 is working-as-designed (the youtube media token vs music.youtube.com-only scope is deliberate tension; no change required per the review)."
  commits:
    MD-01: 8f0d104a
    MD-02: fd3604d5
    LO-01: 692d35ae
    MD-03: c2e3c13f
    LO-02: 7e62c67c
---

# Phase 35: Code Review Report (Denylist Expansion + Import-Time Classification Gate)

**Reviewed:** 2026-06-24
**Depth:** deep (cross-file: router gate <-> denylist classifier <-> consent store <-> gate script)
**Files Reviewed:** 8
**Status:** RESOLVED (0 BLOCKER / 0 HIGH / 3 MEDIUM / 3 LOW -- MD-01/MD-02/MD-03/LO-01/LO-02 fixed; LO-03 working-as-designed, no change)

## Summary

I reviewed the security-foundation changes of Phase 35 against an adversarial stance,
empirically exercising the gate and re-gate rather than reading them alone. The
**headline security control (the posture-B sensitive-write re-gate at step 3.5 of
`_evaluateConsent`) is correct and well-scoped**: it fires only when
`classify(origin).sensitive === true` AND the call is mutating AND the per-origin
mutating flag is unset; it leaves reads and non-sensitive writes fully open; it
returns the dual-field `RECIPE_CONSENT_MUTATING_REQUIRED` byte-exact across all three
fields (`code`/`errorCode`/`error`), satisfying INV-03; and it sits strictly after the
denylist (step 1), so denylist ordering is undisturbed and a denied origin never
reaches it. I verified the live mutation-gate test (17/17 PASS) and traced the
ordering by hand. **I could not construct a path where a sensitive write reaches
`decision:'allow'` without the mutating flag** under the shipped (total) `classify()`.

Roster correctness is clean: exact-host forms hold (`music.youtube.com` does NOT catch
`youtube.com`; `dashboard.stripe.com` does NOT catch `api.stripe.com`;
`digital.fidelity.com` exact; `store.steampowered.com` exact); `*.x.com` matches the
apex and subdomains but correctly anchors (`notx.com`/`evilx.com` reject);
IG/FB/TikTok/X are sensitive-not-denied as required. Wall 1 holds (no runtime `.js`
under `vendor/opentabs-snapshot/`). The gate is chained into both `validate:extension`
and `ci`, exports `classifyGate` for Phase 36, and the proof fixture is correctly
isolated under `_fixtures/` (excluded from the non-recursive corpus sweep) and
exercised by `tests/classification-gate.test.js` (10/10 PASS). The CLI exits non-zero
on failure and zero on pass.

No blockers. The findings below are robustness gaps in the fail-closed gate's
heuristic (which weaken its false-negative guarantee, the explicit point of DENY-03), a
defense-in-depth fail-open in the re-gate's error handling, a now-stale/contradictory
governance doc, and minor data/comment-accuracy issues.

## Critical Issues

None.

## High Issues

None.

## Medium

### MD-01: Re-gate fails OPEN if `classify()` throws for a sensitive origin (defense-in-depth asymmetry)

**[RESOLVED -- commit 8f0d104a]** The step-(3.5) branch now fails CLOSED: a `classify()` that throws (or returns a non-object) for a mutating, non-flagged call re-gates to `RECIPE_CONSENT_MUTATING_REQUIRED` rather than falling through to allow. An ABSENT denylist remains the documented "nothing sensitive" baseline (write stays open). Regression assertions added to tests/consent-mutation-gate.test.js (throwing classify on a mutating call -> RECIPE_CONSENT_MUTATING_REQUIRED; throwing classify on a read -> still allow).

**File:** `extension/utils/capability-router.js:464-477`

**Issue:** In the posture-B branch, `classify(origin)` is wrapped in try/catch and a
throw sets `cls = null`, after which control falls through to the final
`return { decision: 'allow' }`. So if the denylist's `classify()` ever throws for a
sensitive, mutating, non-flagged origin, **the sensitive write is ALLOWED**. I proved
this with a harness that injects a denylist whose `classify()` throws: the verdict is
`allow`. This is asymmetric with the rest of the gate, which fails CLOSED on every
other degradation (denylist-unavailable -> `off` at line 372-378; consent-store
degraded -> `off` at line 409-414; null origin -> `off` at line 418-425). A
credential-replay gate degrading OPEN on its sensitivity probe is exactly the posture
the phase set out to eliminate.

Severity is MEDIUM (not BLOCKER) because the *shipped* `service-denylist.js classify()`
is total -- it routes every parse failure through `_parseOrigin` (no-throw) and returns
a plain object, so the throw is not reachable with the production classifier. This is a
latent guardrail gap, not a live bypass. But the surrounding code already treats every
other collaborator failure as fail-closed, and the `isDenied` probe at step 1 catches
its throw and treats it as a NON-match by design (acceptable, because step 2/3 still
gate) -- whereas here the catch lands directly on the allow path with no backstop.

**Fix:** On a classify throw (or null) for a mutating, non-flagged call, fail closed
rather than fall through to allow. Mirror the denylist-unavailable shape:

```js
if (mutating && !mutatingAllowed) {
  var cls = null;
  var clsErrored = false;
  if (denylist && typeof denylist.classify === 'function') {
    try { cls = denylist.classify(origin); }
    catch (_e) { cls = null; clsErrored = true; }
  }
  // Fail CLOSED: a sensitivity probe that THREW cannot prove the origin is safe,
  // and this is a mutating call -- re-gate rather than fall through to allow.
  if (clsErrored || (cls && cls.sensitive === true)) {
    return {
      decision: 'mutating_required',
      method: method,
      sideEffectClass: sideEffectClass,
      error: _err('RECIPE_CONSENT_MUTATING_REQUIRED', { origin: origin, slug: slug })
    };
  }
}
```

(If reusing `RECIPE_CONSENT_MUTATING_REQUIRED` for the errored case is undesirable,
return a `RECIPE_CONSENT_REQUIRED` with `reason:'classify-unavailable'` -- either is
fail-closed; the current fall-through to `allow` is the only wrong answer.)

### MD-02: Heuristic word-boundary anchoring misses common plural/derived forms (`funds`, `banking`) -- weakens the fail-closed guarantee

**[RESOLVED -- commit fd3604d5]** Added `banking` and `funds` to the finance/payment axis vocabulary (option (a)). An unclassified origin whose descriptor metadata contains "online banking" / "manage your funds" is now flagged. The no-false-positive guarantee is preserved (CLI gate still exits 0 over 8 corpus + 23 roster origins; benign reddit.inbox/github.notifications/airtable/wikipedia produce 0 failures). New assertions (e)/(f) in tests/classification-gate.test.js prove both the closed false-negative and the preserved no-false-positive.

**File:** `scripts/verify-classification-gate.mjs:71-96, 106-120`

**Issue:** Every axis RegExp anchors each token with `\b...\b`. Combined with a token
list that includes some forms but not their inflections, this produces false-NEGATIVES
on descriptor *metadata* (slug/description), which is the gate's secondary signal when a
brand-name host carries no category noun (Pitfall 5, the exact failure DENY-03 must
prevent). Proven empirically:

- `fund` (singular) TRIPS, but `funds` (plural) MISSES -- `\bfund\b` will not match
  inside "funds".
- `bank` TRIPS, but `banking` MISSES -- `\bbank\b` will not match inside "banking".
- (`payment`/`payments` both trip only because BOTH forms are explicitly listed; the
  vocabulary is inconsistent about pluralization.)

A Phase-36 descriptor for a brand-name-only finance origin (host carries no category
word) whose description reads "manage your funds" or "online banking" would slip the
gate as "safe." This is the precise false-negative class the comment at lines 64-70
claims robustness against ("a brand-only host ... is caught even when it contains no
generic category word") -- the brand path is covered, but the inflected-category path
is not.

**Fix:** Either (a) add the missing inflected forms to the vocabulary (`funds`,
`banking`, and audit the rest of the list for singular-only/plural-only gaps), or
(b) drop the trailing `\b` (or use a stem-friendly boundary) for category nouns so
`fund` matches `funds`/`funding` and `bank` matches `banking`. Option (b) is the more
robust fail-closed posture (it can only widen the net, and a benign false-positive is
fixed via the SAFE_ALLOWLIST per the module's own stated policy). A token-stem approach,
e.g. matching `\b(bank|...|fund|...)\w*` for the category axes, closes the class.

### MD-03: `docs/LEGAL.md` now contradicts itself on sensitive-write enforcement (stale governance posture)

**[RESOLVED -- commit c2e3c13f]** The two stale Consent Model bullets were rewritten to scope "fully open under Auto" to NON-sensitive origins and to state that sensitive-origin WRITES re-enforce the per-origin mutating opt-in at the invoke gate (posture B / DENY-04), while reads run under Auto and non-sensitive writes stay open. The Auto table row and the Security note were also qualified for consistency. No remaining sentence claims sensitive writes are ungated under Auto; the section now agrees with the Categorization Axes subsection.

**File:** `docs/LEGAL.md:57-65` vs `docs/LEGAL.md:151-156`

**Issue:** The new "Categorization Axes" subsection (lines 151-156) correctly states
that a WRITE to a sensitive origin "re-enforces the per-origin mutating opt-in (posture
B / DENY-04) before it is permitted." But the older "Consent Model" bullets were not
reconciled and now state the OPPOSITE for the same case:

- Line 57-60: "**Writes are allowed under Auto.** ... The per-origin mutating flag is
  retained in storage but **is not enforced at the invoke gate** while the origin is
  Auto."
- Line 61-65: "**Sensitive-origin friction remains on discovery only.** Origins
  classified as sensitive ... **no longer force extra confirmation at the capability
  invoke gate under Auto.**"

After DENY-04, sensitive-origin writes DO force the mutating opt-in at the invoke gate.
This is a self-contradiction in the human-readable governance/ToS document that
describes the shipped security posture -- a reader (or auditor) gets two opposite
answers depending on which section they read. The router behavior is correct; the doc
is stale.

**Fix:** Update the two Consent Model bullets to scope the "fully open under Auto"
statement to NON-sensitive origins, consistent with the Categorization Axes subsection.
For example, qualify line 57-60 to "Writes to non-sensitive origins are allowed under
Auto; writes to sensitive origins re-enforce the per-origin mutating opt-in (see
Categorization Axes)," and revise line 61-65 so it no longer asserts sensitive origins
have NO invoke-gate friction (network-capture discovery keeps its own broader confirm;
the invoke gate now re-gates sensitive writes).

## Low

### LO-01: Misleading comment -- heuristic does NOT catch a regression that drops 4 of the roster origins

**[RESOLVED -- commit 692d35ae]** Softened the ROSTER_ITEMS comment: it now states the sweep proves the "explicitly-classified -> OK" path (each entry hits the classify()-matched `continue` before the heuristic), and explicitly records that 4 of 23 (steampowered.com, console.twilio.com, x.com, teams.microsoft.com) MISS on host-only input -- so the sweep is a classification proof, not a per-host regression net for brand-only hosts the vocabulary lacks.

**File:** `scripts/verify-classification-gate.mjs:194-198`

**Issue:** The ROSTER_ITEMS comment claims the sweep "would catch a regression that
dropped a roster entry" because "every one of these trips a heuristic axis." That is
false for 4 of the 23 roster origins. With slug/description empty (as the roster items
are), the host alone does NOT trip any axis for: `store.steampowered.com` (no token;
"steam" matches media but "steampowered" is not "steam" under `\bsteam\b`),
`console.twilio.com` ("twilio" is not in any axis vocabulary), `x.com` (the social axis
has `twitter`, not `x`), and `teams.microsoft.com` ("teams" is not a token). I verified
this directly: these four MISS on host-only input. They pass the gate today only because
they are explicitly classified (they hit the `continue` before the heuristic runs). So
if a future edit dropped one of these from `service-denylist.json`, the gate would NOT
catch it -- contrary to the comment's promise.

**Fix:** Either soften the comment to state that the roster proves the
"explicitly-classified -> OK" path (true) but does NOT by itself prove
regression-detection for brand-only hosts the vocabulary lacks; OR add the missing brand
tokens (`twilio`, `x`/`x.com`, `teams`, `steampowered`) to the relevant axes so the
regression-detection claim becomes true. The latter also hardens MD-02's false-negative
surface for these real apps.

### LO-02: `catalog/descriptors/_fixtures/_provenance.json` is a byte-for-byte copy of the vendor pin and mislabels its own location

**[RESOLVED -- commit 7e62c67c]** Added `_role` ("catalog-descriptor-provenance-scaffold") and a `_note` distinguishing it from the authoritative vendor pin (pointing to vendor/opentabs-snapshot/_provenance.json as the source of truth, and noting the seeded pin fields are not a second pin to bump by hand). The file is no longer byte-identical to the vendor pin. Kept data-only; the existing tests/provenance-scaffold.test.js cross-check (both files pin the same SHA) stays green.

**File:** `catalog/descriptors/_fixtures/_provenance.json:1-9`

**Issue:** This file is byte-identical to `vendor/opentabs-snapshot/_provenance.json`
(verified via `diff`). Its content describes an OpenTabs *snapshot pin*
(`"source":"opentabs"`, `"repo":...`, `"sha":...`, `"apps":[]`) -- which is the vendor
directory's concern -- yet it lives in the catalog fixtures directory. The RESEARCH/plan
intent (35-RESEARCH Q3, 35-04) is a catalog-side *descriptor provenance* scaffold that
Phase 36 extends with per-descriptor provenance; duplicating the vendor pin verbatim
conflates two different provenance roles and risks the two files drifting silently (a
future SHA bump to one will not propagate to the other). Note this file is harmless to
the shipped catalog (it lives under `_fixtures/`, excluded from the non-recursive corpus
reader -- I verified the gate's `readCorpusItems` does not pick it up), so this is a
data-hygiene/clarity issue, not a correctness bug.

**Fix:** Give the catalog-side scaffold a distinct shape that reflects its role
(descriptor provenance for the emitted catalog), or add a `"_role"`/`"_note"` field
distinguishing it from the vendor pin, so Phase 36 extends the right structure and the
two files are not assumed to be a single source of truth.

### LO-03: `youtube` media token over-broad relative to the denylist's deliberate exact-host scoping

**[SKIPPED -- working-as-designed]** No change required (the review itself does not flag this as a defect). The `youtube` media token vs the denylist's `music.youtube.com`-only scope is a deliberate, RESEARCH-sanctioned tension; Phase 36 must make a conscious classify-or-allowlist call for `youtube.com` proper.

**File:** `scripts/verify-classification-gate.mjs:86` (media axis)

**Issue:** The media axis matches the bare token `youtube`, so the gate would flag ANY
unclassified origin whose host/metadata contains "youtube" (e.g. a hypothetical
`youtube.com` proper descriptor, or any "youtube"-substring service) as
sensitivity-suspect. Meanwhile the denylist deliberately classifies ONLY
`music.youtube.com` (exact host) and intentionally leaves `youtube.com` UNclassified
(Pitfall 1, to avoid `*.youtube.com` catching youtube proper). The result: a future
`youtube.com` descriptor would FAIL the gate (heuristic trips, not classified) and force
a classification decision. RESEARCH explicitly calls this out as the intended/"correct"
conservative behavior ("`youtube` (media keyword) WILL trip ... that is correct"), so
this is working-as-designed and I am NOT flagging it as a defect -- but it is worth
recording that the gate's `youtube` token and the denylist's `music.youtube.com`-only
scope are in deliberate tension, and Phase 36 must make a conscious classify-or-allowlist
call for `youtube.com` rather than being surprised by a build failure.

**Fix:** No change required. Optionally, when Phase 36 imports `youtube` proper, document
the classify/allowlist decision inline so the tension is explicit for the next reader.

---

## Verification performed (for the record)

- Posture-B re-gate: ran `tests/consent-mutation-gate.test.js` (17/17 PASS), including
  byte-exact `RECIPE_CONSENT_MUTATING_REQUIRED` on all three dual-fields, sensitive
  GET->allow, sensitive POST(no flag)->re-gate, sensitive POST(with flag)->allow,
  non-sensitive POST->allow. Hand-traced step ordering (denylist 1 -> off 2 -> ask 3 ->
  re-gate 3.5 -> allow): denied origins cannot reach 3.5; ordering undisturbed.
- Roster: `classify()` probes confirm `music.youtube.com` denied while
  `youtube.com`/`www.youtube.com` are not; `dashboard.stripe.com` sensitive while
  `api.stripe.com` is not; `*.x.com` matches apex+subdomain but rejects
  `notx.com`/`evilx.com`; `digital.fidelity.com` and `store.steampowered.com` exact-host
  only; IG/FB/TikTok/X sensitive-not-denied.
- Gate: CLI exits 0 over corpus+roster; `tests/classification-gate.test.js` (10/10 PASS)
  drives the fixture rejection, the SAFE_ALLOWLIST override, benign no-false-positive,
  and explicitly-classified-passes paths. Confirmed `_fixtures/` is excluded from the
  non-recursive corpus sweep and the committed corpus does not false-fail.
- Wall 1: no `.js/.mjs/.cjs/.ts` under `vendor/opentabs-snapshot/`.
- CI wiring: `verify-classification-gate.mjs` is in `validate:extension` and `ci`.

---

_Reviewed: 2026-06-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
