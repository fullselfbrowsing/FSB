// Vendored metadata slice of the OpenTabs uber plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Uber is a PAYMENT-bearing rideshare app -- its upstream host is *.uber.com, the
// origin Phase 39-01 classified SENSITIVE (the payment/money-movement axis:
// requesting a ride charges a card -- the '*.uber.com' subdomain-wildcard entry
// covers it), so the merge-time classifyGate passes on a screened origin. The host
// (service uber.com) derives the stem 'uber' (already correct); the dir-name
// STEM_OVERRIDES {uber:'uber'} pins the slug canonically to opentabs__uber__*. Part
// of Phase-39 batch C sub-batch 1 (food delivery + rideshare). Its ops list ride
// options + a fare estimate + the user's trips (reads), REQUEST a paid ride
// (request_ride -> the PAYMENT WRITE -- the DOM-only-on-sensitive payment-op-guard
// subject), and CANCEL a ride (cancel_ride -> DESTRUCTIVE). posture-B re-gates the
// writes because the origin is sensitive. backing:'dom' (the frozen default) ->
// DOM-only routing (the payment op is NOT API-invocable -> the payment-op CI guard
// passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listRideOptions } from './tools/list-ride-options.js';
import { getRideEstimate } from './tools/get-ride-estimate.js';
import { listTrips } from './tools/list-trips.js';
import { requestRide } from './tools/request-ride.js';
import { cancelRide } from './tools/cancel-ride.js';

class UberPlugin extends OpenTabsPlugin {
  readonly name = 'uber';
  readonly description =
    'OpenTabs plugin for Uber — see ride options, estimate a fare, view your trips, request a paid ride, and cancel a ride';
  override readonly displayName = 'Uber';
  readonly urlPatterns = ['*://*.uber.com/*'];
  override readonly homepage = 'https://www.uber.com';
  readonly tools: ToolDefinition[] = [
    // Ride options + estimate + trips (reads), requesting the paid ride (the payment write), cancelling (destructive).
    listRideOptions,
    getRideEstimate,
    listTrips,
    requestRide,
    cancelRide,
  ];
}

const plugin = new UberPlugin();
export default plugin;
export { plugin };
