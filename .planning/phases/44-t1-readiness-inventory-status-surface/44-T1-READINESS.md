# Phase 44 T1 Readiness Matrix

**Generated:** 2026-07-02T07:29:03.767Z

This report is generated from `extension/catalog/recipe-index.generated.js` plus the live `capability-catalog.js` resolver. It is the v1.1.0 truth surface: catalog/search support means a capability is searchable and routable, not that every app has direct API execution today.

## Baseline

| Metric | Count |
|--------|------:|
| Total descriptors | 2314 |
| App stems | 128 |
| Distinct service hosts | 129 |
| T0/T1a/T1b resolved descriptors | 1874 |
| T1 ready executable descriptors | 1310 |
| T1 guarded fail-closed rows | 564 |
| Learn-pending descriptors | 0 |
| DOM/discovery-pending descriptors | 401 |
| Blocked descriptors | 39 |
| Catalog tail not direct API-ready | 440 |

## What This Means

The catalog spans 128 app stems. That 128-app breadth is catalog/search support, not direct API execution for every app. `invoke_capability` executes only proven T0/T1a/T1b handlers or recipes today; guarded rows return fail-closed pending live proof; the remaining 440-descriptor tail stays DOM/discovery, learn-pending, or blocked by denylist.

Non-denied origins are allowed under Auto for ordinary capability invoke. Denylisted origins remain blocked. Sensitive origins are flagged in UI/audit records, while extra confirmation remains scoped to network-capture discovery.

## Readiness Totals

| Status | Count |
|--------|------:|
| t1-ready | 1310 |
| t1-guarded-fail-closed | 564 |
| learn-pending | 0 |
| discovery-pending | 401 |
| blocked | 39 |
| unknown | 0 |

## Per-App Rollup

| App | Total | Ready | Guarded | Learn | Discovery | Blocked |
|-----|------:|------:|--------:|------:|----------:|--------:|
| `airbnb` | 14 | 13 | 0 | 0 | 1 | 0 |
| `airtable` | 8 | 6 | 2 | 0 | 0 | 0 |
| `amazon` | 6 | 4 | 2 | 0 | 0 | 0 |
| `amplitude` | 15 | 14 | 0 | 0 | 1 | 0 |
| `asana` | 24 | 15 | 0 | 0 | 9 | 0 |
| `aws` | 16 | 13 | 3 | 0 | 0 | 0 |
| `azure` | 26 | 19 | 7 | 0 | 0 | 0 |
| `bestbuy` | 11 | 2 | 0 | 0 | 9 | 0 |
| `bitbucket` | 27 | 18 | 9 | 0 | 0 | 0 |
| `booking` | 10 | 6 | 0 | 0 | 4 | 0 |
| `bsky` | 38 | 12 | 0 | 0 | 26 | 0 |
| `calendly` | 15 | 9 | 6 | 0 | 0 | 0 |
| `carta` | 20 | 20 | 0 | 0 | 0 | 0 |
| `chatgpt` | 20 | 13 | 0 | 0 | 7 | 0 |
| `chipotle` | 16 | 4 | 0 | 0 | 12 | 0 |
| `circleci` | 33 | 21 | 12 | 0 | 0 | 0 |
| `claude` | 14 | 7 | 7 | 0 | 0 | 0 |
| `clickhouse` | 9 | 9 | 0 | 0 | 0 | 0 |
| `clickup` | 11 | 11 | 0 | 0 | 0 | 0 |
| `cloudflare` | 30 | 25 | 0 | 0 | 5 | 0 |
| `cockroachdb` | 18 | 13 | 5 | 0 | 0 | 0 |
| `coinbase` | 17 | 11 | 6 | 0 | 0 | 0 |
| `confluence` | 21 | 13 | 8 | 0 | 0 | 0 |
| `costco` | 16 | 3 | 0 | 0 | 13 | 0 |
| `craigslist` | 9 | 6 | 3 | 0 | 0 | 0 |
| `datadog` | 71 | 46 | 0 | 0 | 25 | 0 |
| `discord` | 26 | 13 | 13 | 0 | 0 | 0 |
| `dockerhub` | 12 | 9 | 3 | 0 | 0 | 0 |
| `dominos` | 20 | 6 | 0 | 0 | 14 | 0 |
| `doordash` | 11 | 6 | 0 | 0 | 5 | 0 |
| `ebay` | 8 | 7 | 1 | 0 | 0 | 0 |
| `etsy` | 5 | 3 | 2 | 0 | 0 | 0 |
| `eventbrite` | 4 | 3 | 1 | 0 | 0 | 0 |
| `excel` | 29 | 10 | 19 | 0 | 0 | 0 |
| `expedia` | 12 | 6 | 0 | 0 | 6 | 0 |
| `facebook` | 14 | 2 | 3 | 0 | 9 | 0 |
| `fidelity` | 13 | 13 | 0 | 0 | 0 | 0 |
| `figma` | 14 | 10 | 4 | 0 | 0 | 0 |
| `fiverr` | 8 | 7 | 1 | 0 | 0 | 0 |
| `ganalytics` | 8 | 8 | 0 | 0 | 0 | 0 |
| `gcal` | 18 | 9 | 9 | 0 | 0 | 0 |
| `gcloud` | 30 | 24 | 6 | 0 | 0 | 0 |
| `gdocs` | 19 | 7 | 12 | 0 | 0 | 0 |
| `gdrive` | 17 | 6 | 11 | 0 | 0 | 0 |
| `gemini` | 6 | 4 | 2 | 0 | 0 | 0 |
| `github` | 3 | 2 | 1 | 0 | 0 | 0 |
| `gitlab` | 22 | 16 | 6 | 0 | 0 | 0 |
| `glama` | 15 | 15 | 0 | 0 | 0 | 0 |
| `gmaps` | 16 | 15 | 1 | 0 | 0 | 0 |
| `grafana` | 3 | 3 | 0 | 0 | 0 | 0 |
| `grubhub` | 5 | 3 | 2 | 0 | 0 | 0 |
| `hack2hire` | 14 | 14 | 0 | 0 | 0 | 0 |
| `hackernews` | 10 | 9 | 0 | 0 | 1 | 0 |
| `homedepot` | 10 | 6 | 1 | 0 | 3 | 0 |
| `instacart` | 12 | 6 | 0 | 0 | 6 | 0 |
| `instagram` | 28 | 5 | 10 | 0 | 13 | 0 |
| `jira` | 20 | 12 | 8 | 0 | 0 | 0 |
| `kayak` | 4 | 3 | 1 | 0 | 0 | 0 |
| `leetcode` | 26 | 24 | 0 | 0 | 2 | 0 |
| `linear` | 59 | 28 | 31 | 0 | 0 | 0 |
| `linkedin` | 6 | 5 | 1 | 0 | 0 | 0 |
| `lucid` | 20 | 14 | 6 | 0 | 0 | 0 |
| `lyft` | 5 | 3 | 2 | 0 | 0 | 0 |
| `mastodon` | 4 | 2 | 2 | 0 | 0 | 0 |
| `medium` | 20 | 15 | 5 | 0 | 0 | 0 |
| `meticulous` | 26 | 21 | 0 | 0 | 5 | 0 |
| `minimax` | 31 | 1 | 30 | 0 | 0 | 0 |
| `mongodb` | 20 | 16 | 4 | 0 | 0 | 0 |
| `msword` | 27 | 12 | 15 | 0 | 0 | 0 |
| `netflix` | 18 | 0 | 0 | 0 | 0 | 18 |
| `netlify` | 40 | 21 | 19 | 0 | 0 | 0 |
| `newrelic` | 22 | 12 | 0 | 0 | 10 | 0 |
| `notebooklm` | 19 | 9 | 10 | 0 | 0 | 0 |
| `notion` | 20 | 8 | 0 | 0 | 12 | 0 |
| `npm` | 14 | 11 | 0 | 0 | 3 | 0 |
| `onenote` | 12 | 8 | 4 | 0 | 0 | 0 |
| `onlyfans` | 21 | 0 | 0 | 0 | 0 | 21 |
| `opentable` | 5 | 3 | 2 | 0 | 0 | 0 |
| `outlook` | 24 | 12 | 12 | 0 | 0 | 0 |
| `pandaexpress` | 18 | 4 | 0 | 0 | 14 | 0 |
| `pinterest` | 24 | 14 | 10 | 0 | 0 | 0 |
| `posthog` | 38 | 24 | 14 | 0 | 0 | 0 |
| `powerpoint` | 26 | 14 | 12 | 0 | 0 | 0 |
| `priceline` | 18 | 3 | 0 | 0 | 15 | 0 |
| `reddit` | 24 | 14 | 0 | 0 | 10 | 0 |
| `redfin` | 12 | 12 | 0 | 0 | 0 | 0 |
| `retool` | 50 | 28 | 22 | 0 | 0 | 0 |
| `robinhood` | 23 | 21 | 2 | 0 | 0 | 0 |
| `sentry` | 21 | 19 | 2 | 0 | 0 | 0 |
| `shopify` | 5 | 3 | 2 | 0 | 0 | 0 |
| `shortcut` | 27 | 8 | 0 | 0 | 19 | 0 |
| `slack` | 24 | 11 | 13 | 0 | 0 | 0 |
| `snowflake` | 14 | 14 | 0 | 0 | 0 | 0 |
| `spotify` | 21 | 11 | 10 | 0 | 0 | 0 |
| `stackoverflow` | 20 | 9 | 0 | 0 | 11 | 0 |
| `starbucks` | 20 | 15 | 5 | 0 | 0 | 0 |
| `steam` | 15 | 9 | 6 | 0 | 0 | 0 |
| `stripe` | 30 | 21 | 0 | 0 | 9 | 0 |
| `stubhub` | 4 | 3 | 0 | 0 | 1 | 0 |
| `supabase` | 26 | 19 | 7 | 0 | 0 | 0 |
| `target` | 18 | 2 | 0 | 0 | 16 | 0 |
| `teams` | 11 | 4 | 7 | 0 | 0 | 0 |
| `telegram` | 23 | 12 | 11 | 0 | 0 | 0 |
| `temporal` | 8 | 8 | 0 | 0 | 0 | 0 |
| `terraform` | 38 | 21 | 17 | 0 | 0 | 0 |
| `threads` | 3 | 1 | 1 | 0 | 1 | 0 |
| `ticketmaster` | 4 | 3 | 1 | 0 | 0 | 0 |
| `tiktok` | 9 | 2 | 7 | 0 | 0 | 0 |
| `tinder` | 16 | 6 | 10 | 0 | 0 | 0 |
| `todoist` | 33 | 12 | 21 | 0 | 0 | 0 |
| `tripadvisor` | 12 | 10 | 0 | 0 | 2 | 0 |
| `tumblr` | 32 | 20 | 12 | 0 | 0 | 0 |
| `twilio` | 35 | 1 | 11 | 0 | 23 | 0 |
| `twitch` | 14 | 14 | 0 | 0 | 0 | 0 |
| `uber` | 8 | 8 | 0 | 0 | 0 | 0 |
| `ubereats` | 5 | 3 | 2 | 0 | 0 | 0 |
| `vercel` | 8 | 7 | 0 | 0 | 1 | 0 |
| `walmart` | 10 | 4 | 0 | 0 | 6 | 0 |
| `webflow` | 15 | 15 | 0 | 0 | 0 | 0 |
| `whatsapp` | 21 | 7 | 14 | 0 | 0 | 0 |
| `wikipedia` | 19 | 17 | 0 | 0 | 2 | 0 |
| `x` | 31 | 2 | 0 | 0 | 29 | 0 |
| `yelp` | 7 | 3 | 0 | 0 | 4 | 0 |
| `ynab` | 22 | 11 | 11 | 0 | 0 | 0 |
| `youtube` | 18 | 0 | 0 | 0 | 18 | 0 |
| `ytmusic` | 15 | 0 | 0 | 0 | 15 | 0 |
| `zendesk` | 17 | 13 | 4 | 0 | 0 | 0 |
| `zillow` | 12 | 8 | 0 | 0 | 4 | 0 |

## Next-Batch Candidates

### Same-Origin Reads
- `bestbuy.get_cart` (bestbuy.com)
- `bestbuy.get_product` (bestbuy.com)
- `bestbuy.get_product_reviews` (bestbuy.com)
- `bestbuy.get_purchase_details` (bestbuy.com)
- `bestbuy.get_saved_cards` (bestbuy.com)
- `bestbuy.list_purchases` (bestbuy.com)
- `bestbuy.navigate_to_checkout` (bestbuy.com)
- `bestbuy.search_products` (bestbuy.com)
- `booking.get_current_user` (booking.com)
- `booking.get_genius_status` (booking.com)
- `booking.list_trips` (booking.com)
- `booking.list_wishlists` (booking.com)
- `bsky.get_blocks` (bsky.app)
- `bsky.get_conversation` (bsky.app)
- `bsky.get_current_user` (bsky.app)
- `bsky.get_messages` (bsky.app)
- `bsky.get_timeline` (bsky.app)
- `bsky.get_unread_count` (bsky.app)
- `bsky.list_conversations` (bsky.app)
- `bsky.list_notifications` (bsky.app)
- `chipotle.get_current_user` (chipotle.com)
- `chipotle.get_extras_campaigns` (chipotle.com)
- `chipotle.get_favorites` (chipotle.com)
- `chipotle.get_last_restaurant` (chipotle.com)
- `chipotle.get_loyalty_points` (chipotle.com)
- `chipotle.get_menu_groups` (chipotle.com)
- `chipotle.get_payment_methods` (chipotle.com)
- `chipotle.get_promotions` (chipotle.com)
- `chipotle.get_recent_orders` (chipotle.com)
- `chipotle.get_reward_categories` (chipotle.com)

### Pattern-D Candidates
- `asana.add_followers` (app.asana.com)
- `asana.add_task_to_section` (app.asana.com)
- `asana.create_project` (app.asana.com)
- `asana.create_section` (app.asana.com)
- `asana.create_story` (app.asana.com)
- `asana.create_task` (app.asana.com)
- `asana.delete_task` (app.asana.com)
- `asana.update_project` (app.asana.com)
- `asana.update_task` (app.asana.com)
- `datadog.aggregate_rum_events` (datadoghq.com)
- `datadog.aggregate_spans` (datadoghq.com)
- `datadog.cancel_downtime` (datadoghq.com)
- `datadog.clone_dashboard` (datadoghq.com)
- `datadog.clone_monitor` (datadoghq.com)
- `datadog.create_downtime` (datadoghq.com)
- `datadog.create_monitor` (datadoghq.com)
- `datadog.create_notebook` (datadoghq.com)
- `datadog.delete_dashboard` (datadoghq.com)
- `datadog.delete_monitor` (datadoghq.com)
- `datadog.delete_notebook` (datadoghq.com)
- `datadog.get_monitor_state_history` (datadoghq.com)
- `datadog.mute_host` (datadoghq.com)
- `datadog.mute_monitor` (datadoghq.com)
- `datadog.pause_synthetics_test` (datadoghq.com)
- `datadog.query_timeseries` (datadoghq.com)
- `datadog.search_logs` (datadoghq.com)
- `datadog.search_rum_events` (datadoghq.com)
- `datadog.search_security_signals` (datadoghq.com)
- `datadog.search_spans` (datadoghq.com)
- `datadog.trigger_synthetics_test` (datadoghq.com)

### GAPI Bridge Candidates
- None in current report.

### Guarded Fail-Closed Rows
- `airtable.create_comment` (airtable.com)
- `airtable.update_cell` (airtable.com)
- `amazon.cancel_order` (www.amazon.com)
- `amazon.place_order` (www.amazon.com)
- `aws.invoke_function` (console.aws.amazon.com)
- `aws.start_instance` (console.aws.amazon.com)
- `aws.stop_instance` (console.aws.amazon.com)
- `azure.create_deployment` (portal.azure.com)
- `azure.create_lock` (portal.azure.com)
- `azure.create_resource_group` (portal.azure.com)
- `azure.delete_deployment` (portal.azure.com)
- `azure.delete_lock` (portal.azure.com)
- `azure.delete_resource` (portal.azure.com)
- `azure.delete_resource_group` (portal.azure.com)
- `bitbucket.approve_pull_request` (bitbucket.org)
- `bitbucket.create_branch` (bitbucket.org)
- `bitbucket.create_pr_comment` (bitbucket.org)
- `bitbucket.create_pull_request` (bitbucket.org)
- `bitbucket.create_repository` (bitbucket.org)
- `bitbucket.decline_pull_request` (bitbucket.org)
- `bitbucket.delete_branch` (bitbucket.org)
- `bitbucket.merge_pull_request` (bitbucket.org)
- `bitbucket.update_pull_request` (bitbucket.org)
- `calendly.activate_event_type` (calendly.com)
- `calendly.clone_event_type` (calendly.com)
- `calendly.create_event_type` (calendly.com)
- `calendly.deactivate_event_type` (calendly.com)
- `calendly.delete_event_type` (calendly.com)
- `calendly.update_event_type` (calendly.com)
- `circleci.approve_job` (app.circleci.com)

## Machine-Readable Matrix

The full per-descriptor matrix is written to `44-T1-READINESS.json` with one row per descriptor.
