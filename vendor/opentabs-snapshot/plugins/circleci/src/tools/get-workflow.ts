import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawWorkflow, mapWorkflow, workflowSchema } from './schemas.js';

export const getWorkflow = defineTool({
  name: 'get_workflow',
  displayName: 'Get Workflow',
  description: 'Get a single workflow by its UUID. Returns status, timing, and pipeline info.',
  summary: 'Get a workflow by ID',
  icon: 'workflow',
  group: 'Workflows',
  input: z.object({
    workflow_id: z.string().describe('Workflow UUID'),
  }),
  output: z.object({
    workflow: workflowSchema,
  }),
  handle: async ({ workflow_id }) => {
    const data = await api<RawWorkflow>(`/workflow/${workflow_id}`);
    return { workflow: mapWorkflow(data) };
  },
});
