# Phase 16: Live-Observe Watch & Analyzing Pulse - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-06-16
**Phase:** 16-live-observe-watch-analyzing-pulse
**Mode:** assumptions
**Areas analyzed:** Module Decomposition & SW Ingress; Live-Observe Re-Arm & Selector Re-Resolution; Analyzing Pulse / Label / Clear Lifecycle; Teardown / Multiplexing / Tests
**Calibration tier:** standard (USER-PROFILE Vendor Philosophy = pragmatic)
**Codebase analysis:** gsd-assumptions-analyzer read 15+ source files + all four research docs.

## Assumptions Presented

### A. Module Decomposition & SW Value-Report Ingress
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| 1 NEW content module `trigger-observe.js` + MOD `messaging.js`/`visual-feedback.js`/`background.js`; no new SW util; isolated-world injection; `dom-stream.js` NOT reused | Confident | ARCHITECTURE.md:60-62,79,430,448-457; background.js:6346 (`domStreamMutations`), :267-285 (`CONTENT_SCRIPT_FILES`), :5436/:6412 (onMessage + sender.tab.id); manifest.json:49-56 |
| Live-observe fire evaluated on the value-report `onMessage` (instant), not the alarm tick; SW drives `evaluate()` via the Phase-15 lifecycle SEAM; report shape `{text, attributes?}` | Confident | ARCHITECTURE.md:324-327,406; trigger-lifecycle.js (SEAM); trigger-manager.js / value-extractor.js:25-26 |
| Add low-freq watchdog alarm now (re-issue `triggerObserveStart` after eviction/undetected-nav) + a test-only arm path (not an MCP tool — that's Phase 18) | Likely | ARCHITECTURE.md:212,320; PITFALLS.md:59 (Phase-211 two-tier); background.js:6361 (idempotent watchdog `create`); trigger-lifecycle.js:195 (`armTrigger`); REG-01→Phase 18 |

### B. Live-Observe Re-Arm & Selector Re-Resolution (WATCH-05)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| SW-side re-arm off `webNavigation`/`tabs.onUpdated` for full reload; content self-handles BF-cache `pageshow(persisted)`; stable-container observe + per-batch selector re-resolution for SPA node-swap | Likely → **Confident after research** | ARCHITECTURE.md:212; PITFALLS.md:139; selectors.js:497/1090/22/1093; lifecycle.js:454 (⚠️ google-gated), :623 (BF-cache); background.js:2677/3208/3217 |
| Observe options per extract kind: text/number `{childList,characterData,subtree}` on container; attribute `{attributes,attributeFilter:[attr]}`; `*OldValue` off | Confident | STACK.md:115; PITFALLS.md:118-119 |
| Debounce = trailing in-page `setTimeout` ~150-300ms, NOT rAF (diverges from dom-stream) | Confident | STACK.md:116; dom-stream.js:757-758 |

### C. Analyzing Pulse, "Watching" Label & Clear Lifecycle (VIS-01..04)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Pulse as a glow VARIANT (not a new overlay); GPU-composited opacity/transform only; reuse reduced-motion `@media`; "watching" label via additive `overlayState.mode='trigger-watch'`; pulse-message mirrors `highlightElement` | Likely | ARCHITECTURE.md:221-232,472; PITFALLS.md:380,414-418; visual-feedback.js:1508/1527/1574/1601/1100; overlay-state.js:366/444; messaging.js:1229-1243 |
| **Which overlay hosts the pulse: Shadow-DOM element-glow overlay, NOT the inline-style `HighlightManager`** (the one genuine fork) | **Unclear → user-decided** | VIS-01/ROADMAP.md:66 require "Shadow-DOM glow variant"; two overlay systems coexist (visual-feedback.js:25 inline vs :1508 Shadow-DOM); inline-on-SPA-node = re-render wipe + self-trigger feedback-loop risk |
| Clear is storage-backed (`deadline_at` reap) so a dead SW can't strand the pulse; one overlay owner per tab; no run_task collision | Likely | ROADMAP.md:67; VIS-03; trigger-store.js:40; trigger-lifecycle.js:307/350-360; visual-feedback.js:2244; messaging.js:1196-1209 |

### D. Teardown Discipline, Multiplexing & Test Strategy
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| One observer-registry per content instance; idempotent start; disconnect-all on fire/stop/`beforeunload`/`pagehide`/re-injection (add `pagehide`); independent observer per trigger (not multiplexed body) | Confident | PITFALLS.md:88-100; dom-stream.js:744-746,802-816; visual-feedback.js:2244,2258-2264; lifecycle.js:640 |
| Node-mock content-module unit tests + "every observer disconnected" leak test; live-Chrome UAT deferred (Phase-14/15 / v0.10.0 pattern) | Likely | PITFALLS.md:100; 14-CONTEXT.md:52; 15-CONTEXT.md:60; visual-feedback.js:2300 (node test hook) |

## Corrections Made

The user selected **"Yes, proceed — lock all, Shadow-DOM overlay for the pulse"** — all assumptions confirmed as decisions, with the one genuine fork (C, overlay host) resolved in favor of the **Shadow-DOM element-glow overlay** (recommended option). No assumption was overturned.

**Notable correction surfaced during analysis (analyzer vs scout hint):** the `lifecycle.js` `pushState`/`replaceState`/`popstate` SPA hooks are **google.com-gated** (hostname check at lifecycle.js:454), so they are NOT a universal re-arm signal — re-arm for full-reload/hard-nav is driven SW-side off `webNavigation`/`tabs.onUpdated` instead. Captured in D-04.

## External Research

Spawned a focused research pass on the two flagged highest-risk runtime questions (Phase 16 is the milestone's research-flagged phase). Both resolved at **HIGH confidence** with vendor-primary / standards sources:

1. **BF-cache + MutationObserver survival.** A MutationObserver created before BF-cache freeze **survives connected** after `pageshow(persisted===true)`; the JS heap is frozen/resumed (not torn down) and the content script is **NOT re-injected**. The one thing that breaks is a persistent extension message **port** (Chrome 123+ closes it on BF-cache entry → reconnect on `pageshow`). **Implication:** do NOT re-create the observer on BF-cache restore (would double-fire); only reconnect a held port. Make arming idempotent (node-flag guard) to cover both "survived" and "fresh re-inject" without double-arming.
   - Sources: https://web.dev/articles/bfcache ; https://developer.chrome.com/blog/back-forward-cache ; https://developer.chrome.com/blog/bfcache-extension-messaging-changes
   - Resolves: D-04 (the BF-cache branch of the trifurcated re-arm) — confidence Likely → Confident.

2. **characterData vs node REPLACEMENT on SPA frameworks.** `characterData` fires only for in-place text edits, **not** when a framework replaces the text node (that surfaces as a `childList` mutation on the parent). The catch-all is observing a **stable container ancestor** with `{ childList:true, characterData:true, subtree:true }` and **re-querying the target by selector each batch** (no re-observe needed — the container is stable). Never bind the observer to a leaf text node.
   - Sources: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserverInit ; https://www.quirksmode.org/blog/archives/2017/11/mutation_observ.html ; https://dom.spec.whatwg.org/#mutationobserver
   - Resolves: D-04 (SPA branch) + D-05 (observe options) — confidence Confident.
