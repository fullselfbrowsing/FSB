// Vendored metadata slice of the OpenTabs etsy plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Etsy is a PAYMENT-bearing marketplace app -- its upstream host is www.etsy.com,
// the EXACT origin Phase 39-01 classified SENSITIVE (the payment/money-movement
// axis: checkout charges a card), so the merge-time classifyGate passes on a screened
// origin. The host-derived stem ('www') is WRONG, so the dir-name STEM_OVERRIDES
// {etsy:'etsy'} canonicalizes the slug to opentabs__etsy__*. Part of Phase-39 batch C
// sub-batch 2 (retail + marketplace). Its ops search the handmade/vintage listings +
// a single listing detail + the user's orders (reads), ADD an item to the cart
// (add_to_cart -> a WRITE), and CHECK OUT (checkout -> the PAYMENT WRITE -- the
// DOM-only-on-sensitive payment-op-guard subject). posture-B re-gates the writes
// because the origin is sensitive. backing:'dom' (the frozen default) -> DOM-only
// routing (the payment op is NOT API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchListings } from './tools/search-listings.js';
import { getListing } from './tools/get-listing.js';
import { listOrders } from './tools/list-orders.js';
import { addToCart } from './tools/add-to-cart.js';
import { checkout } from './tools/checkout.js';

class EtsyPlugin extends OpenTabsPlugin {
  readonly name = 'etsy';
  readonly description =
    'OpenTabs plugin for Etsy — search handmade and vintage listings, read a listing, view your orders, add an item to your cart, and check out';
  override readonly displayName = 'Etsy';
  readonly urlPatterns = ['*://www.etsy.com/*'];
  override readonly homepage = 'https://www.etsy.com';
  readonly tools: ToolDefinition[] = [
    // Listings + orders (reads), adding to cart (a write), checking out (the payment write).
    searchListings,
    getListing,
    listOrders,
    addToCart,
    checkout,
  ];
}

const plugin = new EtsyPlugin();
export default plugin;
export { plugin };
