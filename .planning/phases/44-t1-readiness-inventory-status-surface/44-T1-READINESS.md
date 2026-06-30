# Phase 44 T1 Readiness Matrix

**Generated:** 2026-06-30T05:06:59.252Z

This report is generated from `extension/catalog/recipe-index.generated.js` plus the live `capability-catalog.js` resolver. It is the v1.1.0 truth surface: catalog/search support means a capability is searchable and routable, not that every app has direct API execution today.

## Baseline

| Metric | Count |
|--------|------:|
| Total descriptors | 2314 |
| App stems | 128 |
| Distinct service hosts | 129 |
| T0/T1a/T1b resolved descriptors | 74 |
| T1 ready executable descriptors | 69 |
| T1 guarded fail-closed writes | 5 |
| Learn-pending descriptors | 0 |
| DOM/discovery-pending descriptors | 2046 |
| Blocked descriptors | 194 |
| Catalog tail not direct API-ready | 2240 |

## What This Means

The catalog spans 128 app stems. That 128-app breadth is catalog/search support, not direct API execution for every app. `invoke_capability` executes only proven T0/T1a/T1b handlers or recipes today; guarded writes return fail-closed pending UAT; the remaining 2240-descriptor tail stays DOM/discovery, learn-pending, or blocked by denylist.

Non-denied origins are allowed under Auto for ordinary capability invoke. Denylisted origins remain blocked. Sensitive origins are flagged in UI/audit records, while extra confirmation remains scoped to network-capture discovery.

## Readiness Totals

| Status | Count |
|--------|------:|
| t1-ready | 69 |
| t1-guarded-fail-closed | 5 |
| learn-pending | 0 |
| discovery-pending | 2046 |
| blocked | 194 |
| unknown | 0 |

## Per-App Rollup

| App | Total | Ready | Guarded | Learn | Discovery | Blocked |
|-----|------:|------:|--------:|------:|----------:|--------:|
| `airbnb` | 14 | 0 | 0 | 0 | 14 | 0 |
| `airtable` | 8 | 0 | 0 | 0 | 8 | 0 |
| `amazon` | 6 | 0 | 0 | 0 | 6 | 0 |
| `amplitude` | 15 | 0 | 0 | 0 | 15 | 0 |
| `asana` | 24 | 0 | 0 | 0 | 24 | 0 |
| `aws` | 16 | 0 | 0 | 0 | 16 | 0 |
| `azure` | 26 | 0 | 0 | 0 | 26 | 0 |
| `bestbuy` | 11 | 2 | 0 | 0 | 9 | 0 |
| `bitbucket` | 27 | 4 | 0 | 0 | 23 | 0 |
| `booking` | 10 | 0 | 0 | 0 | 10 | 0 |
| `bsky` | 38 | 0 | 0 | 0 | 38 | 0 |
| `calendly` | 15 | 0 | 0 | 0 | 15 | 0 |
| `carta` | 20 | 0 | 0 | 0 | 0 | 20 |
| `chatgpt` | 20 | 0 | 0 | 0 | 20 | 0 |
| `chipotle` | 16 | 0 | 0 | 0 | 16 | 0 |
| `circleci` | 33 | 11 | 0 | 0 | 22 | 0 |
| `claude` | 14 | 0 | 0 | 0 | 14 | 0 |
| `clickhouse` | 9 | 0 | 0 | 0 | 9 | 0 |
| `clickup` | 11 | 0 | 0 | 0 | 11 | 0 |
| `cloudflare` | 30 | 0 | 0 | 0 | 30 | 0 |
| `cockroachdb` | 18 | 0 | 0 | 0 | 18 | 0 |
| `coinbase` | 17 | 0 | 0 | 0 | 17 | 0 |
| `confluence` | 21 | 0 | 0 | 0 | 21 | 0 |
| `costco` | 16 | 0 | 0 | 0 | 16 | 0 |
| `craigslist` | 9 | 0 | 0 | 0 | 9 | 0 |
| `datadog` | 71 | 0 | 0 | 0 | 71 | 0 |
| `discord` | 26 | 0 | 0 | 0 | 26 | 0 |
| `dockerhub` | 12 | 0 | 0 | 0 | 12 | 0 |
| `dominos` | 20 | 0 | 0 | 0 | 20 | 0 |
| `doordash` | 11 | 0 | 0 | 0 | 11 | 0 |
| `ebay` | 8 | 0 | 0 | 0 | 8 | 0 |
| `etsy` | 5 | 0 | 0 | 0 | 5 | 0 |
| `eventbrite` | 4 | 0 | 0 | 0 | 4 | 0 |
| `excel` | 29 | 0 | 0 | 0 | 29 | 0 |
| `expedia` | 12 | 0 | 0 | 0 | 12 | 0 |
| `facebook` | 14 | 0 | 0 | 0 | 14 | 0 |
| `fidelity` | 13 | 0 | 0 | 0 | 0 | 13 |
| `figma` | 14 | 0 | 0 | 0 | 14 | 0 |
| `fiverr` | 8 | 0 | 0 | 0 | 8 | 0 |
| `ganalytics` | 8 | 0 | 0 | 0 | 8 | 0 |
| `gcal` | 18 | 0 | 0 | 0 | 18 | 0 |
| `gcloud` | 30 | 0 | 0 | 0 | 30 | 0 |
| `gdocs` | 19 | 0 | 0 | 0 | 19 | 0 |
| `gdrive` | 17 | 0 | 0 | 0 | 17 | 0 |
| `gemini` | 6 | 0 | 0 | 0 | 6 | 0 |
| `github` | 3 | 2 | 1 | 0 | 0 | 0 |
| `gitlab` | 22 | 5 | 3 | 0 | 14 | 0 |
| `glama` | 15 | 0 | 0 | 0 | 15 | 0 |
| `gmaps` | 16 | 0 | 0 | 0 | 16 | 0 |
| `grafana` | 3 | 0 | 0 | 0 | 3 | 0 |
| `grubhub` | 5 | 0 | 0 | 0 | 5 | 0 |
| `hack2hire` | 14 | 0 | 0 | 0 | 14 | 0 |
| `hackernews` | 10 | 0 | 0 | 0 | 10 | 0 |
| `homedepot` | 10 | 0 | 0 | 0 | 10 | 0 |
| `instacart` | 12 | 0 | 0 | 0 | 12 | 0 |
| `instagram` | 28 | 0 | 0 | 0 | 28 | 0 |
| `jira` | 20 | 0 | 0 | 0 | 20 | 0 |
| `kayak` | 4 | 0 | 0 | 0 | 4 | 0 |
| `leetcode` | 26 | 0 | 0 | 0 | 26 | 0 |
| `linear` | 59 | 0 | 0 | 0 | 59 | 0 |
| `linkedin` | 6 | 0 | 0 | 0 | 6 | 0 |
| `lucid` | 20 | 0 | 0 | 0 | 20 | 0 |
| `lyft` | 5 | 0 | 0 | 0 | 5 | 0 |
| `mastodon` | 4 | 0 | 0 | 0 | 4 | 0 |
| `medium` | 20 | 0 | 0 | 0 | 20 | 0 |
| `meticulous` | 26 | 0 | 0 | 0 | 26 | 0 |
| `minimax` | 31 | 0 | 0 | 0 | 31 | 0 |
| `mongodb` | 20 | 0 | 0 | 0 | 20 | 0 |
| `msword` | 27 | 0 | 0 | 0 | 27 | 0 |
| `netflix` | 18 | 0 | 0 | 0 | 0 | 18 |
| `netlify` | 40 | 5 | 0 | 0 | 35 | 0 |
| `newrelic` | 22 | 0 | 0 | 0 | 22 | 0 |
| `notebooklm` | 19 | 0 | 0 | 0 | 19 | 0 |
| `notion` | 20 | 8 | 0 | 0 | 12 | 0 |
| `npm` | 14 | 0 | 0 | 0 | 14 | 0 |
| `onenote` | 12 | 0 | 0 | 0 | 12 | 0 |
| `onlyfans` | 21 | 0 | 0 | 0 | 0 | 21 |
| `opentable` | 5 | 0 | 0 | 0 | 5 | 0 |
| `outlook` | 24 | 0 | 0 | 0 | 24 | 0 |
| `pandaexpress` | 18 | 0 | 0 | 0 | 18 | 0 |
| `pinterest` | 24 | 0 | 0 | 0 | 24 | 0 |
| `posthog` | 38 | 0 | 0 | 0 | 38 | 0 |
| `powerpoint` | 26 | 0 | 0 | 0 | 26 | 0 |
| `priceline` | 18 | 0 | 0 | 0 | 18 | 0 |
| `reddit` | 24 | 1 | 0 | 0 | 23 | 0 |
| `redfin` | 12 | 1 | 0 | 0 | 11 | 0 |
| `retool` | 50 | 16 | 0 | 0 | 34 | 0 |
| `robinhood` | 23 | 0 | 0 | 0 | 0 | 23 |
| `sentry` | 21 | 0 | 0 | 0 | 21 | 0 |
| `shopify` | 5 | 0 | 0 | 0 | 5 | 0 |
| `shortcut` | 27 | 0 | 0 | 0 | 27 | 0 |
| `slack` | 24 | 5 | 1 | 0 | 18 | 0 |
| `snowflake` | 14 | 0 | 0 | 0 | 14 | 0 |
| `spotify` | 21 | 0 | 0 | 0 | 0 | 21 |
| `stackoverflow` | 20 | 0 | 0 | 0 | 20 | 0 |
| `starbucks` | 20 | 0 | 0 | 0 | 20 | 0 |
| `steam` | 15 | 0 | 0 | 0 | 0 | 15 |
| `stripe` | 30 | 0 | 0 | 0 | 30 | 0 |
| `stubhub` | 4 | 0 | 0 | 0 | 4 | 0 |
| `supabase` | 26 | 0 | 0 | 0 | 26 | 0 |
| `target` | 18 | 0 | 0 | 0 | 18 | 0 |
| `teams` | 11 | 0 | 0 | 0 | 11 | 0 |
| `telegram` | 23 | 0 | 0 | 0 | 23 | 0 |
| `temporal` | 8 | 0 | 0 | 0 | 8 | 0 |
| `terraform` | 38 | 0 | 0 | 0 | 38 | 0 |
| `threads` | 3 | 0 | 0 | 0 | 3 | 0 |
| `ticketmaster` | 4 | 0 | 0 | 0 | 4 | 0 |
| `tiktok` | 9 | 0 | 0 | 0 | 9 | 0 |
| `tinder` | 16 | 0 | 0 | 0 | 0 | 16 |
| `todoist` | 33 | 0 | 0 | 0 | 33 | 0 |
| `tripadvisor` | 12 | 0 | 0 | 0 | 12 | 0 |
| `tumblr` | 32 | 0 | 0 | 0 | 32 | 0 |
| `twilio` | 35 | 0 | 0 | 0 | 35 | 0 |
| `twitch` | 14 | 0 | 0 | 0 | 0 | 14 |
| `uber` | 8 | 0 | 0 | 0 | 8 | 0 |
| `ubereats` | 5 | 0 | 0 | 0 | 5 | 0 |
| `vercel` | 8 | 7 | 0 | 0 | 1 | 0 |
| `walmart` | 10 | 0 | 0 | 0 | 10 | 0 |
| `webflow` | 15 | 2 | 0 | 0 | 13 | 0 |
| `whatsapp` | 21 | 0 | 0 | 0 | 21 | 0 |
| `wikipedia` | 19 | 0 | 0 | 0 | 19 | 0 |
| `x` | 31 | 0 | 0 | 0 | 31 | 0 |
| `yelp` | 7 | 0 | 0 | 0 | 7 | 0 |
| `ynab` | 22 | 0 | 0 | 0 | 22 | 0 |
| `youtube` | 18 | 0 | 0 | 0 | 0 | 18 |
| `ytmusic` | 15 | 0 | 0 | 0 | 0 | 15 |
| `zendesk` | 17 | 0 | 0 | 0 | 17 | 0 |
| `zillow` | 12 | 0 | 0 | 0 | 12 | 0 |

## Next-Batch Candidates

### Same-Origin Reads
- `airbnb.get_current_user` (airbnb.com)
- `airbnb.get_header_info` (airbnb.com)
- `airbnb.get_inbox_filters` (airbnb.com)
- `airbnb.get_listing_from_page` (airbnb.com)
- `airbnb.get_map_viewport_info` (airbnb.com)
- `airbnb.get_message_thread` (airbnb.com)
- `airbnb.get_search_results` (airbnb.com)
- `airbnb.get_user_thumbnail` (airbnb.com)
- `airbnb.get_wishlist_items` (airbnb.com)
- `airbnb.list_message_threads` (airbnb.com)
- `airbnb.list_wishlists` (airbnb.com)
- `airbnb.search_suggestions` (airbnb.com)
- `amazon.get_product` (www.amazon.com)
- `amazon.list_orders` (www.amazon.com)
- `amazon.search_products` (www.amazon.com)
- `amazon.track_order` (www.amazon.com)
- `amplitude.get_color_palettes` (app.amplitude.com)
- `amplitude.get_current_user` (app.amplitude.com)
- `amplitude.get_entitlements` (app.amplitude.com)
- `amplitude.get_event_volumes` (app.amplitude.com)
- `amplitude.get_mtu_volumes` (app.amplitude.com)
- `amplitude.get_org_data` (app.amplitude.com)
- `amplitude.get_personal_space` (app.amplitude.com)
- `amplitude.get_report_quota` (app.amplitude.com)
- `amplitude.get_session_replay_volumes` (app.amplitude.com)
- `amplitude.list_events` (app.amplitude.com)
- `amplitude.list_orgs` (app.amplitude.com)
- `amplitude.list_spaces` (app.amplitude.com)
- `amplitude.list_users` (app.amplitude.com)
- `amplitude.search_content` (app.amplitude.com)

### Pattern-D Candidates
- `airtable.create_comment` (airtable.com)
- `airtable.get_base_schema` (airtable.com)
- `airtable.get_field_choices` (airtable.com)
- `airtable.get_record` (airtable.com)
- `airtable.get_record_activity` (airtable.com)
- `airtable.list_records` (airtable.com)
- `airtable.list_workspaces` (airtable.com)
- `airtable.update_cell` (airtable.com)
- `asana.add_followers` (app.asana.com)
- `asana.add_task_to_section` (app.asana.com)
- `asana.create_project` (app.asana.com)
- `asana.create_section` (app.asana.com)
- `asana.create_story` (app.asana.com)
- `asana.create_task` (app.asana.com)
- `asana.delete_task` (app.asana.com)
- `asana.get_current_user` (app.asana.com)
- `asana.get_project` (app.asana.com)
- `asana.get_stories_for_task` (app.asana.com)
- `asana.get_subtasks` (app.asana.com)
- `asana.get_task` (app.asana.com)
- `asana.get_tasks_for_project` (app.asana.com)
- `asana.get_tasks_for_section` (app.asana.com)
- `asana.get_user` (app.asana.com)
- `asana.list_projects` (app.asana.com)
- `asana.list_sections` (app.asana.com)
- `asana.list_tags` (app.asana.com)
- `asana.list_teams` (app.asana.com)
- `asana.list_users_for_workspace` (app.asana.com)
- `asana.list_workspaces` (app.asana.com)
- `asana.search_tasks` (app.asana.com)

### GAPI Bridge Candidates
- `ganalytics.check_compatibility` (analytics.google.com)
- `ganalytics.get_active_property` (analytics.google.com)
- `ganalytics.get_current_user` (analytics.google.com)
- `ganalytics.get_metadata` (analytics.google.com)
- `ganalytics.list_accounts` (analytics.google.com)
- `ganalytics.run_batch_report` (analytics.google.com)
- `ganalytics.run_realtime_report` (analytics.google.com)
- `ganalytics.run_report` (analytics.google.com)
- `gcal.create_calendar` (calendar.google.com)
- `gcal.create_event` (calendar.google.com)
- `gcal.delete_calendar` (calendar.google.com)
- `gcal.delete_event` (calendar.google.com)
- `gcal.get_calendar` (calendar.google.com)
- `gcal.get_colors` (calendar.google.com)
- `gcal.get_event` (calendar.google.com)
- `gcal.get_setting` (calendar.google.com)
- `gcal.list_calendars` (calendar.google.com)
- `gcal.list_event_instances` (calendar.google.com)
- `gcal.list_events` (calendar.google.com)
- `gcal.list_settings` (calendar.google.com)
- `gcal.move_event` (calendar.google.com)
- `gcal.query_freebusy` (calendar.google.com)
- `gcal.quick_add_event` (calendar.google.com)
- `gcal.search_events` (calendar.google.com)
- `gcal.update_calendar` (calendar.google.com)
- `gcal.update_event` (calendar.google.com)
- `gcloud.disable_service` (console.cloud.google.com)
- `gcloud.enable_service` (console.cloud.google.com)
- `gcloud.get_billing_info` (console.cloud.google.com)
- `gcloud.get_bucket` (console.cloud.google.com)

### Guarded Writes
- `github.issues.create` (github.com)
- `gitlab.create_issue` (gitlab.com)
- `gitlab.create_merge_request` (gitlab.com)
- `gitlab.create_note` (gitlab.com)
- `slack.send_message` (slack.com)

## Machine-Readable Matrix

The full per-descriptor matrix is written to `44-T1-READINESS.json` with one row per descriptor.
