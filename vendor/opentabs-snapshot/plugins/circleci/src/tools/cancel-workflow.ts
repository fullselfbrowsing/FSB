import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../circleci-api.js';

export const cancelWorkflow = defineTool({
  name: 'cancel_workflow',
  displayName: 'Cancel Workflow',
  description: 'Cancel a running workflow. The workflow and its running jobs will be stopped.',
  summary: 'Cancel a running workflow',
  icon: 'circle-x',
  group: 'Workflows',
  input: z.object({
    workflow_id: z.string().describe('Workflow UUID'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the cancellation succeeded'),
  }),
  handle: async ({ workflow_id }) => {
    await apiVoid(`/workflow/${workflow_id}/cancel`);
    return { success: true };
  },
});
