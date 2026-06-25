// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../jira-api.js';

export const updateIssue = defineTool({
  name: 'update_issue',
  displayName: 'Update Issue',
  description: 'Update an existing Jira issue. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an existing issue',
  icon: 'pencil',
  group: 'Issues',
  input: z.object({
    issue_id_or_key: z.string().min(1).describe('Issue ID or key to update (e.g. ENG-123)'),
    summary: z.string().optional().describe('New issue summary/title'),
    description: z.string().optional().describe('New issue description in markdown'),
    assignee_account_id: z.string().optional().describe('Account ID of the new assignee'),
    priority: z.string().optional().describe('New priority name (e.g. High, Medium, Low)'),
    labels: z.array(z.string()).optional().describe('New labels (replaces existing)'),
  }),
  output: z.object({
    id: z.string().describe('The updated issue ID'),
    key: z.string().describe('The updated issue key'),
  }),
  handle: async (params: { issue_id_or_key: string; summary?: string }) => {
    // NEVER executed by the importer. Upstream: api PUT /rest/api/3/issue/:idOrKey.
    const data = await api<{ id: string; key: string }>(`/rest/api/3/issue/${params.issue_id_or_key}`, {
      method: 'PUT',
      body: { fields: { summary: params.summary } },
    });
    return data;
  },
});
