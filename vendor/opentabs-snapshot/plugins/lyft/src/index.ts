// Vendored metadata slice of the OpenTabs lyft plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Lyft is a PAYMENT-bearing rideshare app -- its upstream host is *.lyft.com, the
// origin Phase 39-01 classified SENSITIVE (the payment/money-movement axis:
// requesting a ride charges a card -- the '*.lyft.com' subdomain-wildcard entry
// covers it), so the merge-time classifyGate passes on a screened origin. The host
// (service lyft.com) derives the stem 'lyft' (already correct); the dir-name
// STEM_OVERRIDES {lyft:'lyft'} pins the slug canonically to opentabs__lyft__*. Part
// of Phase-39 batch C sub-batch 1 (food delivery + rideshare). Its ops list ride
// types + a fare estimate + the user's rides (reads), REQUEST a paid ride
// (request_ride -> the PAYMENT WRITE -- the DOM-only-on-sensitive payment-op-guard
// subject), and CANCEL a ride (cancel_ride -> DESTRUCTIVE). posture-B re-gates the
// writes because the origin is sensitive. backing:'dom' (the frozen default) ->
// DOM-only routing (the payment op is NOT API-invocable -> the payment-op CI guard
// passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listRideTypes } from './tools/list-ride-types.js';
import { getRideEstimate } from './tools/get-ride-estimate.js';
import { listRides } from './tools/list-rides.js';
import { requestRide } from './tools/request-ride.js';
import { cancelRide } from './tools/cancel-ride.js';

class LyftPlugin extends OpenTabsPlugin {
  readonly name = 'lyft';
  readonly description =
    'OpenTabs plugin for Lyft — see ride types, estimate a fare, view your rides, request a paid ride, and cancel a ride';
  override readonly displayName = 'Lyft';
  readonly urlPatterns = ['*://*.lyft.com/*'];
  override readonly homepage = 'https://www.lyft.com';
  readonly tools: ToolDefinition[] = [
    // Ride types + estimate + rides (reads), requesting the paid ride (the payment write), cancelling (destructive).
    listRideTypes,
    getRideEstimate,
    listRides,
    requestRide,
    cancelRide,
  ];
}

const plugin = new LyftPlugin();
export default plugin;
export { plugin };
