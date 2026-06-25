// Vendored metadata slice of the OpenTabs dominos plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Domino's is a PAYMENT-bearing food-order app -- its upstream host is www.dominos.com,
// classified SENSITIVE by Phase 39-01 (the payment/money-movement axis: placing an order
// charges a card), so the merge-time classifyGate passes on a screened origin. The
// host-derived stem ('www') is WRONG, so the dir-name STEM_OVERRIDES {dominos:'dominos'}
// canonicalizes the slug to opentabs__dominos__*. Part of Phase-39 batch C sub-batch 5
// (completion -- remaining commerce + read-only misc). Its ops list nearby stores + a
// store's menu + the user's orders + a single order's live tracking (reads) and PLACE a
// paid order (place_order -> the PAYMENT WRITE -- 'place' in 39-01 PAYMENT_VERBS,
// place_order in PAYMENT_OP_NAMES; the DOM-only-on-sensitive payment-op-guard subject for
// food-order). posture-B re-gates the writes because the origin is sensitive.
// backing:'dom' (the frozen default) -> DOM-only routing (the payment op is NOT
// API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listStores } from './tools/list-stores.js';
import { getMenu } from './tools/get-menu.js';
import { listOrders } from './tools/list-orders.js';
import { placeOrder } from './tools/place-order.js';
import { trackOrder } from './tools/track-order.js';

class DominosPlugin extends OpenTabsPlugin {
  readonly name = 'dominos';
  readonly description =
    'OpenTabs plugin for Domino’s — find nearby stores, read a store menu, track your orders, and place a paid order';
  override readonly displayName = 'Domino’s';
  readonly urlPatterns = ['*://www.dominos.com/*'];
  override readonly homepage = 'https://www.dominos.com';
  readonly tools: ToolDefinition[] = [
    // Stores + menu + orders + tracking (reads), placing the paid order (the payment write).
    listStores,
    getMenu,
    listOrders,
    placeOrder,
    trackOrder,
  ];
}

const plugin = new DominosPlugin();
export default plugin;
export { plugin };
