// Vendored metadata slice of the OpenTabs ubereats plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Uber Eats is a PAYMENT-bearing food-delivery app -- its upstream host is
// www.ubereats.com, the EXACT origin Phase 39-01 classified SENSITIVE (the payment/
// money-movement axis: placing an order charges a card), so the merge-time
// classifyGate passes on a screened origin. The host-derived stem ('www') is WRONG,
// so the dir-name STEM_OVERRIDES {ubereats:'ubereats'} canonicalizes the slug to
// opentabs__ubereats__*. Part of Phase-39 batch C sub-batch 1 (food delivery +
// rideshare). Its ops list/search restaurants + a restaurant menu + the user's orders
// (reads), PLACE a paid order (place_order -> the PAYMENT WRITE -- the DOM-only-on-
// sensitive payment-op-guard subject), and CANCEL an order (cancel_order ->
// DESTRUCTIVE). posture-B re-gates the writes because the origin is sensitive.
// backing:'dom' (the frozen default) -> DOM-only routing (the payment op is NOT
// API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listRestaurants } from './tools/list-restaurants.js';
import { getMenu } from './tools/get-menu.js';
import { listOrders } from './tools/list-orders.js';
import { placeOrder } from './tools/place-order.js';
import { cancelOrder } from './tools/cancel-order.js';

class UberEatsPlugin extends OpenTabsPlugin {
  readonly name = 'ubereats';
  readonly description =
    'OpenTabs plugin for Uber Eats — browse restaurants, read a menu, see your orders, place a paid order, and cancel an order';
  override readonly displayName = 'Uber Eats';
  readonly urlPatterns = ['*://www.ubereats.com/*'];
  override readonly homepage = 'https://www.ubereats.com';
  readonly tools: ToolDefinition[] = [
    // Restaurants + menu + orders (reads), placing the paid order (the payment write), cancelling (destructive).
    listRestaurants,
    getMenu,
    listOrders,
    placeOrder,
    cancelOrder,
  ];
}

const plugin = new UberEatsPlugin();
export default plugin;
export { plugin };
