# Phase 51 T1 Tail Worklist

**Generated:** 2026-06-30T01:53:58.235Z

This worklist is generated from the Phase 44 readiness report and covers every descriptor that is not currently executable T1 or guarded fail-closed. It is a migration target list, not an execution claim.

## Summary

| Metric | Count |
|--------|------:|
| Total descriptors | 2314 |
| Current T1-ready descriptors | 45 |
| Current guarded fail-closed writes | 5 |
| Tail rows in this worklist | 2264 |
| Actionable non-denied tail rows | 2070 |
| Blocked policy rows | 194 |
| Read rows | 1590 |
| Write rows | 508 |
| Destructive rows | 166 |

## Workstreams

| Item | Count |
|------|------:|
| `same-origin-read` | 1120 |
| `write-destructive-uat` | 638 |
| `pattern-d` | 229 |
| `blocked-policy` | 194 |
| `gapi-bridge` | 83 |

## Largest App Buckets

| Item | Count |
|------|------:|
| `datadog` | 71 |
| `linear` | 59 |
| `retool` | 50 |
| `bsky` | 38 |
| `posthog` | 38 |
| `terraform` | 38 |
| `netlify` | 36 |
| `twilio` | 35 |
| `todoist` | 33 |
| `tumblr` | 32 |
| `minimax` | 31 |
| `x` | 31 |
| `cloudflare` | 30 |
| `gcloud` | 30 |
| `stripe` | 30 |
| `excel` | 29 |
| `instagram` | 28 |
| `msword` | 27 |
| `shortcut` | 27 |
| `azure` | 26 |
| `discord` | 26 |
| `leetcode` | 26 |
| `meticulous` | 26 |
| `powerpoint` | 26 |
| `supabase` | 26 |
| `asana` | 24 |
| `bitbucket` | 24 |
| `outlook` | 24 |
| `pinterest` | 24 |
| `circleci` | 23 |
| `reddit` | 23 |
| `robinhood` | 23 |
| `telegram` | 23 |
| `newrelic` | 22 |
| `ynab` | 22 |
| `confluence` | 21 |
| `onlyfans` | 21 |
| `sentry` | 21 |
| `spotify` | 21 |
| `whatsapp` | 21 |
| `carta` | 20 |
| `chatgpt` | 20 |
| `dominos` | 20 |
| `jira` | 20 |
| `lucid` | 20 |
| `medium` | 20 |
| `mongodb` | 20 |
| `stackoverflow` | 20 |
| `starbucks` | 20 |
| `gdocs` | 19 |

## Route Feasibility

| Item | Count |
|------|------:|
| `same-origin-read-candidate` | 1120 |
| `dom-discovery-only` | 480 |
| `pattern-d-candidate` | 337 |
| `blocked` | 194 |
| `gapi-bridge-candidate` | 133 |

## Origin Class

| Item | Count |
|------|------:|
| `standard` | 1333 |
| `sensitive` | 737 |
| `denied` | 194 |

## Machine-Readable Rows

The full per-descriptor worklist is written to `51-T1-TAIL-WORKLIST.json`.
