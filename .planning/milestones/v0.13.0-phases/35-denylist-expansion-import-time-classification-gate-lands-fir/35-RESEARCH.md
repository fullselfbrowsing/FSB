# Phase 35: Denylist Expansion + Import-Time Classification Gate (LANDS FIRST) - Research

**Researched:** 2026-06-24
**Domain:** Origin-classification data + a fail-closed build-time/CI gate + a narrow consent-router re-gate, all in FSB's v0.9.99 capability substrate. No new runtime libraries; no descriptor import (that is Phase 36).
**Confidence:** HIGH (every integration seam read live on branch `automation`; OpenTabs roster origins read live via authenticated `gh api` against the pinnable commit SHA `4b17021637d2cac12b8d84d21c40e765aa7b85e9`)

## Summary

Phase 35 is a **data + one CI gate + one ~12-line router branch + a provenance scaffold** phase. There are no new npm packages, no new MCP tools, no new tiers. The four requirements decompose cleanly: DENY-01/02 expand `extension/config/service-denylist.json` (pure JSON data; the `service-denylist.js` loader is untouched); DENY-03 adds a `classify()`-backed fail-closed gate script chained into `validate:extension` + a CI test + a proof fixture; DENY-04 re-introduces a single mutating-elevation branch into `capability-router._evaluateConsent` scoped to `classify(origin).sensitive === true`. Criterion 5 vendors a pinned MIT OpenTabs metadata snapshot (`vendor/opentabs-snapshot/PIN.md` mirroring `.planning/LATTICE-PIN.md`) + a `_provenance.json` scaffold + a `docs/LEGAL.md` "Categorization Axes" subsection.

All five genuinely-open questions resolved with HIGH confidence. The OpenTabs pin SHA and exact MIT copyright line are verified. Every named roster app's concrete origin is read from its live `package.json.opentabs.urlPatterns` — and three of them break the naive `https://*.domain` assumption (fidelity → `digital.fidelity.com`, stripe → `dashboard.stripe.com`, plus a cluster of single-host apps), so the denylist must use **exact-host patterns** for those, not subdomain wildcards. The fail-closed gate's heuristic keys off keyword matching on the descriptor's `service`/`slug`/`description` against a finance/payment/health/social/media/adult vocabulary; an origin that trips the heuristic but is not explicitly classified denied/sensitive/safe fails the build.

**Primary recommendation:** Land the denylist data first (DENY-01/02) using the exact-host patterns documented in §"Roster → Origins"; author a standalone `scripts/verify-classification-gate.mjs` (consuming `service-denylist.js classify()` + a keyword heuristic) chained into `validate:extension` with a paired `tests/classification-gate.test.js` and a `catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json`; insert the DENY-04 branch into `_evaluateConsent` immediately after the `mode === 'ask'` step and before the final `return { decision: 'allow' }`, scoped to `classify(origin).sensitive && mutating && !mutatingAllowed`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Origin denied/sensitive classification (data) | Config data (`service-denylist.json`) | — | Closed-vocab JSON; the loader is the single source of truth, data is user-extensible |
| Origin classification logic | SW util (`service-denylist.js classify()`) | — | Pure synchronous classifier already exists; Phase 35 adds NO code here, only data it reads |
| Build-time/CI classification gate | Build script (Node ESM) + CI test | — | Mirrors `verify-recipe-path-guard.mjs`; runs at `validate:extension`, never ships in the extension |
| Sensitive-write re-gate (DENY-04) | SW util (`capability-router._evaluateConsent`) | Consent store (mutating flag) | The single consent chokepoint both front doors share (INV-02); reads `classify().sensitive` + the per-origin `mutating` flag |
| Provenance / vendored snapshot | Repo artifact (`vendor/opentabs-snapshot/`) | Docs (`docs/LEGAL.md`) | Hermetic/offline build input for Phase 36; auditable MIT provenance |

## Standard Stack

**No new packages are installed in Phase 35.** This phase is data + scripts + a router edit + a docs/provenance scaffold. The build-time codegen stack (zod / tsx / @opentabs-dev/plugin-sdk) is a **Phase 36** concern and is out of scope here per CONTEXT (`## Out of scope`).

### Core (all pre-existing, reused unchanged)
| Asset | Version | Purpose | Why Standard |
|-------|---------|---------|--------------|
| `extension/utils/service-denylist.js` | in-repo | `classify(origin) -> {sensitive,denied,reason}` loader/classifier | [VERIFIED: read live] D-14 single source of truth; Phase 35 adds DATA only, code untouched |
| `extension/utils/capability-router.js` | in-repo | `_evaluateConsent` consent chokepoint | [VERIFIED: read live] INV-02 both front doors; Phase 35 re-adds one branch |
| Node `>=24` (ESM) | engines floor | run the new gate script | [VERIFIED: package.json engines] already the FSB floor |
| `gh` CLI (authenticated) | host tool | resolve OpenTabs SHA + license + roster origins at research/author time | [VERIFIED: ran live] confirmed working against `repos/opentabs-dev/opentabs` |

### Supporting (test + CI infra, pre-existing patterns)
| Pattern | Purpose | When to Use |
|---------|---------|-------------|
| Standalone node test (`node tests/<name>.test.js`, `PASS=/FAIL=`, `process.exit(1)`) | DENY-01..04 proofs | every test file this phase ([VERIFIED: read `tests/service-denylist.test.js`, `tests/consent-mutation-gate.test.js`]) |
| `scripts/verify-recipe-path-guard.mjs` shape | template for the fail-closed gate script | `scripts/verify-classification-gate.mjs` mirrors its CI-gate structure (exit non-zero + named offender) |
| `validate:extension` npm script | CI chain point for the gate | `node scripts/validate-extension.mjs && node scripts/verify-recipe-path-guard.mjs` → append `&& node scripts/verify-classification-gate.mjs` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Exact-host pattern for fidelity/stripe | `https://*.fidelity.com` subdomain wildcard | Over-broad: denies all of fidelity.com / dashboard-vs-api confusion. Use exact host to match OpenTabs' own `urlPatterns` scope. (See §Pitfall 1.) |
| Keyword heuristic in the gate | A maintained per-app sensitivity table | The table is the *deferred* full-coverage work (batches 37-39). The heuristic is the **fail-closed backstop** that makes an *un-tabled* sensitive origin a build failure — both are needed; the heuristic is what DENY-03 actually requires now. |
| Gate as a standalone `.mjs` | Folding into `validate-extension.mjs` | Keep it standalone (one responsibility, easy to unit-test via the CI test, mirrors `verify-recipe-path-guard.mjs`); chain it in `validate:extension`. |

**Installation:** None. (Phase 35 installs no packages.)

## Package Legitimacy Audit

**Not applicable — Phase 35 installs zero external packages.** All assets are in-repo (`service-denylist.js`, `capability-router.js`) or host tools already present (`node`, `gh`). The OpenTabs metadata vendored under `vendor/opentabs-snapshot/` is **data, not a dependency** (no `npm install`, never imported at runtime — Wall 1), pinned by commit SHA with an MIT license file. The codegen package stack (zod/tsx/@opentabs-dev/plugin-sdk) is a Phase 36 concern and must run its own legitimacy audit there.

*slopcheck gate skipped: no install step exists in this phase.*

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Scope now:** Classify the explicitly-named DENY-01/02 roster + obvious finance/ToS origins. Full per-app classification of all 119 apps is deferred to batches 37-39; each batch is gated on its origins being classified (DENY-03).
- **Origin pattern form:** Reuse the existing `https://*.domain` subdomain-wildcard form already used in `service-denylist.json` (no new matcher syntax). *(Researcher note: the loader ALSO supports an exact-host form `https://host.domain.com` with no `*` — this is required for three roster apps; see §Roster→Origins. This is not new syntax; it is the existing exact-origin branch of the SAME matcher.)*
- **instagram / facebook / tiktok / x:** Classify as **sensitive** (NOT fully denied). Reads run under Auto; writes are mutating-gated through posture B (DENY-04) + the descriptor's side-effect class. Fully-denied is reserved for categorically-prohibited origins.
- **deniedOrigins (categorically prohibited):** brokerage/trading — robinhood, fidelity, carta; ToS-hostile media/social — netflix, spotify, twitch, steam, youtube-music, tinder, onlyfans. Each named in `docs/LEGAL.md` ToS-axis.
- **Classification gate:** A `classify()`-backed gate function + a CI test land in THIS phase (the Phase-36 importer will consume the gate; it does not exist yet). Gate logic keyed off `service-denylist.js classify(origin)` returning denied/sensitive/safe.
- **Fail-closed trigger:** An origin matching a sensitivity heuristic (finance/payment/health/social/media/adult keyword in domain or app metadata) but lacking an explicit denied/sensitive/safe classification fails the build. Genuinely-safe origins default to safe.
- **Failure UX:** Non-zero exit code, naming the offending origin and suggesting a classification.
- **Proof fixture:** A deliberately-unclassified sensitive fixture origin the gate MUST reject.
- **Sensitive-write re-gate:** Re-introduce a mutating-elevation branch in `capability-router._evaluateConsent`, scoped to `classify(origin).sensitive === true`. A WRITE to a sensitive origin without the per-origin mutating flag returns the existing dual-field `RECIPE_CONSENT_MUTATING_REQUIRED`. Reads pass under Auto everywhere; non-sensitive writes pass; only sensitive writes are re-gated.
- **Sensitivity source of truth:** `classify(origin).sensitive` from `service-denylist.js` (single source of truth; the D-14 pattern, restored for the sensitive subset only).
- **Provenance scaffold:** Phase 35 lands `vendor/opentabs-snapshot/PIN.md` (commit SHA + MIT license text) and a `_provenance.json` scaffold. Actual metadata-file vendoring + descriptor extraction is Phase 36. Only metadata is ever vendored; OpenTabs `dist/`/`handle()` runtime is never shipped (Wall 1).
- **docs/LEGAL.md:** Add a "Categorization Axes" subsection naming three distinct criteria: (1) finance/gov denial, (2) ToS-hostility denial, (3) sensitivity (Ask / mutating-gated).

### Claude's Discretion
- Exact heuristic keyword list + match mechanism for the fail-closed gate.
- Internal structure of `_provenance.json` (kept minimal/scaffold for Phase 36 to extend).
- Test file names and the precise fixture origin used to prove fail-closed.

### Deferred Ideas (OUT OF SCOPE)
- The descriptor importer + actual OpenTabs metadata vendoring → Phase 36 (CGEN-01).
- Full per-app classification of all 119 apps → batches 37-39 (incremental, gated on DENY-03).
- Per-app CORS / first-party-origin verification for separate-API-origin ports → Phases 40-41.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DENY-01 | `deniedOrigins` hard-blocks categorically-prohibited OpenTabs apps (brokerage robinhood/fidelity/carta; ToS-hostile netflix/spotify/twitch/steam/youtube-music/tinder/onlyfans; write-paths of IG/FB/TikTok/X — classified sensitive not denied per CONTEXT) | §Roster→Origins gives every concrete origin (verified live); §Pitfall 1 covers the exact-host nuance for fidelity/stripe/etc.; §Validation Architecture maps the per-origin `denied` assertion |
| DENY-02 | `sensitiveOrigins` covers allowed-but-sensitive tier (payments stripe/coinbase/twilio; budgeting ynab; messaging-app writes; finance reads) | §Roster→Origins gives stripe→`dashboard.stripe.com`, coinbase, twilio→`console.twilio.com`, ynab→`app.ynab.com` + messaging origins; §Validation Architecture maps the `classify().sensitive` roster test |
| DENY-03 | Build-time + CI classification gate refuses to emit a descriptor whose origin is unclassified; an unclassified sensitive-or-ToS origin fails the build (fail-closed) | §Fail-Closed Classification Gate gives the script design, the keyword heuristic, the CI chain point, and the failing fixture |
| DENY-04 | Sensitive origins re-enforce per-origin mutating opt-in (posture B): reads run under Auto; a sensitive-origin WRITE requires the per-origin mutating flag; non-sensitive stay fully-open | §Posture-B Re-Gate Diff gives the exact ~12-line branch, its insertion point relative to steps 1-4, and the INV-03 byte-equality constraint |

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────────┐
   BUILD / CI TIME       │  npm run validate:extension                      │
                         │   validate-extension.mjs                         │
                         │   && verify-recipe-path-guard.mjs                │
                         │   && verify-classification-gate.mjs  ★NEW        │
                         └───────────────┬─────────────────────────────────┘
                                         │ reads
              ┌──────────────────────────▼───────────────────────────┐
              │ scripts/verify-classification-gate.mjs  ★NEW          │
              │  for each origin in {descriptor corpus ∪ roster}:     │
              │    c = FsbServiceDenylist.classify(origin)            │
              │    h = sensitivityHeuristic(service, slug, desc)      │
              │    if h.suspect && !c.denied && !c.sensitive          │
              │       && !explicitlySafe(origin):                     │
              │         FAIL(origin, suggested classification)        │ ──► exit 1
              └──────────────┬───────────────────────┬───────────────┘
                  reads data │                        │ proven by
        ┌────────────────────▼──────┐   ┌─────────────▼──────────────────────┐
        │ extension/config/         │   │ catalog/descriptors/_fixtures/      │
        │ service-denylist.json ◆MOD│   │ unclassified-sensitive.fixture.json │
        │  deniedOrigins[] (DENY-01)│   │   (DENY-03 fail-closed proof)       │
        │  sensitiveOrigins[](DENY-02)  └─────────────────────────────────────┘
        └────────────┬──────────────┘
                     │ loaded at SW boot (UNCHANGED loader)
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
   RUNTIME           │ classify(origin)
        ┌────────────▼───────────────────────────────────────────────────────┐
        │ capability-router.invoke(slug, args, {origin, tabId})  [INV-02]     │
        │  └─ _evaluateConsent(params):                                       │
        │      (1) denylist.isDenied → RECIPE_CONSENT_BLOCKED  (hard floor)   │
        │      (2) mode 'off'  → RECIPE_CONSENT_REQUIRED                      │
        │      (3) mode 'ask'  → RECIPE_CONSENT_REQUIRED                      │
        │      (3.5) ★NEW DENY-04: classify(origin).sensitive && mutating     │
        │            && !mutatingAllowed → RECIPE_CONSENT_MUTATING_REQUIRED   │
        │      (4) auto → allow  (reads everywhere; non-sensitive writes)     │
        └─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (deltas only)
```
extension/config/
  service-denylist.json              # ◆MOD: deniedOrigins + sensitiveOrigins expanded (DENY-01/02)
extension/utils/
  capability-router.js               # ◆MOD: re-add mutating-elevation branch, scoped to sensitive (DENY-04)
  service-denylist.js                # UNCHANGED (data-only change above)
scripts/
  verify-classification-gate.mjs     # ★NEW: fail-closed classification gate (DENY-03), chained into validate:extension
catalog/descriptors/
  _provenance.json                   # ★NEW: provenance scaffold (Phase 36 extends)
  _fixtures/
    unclassified-sensitive.fixture.json  # ★NEW: DENY-03 fail-closed proof fixture
vendor/opentabs-snapshot/            # ★NEW dir
  PIN.md                             # ★NEW: SHA 4b17021637... + MIT license text (mirror .planning/LATTICE-PIN.md)
docs/
  LEGAL.md                           # ◆MOD: add "Categorization Axes" subsection
tests/
  service-denylist.test.js           # ◆MOD: assert each denied/sensitive roster origin classifies correctly
  consent-mutation-gate.test.js      # ◆MOD: add posture-B sensitive-write block + non-sensitive-write allow cases
  classification-gate.test.js        # ★NEW: DENY-03 gate behavior + fixture rejection (CI test)
```

### Pattern 1: Data-only denylist expansion (DENY-01/02)
**What:** Append origins to `deniedOrigins[]` and `sensitiveOrigins[]` in `service-denylist.json`. The `service-denylist.js` matcher already supports both pattern forms; no code change.
**When to use:** All roster classification this phase.
**Matcher contract (verified, LOCKED):**
```js
// extension/utils/service-denylist.js _parsePattern + _matchesPattern (read live)
// 'https://*.robinhood.com' -> { kind:'suffix', host:'robinhood.com' }
//    matches the apex robinhood.com AND any subdomain *.robinhood.com
// 'https://dashboard.stripe.com' (NO '*') -> { kind:'exact', host:'dashboard.stripe.com' }
//    matches ONLY that exact host (scheme must match)
// '*' anywhere other than a leading '*.' -> null (unsupported -> no match)
```
[VERIFIED: read live `extension/utils/service-denylist.js:84-113`]

### Pattern 2: classify()-backed fail-closed gate (DENY-03)
**What:** A standalone Node ESM script that loads `service-denylist.js`, enumerates the origins a descriptor corpus would emit, and fails the build when an origin trips a sensitivity heuristic but is not explicitly classified. Mirrors `verify-recipe-path-guard.mjs` (the established CI-gate pattern).
**When to use:** Authored now (Phase 35); consumed by the Phase-36 importer when it exists.
**Key insight:** "a gap in the JSON array is indistinguishable from an allow decision" must become a CI failure. The heuristic is the backstop; the explicit classification is the override.

### Pattern 3: Scoped consent re-gate (DENY-04, posture B)
**What:** Re-introduce ONE branch in `_evaluateConsent`, between step (3) `ask` and step (4) `auto→allow`, that fires only when `classify(origin).sensitive && isMutating && !mutatingAllowed`. Returns the dual-field `RECIPE_CONSENT_MUTATING_REQUIRED` via the existing `_err` helper.
**When to use:** This is the headline security control of the milestone.

### Anti-Patterns to Avoid
- **Broadening fidelity/stripe to `*.fidelity.com` / `*.stripe.com`:** over-blocks and confuses dashboard-vs-API scope. Use the exact host OpenTabs itself targets (§Pitfall 1).
- **Putting the heuristic keyword list in the UI or the router:** the classifier (`service-denylist.js`) + the gate script are the source of truth (D-14). The router only reads `classify().sensitive`.
- **Re-applying the mutating gate to non-sensitive origins:** that would revert the whole opt-out posture, not narrow it. Scope strictly to `classify().sensitive === true`.
- **Letting the gate fail-OPEN on a genuinely-safe unclassified origin:** benign apps default to safe; only heuristic-suspect-AND-unclassified fails. (Fail-closed is for sensitivity-suspect origins, not all unknowns — re-read CONTEXT Area 2.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Origin pattern matching | A new glob/regex matcher | The existing `service-denylist.js _matchesPattern` (suffix + exact forms) | [VERIFIED] Already handles scheme + apex + subdomain + exact; on `RECIPE_PATH_ALLOWLIST`, dynamic-code-free; tested |
| Sensitivity source of truth | A second sensitivity flag in the router/UI | `FsbServiceDenylist.classify(origin).sensitive` | D-14 single source of truth; the router already reaches it via `_denylist()` typeof-guarded accessor |
| Typed consent error shape | A new error object | The `_err(code, extra)` helper → dual-field `{success:false, code, errorCode, error}` | INV-03: only this shape survives the `/^RECIPE_.+$/` MCP passthrough byte-equal across 7 providers |
| CI gate scaffolding | A bespoke CI runner | The `verify-recipe-path-guard.mjs` script shape + `validate:extension` chain | Established pattern: exit non-zero, name the offender, runs in the same `ci` aggregate |
| OpenTabs roster origins | Guessing domains from app names | The live `package.json.opentabs.urlPatterns` per app (pinned SHA) | Several origins are non-obvious (digital.fidelity.com, dashboard.stripe.com, store.steampowered.com) |

**Key insight:** Phase 35 writes almost no new logic — it writes *data* (`service-denylist.json`, `_provenance.json`, `PIN.md`), *one CI script* that composes existing primitives, and *one router branch*. The complexity is in getting the roster origins exactly right and scoping the re-gate precisely; both are resolved below.

## Genuinely-Open Questions — RESOLVED

### Q1 — OpenTabs SHA + License (criterion 5, PIN.md)

[VERIFIED: gh api `repos/opentabs-dev/opentabs/commits/main` 2026-06-24]

- **Pin-able commit SHA:** `4b17021637d2cac12b8d84d21c40e765aa7b85e9`
- **Commit date:** `2026-06-21T21:54:20Z`
- **Commit subject:** `chore: auto-publish plugin version bumps [skip ci]` (the publish commit that bumps all 119 plugins — a clean, stable pin point)
- **License:** **MIT** — [VERIFIED: gh api `repos/opentabs-dev/opentabs/license` → `spdx_id: MIT`, `path: LICENSE`]
- **Exact copyright line:** `Copyright (c) 2026-present OpenTabs Contributors` [VERIFIED: decoded `contents/LICENSE`]

**PIN.md format (mirror `.planning/LATTICE-PIN.md`):** that file uses YAML frontmatter (`current_*` keys: source/package/version/sha/tag) + a prose body + a per-phase log table. For `vendor/opentabs-snapshot/PIN.md`, the planner should adapt the SAME discipline:
```markdown
---
current_opentabs_source: github
current_opentabs_repo: github.com/opentabs-dev/opentabs
current_opentabs_sha: 4b17021637d2cac12b8d84d21c40e765aa7b85e9
current_opentabs_ref: main
current_opentabs_pinned_at: "2026-06-21T21:54:20Z"
current_opentabs_license: MIT
schema_version: 1
---

# OpenTabs Snapshot Pin -- FSB <-> OpenTabs metadata provenance

**Current source:** github.com/opentabs-dev/opentabs @ 4b17021637d2cac12b8d84d21c40e765aa7b85e9 (main, 2026-06-21)
**License:** MIT -- Copyright (c) 2026-present OpenTabs Contributors

## MIT License (verbatim)
<full MIT text with the copyright line above>

## Per-FSB-Phase Log
| FSB Phase | Date | OpenTabs SHA | Metadata vendored | Notes |
| Phase 35  | 2026-06-24 | 4b170216... | (none yet -- scaffold only; metadata files land in Phase 36) | PIN + license scaffold |
```
**Full MIT text:** fetch via `gh api repos/opentabs-dev/opentabs/contents/LICENSE --jq .content | base64 -d` at author time (the first 8 lines are confirmed above; embed the whole file). Confidence: HIGH.

### Q2 — Roster → Origins (DENY-01/02 concrete domains)

[VERIFIED: each read live from `gh api .../plugins/<app>/package.json?ref=4b170216...` → `.opentabs.urlPatterns` + `.homepage`, 2026-06-24]

**deniedOrigins (DENY-01 — categorically prohibited):**

| App | urlPatterns (verified) | Denylist pattern to add | Form |
|-----|------------------------|--------------------------|------|
| robinhood | `*://*.robinhood.com/*` | `https://*.robinhood.com` | suffix |
| fidelity | `*://digital.fidelity.com/*` | `https://digital.fidelity.com` | **exact** ⚠ |
| carta | `*://app.carta.com/*` | `https://app.carta.com` | **exact** ⚠ |
| netflix | `*://*.netflix.com/*` | `https://*.netflix.com` | suffix |
| spotify | `*://open.spotify.com/*` | `https://open.spotify.com` | **exact** ⚠ |
| twitch | `*://*.twitch.tv/*` | `https://*.twitch.tv` | suffix |
| steam | `*://store.steampowered.com/*` | `https://store.steampowered.com` | **exact** ⚠ |
| youtube-music | `*://music.youtube.com/*` | `https://music.youtube.com` | **exact** ⚠ (do NOT use `*.youtube.com` — would catch youtube proper) |
| tinder | `*://*.tinder.com/*` | `https://*.tinder.com` | suffix |
| onlyfans | `*://*.onlyfans.com/*` | `https://*.onlyfans.com` | suffix |

**sensitiveOrigins (DENY-02 — allowed-but-sensitive) + the IG/FB/TikTok/X "sensitive-not-denied" set:**

| App | urlPatterns (verified) | Sensitive pattern to add | Form | Category |
|-----|------------------------|---------------------------|------|----------|
| stripe | `*://dashboard.stripe.com/*` | `https://dashboard.stripe.com` | **exact** ⚠ | payments (dashboard origin, NOT api.stripe.com) |
| coinbase | `*://*.coinbase.com/*` | `https://*.coinbase.com` | suffix | payments/crypto |
| twilio | `*://console.twilio.com/*` | `https://console.twilio.com` | **exact** ⚠ | payments/messaging-infra |
| ynab | `*://app.ynab.com/*` | `https://app.ynab.com` | **exact** ⚠ | budgeting (finance read/write) |
| instagram | `*://*.instagram.com/*` | `https://*.instagram.com` | suffix | social (writes mutating-gated) |
| facebook | `*://*.facebook.com/*` | `https://*.facebook.com` | suffix | social |
| tiktok | `*://*.tiktok.com/*` | `https://*.tiktok.com` | suffix | social |
| x | `*://*.x.com/*` | `https://*.x.com` | suffix | social |

**Messaging-app writes (DENY-02 "messaging-app writes") + finance-read candidates — recommended sensitive additions (verified origins; planner confirms inclusion against the "named roster now, breadth deferred" scope line):**

| App | urlPatterns (verified) | Sensitive pattern | Form | Note |
|-----|------------------------|--------------------|------|------|
| whatsapp | `*://web.whatsapp.com/*` | `https://web.whatsapp.com` | exact | messaging |
| telegram | `*://web.telegram.org/*` | `https://web.telegram.org` | exact | messaging |
| slack | `*://*.slack.com/*` | `https://*.slack.com` | suffix | messaging (already partly bundled in FSB head) |
| discord | `*://discord.com/*` | `https://discord.com` | exact | messaging |
| teams | `*://teams.live.com/*`, `*://teams.microsoft.com/*`, `*://teams.cloud.microsoft/*` | three exact patterns | exact ×3 | messaging (multi-origin) |

**Existing FSB denylist seed (do not remove — these are FSB's own, not OpenTabs apps):** `chase`, `bankofamerica`, `wellsfargo`, `irs.gov` (denied); + `mail.google.com`, `outlook.live.com`, `outlook.office.com`, `*.gov` (sensitive). [VERIFIED: read live `service-denylist.json`]. `chase` is NOT an OpenTabs plugin — confirmed the OpenTabs plugin dir has no `chase`.

**Decision needed from planner (flagged in §Open Questions):** the exact membership of "messaging-app writes" and "finance reads" in DENY-02. CONTEXT says "classify the explicitly-named DENY-01/02 roster + obvious finance/ToS origins." The explicitly-named payments/budgeting set (stripe/coinbase/twilio/ynab) is unambiguous. The messaging origins above are the natural "messaging-app writes" set; include them as sensitive so their writes are mutating-gated under posture B (their reads still run under Auto). Confidence: HIGH on origins, MEDIUM on exact membership scope (a discretion call the planner/discuss-phase should lock).

### Q3 — Fail-Closed Classification Gate (DENY-03)

**Where it lives:** `scripts/verify-classification-gate.mjs` (★NEW), chained into `validate:extension`:
```
"validate:extension": "node scripts/validate-extension.mjs && node scripts/verify-recipe-path-guard.mjs && node scripts/verify-classification-gate.mjs"
```
[VERIFIED: current `validate:extension` = the first two; `ci` = `npm run validate:extension && npm test && ...`, so the gate runs in both `validate:extension` and the `ci` aggregate.]

**What it iterates:** In Phase 35 there is no importer yet, so the gate operates over **the existing committed descriptor corpus (`catalog/descriptors/*.json`) ∪ the named roster origins ∪ the fixture**. Each descriptor carries a `service`/origin field (verified shape: `catalog/descriptors/github-issues-create.json` has `slug`, `service`, `sideEffectClass`, `params`). The gate derives the origin from the descriptor's `service` (e.g. `github.com` → `https://github.com`) — and additionally accepts an explicit list of roster origins to check. Phase 36's importer will feed it the full 2,523-descriptor corpus; the gate's signature must therefore accept "a list of {origin, service, slug, description}" so Phase 36 can call it programmatically (export a `classifyGate(items) -> {failures[]}` function AND run as a CLI when invoked directly — the dual-export idiom).

**Gate algorithm (the load-bearing logic):**
```
load FsbServiceDenylist (require ../extension/utils/service-denylist.js) ; await load()
SAFE_ALLOWLIST = explicit set of origins curated safe (optional; defaults empty -> "safe by default")
for each item {origin, service, slug, description}:
  c = classify(origin)                       // {sensitive, denied}
  if c.denied || c.sensitive: continue        // explicitly classified -> OK
  suspect = sensitivityHeuristic(service, slug, description, origin)
  if suspect && !SAFE_ALLOWLIST.has(origin):
     FAIL: `origin <origin> (<service>) trips sensitivity heuristic [<matched keyword>]
            but is not classified denied/sensitive. Add it to deniedOrigins or
            sensitiveOrigins in service-denylist.json, or to the safe allowlist if benign.`
if any FAIL: process.exit(1)
```

**The sensitivity heuristic (Claude's discretion — recommended keyword vocabulary):** match case-insensitively against the **domain host + slug + description text**. Group the vocabulary by axis so the failure message can suggest the right bucket:

| Axis | Keywords (substring/token match on host + metadata) |
|------|------------------------------------------------------|
| finance/payment | `bank`, `pay`, `payment`, `wallet`, `invoice`, `billing`, `card`, `stripe`, `coinbase`, `crypto`, `broker`, `trade`, `trading`, `fund`, `portfolio`, `tax`, `budget`, `ynab`, `venmo`, `paypal`, `wise`, `fidelity`, `robinhood`, `schwab`, `carta`, `treasury` |
| health | `health`, `clinic`, `patient`, `medical`, `pharmacy`, `rx`, `insur`, `dental`, `therapy`, `medicare`, `medicaid` |
| social/messaging | `instagram`, `facebook`, `tiktok`, `twitter`, `whatsapp`, `telegram`, `messenger`, `snapchat`, `discord`, `linkedin`, `dm`, `direct-message`, `slack`, `signal` |
| media (ToS-hostile) | `netflix`, `spotify`, `twitch`, `youtube`, `steam`, `hulu`, `disney`, `primevideo`, `hbo`, `music` |
| adult/dating | `onlyfans`, `tinder`, `bumble`, `hinge`, `grindr`, `adult`, `nsfw`, `dating`, `escort` |
| government | `.gov`, `irs`, `dmv`, `ssa`, `uscis`, `medicare`, `passport` |

Match mechanism: build one `RegExp` per axis as a word/substring alternation (`\b(bank|pay|...)`); test against `host.toLowerCase() + ' ' + slug + ' ' + description`. A host-suffix axis like government also checks `host.endsWith('.gov')`. Tune by running the gate over the full 119-app universe (§"119-app universe" below) and confirming: (a) every known-sensitive app trips it, (b) genuinely-benign apps (airtable, asana, wikipedia, hackernews) do NOT. The heuristic is **fail-closed**: a false positive on a benign app is fixed by classifying it safe (add to the SAFE_ALLOWLIST) — never by weakening the heuristic. Confidence: MEDIUM (keyword lists are inherently a discretion call; the *mechanism* and fail-closed posture are HIGH).

**The proof fixture (DENY-03 success criterion):** `catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json` — a descriptor for a fabricated origin that trips the heuristic but is intentionally absent from `service-denylist.json`. Recommended:
```json
{
  "slug": "fixture-payments.send_payment",
  "service": "pay.unclassified-fixture.test",
  "description": "Send a payment from the user's wallet (fail-closed gate fixture)",
  "actionVerb": "send",
  "sideEffectClass": "write",
  "params": { "type": "object", "properties": {}, "additionalProperties": false },
  "_fixture": "DENY-03: this origin MUST be rejected by verify-classification-gate.mjs unless explicitly classified"
}
```
The host `pay.unclassified-fixture.test` trips the finance axis (`pay`, `payment`, `wallet`) and is on no list → the gate must exit non-zero naming it. The CI test (`tests/classification-gate.test.js`) runs the gate against `[fixture]` and asserts a failure is reported; then runs it against `[fixture]` WITH the fixture origin added to a sensitive list and asserts it passes (proving the override works). The fixture must NOT be picked up by the real `catalog/descriptors` corpus that ships — keep it under `_fixtures/` which `package-extension.mjs`'s `readJsonDir(catalog/descriptors)` must not recurse into. [VERIFIED: `_fixtures/` already exists as a sibling holding `seed-descriptors.json` etc., and `validate-extension.mjs` reads `readJsonDir(join(catalogRoot,'descriptors'))` — confirm `readJsonDir` is non-recursive so `_fixtures/` is excluded; if it recurses, the fixture must live outside `descriptors/` e.g. `catalog/_gate-fixtures/`.]

**How Phase 36 consumes it:** the Phase-36 importer (`scripts/import-opentabs-catalog.mjs`, does not exist yet) imports `classifyGate` from this module and calls it on the full extracted descriptor set BEFORE writing any descriptor JSON — refusing to emit a descriptor for an unclassified sensitive origin. The CLI invocation in `validate:extension` is the CI backstop. Designing the gate as `export { classifyGate }` + CLI-on-direct-run makes both paths reuse the same logic. Confidence: HIGH on the structure.

### Q4 — Posture-B Re-Gate Diff (DENY-04)

[VERIFIED: read live `capability-router.js:359-463` (`_evaluateConsent`) + `consent-policy-store.js getConsentForOrigin` returning `{mode, mutating}`]

**Current step order in `_evaluateConsent` (verified):**
1. denylist `isDenied` → `RECIPE_CONSENT_BLOCKED` (lines 383-394)
2. store absent → Phase-29 harness allow OR fail-closed `off` (405-415); null origin → `off` (418-425)
3. `mode === 'off'` → `RECIPE_CONSENT_REQUIRED` (434-441)
4. `mode === 'ask'` → `RECIPE_CONSENT_REQUIRED` (444-451)
5. (auto) → `return { decision:'allow' }` (462) — **this is where the former mutating-elevation gate was removed in `68ceea90`**

`mutating` is ALREADY computed at the top of the function (line 366: `var mutating = _isMutatingSideEffect(sideEffectClass) || !!MUTATING_METHODS[method];`) and `mutatingAllowed` is ALREADY read (line 431: `var mutatingAllowed = !!(consent && consent.mutating);`). Both variables exist and are currently unused under auto — the comment at lines 458-460 explicitly notes they "remain computed for back-compat but are no longer consulted here." **The re-gate just consults them again, scoped to sensitive.**

**Exact insertion point:** immediately AFTER the `mode === 'ask'` block (line 451) and BEFORE the final `return { decision:'allow' ... }` (line 462). This is "step 3.5" — after off/ask opt-out paths, before the auto-allow. The branch:

```js
// (3.5) ★NEW DENY-04 (posture B): a WRITE to a SENSITIVE (non-denied) origin
//       re-enforces the per-origin mutating opt-in. Reads pass; non-sensitive
//       writes pass; only sensitive writes without the per-origin mutating flag
//       are re-gated. This NARROWS the opt-out base from 68ceea90 to sensitive
//       origins only -- the deliberate posture-B refinement. classify().sensitive
//       (D-14) is the single source of truth.
if (mutating && !mutatingAllowed) {
  var cls = null;
  if (denylist && typeof denylist.classify === 'function') {
    try { cls = denylist.classify(origin); } catch (_e) { cls = null; }
  }
  if (cls && cls.sensitive === true) {
    return {
      decision: 'mutating_required',
      method: method,
      sideEffectClass: sideEffectClass,
      error: _err('RECIPE_CONSENT_MUTATING_REQUIRED', { origin: origin, slug: slug })
    };
  }
}
```

**Critical INV-03 detail — the typed-reason code.** CONTEXT/criteria call this `RECIPE_CONSENT_MUTATING_REQUIRED`. The pre-`68ceea90` router used this exact code; the consent-mutation-gate test currently asserts the *relaxed* behavior. The planner MUST:
- Confirm the exact string the v0.9.99 gate used (`git show <pre-68ceea90>:extension/utils/capability-router.js` to recover the removed branch — it was `RECIPE_CONSENT_MUTATING_REQUIRED` per the commit message "mutating-elevation (GOV-03/D-04) gates"). Re-use it BYTE-FOR-BYTE so INV-03 holds (typed reasons byte-equal across the 7 universal-provider targets).
- The dual-field `_err` shape (`{success:false, code, errorCode, error}`) is mandatory (lines 61-69) — it is the only shape that survives the `/^RECIPE_.+$/` MCP passthrough.

**The `decision` label.** The `invoke` caller (lines 674-681) treats ANY `verdict.decision !== 'allow'` as blocked and returns `verdict.error` verbatim + audits it. So a new label like `'mutating_required'` flows through correctly (it is `!== 'allow'`). Audit gets `consentDecision = verdict.consentDecision || verdict.decision` → `'mutating_required'`. The planner may alternatively reuse `decision:'ask'` to minimize new vocabulary, but a distinct `'mutating_required'` label is clearer for the audit trail and tests; either works because the caller only checks `!== 'allow'`. Recommend the distinct label.

**Where `entry`/`method` come from for the sensitivity decision:** `_evaluateConsent` already receives `entry` and computes `method`/`sideEffectClass`/`mutating` (lines 364-366). The `origin` is `params.origin`. No new inputs needed. `invoke` passes `{origin: c.origin, slug, method, entry}` (line 673) — unchanged.

**Regression surface (tests to update, not just add):**
- `tests/consent-mutation-gate.test.js` [VERIFIED: read live] currently asserts POST-on-Auto → allow and "the per-origin mutating flag is now inert." Under posture B these flip FOR SENSITIVE ORIGINS: the test's `ORIGIN = 'https://github.com'` is NON-sensitive (`classify` stub returns `{sensitive:false}`), so its existing assertions (writes allowed on a non-sensitive origin) STAY GREEN — good, posture B does not touch non-sensitive writes. The planner ADDS new cases with a sensitive-origin stub (`classify() -> {sensitive:true}`) asserting: GET → allow; POST without mutating flag → `mutating_required`/`RECIPE_CONSENT_MUTATING_REQUIRED`; POST WITH `setOriginMutating(origin,true)` → allow.
- `tests/consent-gate.test.js`, `tests/consent-chokepoint.test.js` — re-run; they predate posture B and use non-sensitive or denied origins, so should stay green. Verify no test asserts "sensitive write under auto → allow" (that assertion would now be wrong).

Confidence: HIGH (exact line numbers + variable names verified live; only the typed-code-string recovery is a "confirm against git history" step).

### Q5 — Validation Architecture (see dedicated section below)

## 119-App Universe (for heuristic tuning)

[VERIFIED: `gh api .../plugins?ref=4b170216...`]. Full set (excluding `e2e-test`, `prescript-test` fixtures): airbnb, airtable, amplitude, asana, aws-console, azure, bestbuy, bitbucket, bluesky, booking, calendly, carta, chatgpt, chipotle, circleci, claude, clickhouse, clickup, cloudflare, cockroachdb, coinbase, confluence, costco, craigslist, datadog, discord, docker-hub, dominos, doordash, ebay, excel-online, expedia, facebook, fidelity, figma, fiverr, gemini, github, gitlab, glama, google-analytics, google-calendar, google-cloud, google-docs, google-drive, google-maps, grafana, hack2hire, hackernews, homedepot, instacart, instagram, jira, leetcode, linear, linkedin, lucid, medium, meticulous, microsoft-word, minimax-agent, mongodb-atlas, netflix, netlify, newrelic, notebooklm, notion, npm, onenote, onlyfans, outlook, panda-express, pinterest, posthog, powerpoint, priceline, reddit, redfin, retool, robinhood, sentry, shortcut, slack-enterprise, slack, snowflake, spotify, sqlpad, stackoverflow, starbucks, steam, stripe, supabase, target, teams, telegram, temporal-cloud, terraform-cloud, tiktok, tinder, todoist, tripadvisor, tumblr, twilio, twitch, uber, vercel, walmart, webflow, whatsapp, wikipedia, x, yelp, ynab, youtube-music, youtube, zendesk, zillow.

**Heuristic-suspect apps in this set the gate should flag if unclassified** (use to validate the keyword vocabulary catches them): the named roster (above) + coinbase, ynab, twilio, stripe, all messaging (whatsapp/telegram/discord/teams/slack/linkedin), commerce-with-payment (uber, doordash, instacart, walmart, target, ebay, bestbuy, costco, homedepot, starbucks, dominos, chipotle, panda-express, airbnb, booking, expedia, priceline — these carry checkout/payment flows; per ARCHITECTURE Phase-39, payment-bearing flows are screened/denied/DOM-only). **Benign apps that must NOT trip (false-positive check):** airtable, asana, clickup, todoist, linear, jira, confluence, notion, figma, lucid, wikipedia, hackernews, stackoverflow, leetcode, github, gitlab, bitbucket, vercel, netlify, datadog, sentry, grafana, posthog, amplitude. Note: `youtube` (media keyword) WILL trip the media axis — that is correct (it should be classified, likely sensitive or DOM-only), confirming the heuristic is appropriately conservative.

## Common Pitfalls

### Pitfall 1: Subdomain-wildcard over-broadening for single-host apps
**What goes wrong:** Using `https://*.fidelity.com` (suffix form) when OpenTabs targets only `digital.fidelity.com`; or `https://*.stripe.com` when the app is `dashboard.stripe.com` (and `api.stripe.com` is a DIFFERENT origin FSB never hand-ports). Worst case: `https://*.youtube.com` for youtube-music would ALSO match youtube proper (a different plugin with different classification).
**Why it happens:** The CONTEXT locks "reuse the `https://*.domain` form" — but that is the *default* form, and the loader equally supports the exact-host form. Five denied + four sensitive roster apps need exact-host.
**How to avoid:** Match the denylist pattern to OpenTabs' own `urlPatterns` host scope (verified table in §Roster→Origins). Suffix form ONLY when OpenTabs uses `*://*.domain/*`; exact form when OpenTabs targets a specific subdomain.
**Warning signs:** A denylist pattern broader than the app's actual urlPattern; `music.youtube.com` and `youtube.com` colliding.

### Pitfall 2: Mutating gate reverting the whole posture instead of narrowing it
**What goes wrong:** Re-adding the mutating branch WITHOUT the `classify().sensitive` guard re-gates every write everywhere → undoes `68ceea90` entirely → the consent-mutation-gate non-sensitive cases break.
**Why it happens:** Copy-pasting the pre-`68ceea90` branch verbatim (it was unscoped).
**How to avoid:** The branch fires ONLY inside `if (cls && cls.sensitive === true)`. Non-sensitive writes fall through to `allow`. The existing `tests/consent-mutation-gate.test.js` (non-sensitive `github.com`) is the regression canary — it must stay green.
**Warning signs:** A non-sensitive POST returning `RECIPE_CONSENT_MUTATING_REQUIRED`; consent-mutation-gate failing.

### Pitfall 3: INV-03 typed-reason drift
**What goes wrong:** Using a slightly different code string (`RECIPE_MUTATING_CONSENT_REQUIRED`, `RECIPE_CONSENT_MUTATE_REQUIRED`) → byte-inequality across the 7 universal-provider targets → INV-03 violation; or omitting a field from the dual-field `_err` shape → the code is stripped by the MCP `/^RECIPE_.+$/` passthrough.
**Why it happens:** Re-typing the constant from memory instead of recovering the exact pre-`68ceea90` string.
**How to avoid:** Recover the exact string via `git show` of the removed branch; use the `_err(code, extra)` helper (never hand-build the object). Add an INV-03 assertion (the code surfaces byte-equal) to the test.
**Warning signs:** `capability-mcp-surface.test.js` / provider-parity drift; a `RECIPE_` code not surfacing through the passthrough.

### Pitfall 4: The fail-closed gate fixture leaking into the shipped catalog
**What goes wrong:** Placing `unclassified-sensitive.fixture.json` directly in `catalog/descriptors/` → `package-extension.mjs readJsonDir` inlines it into the shipped index → a fixture origin in production + the gate failing on the real corpus.
**Why it happens:** Assuming `_fixtures/` is auto-excluded.
**How to avoid:** Verify `readJsonDir` is non-recursive (so `catalog/descriptors/_fixtures/` is skipped) OR place the gate fixture outside `descriptors/` entirely (e.g. `catalog/_gate-fixtures/`). The CI test references it by path directly; it never needs to be in the descriptor corpus. [VERIFIED: `_fixtures/` already holds `seed-descriptors.json` as a sibling — confirm exclusion behavior of `readJsonDir`.]
**Warning signs:** `catalogVersion` djb2 hash changing when the fixture is added; the fixture slug appearing in `recipe-index.generated.js`.

### Pitfall 5: Heuristic false-negative — a sensitive app the keyword list misses
**What goes wrong:** A finance/health app whose host + metadata contain none of the keywords (e.g. a brand-name-only domain like `carta.com` if `carta` weren't in the list) slips through as "safe."
**Why it happens:** Brand names aren't generic keywords.
**How to avoid:** The keyword vocabulary includes the named-brand tokens (robinhood, fidelity, carta, stripe, coinbase, ynab, onlyfans, tinder, netflix, spotify, twitch, steam) AND the generic-category tokens. Run the gate over the full 119-app universe and eyeball every "safe" verdict for a missed sensitive app. The fixture proves the mechanism; the 119-app sweep proves the vocabulary coverage.
**Warning signs:** A known-sensitive app in §119-app universe verdicting "safe" in the gate's debug output.

## Code Examples

### Reading classify() in the gate script (verified API)
```js
// scripts/verify-classification-gate.mjs (★NEW)
// Source: extension/utils/service-denylist.js (read live) -- classify(origin) -> {sensitive,denied,reason}
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Denylist = require('../extension/utils/service-denylist.js'); // dual-export: module.exports
await Denylist.load();                       // reads extension/config/service-denylist.json via require path
const c = Denylist.classify('https://dashboard.stripe.com');  // -> { sensitive:true, denied:false, reason:... }
```

### The posture-B branch placement (verified context)
```js
// extension/utils/capability-router.js _evaluateConsent (read live)
// ... after (4) mode === 'ask' block at line ~451, before final return at ~462:
// [INSERT the (3.5) DENY-04 branch from Q4 here]
// From here mode === 'auto'. Non-sensitive reads AND writes still pass:
return { decision: 'allow', method: method, sideEffectClass: sideEffectClass };
```

### Denylist JSON shape (verified — append to these arrays)
```json
// extension/config/service-denylist.json (read live; v:1 envelope)
{ "v": 1,
  "deniedReason": "Automation prohibited for this service category (financial / government). See docs/LEGAL.md.",
  "deniedOrigins": [ "https://*.chase.com", "...existing...",
    "https://*.robinhood.com", "https://digital.fidelity.com", "https://app.carta.com",
    "https://*.netflix.com", "https://open.spotify.com", "https://*.twitch.tv",
    "https://store.steampowered.com", "https://music.youtube.com",
    "https://*.tinder.com", "https://*.onlyfans.com" ],
  "sensitiveOrigins": [ "...existing...",
    "https://dashboard.stripe.com", "https://*.coinbase.com", "https://console.twilio.com",
    "https://app.ynab.com", "https://*.instagram.com", "https://*.facebook.com",
    "https://*.tiktok.com", "https://*.x.com" ] }
```
(The planner may add a second `deniedReason`-style field for the ToS axis, or keep one reason; CONTEXT only requires the origins + the docs/LEGAL.md naming. The current schema has a single `deniedReason` string — consider adding `deniedReasonTos` or documenting the axis split in LEGAL.md only, per discretion.)

## State of the Art

| Old Approach (v0.9.99 pre-68ceea90) | Current (post-68ceea90, opt-out) | Phase 35 (posture B) |
|--------------------------------------|----------------------------------|----------------------|
| Default OFF; sensitive-downgrade + mutating-elevation always applied | Default Auto; denylist the only hard floor; mutating flag inert at gate | Default Auto; denylist hard floor; **mutating flag re-enforced for sensitive-origin writes only** |
| 4 denied / 7 sensitive seed (banks + gov) | same seed | + brokerage/ToS-denied roster, + payments/social/messaging sensitive roster |
| No build-time origin gate | No build-time origin gate | **Fail-closed classification gate in `validate:extension` + CI** |

**Deprecated/outdated:**
- The pre-`68ceea90` unscoped mutating-elevation branch: replaced by the sensitive-scoped re-gate. Recover the exact typed-code string from git history, discard the unscoped guard.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact pre-`68ceea90` typed code is `RECIPE_CONSENT_MUTATING_REQUIRED` (per the commit message naming GOV-03/D-04 "mutating-elevation"); recover byte-exact from git before reuse | Q4 / Pitfall 3 | INV-03 byte-inequality if a different string is used. **Mitigation: `git show` the removed branch — this is a verify step, not a guess.** Tagged ASSUMED until that grep runs. |
| A2 | "Messaging-app writes" in DENY-02 = whatsapp/telegram/discord/teams/slack as sensitive (origins verified; membership inferred from category) | Q2 | If the intended set differs, a messaging app's writes run unguarded (still reads-OK). MEDIUM risk; planner/discuss-phase should lock the exact DENY-02 membership. |
| A3 | "Finance reads" in DENY-02 are covered by classifying the finance origins (robinhood/fidelity/carta denied; coinbase/ynab sensitive) — there is no separate "read-only finance" tier beyond sensitive | Q2 | If a finance read was meant to be allowed-under-Auto-without-mutating-gate, the sensitive classification still permits the read (only writes gate), so low risk. |
| A4 | `readJsonDir` in `package-extension.mjs`/`validate-extension.mjs` is non-recursive, so `catalog/descriptors/_fixtures/` is excluded from the shipped corpus | Q3 / Pitfall 4 | If recursive, the gate fixture leaks into production. **Mitigation: verify `readJsonDir` impl OR place fixture outside `descriptors/`.** Tagged ASSUMED until the impl is read. |
| A5 | The heuristic keyword vocabulary (discretion) catches all sensitive apps in the 119-set without flagging the listed benign apps | Q3 / Pitfall 5 | A false-negative lets a sensitive origin ship unclassified. **Mitigation: the 119-app sweep + the fail-closed fixture; tune the vocabulary against the real set.** |

## Open Questions (RESOLVED)

> All three resolved at plan time — decisions locked in 35-CONTEXT.md and baked into plans 35-01/02/03/04. Per-item markers below.

1. **Exact DENY-02 membership for "messaging-app writes" and "finance reads."** — **RESOLVED:** the full messaging set (whatsapp/telegram/discord/teams/slack/linkedin) is classified sensitive in 35-01 (writes mutating-gated, reads under Auto); no extra finance-read carve-out beyond the sensitive classification.
   - What we know: the payments/budgeting set (stripe/coinbase/twilio/ynab) is unambiguous and verified; messaging origins are verified.
   - What's unclear: whether DENY-02 intends the full messaging set (whatsapp/telegram/discord/teams/slack/linkedin) or a subset, and whether any finance app should be sensitive-but-read-allowed beyond what the sensitive classification already gives.
   - Recommendation: planner locks the membership; default to including the messaging set as sensitive (writes mutating-gated, reads under Auto) — it is the safe direction and matches "messaging-app writes."

2. **Exact typed-reason string for the re-gate (INV-03).** — **RESOLVED:** confirmed byte-exact `RECIPE_CONSENT_MUTATING_REQUIRED` via `git show 68ceea90^:extension/utils/capability-router.js`; reused verbatim (dual-field) in 35-03.
   - What we know: it is the pre-`68ceea90` mutating-elevation code; the commit message + criteria call it `RECIPE_CONSENT_MUTATING_REQUIRED`.
   - What's unclear: byte-exact confirmation requires reading the removed branch.
   - Recommendation: `git show <commit>^:extension/utils/capability-router.js | grep MUTATING` before authoring; reuse byte-for-byte.

3. **`readJsonDir` recursion (fixture isolation).** — **RESOLVED:** verified non-recursive in both `validate-extension.mjs` and `package-extension.mjs`; gate fixture placed under `_fixtures/` in 35-02/35-04, excluded from the shipped corpus.
   - What we know: `_fixtures/` already exists as a sibling holding seed data; `validate-extension.mjs` reads `readJsonDir(catalog/descriptors)`.
   - What's unclear: whether it recurses into `_fixtures/`.
   - Recommendation: read the `readJsonDir` impl in `package-extension.mjs`; if recursive, place the gate fixture at `catalog/_gate-fixtures/`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (ESM) | the gate script + tests | ✓ | >=24 (engines floor) | — |
| `gh` CLI (authenticated) | PIN.md SHA/license + roster origins (author time) | ✓ | ran live | record SHA/license/origins into PIN.md + this RESEARCH so author-time needs no live fetch |
| npm | `validate:extension` / `npm test` chain | ✓ | present | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none required — all roster origins, the SHA, and the license text are captured in this document so Phase 35 authoring is offline/hermetic.

## Validation Architecture

> nyquist_validation is enabled (no `workflow.nyquist_validation:false` in config.json; config shows the v0.10.0 workflow block with no such key → treat as enabled). Test convention: standalone node scripts, `PASS=/FAIL=` summary, `process.exit(1)` on fail; full `npm test` is the CI gate.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Zero-framework standalone node scripts (`node tests/<name>.test.js`); NOT Jest |
| Config file | none — each test self-contains a `check(cond,msg)` counter + chrome-storage stub |
| Quick run command | `node tests/service-denylist.test.js && node tests/consent-mutation-gate.test.js && node tests/classification-gate.test.js` |
| Full suite command | `npm test` (the milestone CI gate) ; `npm run validate:extension` (runs the new gate script) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DENY-01 | each denied roster origin classifies `denied:true` (robinhood, fidelity, carta, netflix, spotify, twitch, steam, youtube-music, tinder, onlyfans) | unit | `node tests/service-denylist.test.js` | ◆MOD existing (add roster assertions) |
| DENY-02 | each sensitive roster origin classifies `{sensitive:true, denied:false}` (stripe, coinbase, twilio, ynab, instagram, facebook, tiktok, x, + messaging) | unit | `node tests/service-denylist.test.js` | ◆MOD existing |
| DENY-03 | the gate rejects an unclassified sensitive fixture origin (exit≠0, names it); passes when classified | unit | `node tests/classification-gate.test.js` + `node scripts/verify-classification-gate.mjs` | ❌ Wave 0 |
| DENY-03 | the gate runs in CI and over the real descriptor corpus without false-failing benign apps | integration | `npm run validate:extension` | ◆MOD chain (append gate) |
| DENY-04 | sensitive-origin GET → allow; sensitive-origin POST w/o mutating flag → `RECIPE_CONSENT_MUTATING_REQUIRED`; with flag → allow; non-sensitive POST → allow (unchanged) | unit | `node tests/consent-mutation-gate.test.js` | ◆MOD existing (add sensitive-origin cases) |
| DENY-04 | the typed reason is byte-equal across providers (INV-03) + dual-field `_err` shape | unit | `node tests/consent-mutation-gate.test.js` (assert code string) | ◆MOD |
| crit.5 | `vendor/opentabs-snapshot/PIN.md` exists with the SHA + MIT text; `_provenance.json` scaffold exists; `docs/LEGAL.md` names the 3 axes | unit | `node tests/service-denylist.test.js` (extend LEGAL.md assertions) OR a small `node tests/provenance-scaffold.test.js` | ❌ Wave 0 (LEGAL assertion exists; PIN/_provenance new) |

### Sampling Rate
- **Per task commit:** the quick run command (denylist + mutation-gate + classification-gate).
- **Per wave merge:** `npm run validate:extension` (exercises the new gate end-to-end) + the three unit tests.
- **Phase gate:** full `npm test` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/classification-gate.test.js` — covers DENY-03 (gate rejects fixture; passes when classified; no false-fail on benign 119-set sample).
- [ ] `scripts/verify-classification-gate.mjs` — the gate itself (export `classifyGate` + CLI on direct run); chained into `validate:extension`.
- [ ] `catalog/descriptors/_fixtures/unclassified-sensitive.fixture.json` (or `catalog/_gate-fixtures/...` if `readJsonDir` recurses) — the DENY-03 fail-closed proof.
- [ ] `vendor/opentabs-snapshot/PIN.md` — SHA `4b170216...` + MIT license verbatim.
- [ ] `catalog/descriptors/_provenance.json` — minimal scaffold (`{source:"opentabs", sha:"4b170216...", license:"MIT", apps:[]}` — Phase 36 populates `apps`).
- [ ] (optional) `tests/provenance-scaffold.test.js` — asserts PIN.md + `_provenance.json` presence and SHA match, if not folded into service-denylist.test.js.
- [ ] Existing test updates: `tests/service-denylist.test.js` (roster assertions + LEGAL axes), `tests/consent-mutation-gate.test.js` (sensitive-origin posture-B cases).

## Security Domain

> `security_enforcement` is not set to `false` in config.json → treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 35 touches no auth flow; the origin-pin/cookie scoping is the v0.9.99 substrate (Wall 2), unchanged |
| V3 Session Management | no | unchanged; the re-gate is a consent decision, not a session change |
| V4 Access Control | **yes** | This IS the phase's domain: the denylist (hard block) + posture-B sensitive-write re-gate are access-control decisions at the single chokepoint (`_evaluateConsent`). Control = `classify()`-driven deny/sensitive + per-origin mutating opt-in |
| V5 Input Validation | **yes** | The classification gate validates that every emitted-descriptor origin is explicitly classified (fail-closed) — a build-time input-validation gate. The origin string is parsed via the existing `_parseOrigin` (no-throw, malformed → non-match) |
| V6 Cryptography | no | No crypto here; recipe signature verification (Ed25519/JCS) is the v0.9.99 substrate, untouched. (PIN.md records a commit SHA, not a cryptographic operation.) |

### Known Threat Patterns for {opt-out-Auto consent gate + origin classification}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential-replay against a sensitive origin under Auto (the "safe-brand inversion" top risk) | Elevation of Privilege | Denylist hard-block (categorically prohibited) + posture-B mutating gate (sensitive writes) — DENY-01/04 |
| Gap in the denylist JSON array silently reads as "allow" | Tampering / EoP | Fail-closed classification gate: an unclassified sensitivity-suspect origin fails the build (DENY-03) — a gap becomes a CI failure, not a silent allow |
| Over-broad denylist pattern blocking a legitimate sibling origin (e.g. `*.youtube.com` catching youtube proper) | Denial of Service (self-inflicted) | Exact-host patterns matching OpenTabs' own urlPattern scope (§Pitfall 1) |
| Typed-reason drift breaking the MCP passthrough → a security reason silently dropped | Repudiation / Tampering | Dual-field `_err` shape + byte-equal `RECIPE_CONSENT_MUTATING_REQUIRED` across 7 providers (INV-03); test asserts the code surfaces |
| Heuristic false-negative letting a sensitive app ship unclassified | EoP | Brand-name + category keyword vocabulary; 119-app sweep; the fail-closed fixture proves the mechanism (Pitfall 5) |

## Sources

### Primary (HIGH confidence)
- FSB substrate, read live on branch `automation` (2026-06-24): `extension/utils/service-denylist.js` (classify/isDenied/load/`_parsePattern`/`_matchesPattern` — exact + suffix forms), `extension/utils/capability-router.js` (`_evaluateConsent` steps 1-4 + `_err` + `_denylist()` accessor + `invoke` caller), `extension/utils/consent-policy-store.js` (`getConsentForOrigin -> {mode,mutating}`, `DEFAULT_MODE='auto'`, `setOriginMutating`/`setDefaultMode`), `extension/config/service-denylist.json` (v:1 seed), `tests/service-denylist.test.js` + `tests/consent-mutation-gate.test.js` (test conventions), `scripts/validate-extension.mjs` (catalog snapshot cross-check + `readJsonDir(descriptors)`), `scripts/verify-recipe-path-guard.mjs` (CI-gate shape; already allowlists `service-denylist.js`), `package.json` (`validate:extension` + `ci` chains), `catalog/descriptors/*.json` + `_fixtures/` (descriptor shape + fixture home), `docs/LEGAL.md` (current consent/denylist sections), `catalog/handlers/github.js` (T1a reference).
- OpenTabs repo via authenticated `gh api repos/opentabs-dev/opentabs/...` (2026-06-24): `commits/main` → SHA `4b17021637d2cac12b8d84d21c40e765aa7b85e9` (2026-06-21); `license` → MIT; `contents/LICENSE` → `Copyright (c) 2026-present OpenTabs Contributors`; `contents/plugins/<app>/package.json?ref=4b170216...` → `.opentabs.urlPatterns`/`.homepage` for all 18 named roster apps + messaging/finance candidates; `contents/plugins?ref=...` → full 119-app dir list.
- Milestone research (this repo): `.planning/research/ARCHITECTURE.md` (Anti-Pattern 3 denylist-first, the resolve()/gate seams, Phase-35 row), `.planning/research/STACK.md` (OpenTabs op shape, Wall-1 metadata-only, codegen is Phase 36), `.planning/STATE.md` (INV-01..04, Walls 1/2, the `68ceea90` opt-out note + posture-B framing), `.planning/REQUIREMENTS.md` (DENY-01..04 wording).
- The `68ceea90` commit (`git show`): confirms the removed sensitive-downgrade + mutating-elevation branches and the posture-B refinement intent.

### Secondary (MEDIUM confidence)
- Heuristic keyword vocabulary (§Q3) — synthesized from the verified roster categories; mechanism HIGH, exact word list is a discretion call to be tuned against the 119-app sweep.
- DENY-02 messaging/finance membership — origins verified, exact scope a planner/discuss-phase lock.

### Tertiary (LOW confidence)
- None. All factual claims are tool-verified; the two ASSUMED items (A1 typed-code string, A4 readJsonDir recursion) are each a one-command verify step, not unverified assertions.

## Metadata

**Confidence breakdown:**
- Roster origins + SHA + license (Q1, Q2): HIGH — read live via `gh api` against the pinned SHA.
- Posture-B diff (Q4): HIGH — exact lines/variables verified; one git-history confirm for the typed string (A1).
- Classification gate design (Q3): HIGH on structure/CI-chain/fixture; MEDIUM on the keyword vocabulary (discretion + 119-sweep tuning).
- Denylist data expansion: HIGH — matcher contract + every pattern verified.
- Validation/Security: HIGH — maps to existing test conventions + the access-control/input-validation framing of the phase.

**Research date:** 2026-06-24
**Valid until:** OpenTabs SHA pin is permanent once recorded in PIN.md (commit-pinned, hermetic). The FSB substrate seams are on a stable branch; re-verify only if `_evaluateConsent` is refactored before Phase 35 lands. ~30 days for the substrate facts.
