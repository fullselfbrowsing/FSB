import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './terraform-cloud-api.js';

// Account
import { getCurrentUser } from './tools/get-current-user.js';

// Organizations
import { listOrganizations } from './tools/list-organizations.js';
import { getOrganization } from './tools/get-organization.js';
import { listOrganizationMembers } from './tools/list-organization-members.js';

// Projects
import { listProjects } from './tools/list-projects.js';
import { getProject } from './tools/get-project.js';
import { createProject } from './tools/create-project.js';
import { updateProject } from './tools/update-project.js';
import { deleteProject } from './tools/delete-project.js';

// Workspaces
import { listWorkspaces } from './tools/list-workspaces.js';
import { getWorkspace } from './tools/get-workspace.js';
import { createWorkspace } from './tools/create-workspace.js';
import { updateWorkspace } from './tools/update-workspace.js';
import { deleteWorkspace } from './tools/delete-workspace.js';
import { lockWorkspace } from './tools/lock-workspace.js';
import { unlockWorkspace } from './tools/unlock-workspace.js';

// Runs
import { listRuns } from './tools/list-runs.js';
import { getRun } from './tools/get-run.js';
import { createRun } from './tools/create-run.js';
import { applyRun } from './tools/apply-run.js';
import { cancelRun } from './tools/cancel-run.js';
import { discardRun } from './tools/discard-run.js';

// Plans & Applies
import { getPlan } from './tools/get-plan.js';
import { getPlanJsonOutput } from './tools/get-plan-json-output.js';
import { getApply } from './tools/get-apply.js';

// State
import { listStateVersions } from './tools/list-state-versions.js';
import { getCurrentStateVersion } from './tools/get-current-state-version.js';

// Variables
import { listWorkspaceVariables } from './tools/list-workspace-variables.js';
import { createVariable } from './tools/create-variable.js';
import { updateVariable } from './tools/update-variable.js';
import { deleteVariable } from './tools/delete-variable.js';

// Variable Sets
import { listVariableSets } from './tools/list-variable-sets.js';
import { getVariableSet } from './tools/get-variable-set.js';
import { createVariableSet } from './tools/create-variable-set.js';
import { deleteVariableSet } from './tools/delete-variable-set.js';

// Teams
import { listTeams } from './tools/list-teams.js';
import { getTeam } from './tools/get-team.js';
import { listTeamAccess } from './tools/list-team-access.js';

class TerraformCloudPlugin extends OpenTabsPlugin {
  readonly name = 'terraform-cloud';
  readonly description =
    'OpenTabs plugin for HCP Terraform (Terraform Cloud) — manage organizations, workspaces, runs, variables, and teams';
  override readonly displayName = 'HCP Terraform';
  readonly urlPatterns = ['*://app.terraform.io/*'];
  override readonly homepage = 'https://app.terraform.io';

  readonly tools: ToolDefinition[] = [
    getCurrentUser,
    listOrganizations,
    getOrganization,
    listOrganizationMembers,
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    listWorkspaces,
    getWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    lockWorkspace,
    unlockWorkspace,
    listRuns,
    getRun,
    createRun,
    applyRun,
    cancelRun,
    discardRun,
    getPlan,
    getPlanJsonOutput,
    getApply,
    listStateVersions,
    getCurrentStateVersion,
    listWorkspaceVariables,
    createVariable,
    updateVariable,
    deleteVariable,
    listVariableSets,
    getVariableSet,
    createVariableSet,
    deleteVariableSet,
    listTeams,
    getTeam,
    listTeamAccess,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new TerraformCloudPlugin();
