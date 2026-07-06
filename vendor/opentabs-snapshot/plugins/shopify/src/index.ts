// Vendored metadata slice of the OpenTabs shopify plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Shopify is a PAYMENT-bearing e-commerce app -- its upstream host is *.shopify.com,
// classified SENSITIVE by Phase 39-01 (the payment/money-movement axis: creating an
// order charges the saved payment method), so the merge-time classifyGate passes on a
// screened origin. The host-derived stem ('shopify', after readPluginMeta strips the
// '*.') is already correct; the dir-name STEM_OVERRIDES {shopify:'shopify'} pins the
// slug to opentabs__shopify__* for stability. Part of Phase-39 batch C sub-batch 5
// (completion -- remaining commerce + read-only misc). Its ops list the store's
// products + a single product detail + the store's orders (reads), CREATE a paid order
// (create_order -> the PAYMENT WRITE -- in 39-01 PAYMENT_OP_NAMES; the DOM-only-on-
// sensitive payment-op-guard subject for e-commerce), and CANCEL an order (cancel_order
// -> DESTRUCTIVE). posture-B re-gates the writes because the origin is sensitive.
// backing:'dom' (the frozen default) -> DOM-only routing (the payment op is NOT
// API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listProducts } from './tools/list-products.js';
import { getProduct } from './tools/get-product.js';
import { listOrders } from './tools/list-orders.js';
import { createOrder } from './tools/create-order.js';
import { cancelOrder } from './tools/cancel-order.js';

class ShopifyPlugin extends OpenTabsPlugin {
  readonly name = 'shopify';
  readonly description =
    'OpenTabs plugin for Shopify — list a store’s products, read a product, read the store’s orders, create a paid order, and cancel an order';
  override readonly displayName = 'Shopify';
  readonly urlPatterns = ['*://*.shopify.com/*'];
  override readonly homepage = 'https://www.shopify.com';
  readonly tools: ToolDefinition[] = [
    // Catalog + orders (reads), creating the paid order (the payment write), cancelling (destructive).
    listProducts,
    getProduct,
    listOrders,
    createOrder,
    cancelOrder,
  ];
}

const plugin = new ShopifyPlugin();
export default plugin;
export { plugin };
