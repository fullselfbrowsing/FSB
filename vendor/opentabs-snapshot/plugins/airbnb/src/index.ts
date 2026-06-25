// Vendored metadata slice of the OpenTabs airbnb plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Airbnb is a PAYMENT-bearing travel app -- its upstream host is www.airbnb.com,
// the EXACT origin Phase 39-01 classified SENSITIVE (the payment/money-movement axis:
// booking a stay charges a card), so the merge-time classifyGate passes on a screened
// origin. The host-derived stem ('www') is WRONG, so the dir-name STEM_OVERRIDES
// {airbnb:'airbnb'} canonicalizes the slug to opentabs__airbnb__*. Part of Phase-39
// batch C sub-batch 3 (travel + transport). Its ops search listings + a listing's
// detail + the user's trips (reads), BOOK a paid stay (book_stay -> the PAYMENT WRITE
// -- the DOM-only-on-sensitive payment-op-guard subject for travel), and CANCEL a
// reservation (cancel_reservation -> DESTRUCTIVE). posture-B re-gates the writes
// because the origin is sensitive. backing:'dom' (the frozen default) -> DOM-only
// routing (the payment op is NOT API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchListings } from './tools/search-listings.js';
import { getListing } from './tools/get-listing.js';
import { listTrips } from './tools/list-trips.js';
import { bookStay } from './tools/book-stay.js';
import { cancelReservation } from './tools/cancel-reservation.js';

class AirbnbPlugin extends OpenTabsPlugin {
  readonly name = 'airbnb';
  readonly description =
    'OpenTabs plugin for Airbnb — search listings, read a listing, view your trips, book a paid stay, and cancel a reservation';
  override readonly displayName = 'Airbnb';
  readonly urlPatterns = ['*://www.airbnb.com/*'];
  override readonly homepage = 'https://www.airbnb.com';
  readonly tools: ToolDefinition[] = [
    // Listings + trips (reads), booking the paid stay (the payment write), cancelling (destructive).
    searchListings,
    getListing,
    listTrips,
    bookStay,
    cancelReservation,
  ];
}

const plugin = new AirbnbPlugin();
export default plugin;
export { plugin };
