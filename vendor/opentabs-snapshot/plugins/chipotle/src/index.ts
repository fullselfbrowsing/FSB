// Vendored metadata slice of the OpenTabs chipotle plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Chipotle is a PAYMENT-bearing food-order app -- its upstream host is www.chipotle.com,
// classified SENSITIVE by Phase 39-01 (the payment/money-movement axis: placing an order
// charges a card), so the merge-time classifyGate passes on a screened origin. The
// host-derived stem ('www') is WRONG, so the dir-name STEM_OVERRIDES {chipotle:'chipotle'}
// canonicalizes the slug to opentabs__chipotle__*. Part of Phase-39 batch C sub-batch 5
// (completion -- remaining commerce + read-only misc). Its ops list nearby locations + a
// location's menu + the user's orders (reads) and PLACE a paid order (place_order -> the
// PAYMENT WRITE -- 'place' in 39-01 PAYMENT_VERBS, place_order in PAYMENT_OP_NAMES; the
// DOM-only-on-sensitive payment-op-guard subject for food-order). posture-B re-gates the
// writes because the origin is sensitive. backing:'dom' (the frozen default) -> DOM-only
// routing (the payment op is NOT API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listLocations } from './tools/list-locations.js';
import { getMenu } from './tools/get-menu.js';
import { listOrders } from './tools/list-orders.js';
import { placeOrder } from './tools/place-order.js';

class ChipotlePlugin extends OpenTabsPlugin {
  readonly name = 'chipotle';
  readonly description =
    'OpenTabs plugin for Chipotle — find nearby locations, read a location menu, read your orders, and place a paid order';
  override readonly displayName = 'Chipotle';
  readonly urlPatterns = ['*://www.chipotle.com/*'];
  override readonly homepage = 'https://www.chipotle.com';
  readonly tools: ToolDefinition[] = [
    // Locations + menu + orders (reads), placing the paid order (the payment write).
    listLocations,
    getMenu,
    listOrders,
    placeOrder,
  ];
}

const plugin = new ChipotlePlugin();
export default plugin;
export { plugin };
