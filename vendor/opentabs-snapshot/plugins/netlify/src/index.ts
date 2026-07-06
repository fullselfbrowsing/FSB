import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './netlify-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';
import { listAccounts } from './tools/list-accounts.js';
import { getAccount } from './tools/get-account.js';
import { listAuditEvents } from './tools/list-audit-events.js';

// Members
import { listMembers } from './tools/list-members.js';
import { getMember } from './tools/get-member.js';

// Sites
import { listSites } from './tools/list-sites.js';
import { getSite } from './tools/get-site.js';
import { createSite } from './tools/create-site.js';
import { updateSite } from './tools/update-site.js';
import { deleteSite } from './tools/delete-site.js';

// Deploys
import { listDeploys } from './tools/list-deploys.js';
import { getDeploy } from './tools/get-deploy.js';
import { lockDeploy } from './tools/lock-deploy.js';
import { unlockDeploy } from './tools/unlock-deploy.js';
import { restoreDeploy } from './tools/restore-deploy.js';
import { rollbackDeploy } from './tools/rollback-deploy.js';

// Builds
import { listBuilds } from './tools/list-builds.js';
import { createBuild } from './tools/create-build.js';

// Environment Variables
import { listEnvVars } from './tools/list-env-vars.js';
import { getEnvVar } from './tools/get-env-var.js';
import { createEnvVars } from './tools/create-env-vars.js';
import { updateEnvVar } from './tools/update-env-var.js';
import { deleteEnvVar } from './tools/delete-env-var.js';

// DNS
import { listDnsZones } from './tools/list-dns-zones.js';
import { getDnsZone } from './tools/get-dns-zone.js';
import { createDnsZone } from './tools/create-dns-zone.js';
import { listDnsRecords } from './tools/list-dns-records.js';
import { createDnsRecord } from './tools/create-dns-record.js';
import { deleteDnsRecord } from './tools/delete-dns-record.js';

// Hooks
import { listHooks } from './tools/list-hooks.js';
import { deleteHook } from './tools/delete-hook.js';

// Build Hooks
import { listBuildHooks } from './tools/list-build-hooks.js';
import { createBuildHook } from './tools/create-build-hook.js';
import { deleteBuildHook } from './tools/delete-build-hook.js';

// Deploy Keys
import { listDeployKeys } from './tools/list-deploy-keys.js';
import { createDeployKey } from './tools/create-deploy-key.js';

// Forms
import { listForms } from './tools/list-forms.js';
import { listFormSubmissions } from './tools/list-form-submissions.js';
import { deleteSubmission } from './tools/delete-submission.js';

class NetlifyPlugin extends OpenTabsPlugin {
  readonly name = 'netlify';
  readonly description = 'OpenTabs plugin for Netlify';
  override readonly displayName = 'Netlify';
  readonly urlPatterns = ['*://app.netlify.com/*'];
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    listAccounts,
    getAccount,
    listAuditEvents,
    // Members
    listMembers,
    getMember,
    // Sites
    listSites,
    getSite,
    createSite,
    updateSite,
    deleteSite,
    // Deploys
    listDeploys,
    getDeploy,
    lockDeploy,
    unlockDeploy,
    restoreDeploy,
    rollbackDeploy,
    // Builds
    listBuilds,
    createBuild,
    // Environment Variables
    listEnvVars,
    getEnvVar,
    createEnvVars,
    updateEnvVar,
    deleteEnvVar,
    // DNS
    listDnsZones,
    getDnsZone,
    createDnsZone,
    listDnsRecords,
    createDnsRecord,
    deleteDnsRecord,
    // Hooks
    listHooks,
    deleteHook,
    // Build Hooks
    listBuildHooks,
    createBuildHook,
    deleteBuildHook,
    // Deploy Keys
    listDeployKeys,
    createDeployKey,
    // Forms
    listForms,
    listFormSubmissions,
    deleteSubmission,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new NetlifyPlugin();
