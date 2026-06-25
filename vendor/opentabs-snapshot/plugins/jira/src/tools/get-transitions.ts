import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { mapTransition, transitionSchema } from './schemas.js';

export const getTransitions = defineTool({
  name: 'get_transitions',
  displayName: 'Get Transitions',
  description:
    'Get available status transitions for a Jira issue. Use this to find transition IDs before calling transition_issue.',
  summary: 'Get available status transitions',
  icon: 'git-branch',
  group: 'Issues',
  input: z.object({
    issue_key: z.string().describe('Issue key (e.g. "KAN-1") or issue ID'),
  }),
  output: z.object({
    transitions: z.array(transitionSchema).describe('Available transitions for this issue'),
  }),
  handle: async params => {
    const data = await api<{ transitions?: Record<string, unknown>[] }>(
      `/issue/${encodeURIComponent(params.issue_key)}/transitions`,
    );
    return {
      transitions: (data.transitions ?? []).map(mapTransition),
    };
  },
});
