import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';

export const assignIssue = defineTool({
  name: 'assign_issue',
  displayName: 'Assign Issue',
  description: 'Assign a Jira issue to a user, or unassign it by passing null. Use search_users to find account IDs.',
  summary: 'Assign or unassign an issue',
  icon: 'user-plus',
  group: 'Issues',
  input: z.object({
    issue_key: z.string().describe('Issue key (e.g. "KAN-1") or issue ID'),
    account_id: z
      .string()
      .optional()
      .describe('Account ID of the user to assign. Omit or pass empty string to unassign.'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the assignment succeeded'),
  }),
  handle: async params => {
    await api(`/issue/${encodeURIComponent(params.issue_key)}/assignee`, {
      method: 'PUT',
      body: {
        accountId: params.account_id || null,
      },
    });
    return { success: true };
  },
});
