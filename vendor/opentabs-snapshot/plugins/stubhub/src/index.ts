// Vendored metadata slice of the OpenTabs stubhub plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// StubHub is a ticket-resale marketplace -- its upstream host is www.stubhub.com,
// classified SENSITIVE by Phase 39-05 (the payment/money-movement axis: buying tickets
// moves money), so the merge-time classifyGate passes on a screened origin. The
// host-derived stem ('www') is WRONG, so the dir-name STEM_OVERRIDES
// {stubhub:'stubhub'} canonicalizes the slug to opentabs__stubhub__*. Part of Phase-39
// batch C sub-batch 4 (events [sensitive, payment] + local-services/scheduling). Its
// ops search events + a listing's detail + the user's ticket orders (reads), and BUY
// tickets (buy_tickets -> the PAYMENT op -- 'buy' is in the guard's PAYMENT_VERBS set
// AND 'buy_tickets' is in PAYMENT_OP_NAMES; DOM-only on the sensitive origin -> the
// payment-op guard PASSES). posture-B re-gates the write because the origin is
// sensitive. backing:'dom' (the frozen default) -> DOM-only routing (the payment op is
// NOT API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchEvents } from './tools/search-events.js';
import { getListing } from './tools/get-listing.js';
import { listOrders } from './tools/list-orders.js';
import { buyTickets } from './tools/buy-tickets.js';

class StubhubPlugin extends OpenTabsPlugin {
  readonly name = 'stubhub';
  readonly description =
    'OpenTabs plugin for StubHub — search events, read a listing, view your ticket orders, and buy tickets';
  override readonly displayName = 'StubHub';
  readonly urlPatterns = ['*://www.stubhub.com/*'];
  override readonly homepage = 'https://www.stubhub.com';
  readonly tools: ToolDefinition[] = [
    // Events + listings + orders (reads), buying tickets (the payment op).
    searchEvents,
    getListing,
    listOrders,
    buyTickets,
  ];
}

const plugin = new StubhubPlugin();
export default plugin;
export { plugin };
