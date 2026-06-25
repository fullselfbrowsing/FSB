// Vendored metadata slice of the OpenTabs calendly plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Calendly is a scheduling / availability app -- its upstream host is calendly.com (the
// APEX, like reddit), left UNCLASSIFIED (SAFE) in service-denylist.json because every
// vendored op is a READ (event types + availability + scheduled events; reads run under
// Auto with no mutating re-gate). The apex derives the stem 'calendly' directly; the
// dir-name STEM_OVERRIDES {calendly:'calendly'} pins the slug to opentabs__calendly__*
// for stability. Part of Phase-39 batch C sub-batch 4 (events [sensitive, payment] +
// local-services/scheduling [safe, read-only]). ALL ops are reads -- list_event_types /
// get_availability / list_scheduled_events -- NO write op, NO payment verb (booking a
// slot is the invitee flow, out of scope per 39-CONTEXT). calendly.com is added to
// verify-catalog-crosscheck.mjs READ_ONLY_SAFE_SERVICES SPECIFICALLY because it is
// read-only, so a future write op would FAIL the build (the 38 MED-02 invariant); the
// payment-op guard never keys on calendly (no payment-verb op-name). backing:'dom' (the
// frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listEventTypes } from './tools/list-event-types.js';
import { getAvailability } from './tools/get-availability.js';
import { listScheduledEvents } from './tools/list-scheduled-events.js';

class CalendlyPlugin extends OpenTabsPlugin {
  readonly name = 'calendly';
  readonly description =
    'OpenTabs plugin for Calendly — list your event types, check an event type’s availability, and list your scheduled events (read-only)';
  override readonly displayName = 'Calendly';
  readonly urlPatterns = ['*://calendly.com/*'];
  override readonly homepage = 'https://calendly.com';
  readonly tools: ToolDefinition[] = [
    // Scheduling availability + booked meetings -- ALL reads (no write, no payment verb).
    listEventTypes,
    getAvailability,
    listScheduledEvents,
  ];
}

const plugin = new CalendlyPlugin();
export default plugin;
export { plugin };
