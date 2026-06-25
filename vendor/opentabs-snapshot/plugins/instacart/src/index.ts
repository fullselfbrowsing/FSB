// Vendored metadata slice of the OpenTabs instacart plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Instacart is a PAYMENT-bearing grocery-delivery app -- its upstream host is
// www.instacart.com, the EXACT origin Phase 39-01 classified SENSITIVE (the payment/
// money-movement axis: checking out a cart charges a card), so the merge-time
// classifyGate passes on a screened origin. The host-derived stem ('www') is WRONG,
// so the dir-name STEM_OVERRIDES {instacart:'instacart'} canonicalizes the slug to
// opentabs__instacart__*. Part of Phase-39 batch C sub-batch 1 (food delivery +
// rideshare). Its ops list stores + search products + the user's orders (reads),
// CHECK OUT a paid cart (checkout -> the PAYMENT WRITE -- the DOM-only-on-sensitive
// payment-op-guard subject), and CANCEL an order (cancel_order -> DESTRUCTIVE).
// posture-B re-gates the writes because the origin is sensitive. backing:'dom' (the
// frozen default) -> DOM-only routing (the payment op is NOT API-invocable -> the
// payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listStores } from './tools/list-stores.js';
import { searchProducts } from './tools/search-products.js';
import { listOrders } from './tools/list-orders.js';
import { checkout } from './tools/checkout.js';
import { cancelOrder } from './tools/cancel-order.js';

class InstacartPlugin extends OpenTabsPlugin {
  readonly name = 'instacart';
  readonly description =
    'OpenTabs plugin for Instacart — browse grocery stores, search products, see your orders, check out a paid cart, and cancel an order';
  override readonly displayName = 'Instacart';
  readonly urlPatterns = ['*://www.instacart.com/*'];
  override readonly homepage = 'https://www.instacart.com';
  readonly tools: ToolDefinition[] = [
    // Stores + products + orders (reads), checking out the paid cart (the payment write), cancelling (destructive).
    listStores,
    searchProducts,
    listOrders,
    checkout,
    cancelOrder,
  ];
}

const plugin = new InstacartPlugin();
export default plugin;
export { plugin };
