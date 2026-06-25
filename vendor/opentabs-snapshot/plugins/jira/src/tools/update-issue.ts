import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { buildAdfText } from './schemas.js';

export const updateIssue = defineTool({
  name: 'update_issue',
  displayName: 'Update Issue',
  description:
    'Update fields on an existing Jira issue. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an existing issue',
  icon: 'pencil',
  group: 'Issues',
  input: z.object({
    issue_key: z.string().describe('Issue key (e.g. "KAN-1") or issue ID'),
    summary: z.string().optional().describe('New issue summary/title'),
    description: z.string().optional().describe('New issue description in plain text'),
    priority: z.string().optional().describe('New priority name (e.g. "Highest", "High", "Medium", "Low", "Lowest")'),
    assignee_id: z
      .string()
      .optional()
      .describe('New assignee account ID (use search_users to find IDs). Pass empty string to unassign.'),
    labels: z.array(z.string()).optional().describe('Replace all labels with these values'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the update succeeded'),
  }),
  handle: async params => {
    const fields: Record<string, unknown> = {};

    if (params.summary !== undefined) {
      fields.summary = params.summary;
    }
    if (params.description !== undefined) {
      fields.description = buildAdfText(params.description);
    }
    if (params.priority !== undefined) {
      fields.priority = { name: params.priority };
    }
    if (params.assignee_id !== undefined) {
      fields.assignee = params.assignee_id ? { accountId: params.assignee_id } : null;
    }
    if (params.labels !== undefined) {
      fields.labels = params.labels;
    }

    await api(`/issue/${encodeURIComponent(params.issue_key)}`, {
      method: 'PUT',
      body: { fields },
    });

    return { success: true };
  },
});
