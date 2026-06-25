import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './amplitude-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';
import { getOrgData } from './tools/get-org-data.js';
import { listOrgs } from './tools/list-orgs.js';

// Users
import { listUsers } from './tools/list-users.js';

// Spaces
import { getPersonalSpace } from './tools/get-personal-space.js';
import { listSpaces } from './tools/list-spaces.js';

// Search
import { searchContent } from './tools/search-content.js';

// Analytics
import { listEvents } from './tools/list-events.js';
import { getColorPalettes } from './tools/get-color-palettes.js';

// Usage
import { getEventVolumes } from './tools/get-event-volumes.js';
import { getMtuVolumes } from './tools/get-mtu-volumes.js';
import { getSessionReplayVolumes } from './tools/get-session-replay-volumes.js';

// Billing
import { getEntitlements } from './tools/get-entitlements.js';
import { getReportQuota } from './tools/get-report-quota.js';

// Permissions
import { checkPermissions } from './tools/check-permissions.js';

class AmplitudePlugin extends OpenTabsPlugin {
  readonly name = 'amplitude';
  readonly description = 'OpenTabs plugin for Amplitude analytics';
  override readonly displayName = 'Amplitude';
  readonly urlPatterns = ['*://app.amplitude.com/*', '*://analytics.amplitude.com/*'];
  override readonly homepage = 'https://app.amplitude.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    getOrgData,
    listOrgs,
    // Users
    listUsers,
    // Spaces
    getPersonalSpace,
    listSpaces,
    // Search
    searchContent,
    // Analytics
    listEvents,
    getColorPalettes,
    // Usage
    getEventVolumes,
    getMtuVolumes,
    getSessionReplayVolumes,
    // Billing
    getEntitlements,
    getReportQuota,
    // Permissions
    checkPermissions,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new AmplitudePlugin();
