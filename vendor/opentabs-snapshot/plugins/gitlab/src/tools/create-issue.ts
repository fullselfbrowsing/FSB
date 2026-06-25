// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../gitlab-api.js';

export const createIssue = defineTool({
  name: 'create_issue',
  displayName: 'Create Issue',
  description:
    'Create a new issue in a GitLab project. Requires a project and a title at minimum. Optionally set description, assignees, labels, milestone, and due date.',
  summary: 'Create a new issue',
  icon: 'plus',
  group: 'Issues',
  input: z.object({
    project_id: z.string().min(1).describe('Project ID or URL-encoded path (group/project)'),
    title: z.string().min(1).describe('Issue title'),
    description: z.string().optional().describe('Issue description in markdown'),
    assignee_ids: z.array(z.number()).optional().describe('User IDs to assign the issue to'),
    labels: z.array(z.string()).optional().describe('Label names to apply to the issue'),
    milestone_id: z.number().optional().describe('Milestone ID to associate the issue with'),
    due_date: z.string().optional().describe('Due date as an ISO 8601 date (YYYY-MM-DD)'),
  }),
  output: z.object({
    iid: z.number().describe('The created issue IID'),
    title: z.string().describe('The created issue title'),
    web_url: z.string().optional().describe('The created issue URL'),
  }),
  handle: async (params: { project_id: string; title: string }) => {
    // NEVER executed by the importer. Upstream: api POST /projects/:id/issues.
    const data = await api<{ iid: number; title: string }>(
      `/projects/${encodeURIComponent(params.project_id)}/issues`,
      {
        method: 'POST',
        body: { title: params.title },
      }
    );
    return data;
  },
});
