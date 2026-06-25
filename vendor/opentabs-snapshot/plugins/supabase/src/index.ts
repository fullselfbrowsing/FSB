import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './supabase-api.js';
import { createSecrets } from './tools/create-secrets.js';
import { deleteFunction } from './tools/delete-function.js';
import { deleteSecrets } from './tools/delete-secrets.js';
import { generateTypes } from './tools/generate-types.js';
import { getApiKeys } from './tools/get-api-keys.js';
import { getFunction } from './tools/get-function.js';
import { getOrganization } from './tools/get-organization.js';
import { getPerformanceAdvisors } from './tools/get-performance-advisors.js';
import { getPostgrestConfig } from './tools/get-postgrest-config.js';
import { getProject } from './tools/get-project.js';
import { getProjectHealth } from './tools/get-project-health.js';
import { getProjectLogs } from './tools/get-project-logs.js';
import { getSecurityAdvisors } from './tools/get-security-advisors.js';
import { listBackups } from './tools/list-backups.js';
import { listBuckets } from './tools/list-buckets.js';
import { listFunctions } from './tools/list-functions.js';
import { listMigrations } from './tools/list-migrations.js';
import { listOrganizationMembers } from './tools/list-organization-members.js';
import { listOrganizations } from './tools/list-organizations.js';
import { listProjects } from './tools/list-projects.js';
import { listSecrets } from './tools/list-secrets.js';
import { listSqlSnippets } from './tools/list-sql-snippets.js';
import { pauseProject } from './tools/pause-project.js';
import { restoreProject } from './tools/restore-project.js';
import { runQuery } from './tools/run-query.js';
import { runReadOnlyQuery } from './tools/run-read-only-query.js';

class SupabasePlugin extends OpenTabsPlugin {
  readonly name = 'supabase';
  readonly description = 'OpenTabs plugin for Supabase';
  override readonly displayName = 'Supabase';
  readonly urlPatterns = ['*://supabase.com/*'];
  override readonly homepage = 'https://supabase.com/dashboard/projects';
  readonly tools: ToolDefinition[] = [
    listProjects,
    getProject,
    getProjectHealth,
    pauseProject,
    restoreProject,
    listOrganizations,
    getOrganization,
    listOrganizationMembers,
    runQuery,
    runReadOnlyQuery,
    generateTypes,
    listMigrations,
    listBackups,
    listFunctions,
    getFunction,
    deleteFunction,
    listSecrets,
    createSecrets,
    deleteSecrets,
    getApiKeys,
    listBuckets,
    getProjectLogs,
    getPerformanceAdvisors,
    getSecurityAdvisors,
    getPostgrestConfig,
    listSqlSnippets,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new SupabasePlugin();
