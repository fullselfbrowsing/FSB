---
gsd_state_version: 1.0
milestone: v0.9.70
milestone_name: Showcase Dashboard Reliability (Streaming + Sync + Viewport)
status: in_progress
last_updated: "2026-05-18T00:00:00.000Z"
last_activity: "2026-05-18 -- streaming and viewport slices marked complete after merged/deployed fixes; Sync-tab remote-control restoration is now active"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 3
  completed_plans: 2
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-18 -- streaming/viewport complete; Sync remote control active)
See: .planning/MILESTONES.md (v0.9.69 shipped 2026-05-14; v0.9.70 in flight)
See: .planning/ROADMAP.md (v0.9.70 active supplement added above archived v0.9.69 roadmap)
See: .planning/REQUIREMENTS.md (v0.9.70 active supplement added above archived v0.9.69 requirements)

**Core value:** Reliable single-attempt execution -- the AI decides correctly, the mechanics execute precisely.
**Current focus:** v0.9.70 Showcase Dashboard Reliability (Streaming + Sync + Viewport). Dashboard DOM streaming and preview viewport fitting are complete and deployed. Active focus is Sync-tab remote-control restoration on `https://full-selfbrowsing.com`. Deploy target remains Fly.io.

## Current Position

Phase: 279 -- Sync Tab Remote-Control Restoration
Plan: 279-01 -- diagnose pairing + remote-command dispatch, then minimum patch
Status: Investigating
Last activity: 2026-06-04 -- Quick task 260604-jw8: repo transfer LakshmanTurlapati/FSB -> fullselfbrowsing/FSB complete; PR #88 open + CI all-green

## Performance Metrics

- Last milestone: v0.9.69 (8 phases [269-276], 9 plans, 67/68 requirements Complete + 1 Partial by design, tech_debt audit).
- Milestone before: v0.9.63 (7 phases, 15 plans, 14/14 requirements traced, audit passed).
- Milestone before: v0.9.62 (7 phases, 15 plans, 27/27 requirements traced, audit passed).
- Tag: `v0.9.69` created locally. Push remains user-gated.

## Active Milestone Carry-Forward (from v0.9.69)

- **Streaming carry-forward CLOSED:** Phase 276 defensive work was followed by v0.9.70 fixes for content-script DOM stream injection, 16:10 desktop preview fit, and fullscreen actual-screen fit. User verified live streaming works after PR #73 deploy.
- **Active remote-control carry-forward:** Sync-tab pairing / remote-command dispatch remains broken and is the only active v0.9.70 reliability item.
- **CWS Developer Dashboard click-through (BLOCKER B3 follow-up):** in-repo CI guard shipped in v0.9.69 Phase 275; the manual dashboard click-through remains user-gated per D-15 (8-step checklist in `.planning/milestones/v0.9.69/phases/275-…/275-VERIFICATION.md`).

## Deferred Items

Items acknowledged and deferred across prior milestones. None are v0.9.70 work; all predate this milestone.

| Category | Slug | Status |
|----------|------|--------|
| debug_session | angular-showcase-empty-pages | awaiting_human_verify |
| debug_session | auth-blocked-partial-outcome-lifecycle | diagnosed |
| debug_session | content-script-injection-failure | verifying |
| debug_session | e2e-career-session2 | diagnosed |
| debug_session | fsb-core-not-executing | verifying |
| debug_session | fsb-reliability | verifying |
| debug_session | gdocs-editor-typing | verifying |
| debug_session | gdocs-formatted-text | verifying |
| debug_session | overlay-lifecycle-rehydration-gap | diagnosed |
| debug_session | sheets-blindness-post-fix | diagnosed |
| quick_task | 260508-gu8-add-agents-nav-page-to-showcase-fsb-skil | missing |

Total: 11 items. Triage via `/gsd-debug` and `/gsd-cleanup` during a future milestone cycle.

## Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260514-1nv | Showcase /stats Easter-egg page with live GitHub graphs, footer-only entry, 5-min visibility-aware polling | 2026-05-14 | 7d9e449 |  | [260514-1nv-showcase-stats-page-footer-only-easter-e](./quick/260514-1nv-showcase-stats-page-footer-only-easter-e/) |
| 260514-pu4 | Wire showcase/server + showcase/angular deps into ci.yml extension job for v0.9.69 PR checks | 2026-05-14 | fbbdae2 |  | [260514-pu4-wire-showcase-server-showcase-angular-de](./quick/260514-pu4-wire-showcase-server-showcase-angular-de/) |
| 260514-r6i | Fix showcase CSP `connect-src` so /stats Easter-egg page can fetch from api.github.com | 2026-05-15 | a70d550 |  | [260514-r6i-fix-csp-on-showcase-server-to-unblock-st](./quick/260514-r6i-fix-csp-on-showcase-server-to-unblock-st/) |
| 260514-rm4 | Fix two Codex P1 telemetry bugs from PR #50 review (serialize recordDispatch rmw + strip `attempts`) | 2026-05-15 | 2e514c1 |  | [260514-rm4-fix-two-p1-telemetry-bugs-from-codex-pr-](./quick/260514-rm4-fix-two-p1-telemetry-bugs-from-codex-pr-/) |
| 260514-w34 | Add showcase/server + showcase/angular install steps to chrome-extension.yml | 2026-05-15 | 5cb4869 |  | [260514-w34-fix-chrome-extension-yml-dep-gap-add-sho](./quick/260514-w34-fix-chrome-extension-yml-dep-gap-add-sho/) |
| 260514-wdy | Add cumulative-commits all-time line chart to /stats; bump MAX_PAGES 2 -> 30 | 2026-05-15 | 5ac9aaf |  | [260514-wdy-add-cumulative-commits-all-time-line-cha](./quick/260514-wdy-add-cumulative-commits-all-time-line-cha/) |
| 260514-x4s | Bump FSB version 0.9.65 -> 0.9.66 across 8 manifest/README/CWS-listing surfaces | 2026-05-15 | 7758deb |  | [260514-x4s-bump-fsb-version-0-9-65-0-9-66-across-al](./quick/260514-x4s-bump-fsb-version-0-9-65-0-9-66-across-al/) |
| 260515-i1j | Fix telemetry mcp_client recording as 'unknown' (extractMcpClientLabel helper) | 2026-05-15 | (PR #57 merged) |  | [260515-i1j-fix-telemetry-mcp-client-recording-as-un](./quick/260515-i1j-fix-telemetry-mcp-client-recording-as-un/) |
| 260515-kw1 | Replace 8 /stats chart views with richer visualizations | 2026-05-15 | ea9f85c2 |  | [260515-kw1-replace-8-stats-chart-views-with-richer-](./quick/260515-kw1-replace-8-stats-chart-views-with-richer-/) |
| 260515-mfs | Fix 3 Codex P1/P2 review findings on PR #58 follow-up | 2026-05-15 | 773fc073 |  | [260515-mfs-fix-3-codex-p1-p2-findings-on-pr-58-canv](./quick/260515-mfs-fix-3-codex-p1-p2-findings-on-pr-58-canv/) |
| 260516-7l5 | Server-side GitHub stats cache + Angular client swap (stop burning visitor rate limit) | 2026-05-16 | 028c5141 | merged | [260516-7l5-server-side-github-stats-cache-angular-c](./quick/260516-7l5-server-side-github-stats-cache-angular-c/) |
| 260516-pr59 | Per-agent client label cache for non-action MCP message routes; module-wide _lastKnownMcpClientLabel replaced with Map<agentId, label> | 2026-05-16 | (PR #59 merged) | merged | -- |
| 260516-pr62 | Lower telemetry K_ANONYMITY_FLOOR 5 -> 2 so /stats surfaces real client labels at single-digit total installs | 2026-05-16 | (PR #62 merged) | merged | -- |
| 260516-pr63 | MCP transport `z.coerce.number()` at jsonSchemaToZod translator + 7 hand-rolled sites so MCP clients can pass tabId/tab_id as either string or number | 2026-05-16 | (PR #63 merged) | merged | -- |
| 260516-pr64 | Bump fsb-mcp-server 0.9.1 -> 0.9.2 to pick up the numeric coercion fix; auto-published to npm via mcp-v0.9.2 tag + chrome extension v0.9.67 zip released | 2026-05-16 | (PR #64 merged) | merged | -- |
| 260604-jw8 | Transfer FSB repo LakshmanTurlapati/FSB -> fullselfbrowsing/FSB via gh CLI; sweep all hardcoded URL refs (42 files), bump MCP to v0.9.3 with renamed mcpName, preserve all personal-credit fields | 2026-06-04 | (PR #88) | in-review | [260604-jw8-transfer-fsb-repo-to-fullselfbrowsing-or](./quick/260604-jw8-transfer-fsb-repo-to-fullselfbrowsing-or/) |

## Pending User-Gated Actions (carry-forward)

- `git push origin Refinements && git push origin v0.9.69` -- branch + tag will land at v0.9.69 close.
- `git push origin feat/showcase-i18n && git push origin v0.9.63` -- branch + tag NOT pushed (v0.9.63).
- `git push origin refinements && git push origin v0.9.62` -- branch + tag NOT pushed (v0.9.62).
- `npm publish fsb-mcp-server@0.9.0` -- superseded; current npm tip is `fsb-mcp-server@0.9.2` (auto-published from PR #64). v0.9.0 carry-forward closed.
- `clawhub publish "skills/FSB Skill"` -- carry-forward from v0.9.61.
- 4 live-OpenClaw runtime UAT items carried from v0.9.61.
- CWS Developer Dashboard Privacy Practices tab click-through (user-gated per BLOCKER #3 / D-15).
- Decision on whether to rename `v0.9.67` release tag to `extension-v0.9.67` so `chrome-extension.yml` auto-attach owns the zip going forward (option a: leave as-is; option b: re-tag).

## Next Milestone Candidates (after v0.9.70)

- **v0.9.71 (telemetry follow-up):** first-run banner, "View what we send" preview, "Reset anonymous ID" button, "Wipe my data" UI, region-gated opt-IN for EU/UK/CA, public versioned `/api/public-stats` documentation, per-day spark lines, geo heatmap.
- **v0.9.64 (UX, carry-forward):** revisit WARNING-02 picker-cookie short-circuit on bare-`/` Accept-Language redirect.
- **v0.9.65 (dashboard i18n, carry-forward):** translate `showcase/angular/src/app/pages/dashboard/**`.

## Session Continuity

Last session: 2026-05-16 -- v0.9.70 milestone initialization in progress. PROJECT.md "Current Milestone" rewritten to v0.9.70 Showcase Dashboard Reliability; STATE.md frontmatter + Current Position reset. Pending: research decision, REQUIREMENTS.md, ROADMAP.md, milestone-start commit.
Resume file: None.
