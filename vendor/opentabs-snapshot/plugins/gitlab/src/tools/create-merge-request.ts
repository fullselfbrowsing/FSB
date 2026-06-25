// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../gitlab-api.js';

export const createMergeRequest = defineTool({
  name: 'create_merge_request',
  displayName: 'Create Merge Request',
  description:
    'Open a new merge request in a GitLab project from a source branch into a target branch. Requires a project, source_branch, target_branch, and title.',
  summary: 'Open a new merge request',
  icon: 'git-merge',
  group: 'Merge Requests',
  input: z.object({
    project_id: z.string().min(1).describe('Project ID or URL-encoded path (group/project)'),
    source_branch: z.string().min(1).describe('Source branch name to merge from'),
    target_branch: z.string().min(1).describe('Target branch name to merge into'),
    title: z.string().min(1).describe('Merge request title'),
    description: z.string().optional().describe('Merge request description in markdown'),
    assignee_ids: z.array(z.number()).optional().describe('User IDs to assign as reviewers'),
    labels: z.array(z.string()).optional().describe('Label names to apply'),
    remove_source_branch: z.boolean().optional().describe('Delete the source branch on merge'),
  }),
  output: z.object({
    iid: z.number().describe('The created merge request IID'),
    title: z.string().describe('The created merge request title'),
    web_url: z.string().optional().describe('The created merge request URL'),
  }),
  handle: async (params: { project_id: string; source_branch: string; target_branch: string; title: string }) => {
    // NEVER executed by the importer. Upstream: api POST /projects/:id/merge_requests.
    const data = await api<{ iid: number; title: string }>(
      `/projects/${encodeURIComponent(params.project_id)}/merge_requests`,
      {
        method: 'POST',
        body: {
          source_branch: params.source_branch,
          target_branch: params.target_branch,
          title: params.title,
        },
      }
    );
    return data;
  },
});
