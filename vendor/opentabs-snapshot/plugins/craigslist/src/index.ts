// Vendored metadata slice of the OpenTabs craigslist plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Craigslist is a classifieds marketplace -- its upstream host is www.craigslist.org,
// classified SENSITIVE (39-01 listed www.craigslist.org; 39-06 widened the denylist to
// the apex-suffix *.craigslist.org so apex+www are both screened -- posting/contacting a
// listing is transact-adjacent), so the merge-time classifyGate passes on a screened
// origin. The host-derived stem ('www') is WRONG, so the dir-name STEM_OVERRIDES
// {craigslist:'craigslist'} canonicalizes the slug to opentabs__craigslist__*. Part of
// Phase-39 batch C sub-batch 5 (completion -- remaining commerce + read-only misc). Its
// ops search classified listings + a single listing detail (reads), POST a new listing
// (post_listing -> a WRITE -- NOT a payment op, but sensitive-origin posture-B gated),
// and DELETE a listing (delete_listing -> DESTRUCTIVE). backing:'dom' (the frozen
// default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchListings } from './tools/search-listings.js';
import { getListing } from './tools/get-listing.js';
import { postListing } from './tools/post-listing.js';
import { deleteListing } from './tools/delete-listing.js';

class CraigslistPlugin extends OpenTabsPlugin {
  readonly name = 'craigslist';
  readonly description =
    'OpenTabs plugin for Craigslist — search classified listings, read a listing, post a new listing, and delete a listing';
  override readonly displayName = 'Craigslist';
  readonly urlPatterns = ['*://www.craigslist.org/*'];
  override readonly homepage = 'https://www.craigslist.org';
  readonly tools: ToolDefinition[] = [
    // Classifieds search + detail (reads), posting (write), deleting (destructive).
    searchListings,
    getListing,
    postListing,
    deleteListing,
  ];
}

const plugin = new CraigslistPlugin();
export default plugin;
export { plugin };
