import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './webflow-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { getSite } from './tools/get-site.js';
import { getSiteDomains } from './tools/get-site-domains.js';
import { getSiteHosting } from './tools/get-site-hosting.js';
import { getSitePages } from './tools/get-site-pages.js';
import { getSitePermissions } from './tools/get-site-permissions.js';
import { getWorkspace } from './tools/get-workspace.js';
import { getWorkspaceBilling } from './tools/get-workspace-billing.js';
import { getWorkspaceEntitlements } from './tools/get-workspace-entitlements.js';
import { getWorkspacePermissions } from './tools/get-workspace-permissions.js';
import { listFolders } from './tools/list-folders.js';
import { listSiteForms } from './tools/list-site-forms.js';
import { listSites } from './tools/list-sites.js';
import { listWorkspaceMembers } from './tools/list-workspace-members.js';
import { listWorkspaces } from './tools/list-workspaces.js';

class WebflowPlugin extends OpenTabsPlugin {
  readonly name = 'webflow';
  readonly description = 'OpenTabs plugin for Webflow';
  override readonly displayName = 'Webflow';
  readonly urlPatterns = ['*://*.webflow.com/*'];
  override readonly homepage = 'https://webflow.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    // Workspaces
    listWorkspaces,
    getWorkspace,
    getWorkspacePermissions,
    listWorkspaceMembers,
    getWorkspaceBilling,
    getWorkspaceEntitlements,
    listFolders,
    // Sites
    listSites,
    getSite,
    getSiteDomains,
    getSiteHosting,
    getSitePages,
    getSitePermissions,
    listSiteForms,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new WebflowPlugin();
