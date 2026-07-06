# Phase 50 Next-Batch Backlog

This backlog is derived from the regenerated readiness matrix on 2026-06-29. It ranks candidates by user value, feasibility, and risk. Counts are descriptor counts in the current catalog, not commitments that every row should be ported in one phase.

## Recommended Next Milestone Sequence

| Rank | Track | Candidate Apps | Count | Value | Feasibility | Risk | Next Action |
|------|-------|----------------|------:|-------|-------------|------|-------------|
| 1 | Proven-head read expansion | `circleci`, `netlify`, `bitbucket`, `vercel`, `notion` | 70+ remaining candidates | High | High | Low-Medium | Extend existing handlers with the same contract tests and live UAT. |
| 2 | Low-risk same-origin read heads | `stackoverflow`, `leetcode`, `wikipedia`, `tumblr`, `mongodb`, `shortcut` | 120+ read candidates | Medium-High | High | Low | Add first read heads where authenticated same-origin JSON is visible and non-sensitive. |
| 3 | Dev/SaaS same-origin reads needing auth review | `meticulous`, `terraform`, `supabase`, `cloudflare`, `retool` | 100+ read candidates | High | Medium | Medium | Capture same-origin request shapes and prove no token extraction or unsafe XSRF handling. |
| 4 | Pattern-D bridge family | `datadog`, `linear`, `posthog`, `sentry`, `jira`, `asana`, `confluence`, `airtable` | 300+ candidates | Very High | Medium-Low | Medium-High | Build a separate-origin/per-org bridge only after a dedicated Wall 2 design is approved. |
| 5 | GAPI/page bridge family | `gdrive`, `gdocs`, `gcal`, `gcloud`, `ganalytics`, `notebooklm` | 120+ candidates | Very High | Medium-Low | Medium-High | Design and prove a `window.gapi.client.request` or equivalent page-bound bridge. |
| 6 | Guarded write activation | `github`, `gitlab`, `slack` guarded writes | 5 guarded rows | High | Medium | High | Use Phase 49 live UAT template; activate only with redacted mutation-body proof. |
| 7 | Sensitive consumer/social reads | `reddit`, `bsky`, `x`, `instagram`, `priceline`, `stripe`, `twilio` | 140+ read candidates | Medium-High | Medium | High | Defer until product/legal posture and UAT accounts are explicit. |
| 8 | Denied/blocked apps | `carta`, `fidelity`, `netflix`, `onlyfans`, `robinhood`, `spotify`, `steam`, `tinder`, `twitch`, `youtube`, `ytmusic` | 194 blocked rows | Low for T1 | Low | High | Keep blocked unless denylist policy changes. |

## First Wave Recommendation

Start the next milestone with a narrow "read expansion wave" instead of promising all apps:

1. Expand existing proven heads: CircleCI, Netlify, Bitbucket, Vercel, and Notion reads.
2. Add 3-5 new low-risk same-origin read-only app heads, starting with StackOverflow, LeetCode, Wikipedia, MongoDB, and Shortcut.
3. Keep Pattern-D/GAPI and guarded writes as explicit architecture or live-UAT tracks rather than mixing them into the read wave.

## Why Airbnb Is Not First

Airbnb has 14 same-origin read candidates and may be feasible, but it is a sensitive travel/identity surface. It should remain behind low-risk developer/reference apps unless a live account and product/legal acceptance are available.

## Non-Goals

- Do not convert DOM descriptors to T1 based only on catalog presence.
- Do not activate writes without Phase 49-style evidence.
- Do not weaken the origin boundary to handle Pattern-D or GAPI candidates casually.
- Do not mark blocked apps ready without an explicit denylist policy change.
