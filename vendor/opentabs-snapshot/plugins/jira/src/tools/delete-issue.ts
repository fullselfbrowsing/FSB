import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';

export const deleteIssue = defineTool({
  name: 'delete_issue',
  displayName: 'Delete Issue',
  description: 'Delete a Jira issue. Optionally delete all subtasks as well.',
  summary: 'Delete an issue',
  icon: 'trash-2',
  group: 'Issues',
  input: z.object({
    issue_key: z.string().describe('Issue key (e.g. "KAN-1") or issue ID'),
    delete_subtasks: z.boolean().optional().describe('Whether to also delete subtasks (default false)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await api(`/issue/${encodeURIComponent(params.issue_key)}`, {
      method: 'DELETE',
      query: {
        deleteSubtasks: params.delete_subtasks ? 'true' : 'false',
      },
    });
    return { success: true };
  },
});
