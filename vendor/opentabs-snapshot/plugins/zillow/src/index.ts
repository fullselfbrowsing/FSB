// Vendored metadata slice of the OpenTabs zillow plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Zillow is a real-estate-listing / home-value app -- its upstream host is
// www.zillow.com, left UNCLASSIFIED (SAFE) in service-denylist.json because every
// vendored op is a READ (listing search + listing detail + home-value estimate; reads
// run under Auto with no mutating re-gate). The host-derived stem ('www') is WRONG, so
// the dir-name STEM_OVERRIDES {zillow:'zillow'} canonicalizes the slug to
// opentabs__zillow__*. Part of Phase-39 batch C sub-batch 5 (completion -- remaining
// commerce + read-only misc). ALL ops are reads -- search_listings / get_listing /
// get_home_value -- NO write op, NO payment verb. www.zillow.com is added to
// verify-catalog-crosscheck.mjs READ_ONLY_SAFE_SERVICES SPECIFICALLY because it is
// read-only, so a future write op would FAIL the build (the 38 MED-02 invariant); the
// payment-op guard never keys on zillow (no payment-verb op-name). backing:'dom' (the
// frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchListings } from './tools/search-listings.js';
import { getListing } from './tools/get-listing.js';
import { getHomeValue } from './tools/get-home-value.js';

class ZillowPlugin extends OpenTabsPlugin {
  readonly name = 'zillow';
  readonly description =
    'OpenTabs plugin for Zillow — search real-estate listings, read a listing, and look up a home’s value estimate (read-only)';
  override readonly displayName = 'Zillow';
  readonly urlPatterns = ['*://www.zillow.com/*'];
  override readonly homepage = 'https://www.zillow.com';
  readonly tools: ToolDefinition[] = [
    // Real-estate listing search + detail + home-value -- ALL reads (no write, no payment verb).
    searchListings,
    getListing,
    getHomeValue,
  ];
}

const plugin = new ZillowPlugin();
export default plugin;
export { plugin };
