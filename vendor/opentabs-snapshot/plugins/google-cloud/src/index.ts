import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './gcloud-api.js';

// Projects
import { getCurrentProject } from './tools/get-current-project.js';
import { listProjects } from './tools/list-projects.js';
import { getProject } from './tools/get-project.js';

// Compute
import { listInstances } from './tools/list-instances.js';
import { getInstance } from './tools/get-instance.js';
import { startInstance } from './tools/start-instance.js';
import { stopInstance } from './tools/stop-instance.js';
import { listDisks } from './tools/list-disks.js';
import { listNetworks } from './tools/list-networks.js';
import { listFirewalls } from './tools/list-firewalls.js';

// Storage
import { listBuckets } from './tools/list-buckets.js';
import { getBucket } from './tools/get-bucket.js';
import { listObjects } from './tools/list-objects.js';

// IAM
import { listServiceAccounts } from './tools/list-service-accounts.js';
import { listIamRoles } from './tools/list-iam-roles.js';
import { getIamPolicy } from './tools/get-iam-policy.js';

// Services
import { listEnabledServices } from './tools/list-enabled-services.js';
import { enableService } from './tools/enable-service.js';
import { disableService } from './tools/disable-service.js';

// Cloud Functions
import { listFunctions } from './tools/list-functions.js';
import { getFunction } from './tools/get-function.js';

// Cloud Run
import { listCloudRunServices } from './tools/list-cloud-run-services.js';
import { getCloudRunService } from './tools/get-cloud-run-service.js';

// Logging
import { listLogEntries } from './tools/list-log-entries.js';

// Billing
import { listBillingAccounts } from './tools/list-billing-accounts.js';
import { getBillingInfo } from './tools/get-billing-info.js';

// Kubernetes
import { listClusters } from './tools/list-clusters.js';
import { getCluster } from './tools/get-cluster.js';

// Cloud SQL
import { listSqlInstances } from './tools/list-sql-instances.js';
import { getSqlInstance } from './tools/get-sql-instance.js';

class GoogleCloudPlugin extends OpenTabsPlugin {
  readonly name = 'google-cloud';
  readonly description = 'OpenTabs plugin for Google Cloud Console';
  override readonly displayName = 'Google Cloud';
  readonly urlPatterns = ['*://console.cloud.google.com/*'];
  override readonly homepage = 'https://console.cloud.google.com';
  readonly tools: ToolDefinition[] = [
    // Projects
    getCurrentProject,
    listProjects,
    getProject,

    // Compute
    listInstances,
    getInstance,
    startInstance,
    stopInstance,
    listDisks,
    listNetworks,
    listFirewalls,

    // Storage
    listBuckets,
    getBucket,
    listObjects,

    // IAM
    listServiceAccounts,
    listIamRoles,
    getIamPolicy,

    // Services
    listEnabledServices,
    enableService,
    disableService,

    // Cloud Functions
    listFunctions,
    getFunction,

    // Cloud Run
    listCloudRunServices,
    getCloudRunService,

    // Logging
    listLogEntries,

    // Billing
    listBillingAccounts,
    getBillingInfo,

    // Kubernetes
    listClusters,
    getCluster,

    // Cloud SQL
    listSqlInstances,
    getSqlInstance,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new GoogleCloudPlugin();
