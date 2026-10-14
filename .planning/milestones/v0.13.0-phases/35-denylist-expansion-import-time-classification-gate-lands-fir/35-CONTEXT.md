# Phase 35: Denylist Expansion + Import-Time Classification Gate (LANDS FIRST) - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 3 grey areas, all recommended answers accepted

<domain>
## Phase Boundary

Make the `service-denylist` cover every categorically-prohibited and allowed-but-sensitive
origin in the named DENY-01/02 roster, make that coverage un-bypassable via a build-time
classification gate (fail-closed), and re-scope the v0.9.99-Phase-30 friction to sensitive
origins only (DENY-04 posture B) — all BEFORE any descriptor import phase (36+) runs. Under
the shipped opt-out Auto default (committed `68ceea90`), the denylist is the ONE hard floor,
so this phase is a strict hard dependency for every later phase.

**In scope:** denylist roster expansion (denied + sensitive); the `classify()`-backed
build-time + CI classification gate; the posture-B sensitive-write re-gate in
`_evaluateConsent`; the `vendor/opentabs-snapshot/PIN.md` + `_provenance.json` scaffold; the
`docs/LEGAL.md` ToS-axis naming.

**Out of scope (later phases):** the descriptor importer itself (Phase 36, CGEN-01);
vendoring actual OpenTabs metadata files (Phase 36); per-app classification of the full
119-app set (extended incrementally by batches 37-39, each gated on DENY-03).
</domain>

<decisions>
## Implementation Decisions

### Area 1 — Denylist roster & categorization
- **Scope now:** Classify the explicitly-named DENY-01/02 roster + obvious finance/ToS
  origins in this phase. Full per-app classification of all 119 apps is deferred to the
  breadth batches (37-39); each batch is gated on its origins being classified (DENY-03),
  so coverage grows incrementally without front-loading it all here.
- **Origin pattern form:** Reuse the existing `https://*.domain` subdomain-wildcard form
  already used in `service-denylist.json` (no new matcher syntax).
- **instagram / facebook / tiktok / x:** Classify as **sensitive** (NOT fully denied). The
  origin-level denylist cannot express "writes denied, reads allowed", so reads run under
  Auto and writes are mutating-gated through posture B (DENY-04) + the descriptor's
  side-effect class. Fully-denied is reserved for categorically-prohibited origins.
- **deniedOrigins (categorically prohibited):** brokerage/trading — robinhood, fidelity,
  carta; ToS-hostile media/social — netflix, spotify, twitch, steam, youtube-music, tinder,
  onlyfans. Each named in the `docs/LEGAL.md` ToS-axis.

### Area 2 — Classification gate mechanics (DENY-03)
- **Where it lives:** A `classify()`-backed gate function + a CI test land in THIS phase
  (the Phase-36 importer will consume the gate; it does not exist yet). Gate logic is keyed
  off `service-denylist.js classify(origin)` returning denied / sensitive / safe.
- **Fail-closed trigger:** An origin matching a sensitivity heuristic (finance / payment /
  health / social / media / adult keyword in domain or app metadata) but lacking an explicit
  denied/sensitive/safe classification fails the build. Genuinely-safe origins default to
  safe — so not-yet-classified benign apps don't break the build, but a sensitive/ToS origin
  can never slip through unclassified.
- **Failure UX:** Non-zero exit code, naming the offending origin and suggesting a
  classification.
- **Proof fixture:** A deliberately-unclassified sensitive fixture origin that the gate MUST
  reject — proves fail-closed (the DENY-03 success criterion).

### Area 3 — Posture-B re-gate + provenance/legal scaffold (DENY-04 + criterion 5)
- **Sensitive-write re-gate:** Re-introduce a mutating-elevation branch in
  `capability-router._evaluateConsent`, **scoped to `classify(origin).sensitive === true`**.
  A WRITE (mutating side-effect) to a sensitive origin without the per-origin mutating flag
  returns the existing dual-field `RECIPE_CONSENT_MUTATING_REQUIRED`. Reads pass under Auto
  everywhere; non-sensitive writes pass; only sensitive writes are re-gated. This is the
  deliberate narrowing of the "fully open under Auto" base committed in `68ceea90`.
- **Sensitivity source of truth:** `classify(origin).sensitive` from `service-denylist.js`
  (single source of truth; the D-14 pattern, restored for the sensitive subset only).
- **Provenance scaffold:** Phase 35 lands `vendor/opentabs-snapshot/PIN.md` (commit SHA via
  `gh api repos/opentabs-dev/opentabs/commits/main` + the MIT license text) and a
  `_provenance.json` scaffold. Actual metadata-file vendoring + descriptor extraction is
  Phase 36 (CGEN-01). Only metadata is ever vendored; OpenTabs `dist/`/`handle()` runtime is
  never shipped (Wall 1).
- **docs/LEGAL.md:** Add a "Categorization Axes" subsection naming three distinct criteria:
  (1) finance/gov denial, (2) ToS-hostility denial, (3) sensitivity (Ask / mutating-gated).
  Builds on the opt-out-posture rewrite already committed in `68ceea90`.

### Claude's Discretion
- Exact heuristic keyword list + match mechanism for the fail-closed gate.
- Internal structure of `_provenance.json` (kept minimal/scaffold for Phase 36 to extend).
- Test file names and the precise fixture origin used to prove fail-closed.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/config/service-denylist.json` — current seed: 4 deniedOrigins (chase, bofa,
  wellsfargo, irs.gov), 7 sensitiveOrigins (3 banks + mail.google + outlook x2 + `*.gov`).
  `https://*.domain` wildcard form, USER-EXTENSIBLE, v:1 envelope.
- `extension/utils/service-denylist.js` — `classify(origin) -> { sensitive, denied, reason }`
  (denied ⇒ sensitive:true). `_matchesAny` / `_parseOrigin` matcher. Loader unchanged.
- `extension/utils/capability-router.js` — `_evaluateConsent(params)` is the single consent
  chokepoint (both front doors, INV-02). Post-`68ceea90` it is opt-out: step (1) denylist
  block, (2) off, (3) ask, (4) auto→allow. The mutating-elevation branch was removed under
  Auto and must be re-added scoped to sensitive origins here.
- `.planning/LATTICE-PIN.md` — the existing PIN.md discipline (SHA + license) to mirror for
  `vendor/opentabs-snapshot/PIN.md`.
- `docs/LEGAL.md` — Consent Model section already rewritten for the opt-out posture (`68ceea90`).

### Established Patterns
- Closed-vocab JSON config + a pure loader/classifier module (denylist).
- Dual-field `RECIPE_*` typed reasons via the `_err` helper, surfaced verbatim through the
  `/^RECIPE_.+$/` passthrough (INV-03 keeps these byte-equal across providers).
- Node test scripts (`node tests/<name>.test.js`, `PASS=/FAIL=` summary, `process.exit(1)` on
  fail) — not Jest. CI runs the full `npm test` chain.

### Integration Points
- `service-denylist.js classify()` is the source of truth consumed by both the consent gate
  (router) and the new build-time classification gate.
- The build-time gate is authored here but CONSUMED by the Phase-36 importer
  (`scripts/import-opentabs-catalog.mjs`, does not exist yet).
- OpenTabs source: `github.com/opentabs-dev/opentabs` (MIT, `pushed_at 2026-06-21`), reachable
  via `gh api` — confirmed in research/STACK.md + ARCHITECTURE.md.
</code_context>

<specifics>
## Specific Ideas

- Posture B is the headline security control of the milestone: it must be impossible for a
  sensitive-origin WRITE to run under Auto without the per-origin mutating flag. Sample-test
  with a representative sensitive origin (e.g. stripe) for both a read (passes) and a write
  (blocked → `RECIPE_CONSENT_MUTATING_REQUIRED`) without the flag, and write passes WITH it.
- The fail-closed gate's whole purpose: "a gap in the JSON array is indistinguishable from an
  allow decision" must become a CI failure, not a silent allow.
- PIN.md must mirror `.planning/LATTICE-PIN.md` (SHA + license) so provenance is auditable and
  the build is hermetic/offline.
</specifics>

<deferred>
## Deferred Ideas

- The descriptor importer + actual OpenTabs metadata vendoring → Phase 36 (CGEN-01).
- Full per-app classification of all 119 apps → batches 37-39 (incremental, gated on DENY-03).
- Per-app CORS / first-party-origin verification for separate-API-origin ports → Phases 40-41.
</deferred>
