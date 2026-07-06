---
phase: 43
slug: catalog-scale-milestone-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 43 — Validation Strategy

> Close v1.0.0: full-corpus scale + the wrong-invoke precision re-tune (DEF-39.5-04-A) + recipe-rot
> self-heal hardening (per-origin coalescing/back-off, recurrence, degraded surfacing) + INV-03/7-provider
> + MIT provenance + **full `npm test` EXIT 0 = THE MILESTONE GATE**. Source of truth: 43-CONTEXT.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Standalone Node scripts (`PASS=/FAIL=`, `process.exit(1)`); the importer under tsx; the eval/scale/self-heal load in Node |
| **Quick run command** | `node tests/<name>.test.js` |
| **Full suite command** | `npm test` (THE milestone gate — must EXIT 0) |
| **Build/re-import** | `node scripts/import-opentabs-catalog.mjs` → `node scripts/package-extension.mjs` → `npm run validate:extension` |
| **Estimated runtime** | per-suite < ~5s; full `npm test` several minutes |

---

## Sampling Rate

- **After each synonym-enrichment re-import:** `node tests/capability-search-eval.test.js` + `node tests/breadth-search-return.test.js` (wrong-invoke + recall@5; watch the IDF-shift regression on the WHOLE set)
- **After the scale assert:** `node tests/full-corpus-scale.test.js`
- **After each self-heal piece:** the new coalescing/recurrence/degraded test
- **After each wave:** `npm run validate:extension` + `node tests/provider-parity.test.js`
- **Before milestone close:** full `npm test` EXIT 0
- **Max feedback latency:** ~5 s per suite

---

## Per-Task Verification Map

| Requirement / SC | Correct Behavior | Test/Gate | Status |
|------------------|------------------|-----------|--------|
| SC1 — the search index + catalog stay within budget at full scale (index < ~1-2MB, loadJSON+first-search < ~50-100ms, params schema-on-hit / < ~700B/descriptor) AND wrong-invoke driven to the HARD bar (target 0) at full scale | `full-corpus-scale.test.js` HARD-asserts < 2MB / < 100ms / < 700B over > 2000 descriptors (currently 1.40MB / 11ms / 621B); the full-corpus eval wrong-invoke is FLIPPED from RECORDED to a HARD assertion at the achieved level (target 0, via robust intentSynonym enrichment — NOT overfitting); recall@5 ≥ 0.9 stays HARD; curated collision wrong-invoke=0 stays HARD; no index-shape/params-leak regression (621B flat) | `node tests/full-corpus-scale.test.js` + `node tests/capability-search-eval.test.js` (wrong-invoke HARD) + `node tests/breadth-search-return.test.js` (curated HARD=0) | ⬜ pending |
| SC2 — recipe-rot self-heal hardened for 119-app scale: per-origin re-learn coalescing/back-off (no thundering-herd), recurrence-based systemic-vs-transient, app-level degraded/needs-re-port surfacing | N rot-detections on ONE origin coalesce into ONE consent-gated re-learn (+ exponential back-off on repeated failure); repeated rot on (origin,slug) classifies SYSTEMIC (quarantine+surface) vs a one-off TRANSIENT (retry); a stale/quarantined origin surfaces as degraded/needs-re-port (not silent failure); additive — consent gate + executeBoundSpec + classifyRecipeBroken taxonomy + per-origin cap/LRU/quarantine UNCHANGED | a NEW `tests/relearn-coalescing.test.js` (N→1 + back-off) + `tests/rot-recurrence-classify.test.js` (systemic vs transient) + `tests/app-degraded-surfacing.test.js` (degraded state visible) | ⬜ pending |
| SC3 — the typed fallback reason byte-equal across all 7 providers (INV-03); per-app MIT provenance/attribution complete; full `npm test` EXIT 0 = THE MILESTONE GATE; INV-01..04 + Walls 1/2 green | the typed reason `distinct.length===1` across xai/openai/anthropic/gemini/openrouter/lmstudio/custom; `_provenance.json` covers all 127 apps (MIT + SHA) with no gap + Wall-1 no-runtime-js; the whole suite + all guards green | `node tests/provider-parity.test.js` (INV-03) + `node tests/provenance-scaffold.test.js` + `npm run validate:extension` + **full `npm test` EXIT 0** | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] the eval-harness FLIP: `capability-search-eval.test.js` (and the breadth corpus tier) made ready
      to HARD-assert the full-corpus wrong-invoke (the metric is already computed; Wave 0 lands the
      assertion scaffold so the re-tune drives it green — RED until the synonyms are enriched).
- [ ] the self-heal test scaffolds: `relearn-coalescing.test.js` + `rot-recurrence-classify.test.js` +
      `app-degraded-surfacing.test.js` (RED-first, defining the per-origin coalescing / recurrence /
      degraded contracts before the scheduler lands).
- [ ] confirm `full-corpus-scale.test.js` is the SCALE-01 CI gate in `npm test` (it exists + passes —
      Wave 0 just confirms/wires it as the authoritative milestone scale gate).

*Reuses the shipped search/eval/rot/provider/provenance harnesses; the precision re-tune is metadata +
an assertion flip, the self-heal is an additive scheduler + recurrence + surfacing.*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| (none NEW for Phase 43) | the scale, precision, self-heal, INV-03, provenance, and the milestone gate are ALL automatable + headless | — |

*Carried-forward (NOT new, NON-blocking, fail-closed): the guarded-write live UAT (41-HUMAN-UAT.md) + the discovery first-visit live UAT (42-HUMAN-UAT.md) remain human_needed milestone debt, surfaced in the milestone audit — they do NOT gate Phase 43 (the surfaces ship fail-closed/inert).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency (no NEW human_needed item; carried-forward UAT is non-blocking debt)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the eval-flip scaffold + the 3 self-heal test scaffolds + the scale-gate confirm
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
