import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './clickhouse-api.js';
import { getOrganization } from './tools/get-organization.js';
import { getPrivateEndpointConfig } from './tools/get-private-endpoint-config.js';
import { getScalingLimits } from './tools/get-scaling-limits.js';
import { getService } from './tools/get-service.js';
import { getStatus } from './tools/get-status.js';
import { listBackups } from './tools/list-backups.js';
import { listOrganizationMembers } from './tools/list-organization-members.js';
import { listServices } from './tools/list-services.js';
import { queryMetrics } from './tools/query-metrics.js';

class ClickHousePlugin extends OpenTabsPlugin {
  readonly name = 'clickhouse';
  readonly description =
    'Manage ClickHouse Cloud services, monitor health metrics, list backups, and view organization details and members.';
  override readonly displayName = 'ClickHouse Cloud';
  readonly urlPatterns = ['*://console.clickhouse.cloud/*'];
  override readonly homepage = 'https://clickhouse.cloud';
  readonly tools: ToolDefinition[] = [
    getOrganization,
    listOrganizationMembers,
    listServices,
    getService,
    getScalingLimits,
    getPrivateEndpointConfig,
    queryMetrics,
    getStatus,
    listBackups,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new ClickHousePlugin();
