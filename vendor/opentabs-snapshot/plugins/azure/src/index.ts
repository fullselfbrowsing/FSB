import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './azure-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';

// Tenants
import { listTenants } from './tools/list-tenants.js';

// Subscriptions
import { listSubscriptions } from './tools/list-subscriptions.js';
import { getSubscription } from './tools/get-subscription.js';

// Resource Groups
import { listResourceGroups } from './tools/list-resource-groups.js';
import { getResourceGroup } from './tools/get-resource-group.js';
import { createResourceGroup } from './tools/create-resource-group.js';
import { deleteResourceGroup } from './tools/delete-resource-group.js';

// Resources
import { listResources } from './tools/list-resources.js';
import { getResource } from './tools/get-resource.js';
import { deleteResource } from './tools/delete-resource.js';
import { listResourceProviders } from './tools/list-resource-providers.js';

// Deployments
import { listDeployments } from './tools/list-deployments.js';
import { getDeployment } from './tools/get-deployment.js';
import { createDeployment } from './tools/create-deployment.js';
import { deleteDeployment } from './tools/delete-deployment.js';

// Activity Log
import { listActivityLogs } from './tools/list-activity-logs.js';

// Locations
import { listLocations } from './tools/list-locations.js';
import { listSubscriptionLocations } from './tools/list-subscription-locations.js';

// Tags
import { listTags } from './tools/list-tags.js';

// Locks
import { listLocks } from './tools/list-locks.js';
import { createLock } from './tools/create-lock.js';
import { deleteLock } from './tools/delete-lock.js';

// Policy
import { listPolicyAssignments } from './tools/list-policy-assignments.js';
import { getPolicyAssignment } from './tools/get-policy-assignment.js';

// Role Assignments
import { listRoleAssignments } from './tools/list-role-assignments.js';

class AzurePlugin extends OpenTabsPlugin {
  readonly name = 'azure';
  readonly description = 'OpenTabs plugin for Microsoft Azure Portal';
  override readonly displayName = 'Azure Portal';
  readonly urlPatterns = ['*://portal.azure.com/*'];
  override readonly homepage = 'https://portal.azure.com';

  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    // Tenants
    listTenants,
    // Subscriptions
    listSubscriptions,
    getSubscription,
    // Resource Groups
    listResourceGroups,
    getResourceGroup,
    createResourceGroup,
    deleteResourceGroup,
    // Resources
    listResources,
    getResource,
    deleteResource,
    listResourceProviders,
    // Deployments
    listDeployments,
    getDeployment,
    createDeployment,
    deleteDeployment,
    // Activity Log
    listActivityLogs,
    // Locations
    listLocations,
    listSubscriptionLocations,
    // Tags
    listTags,
    // Locks
    listLocks,
    createLock,
    deleteLock,
    // Policy
    listPolicyAssignments,
    getPolicyAssignment,
    // Role Assignments
    listRoleAssignments,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new AzurePlugin();
