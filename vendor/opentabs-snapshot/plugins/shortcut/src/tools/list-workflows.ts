import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawWorkflow, mapWorkflow, workflowSchema } from './schemas.js';

export const listWorkflows = defineTool({
  name: 'list_workflows',
  displayName: 'List Workflows',
  description:
    'List all workflows and their states. Each workflow contains ordered states (e.g., Unstarted, In Progress, Done). Use state IDs when creating or updating stories.',
  summary: 'List workflows with their states',
  icon: 'git-branch',
  group: 'Workflows',
  input: z.object({}),
  output: z.object({ workflows: z.array(workflowSchema).describe('All workflows with states') }),
  handle: async () => {
    const data = await api<RawWorkflow[]>('/workflows');
    return { workflows: (data ?? []).map(mapWorkflow) };
  },
});
