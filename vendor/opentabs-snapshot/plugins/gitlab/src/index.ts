import { OpenTabsPlugin } from '@opentabs-dev/plugin-sdk';
import type { ConfigSchema, ToolDefinition } from '@opentabs-dev/plugin-sdk';
import { isAuthenticated, waitForAuth } from './gitlab-api.js';
import { createIssue } from './tools/create-issue.js';
import { createMergeRequest } from './tools/create-merge-request.js';
import { createNote } from './tools/create-note.js';
import { getFileContent } from './tools/get-file-content.js';
import { getIssue } from './tools/get-issue.js';
import { getJobLog } from './tools/get-job-log.js';
import { getMergeRequest } from './tools/get-merge-request.js';
import { getMergeRequestDiff } from './tools/get-merge-request-diff.js';
import { getProject } from './tools/get-project.js';
import { getUserProfile } from './tools/get-user-profile.js';
import { listBranches } from './tools/list-branches.js';
import { listCommits } from './tools/list-commits.js';
import { listIssues } from './tools/list-issues.js';
import { listMergeRequests } from './tools/list-merge-requests.js';
import { listNotes } from './tools/list-notes.js';
import { listPipelineJobs } from './tools/list-pipeline-jobs.js';
import { listPipelines } from './tools/list-pipelines.js';
import { listProjects } from './tools/list-projects.js';
import { mergeMergeRequest } from './tools/merge-merge-request.js';
import { searchProjects } from './tools/search-projects.js';
import { updateIssue } from './tools/update-issue.js';
import { updateMergeRequest } from './tools/update-merge-request.js';

class GitLabPlugin extends OpenTabsPlugin {
  readonly name = 'gitlab';
  readonly description = 'OpenTabs plugin for GitLab';
  override readonly displayName = 'GitLab';
  readonly urlPatterns = ['*://gitlab.com/*'];
  override readonly homepage = 'https://gitlab.com';
  override readonly configSchema: ConfigSchema = {
    instanceUrl: {
      type: 'url' as const,
      label: 'GitLab URL',
      description:
        'The URL of your self-hosted GitLab instance (e.g., https://gitlab.example.com). Leave empty to use gitlab.com.',
      required: false,
      placeholder: 'https://gitlab.example.com',
    },
  };
  readonly tools: ToolDefinition[] = [
    // Projects
    listProjects,
    getProject,
    searchProjects,
    // Issues
    listIssues,
    getIssue,
    createIssue,
    updateIssue,
    // Merge Requests
    listMergeRequests,
    getMergeRequest,
    createMergeRequest,
    updateMergeRequest,
    mergeMergeRequest,
    getMergeRequestDiff,
    // Notes (Comments)
    listNotes,
    createNote,
    // Branches
    listBranches,
    // Content
    getFileContent,
    listCommits,
    // CI/CD
    listPipelines,
    listPipelineJobs,
    getJobLog,
    // Users
    getUserProfile,
  ];

  async isReady(): Promise<boolean> {
    if (isAuthenticated()) return true;
    return waitForAuth();
  }
}

export default new GitLabPlugin();
