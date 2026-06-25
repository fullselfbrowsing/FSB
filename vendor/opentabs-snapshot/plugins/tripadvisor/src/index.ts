// Vendored metadata slice of the OpenTabs tripadvisor plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Tripadvisor is a travel-reviews / location-discovery app -- its upstream host is
// www.tripadvisor.com, left UNCLASSIFIED (SAFE) in service-denylist.json because every
// vendored op is a READ (location search + location detail + reviews; reads run under
// Auto with no mutating re-gate). The host-derived stem ('www') is WRONG, so the
// dir-name STEM_OVERRIDES {tripadvisor:'tripadvisor'} canonicalizes the slug to
// opentabs__tripadvisor__*. Part of Phase-39 batch C sub-batch 4 (events [sensitive,
// payment] + local-services/scheduling [safe, read-only]). ALL ops are reads --
// search_locations / get_location / list_reviews -- NO write op, NO payment verb
// (partner hotel-booking is OUT OF SCOPE for this read-only slice). www.tripadvisor.com
// is added to verify-catalog-crosscheck.mjs READ_ONLY_SAFE_SERVICES SPECIFICALLY
// because it is read-only, so a future write op would FAIL the build (the 38 MED-02
// invariant); the payment-op guard never keys on tripadvisor (no payment-verb op-name).
// backing:'dom' (the frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchLocations } from './tools/search-locations.js';
import { getLocation } from './tools/get-location.js';
import { listReviews } from './tools/list-reviews.js';

class TripadvisorPlugin extends OpenTabsPlugin {
  readonly name = 'tripadvisor';
  readonly description =
    'OpenTabs plugin for Tripadvisor — search hotels, restaurants, and attractions, read a location, and read a location’s reviews (read-only)';
  override readonly displayName = 'Tripadvisor';
  readonly urlPatterns = ['*://www.tripadvisor.com/*'];
  override readonly homepage = 'https://www.tripadvisor.com';
  readonly tools: ToolDefinition[] = [
    // Travel-location discovery + reviews -- ALL reads (no write, no payment verb).
    searchLocations,
    getLocation,
    listReviews,
  ];
}

const plugin = new TripadvisorPlugin();
export default plugin;
export { plugin };
