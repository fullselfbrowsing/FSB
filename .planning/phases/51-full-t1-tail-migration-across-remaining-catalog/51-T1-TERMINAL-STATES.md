# Phase 51 T1 Terminal States

**Generated:** 2026-07-04T08:32:16.151Z

Descriptors are executable only with current handler/recipe proof. Bridge, write, blocked, and discovery rows remain non-invocable until their required proof is satisfied.

## Summary

| Metric | Count |
|--------|------:|
| Total descriptors | 2314 |
| T1-ready rows | 1310 |
| Guarded fail-closed rows | 564 |
| Bridge-needed rows | 1 |
| UAT-needed rows | 176 |
| Blocked rows | 39 |
| Degraded/discovery-pending rows | 224 |

## Surface Status Counts

| Item | Count |
|------|------:|
| `t1-ready` | 1310 |
| `guarded-fail-closed` | 564 |
| `degraded-discovery-pending` | 224 |
| `uat-needed` | 176 |
| `blocked` | 39 |
| `bridge-needed` | 1 |

## Terminal State Counts

| Item | Count |
|------|------:|
| `t1-ready` | 1310 |
| `guarded-fail-closed` | 564 |
| `same-origin-proof-required` | 224 |
| `live-uat-required` | 176 |
| `blocked-policy` | 39 |
| `pattern-d-bridge-blocked` | 1 |

## App Readiness Rollup

| App | Status | Ready | Guarded | Bridge | UAT | Blocked | Degraded |
|-----|--------|------:|--------:|-------:|----:|--------:|---------:|
| `onlyfans` | `blocked` | 0 | 0 | 0 | 0 | 21 | 0 |
| `netflix` | `blocked` | 0 | 0 | 0 | 0 | 18 | 0 |
| `datadog` | `bridge-needed` | 46 | 0 | 1 | 24 | 0 | 0 |
| `bsky` | `uat-needed` | 12 | 0 | 0 | 18 | 0 | 8 |
| `x` | `uat-needed` | 2 | 0 | 0 | 15 | 0 | 14 |
| `cloudflare` | `uat-needed` | 25 | 0 | 0 | 5 | 0 | 0 |
| `stripe` | `uat-needed` | 21 | 0 | 0 | 9 | 0 | 0 |
| `shortcut` | `uat-needed` | 8 | 0 | 0 | 11 | 0 | 8 |
| `leetcode` | `uat-needed` | 24 | 0 | 0 | 1 | 0 | 1 |
| `meticulous` | `uat-needed` | 21 | 0 | 0 | 5 | 0 | 0 |
| `asana` | `uat-needed` | 15 | 0 | 0 | 9 | 0 | 0 |
| `reddit` | `uat-needed` | 14 | 0 | 0 | 10 | 0 | 0 |
| `newrelic` | `uat-needed` | 12 | 0 | 0 | 10 | 0 | 0 |
| `chatgpt` | `uat-needed` | 13 | 0 | 0 | 7 | 0 | 0 |
| `dominos` | `uat-needed` | 6 | 0 | 0 | 6 | 0 | 8 |
| `notion` | `uat-needed` | 8 | 0 | 0 | 5 | 0 | 7 |
| `pandaexpress` | `uat-needed` | 4 | 0 | 0 | 7 | 0 | 7 |
| `target` | `uat-needed` | 2 | 0 | 0 | 4 | 0 | 12 |
| `youtube` | `uat-needed` | 0 | 0 | 0 | 8 | 0 | 10 |
| `chipotle` | `uat-needed` | 4 | 0 | 0 | 1 | 0 | 11 |
| `costco` | `uat-needed` | 3 | 0 | 0 | 4 | 0 | 9 |
| `amplitude` | `uat-needed` | 14 | 0 | 0 | 1 | 0 | 0 |
| `ytmusic` | `uat-needed` | 0 | 0 | 0 | 5 | 0 | 10 |
| `airbnb` | `uat-needed` | 13 | 0 | 0 | 1 | 0 | 0 |
| `instacart` | `uat-needed` | 6 | 0 | 0 | 2 | 0 | 4 |
| `bestbuy` | `uat-needed` | 2 | 0 | 0 | 1 | 0 | 8 |
| `doordash` | `uat-needed` | 6 | 0 | 0 | 5 | 0 | 0 |
| `hackernews` | `uat-needed` | 9 | 0 | 0 | 1 | 0 | 0 |
| `stubhub` | `uat-needed` | 3 | 0 | 0 | 1 | 0 | 0 |
| `twilio` | `degraded-discovery-pending` | 1 | 11 | 0 | 0 | 0 | 23 |
| `instagram` | `degraded-discovery-pending` | 5 | 10 | 0 | 0 | 0 | 13 |
| `stackoverflow` | `degraded-discovery-pending` | 9 | 0 | 0 | 0 | 0 | 11 |
| `wikipedia` | `degraded-discovery-pending` | 17 | 0 | 0 | 0 | 0 | 2 |
| `priceline` | `degraded-discovery-pending` | 3 | 0 | 0 | 0 | 0 | 15 |
| `facebook` | `degraded-discovery-pending` | 2 | 3 | 0 | 0 | 0 | 9 |
| `npm` | `degraded-discovery-pending` | 11 | 0 | 0 | 0 | 0 | 3 |
| `expedia` | `degraded-discovery-pending` | 6 | 0 | 0 | 0 | 0 | 6 |
| `tripadvisor` | `degraded-discovery-pending` | 10 | 0 | 0 | 0 | 0 | 2 |
| `zillow` | `degraded-discovery-pending` | 8 | 0 | 0 | 0 | 0 | 4 |
| `booking` | `degraded-discovery-pending` | 6 | 0 | 0 | 0 | 0 | 4 |
| `homedepot` | `degraded-discovery-pending` | 6 | 1 | 0 | 0 | 0 | 3 |
| `walmart` | `degraded-discovery-pending` | 4 | 0 | 0 | 0 | 0 | 6 |
| `vercel` | `degraded-discovery-pending` | 7 | 0 | 0 | 0 | 0 | 1 |
| `yelp` | `degraded-discovery-pending` | 3 | 0 | 0 | 0 | 0 | 4 |
| `threads` | `degraded-discovery-pending` | 1 | 1 | 0 | 0 | 0 | 1 |
| `linear` | `guarded-fail-closed` | 28 | 31 | 0 | 0 | 0 | 0 |
| `retool` | `guarded-fail-closed` | 28 | 22 | 0 | 0 | 0 | 0 |
| `netlify` | `guarded-fail-closed` | 21 | 19 | 0 | 0 | 0 | 0 |
| `posthog` | `guarded-fail-closed` | 24 | 14 | 0 | 0 | 0 | 0 |
| `terraform` | `guarded-fail-closed` | 21 | 17 | 0 | 0 | 0 | 0 |
| `circleci` | `guarded-fail-closed` | 21 | 12 | 0 | 0 | 0 | 0 |
| `todoist` | `guarded-fail-closed` | 12 | 21 | 0 | 0 | 0 | 0 |
| `tumblr` | `guarded-fail-closed` | 20 | 12 | 0 | 0 | 0 | 0 |
| `minimax` | `guarded-fail-closed` | 1 | 30 | 0 | 0 | 0 | 0 |
| `gcloud` | `guarded-fail-closed` | 24 | 6 | 0 | 0 | 0 | 0 |
| `excel` | `guarded-fail-closed` | 10 | 19 | 0 | 0 | 0 | 0 |
| `bitbucket` | `guarded-fail-closed` | 18 | 9 | 0 | 0 | 0 | 0 |
| `msword` | `guarded-fail-closed` | 12 | 15 | 0 | 0 | 0 | 0 |
| `azure` | `guarded-fail-closed` | 19 | 7 | 0 | 0 | 0 | 0 |
| `discord` | `guarded-fail-closed` | 13 | 13 | 0 | 0 | 0 | 0 |

## Machine-Readable Rows

The full descriptor-level report is written to `51-T1-TERMINAL-STATES.json`.
