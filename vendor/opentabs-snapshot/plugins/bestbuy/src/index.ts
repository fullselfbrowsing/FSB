// Vendored metadata slice of the OpenTabs bestbuy plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Best Buy is a PAYMENT-bearing retail app -- its upstream host is www.bestbuy.com,
// the EXACT origin Phase 39-01 classified SENSITIVE (the payment/money-movement
// axis: placing an order charges a card), so the merge-time classifyGate passes on a
// screened origin. The host-derived stem ('www') is WRONG, so the dir-name
// STEM_OVERRIDES {bestbuy:'bestbuy'} canonicalizes the slug to opentabs__bestbuy__*.
// Part of Phase-39 batch C sub-batch 2 (retail + marketplace). Its ops search the
// electronics catalog + a single product detail + the user's orders (reads), PLACE a
// paid order (place_order -> the PAYMENT WRITE -- the DOM-only-on-sensitive payment-
// op-guard subject), and CANCEL an order (cancel_order -> DESTRUCTIVE). posture-B
// re-gates the writes because the origin is sensitive. backing:'dom' (the frozen
// default) -> DOM-only routing (the payment op is NOT API-invocable -> the payment-op
// CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchProducts } from './tools/search-products.js';
import { getProduct } from './tools/get-product.js';
import { listOrders } from './tools/list-orders.js';
import { placeOrder } from './tools/place-order.js';
import { cancelOrder } from './tools/cancel-order.js';

class BestbuyPlugin extends OpenTabsPlugin {
  readonly name = 'bestbuy';
  readonly description =
    'OpenTabs plugin for Best Buy — search the electronics catalog, read a product page, view your orders, place a paid order, and cancel an order';
  override readonly displayName = 'Best Buy';
  readonly urlPatterns = ['*://www.bestbuy.com/*'];
  override readonly homepage = 'https://www.bestbuy.com';
  readonly tools: ToolDefinition[] = [
    // Catalog + orders (reads), placing the paid order (the payment write), cancelling (destructive).
    searchProducts,
    getProduct,
    listOrders,
    placeOrder,
    cancelOrder,
  ];
}

const plugin = new BestbuyPlugin();
export default plugin;
export { plugin };
