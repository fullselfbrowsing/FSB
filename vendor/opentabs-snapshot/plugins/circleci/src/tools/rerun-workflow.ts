import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../circleci-api.js';

export const rerunWorkflow = defineTool({
  name: 'rerun_workflow',
  displayName: 'Rerun Workflow',
  description: 'Rerun a workflow. Optionally rerun only failed jobs or run from a specific job.',
  summary: 'Rerun a workflow',
  icon: 'refresh-cw',
  group: 'Workflows',
  input: z.object({
    workflow_id: z.string().describe('Workflow UUID'),
    from_failed: z.boolean().optional().describe('Rerun only from failed jobs'),
    jobs: z.array(z.string()).optional().describe('Specific job UUIDs to rerun'),
    sparse_tree: z.boolean().optional().describe('Rerun only the specified jobs and their dependencies'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the rerun was initiated'),
  }),
  handle: async ({ workflow_id, from_failed, jobs, sparse_tree }) => {
    await apiVoid(`/workflow/${workflow_id}/rerun`, {
      body: stripUndefined({ from_failed, jobs, sparse_tree }),
    });
    return { success: true };
  },
});
