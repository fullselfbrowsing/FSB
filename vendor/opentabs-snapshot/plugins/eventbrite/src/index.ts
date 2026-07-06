// Vendored metadata slice of the OpenTabs eventbrite plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Eventbrite is an events / ticketing + registration app -- its upstream host is
// www.eventbrite.com, classified SENSITIVE by Phase 39-05 (the payment/money-movement
// axis: registering for a paid event moves money), so the merge-time classifyGate
// passes on a screened origin. The host-derived stem ('www') is WRONG, so the dir-name
// STEM_OVERRIDES {eventbrite:'eventbrite'} canonicalizes the slug to
// opentabs__eventbrite__*. Part of Phase-39 batch C sub-batch 4 (events [sensitive,
// payment] + local-services/scheduling). Its ops search events + an event's detail +
// the user's orders (reads), and REGISTER for an event (register_for_event -> the
// PAYMENT op for paid events -- 'register' is in the guard's PAYMENT_VERBS set AND
// 'register_for_event' is in PAYMENT_OP_NAMES; DOM-only on the sensitive origin -> the
// payment-op guard PASSES). posture-B re-gates the write because the origin is
// sensitive. backing:'dom' (the frozen default) -> DOM-only routing (the payment op is
// NOT API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchEvents } from './tools/search-events.js';
import { getEvent } from './tools/get-event.js';
import { listOrders } from './tools/list-orders.js';
import { registerForEvent } from './tools/register-for-event.js';

class EventbritePlugin extends OpenTabsPlugin {
  readonly name = 'eventbrite';
  readonly description =
    'OpenTabs plugin for Eventbrite — search events, read an event, view your orders, and register for an event';
  override readonly displayName = 'Eventbrite';
  readonly urlPatterns = ['*://www.eventbrite.com/*'];
  override readonly homepage = 'https://www.eventbrite.com';
  readonly tools: ToolDefinition[] = [
    // Events + orders (reads), registering for an event (the payment op for paid events).
    searchEvents,
    getEvent,
    listOrders,
    registerForEvent,
  ];
}

const plugin = new EventbritePlugin();
export default plugin;
export { plugin };
