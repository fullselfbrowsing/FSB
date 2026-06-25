// Vendored metadata slice of the OpenTabs booking plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Booking.com is a PAYMENT-bearing travel app -- its upstream host is
// www.booking.com, the EXACT origin Phase 39-01 classified SENSITIVE (the payment/
// money-movement axis: confirming a booking charges a card), so the merge-time
// classifyGate passes on a screened origin. The host-derived stem ('www') is WRONG,
// so the dir-name STEM_OVERRIDES {booking:'booking'} canonicalizes the slug to
// opentabs__booking__*. Part of Phase-39 batch C sub-batch 3 (travel + transport).
// Its ops search stays + a property's detail + the user's bookings (reads), COMPLETE
// a paid booking (complete_booking -> the PAYMENT WRITE -- the DOM-only-on-sensitive
// payment-op-guard subject for travel), and CANCEL a booking (cancel_booking ->
// DESTRUCTIVE). posture-B re-gates the writes because the origin is sensitive.
// backing:'dom' (the frozen default) -> DOM-only routing (the payment op is NOT
// API-invocable -> the payment-op CI guard passes).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchStays } from './tools/search-stays.js';
import { getProperty } from './tools/get-property.js';
import { listBookings } from './tools/list-bookings.js';
import { completeBooking } from './tools/complete-booking.js';
import { cancelBooking } from './tools/cancel-booking.js';

class BookingPlugin extends OpenTabsPlugin {
  readonly name = 'booking';
  readonly description =
    'OpenTabs plugin for Booking.com — search stays, read a property and its rooms, view your bookings, complete a paid booking, and cancel a booking';
  override readonly displayName = 'Booking.com';
  readonly urlPatterns = ['*://www.booking.com/*'];
  override readonly homepage = 'https://www.booking.com';
  readonly tools: ToolDefinition[] = [
    // Stays + bookings (reads), completing the paid booking (the payment write), cancelling (destructive).
    searchStays,
    getProperty,
    listBookings,
    completeBooking,
    cancelBooking,
  ];
}

const plugin = new BookingPlugin();
export default plugin;
export { plugin };
