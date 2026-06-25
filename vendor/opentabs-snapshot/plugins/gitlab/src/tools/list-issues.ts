// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../gitlab-api.js';

export const listIssues = defineTool({
  name: 'list_issues',
  displayName: 'List Issues',
  description: 'List issues in a GitLab project. Optionally filter by state, labels, assignee, or milestone.',
  summary: 'List issues in a project',
  icon: 'list',
  group: 'Issues',
  input: z.object({
    project_id: z.string().min(1).describe('Project ID or URL-encoded path (group/project)'),
    state: z.enum(['opened', 'closed', 'all']).optional().describe('Filter by issue state'),
    labels: z.array(z.string()).optional().describe('Filter by label names'),
    assignee_username: z.string().optional().describe('Filter by assignee username'),
    milestone: z.string().optional().describe('Filter by milestone title'),
    page: z.number().int().optional().describe('Page number for pagination (1-indexed)'),
  }),
  output: z.object({
    issues: z
      .array(z.object({ iid: z.number(), title: z.string() }))
      .describe('List of issues'),
  }),
  handle: async (params: { project_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /projects/:id/issues (default method).
    const data = await api<{ issues: Array<{ iid: number; title: string }> }>(
      `/projects/${encodeURIComponent(params.project_id)}/issues`
    );
    return data;
  },
});
