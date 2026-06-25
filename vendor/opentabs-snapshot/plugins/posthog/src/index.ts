// Vendored metadata slice of the OpenTabs posthog plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// PostHog is a REST app (host app.posthog.com -> derived stem 'posthog' after the
// app. prefix strip, NOT in STEM_OVERRIDES). This vendored slice is read-only
// analytics: every op GETs (list_insights / get_insight / list_dashboards /
// query_events), so the whole slice classes read. posthog.list_dashboards is the
// cross-app near-neighbor of datadog.list_dashboards (same op name, different app) --
// the app token disambiguates (wrong-invoke=0). This is part of the Phase-37
// dev/productivity batch-A sub-batch 4 (cloudflare/circleci/datadog/sentry/posthog --
// cloud + observability + analytics, completing the category).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listInsights } from './tools/list-insights.js';
import { getInsight } from './tools/get-insight.js';
import { listDashboards } from './tools/list-dashboards.js';
import { queryEvents } from './tools/query-events.js';

class PostHogPlugin extends OpenTabsPlugin {
  readonly name = 'posthog';
  readonly description =
    'OpenTabs plugin for PostHog — inspect insights and dashboards and query events via the PostHog REST API';
  override readonly displayName = 'PostHog';
  readonly urlPatterns = ['*://app.posthog.com/*'];
  override readonly homepage = 'https://app.posthog.com';
  readonly tools: ToolDefinition[] = [
    // Insights + dashboards + events (all reads) -- the sub-batch-4 analytics slice.
    listInsights,
    getInsight,
    listDashboards,
    queryEvents,
  ];
}

const plugin = new PostHogPlugin();
export default plugin;
export { plugin };
