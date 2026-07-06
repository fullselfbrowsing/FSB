// Vendored metadata slice of the OpenTabs grafana plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Grafana is an observability / dashboards app -- its upstream host is grafana.com,
// left UNCLASSIFIED (SAFE) in service-denylist.json because every vendored op is a READ
// (dashboard listing + a single dashboard + a metric query; reads run under Auto with no
// mutating re-gate). The host-derived stem ('grafana') is already correct; the dir-name
// STEM_OVERRIDES {grafana:'grafana'} pins the slug to opentabs__grafana__* for stability
// (the apex pattern, like reddit/calendly). Part of Phase-39 batch C sub-batch 5
// (completion -- remaining commerce + read-only misc). ALL ops are reads -- list_dashboards
// / get_dashboard / query_metrics -- NO write op, NO payment verb. grafana.com is added
// to verify-catalog-crosscheck.mjs READ_ONLY_SAFE_SERVICES SPECIFICALLY because it is
// read-only, so a future write op would FAIL the build (the 38 MED-02 invariant); the
// payment-op guard never keys on grafana (no payment-verb op-name). backing:'dom' (the
// frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listDashboards } from './tools/list-dashboards.js';
import { getDashboard } from './tools/get-dashboard.js';
import { queryMetrics } from './tools/query-metrics.js';

class GrafanaPlugin extends OpenTabsPlugin {
  readonly name = 'grafana';
  readonly description =
    'OpenTabs plugin for Grafana — list dashboards, read a dashboard, and query a metric timeseries (read-only)';
  override readonly displayName = 'Grafana';
  readonly urlPatterns = ['*://grafana.com/*'];
  override readonly homepage = 'https://grafana.com';
  readonly tools: ToolDefinition[] = [
    // Observability dashboards + metric query -- ALL reads (no write, no payment verb).
    listDashboards,
    getDashboard,
    queryMetrics,
  ];
}

const plugin = new GrafanaPlugin();
export default plugin;
export { plugin };
