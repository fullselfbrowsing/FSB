---
phase: 38-breadth-b-comms-social-content-sensitivity-screened
verified: 2026-06-25T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification (no prior VERIFICATION.md)."
---

# Phase 38: Breadth B — Comms / Social / Content (sensitivity-screened) Verification Report

**Phase Goal:** Extend the Phase-37 breadth contract to the comms/social/content apps — importing each app's descriptors ONLY after Phase 35 covers its origin (fail-closed merge-gate), and routing ToS-hostile apps to DOM-only/denied rather than API-invocable. Continues BRDTH-01/02/03 (Phase 37 owns them; 38 extends to a more-sensitive category).
**Verified:** 2026-06-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (the 5 phase success criteria)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Comms/social/content descriptors (chatgpt, claude, bsky, mastodon, threads, discord, reddit) imported + returned by search with synonyms + side-effect class, each after a per-app sensitivity check; DENY-01 set has ZERO descriptors | ✓ VERIFIED | 24 descriptors on disk (chatgpt 3 / claude 3 / bsky 4 / mastodon 4 / threads 3 / discord 4 / reddit 3). Every one has ≥3 synonyms (min: reddit.search_posts=3) + a side-effect class. eval recall@5=1.000 over 154 fixtures (all resolve from search). ZERO descriptors for netflix/spotify/twitch/steam/youtube-music/tinder/onlyfans; all classify denied:true. |
| 2 | classifyGate ABORTS fail-closed on unclassified batch origin; every batch origin screened (6 sensitive, reddit safe); ToS-hostile carry backing:'dom'; threads emits opentabs__threads__* on the SCREENED www.threads.net origin (no unscreened origin shipped) | ✓ VERIFIED | breadth-batch-gate block (c): classifyGate([unclassified social origin]) reports >0 failures naming `messenger.acme-social.example` → merge aborts. Live classify(): chatgpt.com/claude.ai/bsky.app/mastodon.social/www.threads.net/discord.com all {sensitive:true,denied:false}; reddit {sensitive:false}. All 24 descriptors backing='dom'. threads service field = `www.threads.net` (the screened origin); ZERO `opentabs__www__*` slugs on disk; STEM_OVERRIDES `threads:'threads'` canonicalizes only the slug. |
| 3 | Backing-status annotation: a DOM-only/sensitive descriptor returns from search but is NOT a confident invocable hit | ✓ VERIFIED | dom-only-default.test.js (6/6): backing:'dom' comms/social descriptor → invocable=false / backingStatus='discovery-pending'. backing-status-annotation.test.js (10/10): annotation distinguishes handler invocable=true vs dom invocable=false. |
| 4 | Write-sensitivity end-to-end: REAL emitted opentabs__discord__send_message WRITE without the flag → RECIPE_CONSENT_MUTATING_REQUIRED; read passes; flag elevates. No social/messaging WRITE runs under Auto | ✓ VERIFIED | sensitive-write-import-gate.test.js (16/16) loads the REAL discord send_message + list_messages JSON from disk, loads the LIVE committed roster (classify(discord).sensitive===true), drives the descriptor's REAL sideEffectClass through Gate.evaluate: read→allow, write-no-flag→RECIPE_CONSENT_MUTATING_REQUIRED (all 3 dual-fields byte-exact), setOriginMutating(true)→allow. Scoped probe: ALL 9 comms/social write+destructive ops are on sensitive origins → posture-B gated; reddit has ZERO write ops. _isMutatingSideEffect treats write+destructive+mutate+mutating as mutating (capability-router.js:309). |
| 5 | Scale/regression green on grown corpus (94 opentabs descriptors); cold-start within budget; MED-01 heuristic backstop catches all 6 social write origins; MED-02 read-only-safe CI guard in place | ✓ VERIFIED | crosscheck PASS (94 descriptors, no under-stated mutating op + MED-02 reddit read-only guard). no-dead-entry 9/9. eval recall@5=1.000 wrong-invoke=0.000; cold-start 55.6KB<64KB, first-search 2.18ms<10ms. MED-01 probe: sensitivityHeuristic flags all 6 social write origins (chatgpt/claude/bsky/mastodon/threads/discord) suspect; reddit reads benign. MED-02: catalog-crosscheck blocks (h)/(i)/(j) + safe-origin-write fixture (gate fails on hypothetical reddit write; 3 real reddit reads pass). validate:extension exit 0. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `extension/config/service-denylist.json` | +5 comms/social sensitive origins (exact-host) | ✓ VERIFIED | chatgpt.com/claude.ai/bsky.app/mastodon.social classify sensitive; threads broadened to `*.threads.net` (LOW-01 fix — apex+www+subdomain all sensitive); discord.com sensitive (Phase 35); DENY-01 unchanged. |
| `docs/LEGAL.md` | Categorization Axes extended for comms/social/content | ✓ VERIFIED | Lines 169-188 name AI-chat (chatgpt/claude) + microblog (bluesky/mastodon/threads) sensitive, reddit reads safe, DOM-only never-learn-seeded posture. |
| `catalog/descriptors/_fixtures/batch-unclassified-social-origin.fixture.json` | social-axis fail-closed gate fixture | ✓ VERIFIED | Present (messenger.acme-social.example); in _fixtures/ (excluded from shipped catalog); trips the gate per block (c). |
| `catalog/descriptors/_fixtures/safe-origin-write.fixture.json` | MED-02 read-only-safe guard fixture | ✓ VERIFIED | Present; exercised by catalog-crosscheck blocks (h)/(i)/(j). |
| `tests/sensitive-write-import-gate.test.js` | end-to-end proof on REAL emitted discord descriptor | ✓ VERIFIED | 16/16; loads real JSON from disk + live roster; registered in package.json. |
| `tests/dom-only-default.test.js` | conservative DOM-only-default proof | ✓ VERIFIED | 6/6; registered in package.json. |
| 24 comms/social descriptors `catalog/descriptors/opentabs__{...}__*.json` | all backing:'dom', correct side-effect class | ✓ VERIFIED | All backing='dom'; 6 writes + 3 destructives on sensitive origins; reddit 3 reads. |
| `scripts/import-opentabs-catalog.mjs` (STEM_OVERRIDES) | threads:'threads' data-map entry | ✓ VERIFIED | `STEM_OVERRIDES = {..., threads:'threads'}` (line 159); the only machinery edit, a DATA-MAP entry (no logic/IIFE/djb2 change). |
| `extension/catalog/recipe-index.generated.js` | snapshot regenerated, reconciles | ✓ VERIFIED | All comms/social slugs present (canonical form: discord 35, mastodon 40, reddit 54 occ); validate:extension byte-compare exit 0. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| service-denylist.json sensitiveOrigins | classifyGate (via classify()) | screened origin classifies sensitive → gate passes + posture-B fires | ✓ WIRED |
| breadth-batch-gate.test.js | batch-unclassified-social-origin.fixture.json | gate test loads fixture, asserts abort naming it | ✓ WIRED |
| sensitive-write-import-gate.test.js | capability-router.js _evaluateConsent + opentabs__discord__send_message.json | real descriptor's write class → RECIPE_CONSENT_MUTATING_REQUIRED through live re-gate | ✓ WIRED |
| dom-only-default.test.js | capability-search.js search() | backing:'dom' → invocable=false / discovery-pending | ✓ WIRED |
| import-opentabs-catalog.mjs enumerateBatchApps | vendor/.../plugins/{chatgpt,claude,bsky,mastodon,threads,discord,reddit} | frozen enumeration auto-discovers dirs, emits descriptors | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Every screening classification correct | live `classify()` probe (6 sensitive / 7 denied / reddit safe / threads apex / IG-FB-TikTok-X) | ALL PASS | ✓ PASS |
| MED-01 heuristic backstop catches all 6 social write origins | `sensitivityHeuristic()` direct probe | all 6 suspect=true (social/messaging); reddit reads benign | ✓ PASS |
| No social/messaging WRITE runs ungated under Auto | scoped probe over comms/social write+destructive ops vs classify() | all 9 on sensitive origins; reddit 0 writes | ✓ PASS |
| ZERO DENY-01 descriptors | ls catalog/descriptors/*{netflix,spotify,...}* | none found | ✓ PASS |
| ZERO opentabs__www__* slugs (threads STEM_OVERRIDE) | ls catalog/descriptors/opentabs__www__* | none found | ✓ PASS |
| eval recall@5 / wrong-invoke / cold-start | node tests/capability-search-eval.test.js | recall@5=1.000, wrong-invoke=0.000, 55.6KB<64KB, 2.18ms<10ms | ✓ PASS |

### Probe Execution

| Probe (test/gate) | Command | Result | Status |
| ----------------- | ------- | ------ | ------ |
| sensitive-write-import-gate | node tests/sensitive-write-import-gate.test.js | 16 passed, 0 failed | PASS |
| breadth-batch-gate | node tests/breadth-batch-gate.test.js | 13 passed, 0 failed | PASS |
| dom-only-default | node tests/dom-only-default.test.js | 6 passed, 0 failed | PASS |
| backing-status-annotation | node tests/backing-status-annotation.test.js | 10 passed, 0 failed | PASS |
| catalog-crosscheck (incl MED-02) | node tests/catalog-crosscheck.test.js | 26 checks, exit 0 | PASS |
| no-dead-entry | node tests/no-dead-entry.test.js | 9 passed, 0 failed | PASS |
| capability-search-eval | node tests/capability-search-eval.test.js | 15 passed, 0 failed | PASS |
| breadth-search-return | node tests/breadth-search-return.test.js | 46 passed, 0 failed | PASS |
| classification-gate (incl MED-01 block g) | node tests/classification-gate.test.js | 30 passed, 0 failed | PASS |
| service-denylist (incl LOW-01) | node tests/service-denylist.test.js | 59 passed, 0 failed | PASS |
| consent-mutation-gate (incl discord block) | node tests/consent-mutation-gate.test.js | 28 passed, 0 failed | PASS |
| verify-classification-gate CLI | node scripts/verify-classification-gate.mjs | 102 corpus + 23 roster origins classified, exit 0 | PASS |
| validate:extension (4-gate sweep) | npm run validate:extension | exit 0 (validate + recipe-path-guard + classification-gate + crosscheck all green) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| BRDTH-01 | 38-02, 38-03 | Real OpenTabs apps (excl fixtures/DENY-01) imported + returned by search with synonyms + side-effect class | ✓ SATISFIED | 24 comms/social descriptors return from search with ≥3 synonyms + class; DENY-01 excluded (zero descriptors). |
| BRDTH-02 | 38-01, 38-03 | Apps imported in sensitivity-ascending batches; each gated on origins being denylist-classified before merge | ✓ SATISFIED | classifyGate fail-closed proven (aborts on unclassified social origin); all batch origins screened before 02/03 import. |
| BRDTH-03 | 38-01, 38-02, 38-03 | Each descriptor carries invocability/backing-status signal | ✓ SATISFIED | All 24 descriptors backing='dom' → invocable=false / discovery-pending; backing-status annotation distinguishes invocable vs DOM-only. |

BRDTH-01/02/03 are Phase-37-owned; Phase 38 extends them to the comms/social/content category with no new v1.0.0 REQ-ID (consistent with REQUIREMENTS.md line 71). No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | (none) | — | No TBD/FIXME/XXX debt markers; no TODO/HACK/PLACEHOLDER; no degenerate "in X in X" synonyms (LOW-02 fixed); no stub/empty-data patterns in shipped descriptors. |

### Human Verification Required

None. Phase 38 is descriptor-data + screening + gates — fully automatable. All verification was performed programmatically (live classify(), heuristic probes, end-to-end consent-gate routing, the full gate suite). No live-browser UAT is required (the consent gating is proven through the real `FsbConsentGate.evaluate` path against the real committed roster and the real emitted descriptor).

### Gaps Summary

No gaps. All 5 phase success criteria are verified against the actual codebase:

1. **24 comms/social/content descriptors** imported, searchable (recall@5=1.000), each with ≥3 synonyms + side-effect class; the **DENY-01 set has zero emitted descriptors** and all classify denied.
2. The **fail-closed merge-gate** genuinely aborts on an unclassified social origin (proven with a dedicated fixture, failure names the origin); every batch origin is screened (6 sensitive via live classify(), reddit safe); all descriptors are `backing:'dom'`; **threads emits `opentabs__threads__*` on the screened `www.threads.net` origin** with zero `opentabs__www__*` slugs (STEM_OVERRIDES canonicalizes the slug only, never the origin).
3. **DOM-only/sensitive descriptors return from search but are non-invocable** (invocable=false / discovery-pending).
4. **Write-sensitivity proven end-to-end on the REAL shipped `opentabs__discord__send_message` descriptor**: write-without-flag → RECIPE_CONSENT_MUTATING_REQUIRED (dual-field byte-exact), read passes, flag elevates; all 9 comms/social write+destructive ops are on sensitive origins so **no social/messaging WRITE runs ungated under Auto**.
5. **Scale/regression green** on the grown 94-descriptor corpus (crosscheck + no-dead-entry + eval), cold-start within budget; the **MED-01 heuristic backstop catches all 6 social write origins** and the **MED-02 read-only-safe CI guard** is wired into validate:extension.

The 38-REVIEW (2 MED + 2 LOW, all fixed) findings were independently re-verified: MED-01 (heuristic now flags all 6 social write origins), MED-02 (reddit read-only guard fails a hypothetical reddit write), LOW-01 (threads apex+subdomain classify sensitive), LOW-02 (no degenerate synonyms). The single machinery edit (threads STEM_OVERRIDE) is a DATA-MAP entry preserving INV-01.

---

_Verified: 2026-06-25_
_Verifier: Claude (gsd-verifier)_
