# Requirements: FSB (Full Self-Browsing) -- v1.0.0 Full App Catalog (OpenTabs Parity)

**Defined:** 2026-06-23
**Core Value:** Reliable single-attempt execution -- the AI decides correctly; the mechanics execute precisely. v1.0.0 scales the v0.9.99 capability path from a 4-service head to the full ~119-app OpenTabs surface by FEEDING THE EXISTING TIERS (breadth = closed-vocab descriptors as data; depth = hand-ported handlers; tail = seeded discovery + DOM fallback) -- no new MCP tool, no new router branch, INV-01..04 + Walls 1/2 preserved by construction.

## v1 Requirements

Requirements for the v1.0.0 milestone. Each maps to a roadmap phase (Phases 35+, continuing integer numbering from v0.9.99's Phase 34). Source: github.com/opentabs-dev/opentabs (MIT, 119 plugins / 2,523 ops), pinned by commit SHA; attribution already in README Acknowledgements.

### DENY -- Denylist Expansion & Import-Time Classification Gate (lands FIRST)

- [x] **DENY-01**: `extension/config/service-denylist.json` deniedOrigins is expanded to hard-block the categorically-prohibited OpenTabs apps (brokerage/trading: robinhood, fidelity, carta; ToS-hostile media/social: netflix, spotify, twitch, steam, youtube-music, tinder, onlyfans; and the write-paths of instagram/facebook/tiktok/x) BEFORE any of those descriptors can be emitted.
- [x] **DENY-02**: sensitiveOrigins is expanded to the allowed-but-sensitive tier (payments: stripe, coinbase, twilio; budgeting: ynab; messaging-app writes; finance reads) so they classify as sensitive (Ask / mutating-gated), not denied.
- [x] **DENY-03**: A build-time classification gate (in the importer and CI) refuses to emit a descriptor whose origin is not explicitly classified denied / sensitive / safe; an unclassified sensitive-or-ToS origin fails the build (fail-closed).
- [x] **DENY-04**: Sensitive-classified origins re-enforce the per-origin mutating opt-in at the invoke gate (posture B): reads run under Auto everywhere, but a WRITE to a sensitive origin requires the per-origin mutating flag (already present in storage, re-gated here); non-sensitive origins remain fully-open under Auto. Scopes the friction removed in v0.9.99 Phase 30 to sensitive origins only.

### CGEN -- Codegen Import Pipeline & No-Dead-Entry Resolution

- [x] **CGEN-01**: A build-time `scripts/import-opentabs-catalog.mjs` (run under tsx) extracts each OpenTabs op's metadata (slug, params via z.toJSONSchema, service/origin, action verb, description) into provenance-stamped descriptor JSON under `catalog/descriptors/opentabs/`, pinned to an OpenTabs commit SHA; NO runtime OpenTabs/plugin-sdk dependency ships (Wall 1).
- [x] **CGEN-02**: Each op's side-effect class is inferred from its transport verb (apiGet -> read; apiPost/apiPut/apiDelete -> write/destructive) plus an override table; a descriptor-vs-derived cross-check fails the build when a descriptor under-states a destructive op.
- [x] **CGEN-03**: `capability-catalog.js resolve()` gains a single fallback branch so a descriptor-only slug (no bundled handler or recipe) resolves to T3 (DOM) or T2 (learn-pending when seeded) -- no searchable-but-uninvocable dead entries; verified by a harness assertion over the full catalog.
- [x] **CGEN-04**: The generated catalog is committed and inlined by `scripts/package-extension.mjs` via the existing readJsonDir path with a stable `catalogVersion`; the IIFE shape and djb2 hashing are unchanged.

### BRDTH -- Breadth: All-App Descriptor Import

- [ ] **BRDTH-01**: Descriptors for all real OpenTabs apps (excluding the e2e-test / prescript-test fixtures and the DENY-01 denied set) are imported and returned by `search_capabilities`, with intent synonyms and side-effect class per op.
- [ ] **BRDTH-02**: Apps are imported in category batches ordered least-sensitive -> most-sensitive; each batch is gated on its origins being denylist-classified (DENY-03) before merge.
- [ ] **BRDTH-03**: Each imported descriptor carries an invocability/backing-status signal (recipe / handler / learn-pending / DOM) so a user or agent can distinguish day-one-invocable apps from discovery-pending ones.

### DEPTH -- Depth: Hand-Ported Handlers (~15-30 apps)

- [ ] **DEPTH-01**: The depth shortlist (~22 apps: linear, datadog, vercel, jira, netlify, todoist, circleci, cloudflare, sentry, posthog, ... reads first) is hand-ported as T1a/T1b handlers via the `github.js` contract: own first-party origin, executeBoundSpec-only, scraped tokens never logged.
- [ ] **DEPTH-02**: Hand-ported WRITE ops fail closed and, on sensitive origins, honor the DENY-04 mutating opt-in; a per-app CORS / first-party-origin verification gate precedes any separate-API-origin (Pattern-D) port (linear is documented-safe; supabase / cloud-consoles must be verified or demoted to T2/T3).

### DSEED -- Discovery Seeding for the Tail

- [ ] **DSEED-01**: The OpenTabs origins (+ known endpoint hints) seed the Phase-31 network-capture discovery so the non-hand-ported tail is learned on first authenticated visit, consent-gated.
- [ ] **DSEED-02**: The capture-time structural redactor is extended and verified against the 119-app field universe so no auth substring is persisted at scale.

### SCALE -- Catalog Scale & Milestone Gate

- [ ] **SCALE-01**: The search index and catalog stay within budget at ~2,523 descriptors (searchable-text indexed; params schema-on-hit / out-of-band; sharded by service), proven by the extended SURF-06 eval harness with size/load-time assertions (index < ~1-2 MB; loadJSON + first search < ~50-100 ms).
- [ ] **SCALE-02**: Recipe-rot self-heal is hardened for 119-app scale (per-origin re-learn coalescing / back-off); the typed fallback reason stays byte-equal across all 7 providers (INV-03); full `npm test` exits 0 (the milestone gate).

## v2 Requirements

Acknowledged but deferred beyond v1.0.0; not in this roadmap.

### Deferred Capability Families

- **GAPI-01**: gapi-bridge handler family for the Google Workspace apps (docs / drive / calendar) invoked via the page's `window.gapi.client.request` trampoline -- needs a dedicated handler-shape spike.
- **CLOUD-01**: Cloud-console Pattern-D ports (aws-console, azure, google-cloud, terraform-cloud) -- pending per-app CORS verification of dashboard-vs-API origin.
- **UATX-01**: Per-app live guarded-write UAT closeout across the hand-ported depth tier (human_needed, mirrors the v0.9.99 live-UAT posture).

## Out of Scope

Explicit exclusions (anti-features from research), documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Hand-porting all 2,523 ops as bundled imperative handlers | MV3 Wall 1 / Web-Store-ban risk; the head stays curated, the tail is descriptors + learned/DOM |
| Runtime dependency on @opentabs-dev/plugin-sdk (or any OpenTabs code) | MV3 bans remotely-hosted code; the import is build-time metadata only |
| ToS-hostile apps as API-invocable (netflix, spotify, twitch, steam, tinder, onlyfans, instagram/tiktok/x writes) | Site Terms of Service; denylisted or DOM-only |
| Brokerage trade execution (robinhood / fidelity / carta trades) | Financial-harm surface under an opt-out default; denied outright |
| e2e-test / prescript-test plugins | OpenTabs CI fixtures, not real apps |

## Traceability

Finalized by the roadmapper; each requirement maps to exactly one phase. 100% coverage, 0 orphans.

Note on breadth phases: BRDTH-01/02/03 are OWNED by Phase 37, which establishes the breadth contract (all real apps return from search with intent synonyms + side-effect class + backing-status, each batch gated on denylist coverage). Phases 38 (Comms/Social/Content) and 39 (Commerce/Travel/Misc) are sensitivity-ascending CONTINUATION batches that extend the same three requirements to more categories; they own no additional v1.0.0 REQ-ID. Depth splits cleanly: DEPTH-01 (the hand-port contract + read heads) is owned by Phase 40; DEPTH-02 (guarded writes + DENY-04 re-enforcement + per-app CORS gate) is owned by Phase 41, which continues the same hand-port mechanism for the remaining heads.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DENY-01 | Phase 35 | Complete |
| DENY-02 | Phase 35 | Complete |
| DENY-03 | Phase 35 | Complete |
| DENY-04 | Phase 35 | Complete |
| CGEN-01 | Phase 36 | Complete |
| CGEN-02 | Phase 36 | Complete |
| CGEN-03 | Phase 36 | Complete |
| CGEN-04 | Phase 36 | Complete |
| BRDTH-01 | Phase 37 | Pending |
| BRDTH-02 | Phase 37 | Pending |
| BRDTH-03 | Phase 37 | Pending |
| DEPTH-01 | Phase 40 | Pending |
| DEPTH-02 | Phase 41 | Pending |
| DSEED-01 | Phase 42 | Pending |
| DSEED-02 | Phase 42 | Pending |
| SCALE-01 | Phase 43 | Pending |
| SCALE-02 | Phase 43 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17 (DENY 4 -> P35; CGEN 4 -> P36; BRDTH 3 -> P37 [P38/P39 continue the contract]; DEPTH-01 -> P40, DEPTH-02 -> P41; DSEED 2 -> P42; SCALE 2 -> P43)
- Unmapped: 0

---
*Requirements defined: 2026-06-23 -- v1.0.0 Full App Catalog (OpenTabs Parity)*
*Last updated: 2026-06-24 -- traceability finalized by roadmapper (9 phases 35-43; DEPTH-02 mapped to Phase 41; BRDTH continuation batches 38-39 noted)*
