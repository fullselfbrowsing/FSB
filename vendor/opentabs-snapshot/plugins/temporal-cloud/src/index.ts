import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './temporal-api.js';
import { listWorkflows } from './tools/list-workflows.js';
import { getWorkflow } from './tools/get-workflow.js';
import { getWorkflowHistory } from './tools/get-workflow-history.js';
import { countWorkflows } from './tools/count-workflows.js';
import { listSchedules } from './tools/list-schedules.js';
import { getSchedule } from './tools/get-schedule.js';
import { getTaskQueue } from './tools/get-task-queue.js';
import { getSettings } from './tools/get-settings.js';

class TemporalCloudPlugin extends OpenTabsPlugin {
  readonly name = 'temporal-cloud';
  readonly description = 'OpenTabs plugin for Temporal Cloud';
  override readonly displayName = 'Temporal Cloud';
  readonly urlPatterns = ['*://cloud.temporal.io/*', '*://*.web.tmprl.cloud/*'];
  override readonly homepage = 'https://cloud.temporal.io';
  readonly tools: ToolDefinition[] = [
    listWorkflows,
    getWorkflow,
    getWorkflowHistory,
    countWorkflows,
    listSchedules,
    getSchedule,
    getTaskQueue,
    getSettings,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TemporalCloudPlugin();
