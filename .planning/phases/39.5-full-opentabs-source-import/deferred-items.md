# Deferred Items -- Phase 39.5 (full-opentabs-source-import)

Out-of-scope discoveries logged during execution. NOT fixed in the plan that found them
(SCOPE BOUNDARY: only fix issues DIRECTLY caused by the current task's changes).

---

## DEF-39.5-03-A: `import-classify-gate-call.test.js` end-to-end importer fails classifyGate over the FULL vendored corpus (op-description-level screening)

**Found during:** Plan 39.5-03 (Task 2 verification cross-check).

**Status:** PRE-EXISTING (independent of 39.5-03). Confirmed RED at the plan's baseline
commit `24d73b56` -- the offending origins are absent from BOTH the baseline AND the
39.5-03 denylist, so 39.5-03's denylist edits neither caused nor could fix it.

**Symptom:** `node tests/import-classify-gate-call.test.js` fails ONE assertion --
"importer (node --import tsx) exits 0". The end-to-end importer (`node --import tsx
./scripts/import-opentabs-catalog.mjs`) runs the merge-time `classifyGate` over the FULL
vendored corpus using each app's REAL OP DESCRIPTIONS (not just the host), and several
net-new apps trip a heuristic axis on a description token while being legitimately SAFE:

| Origin | Axis | Token | Note |
|--------|------|-------|------|
| linear.app | health | "health" | dev issue tracker -- benign false-trip |
| retool.com | health | "health" | internal-tools builder -- benign |
| supabase.com | health | "health" | backend-as-a-service -- benign |
| cloud.mongodb.com | finance/payment | "payment"/"billing" | DB cloud -- billing-page read |
| app.netlify.com | finance/payment | "billing" | hosting -- billing-page read |
| app.snowflake.com | finance/payment | "billing" | data warehouse -- billing read |
| vercel.com | finance/payment | "billing" | hosting -- billing read |
| webflow.com | finance/payment | "billing" | site builder -- billing read |
| outlook.cloud.microsoft | finance/payment | "budget" | email/calendar -- benign |
| cloud.temporal.io | social/messaging | "signal" | workflow engine -- benign |
| zillow.com | finance/payment | "tax" | real-estate (already READ_ONLY_SAFE) -- "property tax" read |

**Why out of scope for 39.5-03:** This plan re-screens the ORIGIN set (host-level
classifyGate completeness, the 2 surfaced origins, the commerce roster + backstop) and
does NOT run the import (the plan states "No import here (39.5-04). validate:extension
stays green"). `validate:extension` (the gate this plan must keep green) PASSES exit 0 --
it sweeps the COMMITTED descriptor corpus + the named roster, not a fresh full-corpus
import. The Task-2 full-corpus-screen test screens every real-app ORIGIN (0 failures) the
way the importer gates origins; the op-DESCRIPTION-level false-trips above are a distinct,
larger surface.

**Belongs to:** Plan 39.5-04 (the actual full-source import + per-app op-set
reconciliation). The fix is either (a) SAFE_ALLOWLIST entries for the benign dev/infra
false-trips (linear/retool/supabase/vercel/netlify/snowflake/mongodb/webflow/outlook/
temporal) per the classifyGate fail-closed policy (widen never weaken; a benign
false-positive is fixed via the safe allowlist), or (b) per-app classification decisions
as each batch lands -- exactly the merge-time reconciliation 39.5-04 performs. zillow is
already in READ_ONLY_SAFE_SERVICES; its "tax" trip is the same benign-read class.

**Action taken:** None (logged only). Not fixed in 39.5-03 per the scope boundary.
