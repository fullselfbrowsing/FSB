// Vendored metadata slice of the OpenTabs datadog plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Datadog is a REST app. Its upstream host is app.datadoghq.com, whose host-derived
// stem ('datadoghq') is WRONG; the vendored DIR NAME is exactly `datadog` so it
// matches the Plan-01 STEM_OVERRIDES key and the importer canonicalizes the stem to
// 'datadog' (emitting opentabs__datadog__*, NOT opentabs__datadoghq__*). Datadog is
// read-heavy observability -- every vendored op GETs (query_metrics / list_monitors /
// get_monitor / list_dashboards), so the whole slice classes read. This is part of
// the Phase-37 dev/productivity batch-A sub-batch 4 (cloudflare/circleci/datadog/
// sentry/posthog -- cloud + observability, completing the category).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { queryMetrics } from './tools/query-metrics.js';
import { listMonitors } from './tools/list-monitors.js';
import { getMonitor } from './tools/get-monitor.js';
import { listDashboards } from './tools/list-dashboards.js';

class DatadogPlugin extends OpenTabsPlugin {
  readonly name = 'datadog';
  readonly description =
    'OpenTabs plugin for Datadog — query metrics and inspect monitors and dashboards via the Datadog REST API';
  override readonly displayName = 'Datadog';
  readonly urlPatterns = ['*://app.datadoghq.com/*'];
  override readonly homepage = 'https://app.datadoghq.com';
  readonly tools: ToolDefinition[] = [
    // Metrics + monitors + dashboards (all reads) -- the sub-batch-4 observability slice.
    queryMetrics,
    listMonitors,
    getMonitor,
    listDashboards,
  ];
}

const plugin = new DatadogPlugin();
export default plugin;
export { plugin };
