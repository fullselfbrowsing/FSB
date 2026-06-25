import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './atlas-api.js';
import { addIpAccessEntry } from './tools/add-ip-access-entry.js';
import { createDatabaseUser } from './tools/create-database-user.js';
import { deleteDatabaseUser } from './tools/delete-database-user.js';
import { deleteIpAccessEntry } from './tools/delete-ip-access-entry.js';
import { getBillingPlan } from './tools/get-billing-plan.js';
import { getCluster } from './tools/get-cluster.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getDeploymentStatus } from './tools/get-deployment-status.js';
import { getOrganization } from './tools/get-organization.js';
import { getProject } from './tools/get-project.js';
import { getUserSecurity } from './tools/get-user-security.js';
import { listAlertConfigs } from './tools/list-alert-configs.js';
import { listAlerts } from './tools/list-alerts.js';
import { listClusters } from './tools/list-clusters.js';
import { listDatabaseUsers } from './tools/list-database-users.js';
import { listIpAccessList } from './tools/list-ip-access-list.js';
import { listNetworkPeering } from './tools/list-network-peering.js';
import { listOrganizationMembers } from './tools/list-organization-members.js';
import { listOrganizationProjects } from './tools/list-organization-projects.js';
import { listOrganizationTeams } from './tools/list-organization-teams.js';

class MongoDBAtlasPlugin extends OpenTabsPlugin {
  readonly name = 'mongodb-atlas';
  readonly description = 'OpenTabs plugin for MongoDB Atlas';
  override readonly displayName = 'MongoDB Atlas';
  readonly urlPatterns = ['*://cloud.mongodb.com/*'];
  override readonly homepage = 'https://cloud.mongodb.com';
  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    getOrganization,
    listOrganizationMembers,
    listOrganizationProjects,
    listOrganizationTeams,
    getProject,
    listClusters,
    getCluster,
    listDatabaseUsers,
    createDatabaseUser,
    deleteDatabaseUser,
    listIpAccessList,
    addIpAccessEntry,
    deleteIpAccessEntry,
    listAlerts,
    listAlertConfigs,
    listNetworkPeering,
    getDeploymentStatus,
    getBillingPlan,
    getUserSecurity,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new MongoDBAtlasPlugin();
