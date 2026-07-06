import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './circleci-api.js';

// Users
import { getCurrentUser } from './tools/get-current-user.js';
import { listCollaborations } from './tools/list-collaborations.js';

// Projects
import { getProject } from './tools/get-project.js';

// Pipelines
import { getPipeline } from './tools/get-pipeline.js';
import { getPipelineConfig } from './tools/get-pipeline-config.js';
import { listPipelines } from './tools/list-pipelines.js';
import { triggerPipeline } from './tools/trigger-pipeline.js';

// Workflows
import { cancelWorkflow } from './tools/cancel-workflow.js';
import { getPipelineWorkflows } from './tools/get-pipeline-workflows.js';
import { getWorkflow } from './tools/get-workflow.js';
import { getWorkflowJobs } from './tools/get-workflow-jobs.js';
import { rerunWorkflow } from './tools/rerun-workflow.js';

// Jobs
import { approveJob } from './tools/approve-job.js';
import { cancelJob } from './tools/cancel-job.js';
import { getJob } from './tools/get-job.js';
import { getJobArtifacts } from './tools/get-job-artifacts.js';
import { getJobTests } from './tools/get-job-tests.js';

// Contexts
import { createContext } from './tools/create-context.js';
import { deleteContext } from './tools/delete-context.js';
import { getContext } from './tools/get-context.js';
import { listContextEnvVars } from './tools/list-context-env-vars.js';
import { listContexts } from './tools/list-contexts.js';

// Environment Variables
import { createEnvVar } from './tools/create-env-var.js';
import { deleteEnvVar } from './tools/delete-env-var.js';
import { listEnvVars } from './tools/list-env-vars.js';

// Insights
import { getFlakyTests } from './tools/get-flaky-tests.js';
import { getProjectWorkflowMetrics } from './tools/get-project-workflow-metrics.js';
import { getWorkflowJobMetrics } from './tools/get-workflow-job-metrics.js';
import { getWorkflowRuns } from './tools/get-workflow-runs.js';

// Schedules
import { createSchedule } from './tools/create-schedule.js';
import { deleteSchedule } from './tools/delete-schedule.js';
import { listSchedules } from './tools/list-schedules.js';
import { updateSchedule } from './tools/update-schedule.js';

class CircleCIPlugin extends OpenTabsPlugin {
  readonly name = 'circleci';
  readonly description = 'OpenTabs plugin for CircleCI';
  override readonly displayName = 'CircleCI';
  readonly urlPatterns = ['*://app.circleci.com/*'];
  override readonly homepage = 'https://app.circleci.com';

  readonly tools: ToolDefinition[] = [
    // Users
    getCurrentUser,
    listCollaborations,

    // Projects
    getProject,

    // Pipelines
    listPipelines,
    getPipeline,
    getPipelineConfig,
    triggerPipeline,

    // Workflows
    getPipelineWorkflows,
    getWorkflow,
    getWorkflowJobs,
    cancelWorkflow,
    rerunWorkflow,

    // Jobs
    getJob,
    getJobArtifacts,
    getJobTests,
    cancelJob,
    approveJob,

    // Contexts
    listContexts,
    getContext,
    createContext,
    deleteContext,
    listContextEnvVars,

    // Environment Variables
    listEnvVars,
    createEnvVar,
    deleteEnvVar,

    // Insights
    getProjectWorkflowMetrics,
    getWorkflowRuns,
    getWorkflowJobMetrics,
    getFlakyTests,

    // Schedules
    listSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new CircleCIPlugin();
