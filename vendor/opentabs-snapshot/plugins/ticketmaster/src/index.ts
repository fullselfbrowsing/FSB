// Vendored metadata slice of the OpenTabs ticketmaster plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Ticketmaster is an events / ticketing app -- its upstream host is
// www.ticketmaster.com, classified SENSITIVE by Phase 39-05 (the payment/money-
// movement axis: buying tickets moves money), so the merge-time classifyGate passes
// on a screened origin. The host-derived stem ('www') is WRONG, so the dir-name
// STEM_OVERRIDES {ticketmaster:'ticketmaster'} canonicalizes the slug to
// opentabs__ticketmaster__*. Part of Phase-39 batch C sub-batch 4 (events [sensitive,
// payment] + local-services/scheduling). Its ops search events + an event's detail +
// the user's ticket orders (reads), and BUY tickets (buy_tickets -> the PAYMENT op --
// 'buy' is in the guard's PAYMENT_VERBS set AND 'buy_tickets' is in PAYMENT_OP_NAMES;
// DOM-only on the sensitive origin -> the payment-op guard PASSES). posture-B re-gates
// the write because the origin is sensitive. backing:'dom' (the frozen default) ->
// DOM-only routing (the payment op is NOT API-invocable -> the payment-op CI guard
// passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchEvents } from './tools/search-events.js';
import { getEvent } from './tools/get-event.js';
import { listOrders } from './tools/list-orders.js';
import { buyTickets } from './tools/buy-tickets.js';

class TicketmasterPlugin extends OpenTabsPlugin {
  readonly name = 'ticketmaster';
  readonly description =
    'OpenTabs plugin for Ticketmaster — search events, read an event, view your ticket orders, and buy tickets';
  override readonly displayName = 'Ticketmaster';
  readonly urlPatterns = ['*://www.ticketmaster.com/*'];
  override readonly homepage = 'https://www.ticketmaster.com';
  readonly tools: ToolDefinition[] = [
    // Events + orders (reads), buying tickets (the payment op).
    searchEvents,
    getEvent,
    listOrders,
    buyTickets,
  ];
}

const plugin = new TicketmasterPlugin();
export default plugin;
export { plugin };
