import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../circleci-api.js';

export const approveJob = defineTool({
  name: 'approve_job',
  displayName: 'Approve Job',
  description: 'Approve a pending approval job in a workflow. Requires the workflow ID and approval request ID.',
  summary: 'Approve a pending job',
  icon: 'check-circle',
  group: 'Jobs',
  input: z.object({
    workflow_id: z.string().describe('Workflow UUID'),
    approval_request_id: z.string().describe('Approval request UUID (same as the approval job ID)'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async ({ workflow_id, approval_request_id }) => {
    await apiVoid(`/workflow/${workflow_id}/approve/${approval_request_id}`);
    return { success: true };
  },
});
