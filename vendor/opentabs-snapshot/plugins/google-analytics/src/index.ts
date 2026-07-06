import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './ga-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';
import { getActiveProperty } from './tools/get-active-property.js';
import { listAccounts } from './tools/list-accounts.js';

// Reporting
import { getMetadata } from './tools/get-metadata.js';
import { runReport } from './tools/run-report.js';
import { runRealtimeReport } from './tools/run-realtime-report.js';
import { runBatchReport } from './tools/run-batch-report.js';
import { checkCompatibility } from './tools/check-compatibility.js';

class GoogleAnalyticsPlugin extends OpenTabsPlugin {
  readonly name = 'google-analytics';
  readonly description = 'OpenTabs plugin for Google Analytics';
  override readonly displayName = 'Google Analytics';
  readonly urlPatterns = ['*://*.analytics.google.com/*'];
  override readonly homepage = 'https://analytics.google.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    getActiveProperty,
    listAccounts,

    // Reporting
    getMetadata,
    runReport,
    runRealtimeReport,
    runBatchReport,
    checkCompatibility,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new GoogleAnalyticsPlugin();
