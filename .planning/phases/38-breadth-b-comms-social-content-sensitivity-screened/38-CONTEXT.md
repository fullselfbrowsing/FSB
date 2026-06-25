# Phase 38: Breadth B — Comms / Social / Content (sensitivity-screened) - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 1 area (sensitivity-screening framework), all recommended accepted

<domain>
## Phase Boundary

Extend the Phase-37 breadth contract to the comms / social / content apps — the FIRST batch
where ToS-hostility + write-sensitivity bite. Import each app's descriptors ONLY after Phase 35
covers its origin (the merge-time classifyGate is the fail-closed enforcer), and route
ToS-hostile apps to DOM-only/denied rather than API-invocable. Continues BRDTH-01/02/03 (no new
v1.0.0 REQ-ID). Reuses the FROZEN Phase-37 machinery verbatim + ADDS the per-app sensitivity
screening (a denylist expansion for this batch's origins).

**In scope:** the comms/social/content import batch; the per-app ToS/sensitivity classification
(denylist expansion for this batch); the ToS-hostile DOM-only routing marker; sensitive-write
gating (reuse posture B); gates staying green on the grown corpus.

**Out of scope (later phases):** commerce/travel/misc batch → Phase 39; depth hand-ports →
40-41; discovery seeding → 42; full-corpus scale → 43. NO machinery edits (37-01-owned, frozen)
beyond what the screening genuinely requires (a per-app backing/ToS marker if the importer
doesn't already support it).
</domain>

<decisions>
## Implementation Decisions

### Sensitivity-Screening Framework (applies the Phase-35 ToS-axis to comms/social/content)
- **Batch membership:** the comms/social/content OpenTabs category (discord, bluesky, mastodon,
  threads, reddit, chatgpt, claude, …) via the frozen importer's enumeration, EXCLUDING the
  DENY-01 fully-denied set (netflix, spotify, twitch, steam, youtube-music, tinder, onlyfans —
  already denylisted in Phase 35) + the e2e-test/prescript-test fixtures. Importer enumerates;
  the planner classifies each app per the ToS-axis.
- **Per-app screening (the gate):** Phase 38 EXTENDS `service-denylist.json` to classify each
  batch origin (denied / sensitive / safe). The merge-time `classifyGate` ABORTS fail-closed on
  ANY unclassified origin — so no comms/social descriptor merges until its origin is screened.
  This is the "import only after Phase 35 covers its origin" requirement, enforced as a build
  failure, not a hope.
- **ToS-hostility routing (4-tier outcome):**
  1. **fully-denied** (catastrophic ToS / the DENY-01 set) → EXCLUDED from import entirely.
  2. **ToS-hostile-but-imported** → `backing:'dom'` (T3 DOM-only marker), NEVER learn-seeded
     (no T2), NEVER a confident API-invocable hit. Default unknown social/AI apps here (the
     conservative default the user accepted). AI-chat apps (chatgpt, claude) → DOM-only.
  3. **sensitive** (social/messaging writes: IG/FB/TikTok/X, discord/messaging) → classified
     sensitive; reads run under Auto, writes are mutating-gated via posture B (DENY-04).
  4. **safe** (content reads: reddit reads, etc.) → imported normally.
- **Write-sensitivity:** IG/FB/TikTok/X + messaging writes stay sensitive — reuse the Phase-35
  classification + the DENY-04 posture-B re-gate (a sensitive-origin WRITE needs the per-origin
  mutating flag). The descriptor's side-effect class + backing enforce write-gating.
- **Conservative default (user-accepted):** an unknown social/AI app defaults to DOM-only (T3),
  NOT fully-API-invocable — fail-safe toward less reach for the sensitive category.
- **Scale:** crosscheck + eval + no-dead-entry stay green on the grown corpus; descriptor-only →
  T3/T2 verified for this batch; cold-start within budget (full-corpus scale stays Phase 43).

### Claude's Discretion
- The exact per-app classification (which specific app is denied / DOM-only / sensitive / safe)
  — the planner grounds it in the Phase-35 `docs/LEGAL.md` Categorization Axes + per-app ToS,
  defaulting unknown social/AI apps to DOM-only.
- The mechanism for the ToS-hostile DOM-only marker IF the importer's backing policy doesn't
  already cover it (prefer a metadata-driven marker over a machinery edit).
</decisions>

<code_context>
## Existing Code Insights (reuse the frozen Phase-37 machinery)
- `scripts/import-opentabs-catalog.mjs` — enumerateBatchApps + STEM_OVERRIDES + classifyGate
  merge-gate + backing policy + synonyms + seed-feeding. FROZEN — Phase 38 vendors apps + runs
  it; a backing/ToS marker is the only candidate machinery touch (prefer metadata-driven).
- `extension/config/service-denylist.json` + `service-denylist.js classify()` — Phase 38 EXTENDS
  the rosters for the comms/social/content origins (the screening). Phase 35 form: `https://*.host`
  / exact-host; 14 denied + 22 sensitive currently.
- `scripts/verify-classification-gate.mjs classifyGate()` — the merge-time gate (fail-closed on
  unclassified). The screening's enforcer.
- `extension/utils/capability-router.js _evaluateConsent` — the posture-B sensitive-write re-gate
  (DENY-04) the sensitive social/messaging writes flow through.
- `extension/utils/capability-search.js` — backing annotation (a DOM-only/sensitive descriptor is
  returned but NOT a confident invocable hit).
- `docs/LEGAL.md` — the Categorization Axes (finance/gov denial vs ToS-hostility denial vs
  sensitivity) the per-app classification applies. Phase 38 may extend the ToS-hostile roster doc.
- The frozen breadth tests (breadth-search-return, breadth-batch-gate, backing-status-annotation)
  extend to the new batch.

## Integration Points
- New denylist classifications → classifyGate merge-gate → import allowed.
- ToS-hostile → backing:'dom' → resolve() T3 → search annotation NOT confident-invocable.
- Sensitive write → posture-B re-gate → RECIPE_CONSENT_MUTATING_REQUIRED without the flag.
</code_context>

<specifics>
## Specific Ideas
- This is a SECURITY-relevant batch: a mis-classified social/messaging app becomes writable under
  Auto. The classifyGate fail-closed merge-gate + the conservative DOM-only default are the
  mitigations. The per-app classification must be defensible against the ToS-axis.
- Never auto-mint a recipe from guessed auth (research anti-pattern) — ToS-hostile apps are
  DOM-only, never a fabricated API call.
- The DENY-01 fully-denied set stays excluded (netflix/spotify/twitch/steam/youtube-music/tinder/
  onlyfans) — do not import them even DOM-only.
</specifics>

<deferred>
## Deferred Ideas
- Commerce/travel/misc batch (most-sensitive, payment-bearing) → Phase 39.
- Real hand-ported handlers → Phases 40-41. Discovery seeding → 42. Full-corpus scale → 43.
</deferred>
