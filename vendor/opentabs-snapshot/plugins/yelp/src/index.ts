// Vendored metadata slice of the OpenTabs yelp plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Yelp is a local-reviews / business-discovery app -- its upstream host is
// www.yelp.com, left UNCLASSIFIED (SAFE) in service-denylist.json because every
// vendored op is a READ (business search + business detail + reviews; reads run under
// Auto with no mutating re-gate). The host-derived stem ('www') is WRONG, so the
// dir-name STEM_OVERRIDES {yelp:'yelp'} canonicalizes the slug to opentabs__yelp__*.
// Part of Phase-39 batch C sub-batch 4 (events [sensitive, payment] +
// local-services/scheduling [safe, read-only]). ALL ops are reads -- search_businesses
// / get_business / list_reviews -- NO write op, NO payment verb. www.yelp.com is added
// to verify-catalog-crosscheck.mjs READ_ONLY_SAFE_SERVICES SPECIFICALLY because it is
// read-only, so a future write op would FAIL the build (the 38 MED-02 invariant); the
// payment-op guard never keys on yelp (no payment-verb op-name). backing:'dom' (the
// frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchBusinesses } from './tools/search-businesses.js';
import { getBusiness } from './tools/get-business.js';
import { listReviews } from './tools/list-reviews.js';

class YelpPlugin extends OpenTabsPlugin {
  readonly name = 'yelp';
  readonly description =
    'OpenTabs plugin for Yelp — search local businesses, read a business, and read a business’s reviews (read-only)';
  override readonly displayName = 'Yelp';
  readonly urlPatterns = ['*://www.yelp.com/*'];
  override readonly homepage = 'https://www.yelp.com';
  readonly tools: ToolDefinition[] = [
    // Local-business discovery + reviews -- ALL reads (no write, no payment verb).
    searchBusinesses,
    getBusiness,
    listReviews,
  ];
}

const plugin = new YelpPlugin();
export default plugin;
export { plugin };
