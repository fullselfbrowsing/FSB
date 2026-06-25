// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../sentry-api.js';

export const getIssue = defineTool({
  name: 'get_issue',
  displayName: 'Get Issue',
  description: 'Get detailed information about a single Sentry error issue by its issue ID.',
  summary: 'Get an issue by id',
  icon: 'bug',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().min(1).describe('Sentry issue ID'),
  }),
  output: z.object({
    id: z.string().describe('Issue ID'),
    title: z.string().describe('Issue title'),
    status: z.string().optional().describe('Issue status'),
  }),
  handle: async (params: { issue_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /issues/:id/ (default method).
    const data = await api<{ id: string; title: string }>(
      `/issues/${encodeURIComponent(params.issue_id)}/`
    );
    return data;
  },
});
