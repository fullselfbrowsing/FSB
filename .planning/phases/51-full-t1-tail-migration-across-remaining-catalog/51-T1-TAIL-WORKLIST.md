# Phase 51 T1 Tail Worklist

**Generated:** 2026-07-02T07:14:28.218Z

This worklist is generated from the Phase 44 readiness report and covers every descriptor that is not currently executable T1 or guarded fail-closed. It is a migration target list, not an execution claim.

## Summary

| Metric | Count |
|--------|------:|
| Total descriptors | 2314 |
| Current T1-ready descriptors | 1310 |
| Current guarded fail-closed rows | 564 |
| Tail rows in this worklist | 440 |
| Actionable non-denied tail rows | 401 |
| Blocked policy rows | 39 |
| Read rows | 266 |
| Write rows | 135 |
| Destructive rows | 39 |

## Workstreams

| Item | Count |
|------|------:|
| `same-origin-read` | 230 |
| `write-destructive-uat` | 168 |
| `blocked-policy` | 39 |
| `pattern-d` | 3 |

## Largest App Buckets

| Item | Count |
|------|------:|
| `x` | 29 |
| `bsky` | 26 |
| `datadog` | 25 |
| `twilio` | 23 |
| `onlyfans` | 21 |
| `shortcut` | 19 |
| `netflix` | 18 |
| `youtube` | 18 |
| `target` | 16 |
| `priceline` | 15 |
| `ytmusic` | 15 |
| `dominos` | 14 |
| `pandaexpress` | 14 |
| `costco` | 13 |
| `instagram` | 13 |
| `chipotle` | 12 |
| `notion` | 12 |
| `stackoverflow` | 11 |
| `newrelic` | 10 |
| `reddit` | 10 |
| `asana` | 9 |
| `bestbuy` | 9 |
| `facebook` | 9 |
| `stripe` | 9 |
| `chatgpt` | 7 |
| `expedia` | 6 |
| `instacart` | 6 |
| `walmart` | 6 |
| `cloudflare` | 5 |
| `doordash` | 5 |
| `meticulous` | 5 |
| `booking` | 4 |
| `yelp` | 4 |
| `zillow` | 4 |
| `homedepot` | 3 |
| `npm` | 3 |
| `leetcode` | 2 |
| `tripadvisor` | 2 |
| `wikipedia` | 2 |
| `airbnb` | 1 |
| `amplitude` | 1 |
| `hackernews` | 1 |
| `stubhub` | 1 |
| `threads` | 1 |
| `vercel` | 1 |

## Route Feasibility

| Item | Count |
|------|------:|
| `same-origin-read-candidate` | 230 |
| `dom-discovery-only` | 137 |
| `blocked` | 39 |
| `pattern-d-candidate` | 34 |

## Origin Class

| Item | Count |
|------|------:|
| `sensitive` | 285 |
| `standard` | 116 |
| `denied` | 39 |

## Machine-Readable Rows

The full per-descriptor worklist is written to `51-T1-TAIL-WORKLIST.json`.
