import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './newrelic-api.js';
import { getCurrentUser } from './tools/get-current-user.js';
import { listAccounts } from './tools/list-accounts.js';
import { getOrganization } from './tools/get-organization.js';
import { searchEntities } from './tools/search-entities.js';
import { getEntity } from './tools/get-entity.js';
import { listEntityTags } from './tools/list-entity-tags.js';
import { addEntityTags } from './tools/add-entity-tags.js';
import { deleteEntityTags } from './tools/delete-entity-tags.js';
import { runNrqlQuery } from './tools/run-nrql-query.js';
import { listEventTypes } from './tools/list-event-types.js';
import { listDashboards } from './tools/list-dashboards.js';
import { getDashboard } from './tools/get-dashboard.js';
import { createDashboard } from './tools/create-dashboard.js';
import { updateDashboard } from './tools/update-dashboard.js';
import { deleteDashboard } from './tools/delete-dashboard.js';
import { listAlertPolicies } from './tools/list-alert-policies.js';
import { createAlertPolicy } from './tools/create-alert-policy.js';
import { deleteAlertPolicy } from './tools/delete-alert-policy.js';
import { listNrqlConditions } from './tools/list-nrql-conditions.js';
import { createNrqlCondition } from './tools/create-nrql-condition.js';
import { updateNrqlCondition } from './tools/update-nrql-condition.js';
import { deleteNrqlCondition } from './tools/delete-nrql-condition.js';

class NewRelicPlugin extends OpenTabsPlugin {
  readonly name = 'newrelic';
  readonly description = 'OpenTabs plugin for New Relic';
  override readonly displayName = 'New Relic';
  readonly urlPatterns = ['*://one.newrelic.com/*'];
  override readonly homepage = 'https://one.newrelic.com';
  readonly tools: ToolDefinition[] = [
    // Account
    getCurrentUser,
    listAccounts,
    getOrganization,
    // Entities
    searchEntities,
    getEntity,
    listEntityTags,
    addEntityTags,
    deleteEntityTags,
    // NRQL
    runNrqlQuery,
    listEventTypes,
    // Dashboards
    listDashboards,
    getDashboard,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    // Alerts
    listAlertPolicies,
    createAlertPolicy,
    deleteAlertPolicy,
    listNrqlConditions,
    createNrqlCondition,
    updateNrqlCondition,
    deleteNrqlCondition,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new NewRelicPlugin();
