import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './snowflake-api.js';

// Account
import { diagnose } from './tools/diagnose.js';
import { getSession } from './tools/get-session.js';

// Queries
import { getQueryTool } from './tools/get-query.js';
import { runQueryTool } from './tools/run-query.js';

// Schema
import { browseData } from './tools/browse-data.js';
import { getObjectDetails } from './tools/get-object-details.js';
import { listSchemas } from './tools/list-schemas.js';
import { listSharedObjects } from './tools/list-shared-objects.js';
import { listTables } from './tools/list-tables.js';
import { listWarehouses } from './tools/list-warehouses.js';
import { searchData } from './tools/search-data.js';

// Worksheets
import { listDashboards } from './tools/list-dashboards.js';
import { listFolders } from './tools/list-folders.js';
import { listWorksheets } from './tools/list-worksheets.js';

class SnowflakePlugin extends OpenTabsPlugin {
  readonly name = 'snowflake';
  readonly description =
    'OpenTabs plugin for Snowflake — run SQL queries, browse database schemas, and manage worksheets.';
  override readonly displayName = 'Snowflake';
  readonly urlPatterns = ['*://app.snowflake.com/*', '*://*.snowflakecomputing.com/*'];
  override readonly homepage = 'https://app.snowflake.com';

  readonly tools: ToolDefinition[] = [
    // Account
    getSession,
    diagnose,
    // Queries
    runQueryTool,
    getQueryTool,
    // Schema
    browseData,
    searchData,
    listSchemas,
    listTables,
    listWarehouses,
    getObjectDetails,
    listSharedObjects,
    // Worksheets
    listWorksheets,
    listFolders,
    listDashboards,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new SnowflakePlugin();
