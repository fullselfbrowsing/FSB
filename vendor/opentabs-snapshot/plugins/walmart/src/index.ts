// Vendored metadata slice of the OpenTabs walmart plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Walmart is a PAYMENT-bearing retail app -- its upstream host is www.walmart.com,
// the EXACT origin Phase 39-01 classified SENSITIVE (the payment/money-movement
// axis: placing an order charges a card), so the merge-time classifyGate passes on a
// screened origin. The host-derived stem ('www') is WRONG, so the dir-name
// STEM_OVERRIDES {walmart:'walmart'} canonicalizes the slug to opentabs__walmart__*.
// Part of Phase-39 batch C sub-batch 2 (retail + marketplace). Its ops search the
// everyday-essentials catalog + a single product detail + the user's orders (reads),
// PLACE a paid order (place_order -> the PAYMENT WRITE -- the DOM-only-on-sensitive
// payment-op-guard subject), and CANCEL an order (cancel_order -> DESTRUCTIVE).
// posture-B re-gates the writes because the origin is sensitive. backing:'dom' (the
// frozen default) -> DOM-only routing (the payment op is NOT API-invocable -> the
// payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchProducts } from './tools/search-products.js';
import { getProduct } from './tools/get-product.js';
import { listOrders } from './tools/list-orders.js';
import { placeOrder } from './tools/place-order.js';
import { cancelOrder } from './tools/cancel-order.js';

class WalmartPlugin extends OpenTabsPlugin {
  readonly name = 'walmart';
  readonly description =
    'OpenTabs plugin for Walmart — search the catalog, read a product page, view your orders, place a paid order, and cancel an order';
  override readonly displayName = 'Walmart';
  readonly urlPatterns = ['*://www.walmart.com/*'];
  override readonly homepage = 'https://www.walmart.com';
  readonly tools: ToolDefinition[] = [
    // Catalog + orders (reads), placing the paid order (the payment write), cancelling (destructive).
    searchProducts,
    getProduct,
    listOrders,
    placeOrder,
    cancelOrder,
  ];
}

const plugin = new WalmartPlugin();
export default plugin;
export { plugin };
