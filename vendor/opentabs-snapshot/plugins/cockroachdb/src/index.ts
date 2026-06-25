import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './cockroachdb-api.js';
import { createDatabaseUser } from './tools/create-database-user.js';
import { deleteCluster } from './tools/delete-cluster.js';
import { deleteDatabaseUser } from './tools/delete-database-user.js';
import { executeSql } from './tools/execute-sql.js';
import { getClusterUsage } from './tools/get-cluster-usage.js';
import { getCluster } from './tools/get-cluster.js';
import { getCreditTrialStatus } from './tools/get-credit-trial-status.js';
import { getNetworkingConfig } from './tools/get-networking-config.js';
import { getOrganization } from './tools/get-organization.js';
import { getResourceCount } from './tools/get-resource-count.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { listClusterNodes } from './tools/list-cluster-nodes.js';
import { listClusters } from './tools/list-clusters.js';
import { listDatabaseNames } from './tools/list-database-names.js';
import { listDatabaseUsers } from './tools/list-database-users.js';
import { listInvoices } from './tools/list-invoices.js';
import { listOrgUsers } from './tools/list-org-users.js';
import { setDeleteProtection } from './tools/set-delete-protection.js';

class CockroachDBPlugin extends OpenTabsPlugin {
  readonly name = 'cockroachdb';
  readonly description = 'OpenTabs plugin for CockroachDB Cloud';
  override readonly displayName = 'CockroachDB Cloud';
  readonly urlPatterns = ['*://*.cockroachlabs.cloud/*'];
  override readonly homepage = 'https://cockroachlabs.cloud';
  readonly tools: ToolDefinition[] = [
    // Organization
    getOrganization,
    listOrgUsers,
    getResourceCount,
    getUserProfile,
    // Clusters
    listClusters,
    getCluster,
    getClusterUsage,
    listClusterNodes,
    deleteCluster,
    setDeleteProtection,
    // Databases
    listDatabaseNames,
    listDatabaseUsers,
    createDatabaseUser,
    deleteDatabaseUser,
    // SQL
    executeSql,
    // Networking
    getNetworkingConfig,
    // Billing
    listInvoices,
    getCreditTrialStatus,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new CockroachDBPlugin();
