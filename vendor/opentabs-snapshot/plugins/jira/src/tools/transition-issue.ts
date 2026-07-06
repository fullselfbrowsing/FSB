import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';

export const transitionIssue = defineTool({
  name: 'transition_issue',
  displayName: 'Transition Issue',
  description:
    'Transition a Jira issue to a new status. Use get_transitions to find available transition IDs for an issue.',
  summary: "Change an issue's status",
  icon: 'arrow-right-circle',
  group: 'Issues',
  input: z.object({
    issue_key: z.string().describe('Issue key (e.g. "KAN-1") or issue ID'),
    transition_id: z.string().describe('Transition ID to execute (use get_transitions to find available IDs)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the transition succeeded'),
  }),
  handle: async params => {
    await api(`/issue/${encodeURIComponent(params.issue_key)}/transitions`, {
      method: 'POST',
      body: { transition: { id: params.transition_id } },
    });
    return { success: true };
  },
});
