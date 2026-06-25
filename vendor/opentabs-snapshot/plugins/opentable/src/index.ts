// Vendored metadata slice of the OpenTabs opentable plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// OpenTable is a held-card reservation travel/dining app -- its upstream host is
// www.opentable.com, classified SENSITIVE UNCONDITIONALLY by Phase 39-01 (a
// reservation holds a card -- payment-adjacent; 39-01 removed the 'only if it has a
// paid op' conditional), so the merge-time classifyGate passes on a screened origin.
// The host-derived stem ('www') is WRONG, so the dir-name STEM_OVERRIDES
// {opentable:'opentable'} canonicalizes the slug to opentabs__opentable__*. Part of
// Phase-39 batch C sub-batch 3 (travel + transport). Its ops search restaurants + a
// restaurant's detail + the user's reservations (reads), RESERVE a table (reserve_table
// -> the PAYMENT op -- 'reserve' is in the guard's PAYMENT_VERBS set; DOM-only on the
// unconditionally-sensitive origin -> the payment-op guard PASSES), and CANCEL a
// reservation (cancel_reservation -> DESTRUCTIVE). posture-B re-gates the writes
// because the origin is sensitive. backing:'dom' (the frozen default) -> DOM-only
// routing (the payment op is NOT API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchRestaurants } from './tools/search-restaurants.js';
import { getRestaurant } from './tools/get-restaurant.js';
import { listReservations } from './tools/list-reservations.js';
import { reserveTable } from './tools/reserve-table.js';
import { cancelReservation } from './tools/cancel-reservation.js';

class OpentablePlugin extends OpenTabsPlugin {
  readonly name = 'opentable';
  readonly description =
    'OpenTabs plugin for OpenTable — search restaurants, read a restaurant, view your reservations, reserve a table (held-card), and cancel a reservation';
  override readonly displayName = 'OpenTable';
  readonly urlPatterns = ['*://www.opentable.com/*'];
  override readonly homepage = 'https://www.opentable.com';
  readonly tools: ToolDefinition[] = [
    // Restaurants + reservations (reads), reserving a table (the held-card payment op), cancelling (destructive).
    searchRestaurants,
    getRestaurant,
    listReservations,
    reserveTable,
    cancelReservation,
  ];
}

const plugin = new OpentablePlugin();
export default plugin;
export { plugin };
