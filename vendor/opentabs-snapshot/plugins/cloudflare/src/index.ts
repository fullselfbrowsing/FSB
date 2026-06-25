// Vendored metadata slice of the OpenTabs cloudflare plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Cloudflare is a REST app. Its upstream host is dash.cloudflare.com, whose
// host-derived stem ('dash') is WRONG; the vendored DIR NAME is exactly `cloudflare`
// so it matches the Plan-01 STEM_OVERRIDES key and the importer canonicalizes the
// stem to 'cloudflare' (emitting opentabs__cloudflare__*, NOT opentabs__dash__*).
// Its ops GET against the Cloudflare REST API v4 (reads) and POST to
// /zones/:id/purge_cache (purge_cache -> DESTRUCTIVE via the shared `purge` verb).
// This is part of the Phase-37 dev/productivity batch-A sub-batch 4 (cloudflare/
// circleci/datadog/sentry/posthog -- cloud + observability, completing the category).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listZones } from './tools/list-zones.js';
import { getZone } from './tools/get-zone.js';
import { listDnsRecords } from './tools/list-dns-records.js';
import { purgeCache } from './tools/purge-cache.js';

class CloudflarePlugin extends OpenTabsPlugin {
  readonly name = 'cloudflare';
  readonly description =
    'OpenTabs plugin for Cloudflare — inspect zones and DNS records and purge the cache via the Cloudflare REST API';
  override readonly displayName = 'Cloudflare';
  readonly urlPatterns = ['*://dash.cloudflare.com/*'];
  override readonly homepage = 'https://dash.cloudflare.com';
  readonly tools: ToolDefinition[] = [
    // Zones + DNS (reads) and cache purge (destructive) -- the sub-batch-4 cloud slice.
    listZones,
    getZone,
    listDnsRecords,
    purgeCache,
  ];
}

const plugin = new CloudflarePlugin();
export default plugin;
export { plugin };
