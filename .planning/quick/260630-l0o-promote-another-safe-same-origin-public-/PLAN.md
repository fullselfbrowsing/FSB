---
id: 260630-l0o
title: Promote another safe same-origin public read handler to T1-ready
created_at: 2026-06-30T20:08:01.667Z
status: complete
---

# Plan

Promote a conservative TripAdvisor public-read subset to T1-ready without enabling user-specific or mutating rows.

## Scope

- Add `catalog/handlers/tripadvisor.js` and mirror it to `extension/catalog/handlers/tripadvisor.js`.
- Register the TripAdvisor head in `background.js`, `capability-catalog.js`, readiness/reporting scripts, search readiness overrides, recipe-path guard, and T1 port contract mapping.
- Extend origin-classification with a TripAdvisor-specific relative-runtime proof for same-origin SSR/LD+JSON HTML reads and `/data/graphql/ids` GraphQL reads.
- Add focused tests for handler behavior, dom-to-T1a upgrades, head-count caps, origin classification, terminal-state search readiness, and service-worker import count.

## T1-Ready Slugs

- `tripadvisor.get_attraction`
- `tripadvisor.get_breadcrumbs`
- `tripadvisor.get_hotel`
- `tripadvisor.get_neighborhood`
- `tripadvisor.get_restaurant`
- `tripadvisor.get_restaurant_awards`
- `tripadvisor.get_reviews`
- `tripadvisor.list_attractions`
- `tripadvisor.list_hotels`
- `tripadvisor.list_restaurants`

## Excluded

- `tripadvisor.check_saved`: user-specific saved/bookmark state.
- `tripadvisor.get_current_user`: authenticated profile state.
