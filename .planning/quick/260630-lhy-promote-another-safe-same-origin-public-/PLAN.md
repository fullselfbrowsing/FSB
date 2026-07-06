---
id: 260630-lhy
title: Promote another safe same-origin public read handler to T1-ready
created_at: 2026-06-30T20:28:44.055Z
status: complete
---

# Plan

Promote a conservative Zillow public search-state subset to T1-ready without enabling user-specific saved-home/profile rows or separate-host autocomplete rows.

## Scope

- Add `catalog/handlers/zillow.js` and mirror it to `extension/catalog/handlers/zillow.js`.
- Register the Zillow head in `background.js`, `capability-catalog.js`, readiness/reporting scripts, search readiness overrides, recipe-path guard, and T1 port contract mapping.
- Extend origin-classification with a Zillow same-origin proof for the public first-party search-state endpoint.
- Add focused tests for handler behavior, dom-to-T1a upgrades, head-count caps, origin classification, terminal-state search readiness, and service-worker import count.

## T1-Ready Slugs

- `zillow.get_market_overview`
- `zillow.search_by_owner`
- `zillow.search_for_rent`
- `zillow.search_for_sale`
- `zillow.search_foreclosures`
- `zillow.search_new_construction`
- `zillow.search_open_houses`
- `zillow.search_recently_sold`

## Excluded

- `zillow.get_current_user`: account-specific state.
- `zillow.get_saved_homes`: saved/favorites state.
- `zillow.search_locations`: separate autocomplete host.
- `zillow.search_by_address`: depends on separate-host autocomplete before search.
