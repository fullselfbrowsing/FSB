// Vendored metadata slice of the OpenTabs kayak plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// KAYAK is a META-SEARCH travel app -- its upstream host is www.kayak.com, classified
// SENSITIVE by Phase 39-01 (the payment/money-movement axis: a paid-booking travel
// origin), so the merge-time classifyGate passes on a screened origin. The host-derived
// stem ('www') is WRONG, so the dir-name STEM_OVERRIDES {kayak:'kayak'} canonicalizes
// the slug to opentabs__kayak__*. Part of Phase-39 batch C sub-batch 3 (travel +
// transport). Its ops search flights + hotels + a saved price alert (reads) and CREATE
// a price alert (create_price_alert -> a BENIGN WRITE; 'create' is NOT a PAYMENT_VERB
// and 'create_price_alert' is NOT a PAYMENT_OP_NAME, so it is NOT a payment op -- no
// card is charged; the guard does not key on it). posture-B still re-gates the write
// because the origin is sensitive. backing:'dom' (the frozen default) -> DOM-only
// routing. This slice has NO payment op and NO destructive op.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { searchFlights } from './tools/search-flights.js';
import { searchHotels } from './tools/search-hotels.js';
import { getPriceAlert } from './tools/get-price-alert.js';
import { createPriceAlert } from './tools/create-price-alert.js';

class KayakPlugin extends OpenTabsPlugin {
  readonly name = 'kayak';
  readonly description =
    'OpenTabs plugin for KAYAK — search flights and hotels across providers, read a saved price alert, and create a price alert';
  override readonly displayName = 'KAYAK';
  readonly urlPatterns = ['*://www.kayak.com/*'];
  override readonly homepage = 'https://www.kayak.com';
  readonly tools: ToolDefinition[] = [
    // Meta-search flights + hotels + a saved price alert (reads), creating a price alert (non-payment write).
    searchFlights,
    searchHotels,
    getPriceAlert,
    createPriceAlert,
  ];
}

const plugin = new KayakPlugin();
export default plugin;
export { plugin };
