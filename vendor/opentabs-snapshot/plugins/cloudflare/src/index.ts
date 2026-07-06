import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isCloudflareAuthenticated, waitForCloudflareAuth } from './cloudflare-api.js';
import { createDnsRecord } from './tools/create-dns-record.js';
import { deleteDnsRecord } from './tools/delete-dns-record.js';
import { getRuleset } from './tools/get-ruleset.js';
import { getUser } from './tools/get-user.js';
import { getZoneSettings } from './tools/get-zone-settings.js';
import { getZone } from './tools/get-zone.js';
import { graphqlQuery } from './tools/graphql-query.js';
import { listAiModels } from './tools/list-ai-models.js';
import { listAlertingPolicies } from './tools/list-alerting-policies.js';
import { listD1Databases } from './tools/list-d1-databases.js';
import { listDnsRecords } from './tools/list-dns-records.js';
import { listEmailAddresses } from './tools/list-email-addresses.js';
import { listEmailRoutingRules } from './tools/list-email-routing-rules.js';
import { listFirewallRules } from './tools/list-firewall-rules.js';
import { listKvNamespaces } from './tools/list-kv-namespaces.js';
import { listPageRules } from './tools/list-page-rules.js';
import { listPagesProjects } from './tools/list-pages-projects.js';
import { listQueues } from './tools/list-queues.js';
import { listRulesLists } from './tools/list-rules-lists.js';
import { listRulesets } from './tools/list-rulesets.js';
import { listSslCertificates } from './tools/list-ssl-certificates.js';
import { listTunnels } from './tools/list-tunnels.js';
import { listVectorizeIndexes } from './tools/list-vectorize-indexes.js';
import { listWaitingRooms } from './tools/list-waiting-rooms.js';
import { listWorkerRoutes } from './tools/list-worker-routes.js';
import { listWorkers } from './tools/list-workers.js';
import { listZones } from './tools/list-zones.js';
import { purgeCache } from './tools/purge-cache.js';
import { updateDnsRecord } from './tools/update-dns-record.js';
import { updateZoneSetting } from './tools/update-zone-setting.js';

class CloudflarePlugin extends OpenTabsPlugin {
  readonly name = 'cloudflare';
  readonly description = 'OpenTabs plugin for Cloudflare';
  override readonly displayName = 'Cloudflare';
  readonly urlPatterns = ['*://dash.cloudflare.com/*'];
  override readonly homepage = 'https://dash.cloudflare.com';
  readonly tools: ToolDefinition[] = [
    // Zones (Domains)
    listZones,
    getZone,
    // Zone Settings
    getZoneSettings,
    updateZoneSetting,
    // DNS
    listDnsRecords,
    createDnsRecord,
    updateDnsRecord,
    deleteDnsRecord,
    // Security
    listRulesets,
    getRuleset,
    listFirewallRules,
    listRulesLists,
    // Rules
    listPageRules,
    // SSL
    listSslCertificates,
    // Cache
    purgeCache,
    // Workers
    listWorkers,
    listWorkerRoutes,
    // Pages
    listPagesProjects,
    // Storage
    listKvNamespaces,
    listD1Databases,
    listQueues,
    // AI
    listAiModels,
    listVectorizeIndexes,
    // Network
    listTunnels,
    // Email
    listEmailRoutingRules,
    listEmailAddresses,
    // Traffic
    listWaitingRooms,
    // Notifications
    listAlertingPolicies,
    // Analytics
    graphqlQuery,
    // Account
    getUser,
  ];

  async isReady(): Promise<boolean> {
    if (isCloudflareAuthenticated()) return true;
    return waitForCloudflareAuth();
  }
}

export default new CloudflarePlugin();
