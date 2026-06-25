// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../jira-api.js';

export const getIssue = defineTool({
  name: 'get_issue',
  displayName: 'Get Issue',
  description: 'Get detailed information about a specific Jira issue by its ID or key.',
  summary: 'Get an issue by ID or key',
  icon: 'file',
  group: 'Issues',
  input: z.object({
    issue_id_or_key: z.string().min(1).describe('Issue ID or key to retrieve (e.g. ENG-123)'),
    fields: z.array(z.string()).optional().describe('Issue field names to include in the response'),
    expand: z.string().optional().describe('Comma-separated list of fields to expand (e.g. changelog)'),
  }),
  output: z.object({
    id: z.string().describe('Issue ID'),
    key: z.string().describe('Issue key'),
  }),
  handle: async (params: { issue_id_or_key: string }) => {
    // NEVER executed by the importer. Upstream: api GET /rest/api/3/issue/:idOrKey (default method).
    const data = await api<{ id: string; key: string }>(`/rest/api/3/issue/${params.issue_id_or_key}`);
    return data;
  },
});
