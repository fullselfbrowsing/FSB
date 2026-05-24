# Phase 1: Lattice SDK gap survey + integration scaffolding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 01-lattice-gap-survey-scaffold
**Milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Areas discussed:** Gap survey scope + deliverable, Integration model, Smoke test definition, Lattice-side work direction

---

## Gray Area Selection

User was offered 4 gray areas and selected all 4 (multiSelect).

| Area | Description | Selected |
|------|-------------|----------|
| Gap survey scope + deliverable | Audit breadth, doc landing location, output format | ✓ |
| Integration model (path:dep / npm link / build-and-vendor) | How FSB consumes Lattice; MV3 SW load semantics | ✓ |
| Smoke test definition | What counts as "scaffolding complete" | ✓ |
| Lattice-side work direction | What lands on fsb-integration-experiments | ✓ |

---

## Area 1: Gap survey scope + deliverable

### Q1.1: Which Lattice surfaces should the Phase 1 audit cover?

| Option | Description | Selected |
|--------|-------------|----------|
| Full 6-area sweep (Recommended) | Receipts + tripwires + providers + delegation + MV3-survivability + observability | ✓ |
| Narrow to receipts + tripwires | Just the two attempt-1 already built | |
| Receipts + tripwires + MV3-survivability adapter | Three-area focus | |

**User's choice:** Full 6-area sweep (Recommended)
**Notes:** Sets up Phase 2+ with a fully-loaded queue. Avoids attempt-1's LAT-05 anti-pattern of identifying-but-not-executing.

### Q1.2: Where does the gap-survey deliverable land?

| Option | Description | Selected |
|--------|-------------|----------|
| Lattice-side only: lattice/docs/fsb-integration-gaps.md (Recommended) | Single source of truth on fsb-integration-experiments | ✓ |
| FSB-side only: .planning/research/lattice-gap-survey.md | Doc lives in FSB's planning tree | |
| Both: Lattice-side authoritative + FSB-side phase artifact | Two writes; tightest audit trail | |

**User's choice:** Lattice-side only (Recommended)
**Notes:** Aligns with INV-06 — primitives + their docs live in Lattice.

### Q1.3: How should gaps be prioritized in the survey output?

| Option | Description | Selected |
|--------|-------------|----------|
| By FSB-blocking severity (Recommended) | Blocker / Important / Nice-to-have | ✓ |
| By Lattice domain (receipts first, then tripwires) | Group by Lattice surface | |
| Two-axis: severity × Lattice-effort | Scored on both axes | |

**User's choice:** By FSB-blocking severity (Recommended)
**Notes:** Drives Phase 2+ ordering directly.

### Q1.4: What format for the audit table?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-gap rows: Domain \| Gap \| Status \| Blocker \| Notes (Recommended) | Flat scannable table | ✓ |
| Per-domain sections with prose + sub-tables | More narrative | |
| Issue-list shape (numbered LSDK-NN items) | Each gap becomes a candidate REQ | |

**User's choice:** Per-gap rows (Recommended)
**Notes:** One source of truth, easy to update as gaps get closed.

---

## Area 2: Integration model

### Q2.1: What's the primary integration mode FSB uses to consume Lattice?

| Option | Description | Selected |
|--------|-------------|----------|
| path: dependency to lattice/packages/lattice (Recommended) | npm follows the path, picks up dist/ exports | ✓ |
| npm link (live edits, no reinstall) | Per-developer setup; CI scripting needed | |
| Build-and-vendor (copy dist into FSB tree) | Most explicit; manual sync per change | |

**User's choice:** path: dependency to lattice/packages/lattice (Recommended)
**Notes:** Reproducible across machines; lattice/ is already on disk per developer.

### Q2.2: How does the built Lattice ESM dist get loaded inside the MV3 service worker?

| Option | Description | Selected |
|--------|-------------|----------|
| MV3 SW supports ES module imports — import directly (Recommended for smoke test) | Module-typed bridge file imports from lattice exports | ✓ |
| Bundle Lattice into a single classic-script file at build time | Heavier build infra; classic-script-only | |
| Sidepanel-only consumption in Phase 1; defer SW import | Skips MV3 SW import question for now | |

**User's choice:** Native ES module imports (Recommended)
**Notes:** Lowest disruption to existing background.js.

### Q2.3: How does Lattice's built dist/ become available to FSB?

| Option | Description | Selected |
|--------|-------------|----------|
| Developer runs `pnpm install && pnpm build` inside lattice/ once (Recommended) | Manual step; FSB npm install picks up the built dist | ✓ |
| FSB's `npm install` triggers Lattice build via postinstall hook | Couples FSB install to pnpm/Node 24 | |
| Commit lattice's dist/ to fsb-integration-experiments branch | Pre-built; pollutes Lattice git | |

**User's choice:** Developer-driven pnpm build (Recommended)
**Notes:** Simple and explicit. Avoids coupling toolchains.

### Q2.4: How do we keep FSB and Lattice in lock-step?

| Option | Description | Selected |
|--------|-------------|----------|
| Document expected Lattice HEAD in FSB (.planning/LATTICE-PIN.md) (Recommended) | Records commit SHA + per-phase history | ✓ |
| Lattice tag + FSB references the tag | Tighter coupling; harder roll-forward | |
| No formal pinning in Phase 1 | Branch heads move together informally | |

**User's choice:** .planning/LATTICE-PIN.md (Recommended)
**Notes:** Easy to bump when Lattice ships new gap-closing commits.

---

## Area 3: Smoke test definition

### Q3.1: What contexts must the smoke test exercise to count Phase 1 'scaffolding complete'?

| Option | Description | Selected |
|--------|-------------|----------|
| Node-side test + MV3 SW runtime check (Recommended) | Two-prong: CI test + manual extension-reload check | ✓ |
| Node-side test only | Phase 1 proves import path under Node; SW deferred | |
| Node + MV3 SW + sidepanel (full triple) | Most thorough; expands scope to sidepanel | |

**User's choice:** Node-side test + manual MV3 SW check (Recommended)
**Notes:** Proves both code paths without inventing a Puppeteer/Playwright harness.

### Q3.2: What primitive does the smoke test actually exercise?

| Option | Description | Selected |
|--------|-------------|----------|
| Mint one Capability Receipt via Lattice's v1.1 surface (Recommended) | Zero Lattice-side changes needed; validates real consumption | ✓ |
| Import a single export + assert it's a function | Lowest-bar; easy to mis-pass | |
| Run one of Lattice's existing examples | Mostly proves Lattice's surface, not FSB's | |

**User's choice:** Mint one Capability Receipt (Recommended)
**Notes:** Receipts are Lattice's core primitive — most direct proof of round-trip.

### Q3.3: Which test runner owns the smoke test?

| Option | Description | Selected |
|--------|-------------|----------|
| FSB-side: new tests/lattice-smoke.test.js (Recommended) | Lives with FSB's 100+ node tests | ✓ |
| Lattice-side: a new vitest test in lattice/packages/lattice/test/ | Couples Lattice tests to FSB consumption | |
| Both sides + cross-repo CI doc | Tightest audit trail; most ceremony | |

**User's choice:** FSB-side tests/lattice-smoke.test.js (Recommended)
**Notes:** Proves FSB consumes Lattice; Lattice's own 451 tests remain authoritative for Lattice.

### Q3.4: What is the explicit pass criteria for Phase 1 'scaffolding complete'?

| Option | Description | Selected |
|--------|-------------|----------|
| Gap doc + FSB smoke green + manual MV3 check (Recommended) | Three checks, all required | ✓ |
| Gap doc + Node-side smoke only (no manual MV3) | Skip manual extension-reload | |
| Gap doc + smoke + LATTICE-PIN + REQUIREMENTS REQ-IDs filled | Adds REQUIREMENTS update | |

**User's choice:** Three checks: doc + smoke + manual MV3 (Recommended)
**Notes:** REQ-ID population deferred to Phase 2 setup.

---

## Area 4: Lattice-side work direction

### Q4.1: Beyond the gap-doc commit, what is the maximum Lattice-side code change allowed in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Audit-doc only + single tsconfig/exports tweak if smoke surfaces one (Recommended) | Holds the line; only packaging fixes permitted | ✓ |
| Audit-doc + receipt-shape stub extensions (attempt-1 fields) | Brings most-likely Phase 2 work forward | |
| Audit-doc + whatever the smoke naturally pulls in | Risk: smoke scope drifts to justify Lattice work | |

**User's choice:** Audit-doc + packaging tweak only (Recommended)
**Notes:** Receipt extensions, tripwire bands deferred to dedicated later phases.

### Q4.2: What ceremony do Lattice-side commits get on fsb-integration-experiments?

| Option | Description | Selected |
|--------|-------------|----------|
| Conventional commits + FSB phase reference (Recommended) | Body cites `Ref: FSB v0.10.0-attempt-2 Phase 1` | ✓ |
| Conventional commits + changesets per commit | Cleaner mainline PR; more overhead | |
| No special ceremony | Polish at mainline PR time | |

**User's choice:** Conventional commits + FSB phase backref (Recommended)
**Notes:** Lightweight, grep-able both ways. No changesets during experiments.

### Q4.3: When do fsb-integration-experiments commits get PR'd into Lattice mainline?

| Option | Description | Selected |
|--------|-------------|----------|
| Never inside this milestone — defer to v0.11.0+ (Recommended) | Lowest coordination cost during experimentation | ✓ |
| Per-phase mainline PR | Tight loop; per-phase PR cost | |
| End-of-milestone single PR | Coherent story; heavy review | |

**User's choice:** Defer to v0.11.0+ (Recommended)
**Notes:** Mainline cadence is its own decision after this milestone proves the pattern.

### Q4.4: Where does the FSB-side traceability for Lattice work live?

| Option | Description | Selected |
|--------|-------------|----------|
| .planning/LATTICE-PIN.md updated each FSB phase (Recommended) | Single cross-repo audit file | ✓ |
| LATTICE-PIN.md (pin only) + Lattice commit bodies self-document | Easier sync; harder FSB-side scan | |
| FSB-side per-phase XX-LATTICE-WORK.md summaries | Most context; more files; risk of drift | |

**User's choice:** LATTICE-PIN.md as single index (Recommended)
**Notes:** One file to grep. No per-phase Lattice summary docs.

---

## Claude's Discretion (deferred to researcher/planner)

Areas where the user explicitly didn't lock implementation details — researcher/planner will pick consistent with the locked decisions:

- CD-01 Exact npm spec for path: dep (`file:` vs `link:` vs `npm install --no-save`)
- CD-02 Exact location of the FSB-side bridge file
- CD-03 Whether to add a postinstall sanity-check script
- CD-04 Smoke test fixture strategy (inline stubs vs `tests/fixtures/`)
- CD-05 Whether `lattice/docs/` uses flat or subdirectory layout
- CD-06 LATTICE-PIN.md schema (markdown table / frontmatter / JSON)

---

## Deferred Ideas

Ideas raised during the discussion that belong outside Phase 1 — captured so they aren't lost:

- Sidepanel-side Lattice consumption (defer to UI consumption phase)
- Headless MV3 SW test harness (defer until SW-critical-path needs it)
- REQUIREMENTS.md LSDK/FINT REQ-ID population (Phase 2 setup work)
- Lattice mainline PR cadence (v0.11.0+ planning)
- Receipt-shape extensions (Phase 2 likely)
- Tripwire band system extensions (Phase 3 likely)
- Provider adapter alignment (own phase)
- Delegation primitive (pending Lattice multi-agent policy)
- MV3-survivability adapter contract (own phase)

---

## Question/Answer Statistics

- Total questions asked: 16 (across 4 batches of 4)
- Recommended-option selections: 16 / 16 (100%)
- "Other" / freeform overrides: 0
- Scope-creep redirects: 0 (all sub-questions stayed within phase boundary)
