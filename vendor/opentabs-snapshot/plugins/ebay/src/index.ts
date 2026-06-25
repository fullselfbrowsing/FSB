// Vendored metadata slice of the OpenTabs ebay plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// eBay is a PAYMENT-bearing marketplace app -- its upstream host is www.ebay.com,
// the EXACT origin Phase 39-01 classified SENSITIVE (the payment/money-movement
// axis: a winning bid is a binding obligation to pay; Buy It Now charges the saved
// card), so the merge-time classifyGate passes on a screened origin. The
// host-derived stem ('www') is WRONG, so the dir-name STEM_OVERRIDES {ebay:'ebay'}
// canonicalizes the slug to opentabs__ebay__*. Part of Phase-39 batch C sub-batch 2
// (retail + marketplace). Its ops search the marketplace listings + a single listing
// detail + the user's orders (reads), PLACE a bid (place_bid -> a PAYMENT-bearing
// WRITE) and BUY NOW (buy_now -> the PAYMENT WRITE -- the DOM-only-on-sensitive
// payment-op-guard subjects for the marketplace). posture-B re-gates the writes
// because the origin is sensitive. backing:'dom' (the frozen default) -> DOM-only
// routing (the payment ops are NOT API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchListings } from './tools/search-listings.js';
import { getListing } from './tools/get-listing.js';
import { listOrders } from './tools/list-orders.js';
import { placeBid } from './tools/place-bid.js';
import { buyNow } from './tools/buy-now.js';

class EbayPlugin extends OpenTabsPlugin {
  readonly name = 'ebay';
  readonly description =
    'OpenTabs plugin for eBay — search marketplace listings, read a listing, view your orders, place a bid, and Buy It Now';
  override readonly displayName = 'eBay';
  readonly urlPatterns = ['*://www.ebay.com/*'];
  override readonly homepage = 'https://www.ebay.com';
  readonly tools: ToolDefinition[] = [
    // Listings + orders (reads), placing a bid + buying now (the payment writes).
    searchListings,
    getListing,
    listOrders,
    placeBid,
    buyNow,
  ];
}

const plugin = new EbayPlugin();
export default plugin;
export { plugin };
