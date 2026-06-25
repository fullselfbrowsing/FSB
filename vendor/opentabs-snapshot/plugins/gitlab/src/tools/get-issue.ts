// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../gitlab-api.js';

export const getIssue = defineTool({
  name: 'get_issue',
  displayName: 'Get Issue',
  description: 'Get detailed information about a specific GitLab issue by its project and internal IID.',
  summary: 'Get an issue by IID',
  icon: 'circle-dot',
  group: 'Issues',
  input: z.object({
    project_id: z.string().min(1).describe('Project ID or URL-encoded path (group/project)'),
    issue_iid: z.number().int().describe('Internal issue IID within the project'),
  }),
  output: z.object({
    iid: z.number().describe('Issue IID'),
    title: z.string().describe('Issue title'),
    state: z.string().optional().describe('Issue state'),
  }),
  handle: async (params: { project_id: string; issue_iid: number }) => {
    // NEVER executed by the importer. Upstream: api GET /projects/:id/issues/:iid (default method).
    const data = await api<{ iid: number; title: string }>(
      `/projects/${encodeURIComponent(params.project_id)}/issues/${params.issue_iid}`
    );
    return data;
  },
});
