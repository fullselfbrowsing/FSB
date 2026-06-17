# Phase 20: Integration, Cap UI, Docs & Edge Cases - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md -- this log preserves the analysis.

**Date:** 2026-06-17T02:59:25Z
**Phase:** 20-integration-cap-ui-docs-edge-cases
**Mode:** assumptions
**Areas analyzed:** Trigger Cap UI, Watch-Mode Conflict and Refresh-Poll Coalescing, Docs/Versioning/Public MCP Surface, Live Browser UAT and Release Readiness

## Assumptions Presented

### Trigger Cap UI

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Add Trigger Concurrency beside Agent Concurrency and clone its numeric cap pattern. | Confident | `extension/ui/control_panel.html`, `extension/ui/options.js`, `extension/utils/trigger-manager.js` |
| Use default 8, range 1-64, with input/load/save clamping and reset. | Confident | `extension/utils/trigger-manager.js`, `tests/trigger-cap.test.js`, existing `fsbAgentCap` UI path |
| Count active trigger snapshots from `chrome.storage.session.fsbTriggerRegistry`. | Confident | `extension/utils/trigger-store.js`, `extension/utils/trigger-manager.js` |

### Watch-Mode Conflict and Refresh-Poll Coalescing

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Add `TRIGGER_TAB_WATCH_CONFLICT` in the background arm path before persistence. | Likely | `extension/background.js` `fsbTriggerHandleToolArm`, `FsbTriggerStore`, prior roadmap success criteria |
| Same-mode live-observe triggers can remain independent; same-tab refresh-poll triggers should coalesce reload work. | Likely | Phase 17 refresh-poll architecture, `fsbTriggerRunRefreshPollTick`, Phase 20 roadmap criterion |
| Coalescing belongs in refresh-poll runtime, not MCP. | Confident | `mcp/src/tools/triggers.ts` is reporting wrapper; background owns reload/read/evaluate |

### Docs, Versioning, and Public MCP Surface

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Bump MCP package metadata to `0.10.0` without dependency changes. | Confident | Phase 20 roadmap, `mcp/package.json`, `mcp/src/version.ts`, `tests/mcp-version-parity.test.js` |
| Add `0.10.0` changelog and Trigger Watchers README docs. | Confident | `mcp/CHANGELOG.md`, `mcp/README.md`, root `README.md` docs governance |
| Root README stays overview-level; detailed trigger semantics go in MCP README. | Confident | `README.md` docs governance notes |

### Live Browser UAT and Release Readiness

| Assumption | Confidence | Evidence |
|------------|------------|----------|
| Phase 20 owns deferred Phase 16 live-browser UAT evidence. | Confident | `.planning/STATE.md`, `.planning/phases/16-live-observe-watch-analyzing-pulse/16-VERIFICATION.md` |
| Add composed trigger UAT for blocking, detached, timeout, rearm, refresh-poll focus retention, conflict/coalescing, and owner cleanup. | Likely | Phase 20 roadmap, Phase 19 summary, existing focused automated tests |
| Publish/tag actions remain user-gated. | Confident | `.planning/STATE.md` deferred publish gates and prior release pattern |

## Corrections Made

No corrections -- assumptions mode proceeded from existing code and roadmap evidence.

## External Research

No external research performed. Phase 20 decisions are grounded in in-repo runtime, UI, docs, and test surfaces.
