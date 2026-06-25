// Vendored metadata slice of the OpenTabs expedia plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Expedia is a PAYMENT-bearing travel app -- its upstream host is www.expedia.com,
// the EXACT origin Phase 39-01 classified SENSITIVE (the payment/money-movement axis:
// booking a flight or hotel charges a card), so the merge-time classifyGate passes on
// a screened origin. The host-derived stem ('www') is WRONG, so the dir-name
// STEM_OVERRIDES {expedia:'expedia'} canonicalizes the slug to opentabs__expedia__*.
// Part of Phase-39 batch C sub-batch 3 (travel + transport). Its ops search flights +
// hotels + the user's trips (reads) and BOOK a paid flight or hotel (book_flight /
// book_hotel -> the PAYMENT WRITES -- the DOM-only-on-sensitive payment-op-guard
// subjects for travel). posture-B re-gates the writes because the origin is sensitive.
// backing:'dom' (the frozen default) -> DOM-only routing (the payment ops are NOT
// API-invocable -> the payment-op CI guard passes). This slice has NO destructive op.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchFlights } from './tools/search-flights.js';
import { searchHotels } from './tools/search-hotels.js';
import { listTrips } from './tools/list-trips.js';
import { bookFlight } from './tools/book-flight.js';
import { bookHotel } from './tools/book-hotel.js';

class ExpediaPlugin extends OpenTabsPlugin {
  readonly name = 'expedia';
  readonly description =
    'OpenTabs plugin for Expedia — search flights and hotels, view your trips, book a paid flight, and book a paid hotel';
  override readonly displayName = 'Expedia';
  readonly urlPatterns = ['*://www.expedia.com/*'];
  override readonly homepage = 'https://www.expedia.com';
  readonly tools: ToolDefinition[] = [
    // Flights + hotels + trips (reads), booking a paid flight + a paid hotel (the payment writes).
    searchFlights,
    searchHotels,
    listTrips,
    bookFlight,
    bookHotel,
  ];
}

const plugin = new ExpediaPlugin();
export default plugin;
export { plugin };
