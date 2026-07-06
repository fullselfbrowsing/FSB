import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';

export const cancelRun = defineTool({
  name: 'cancel_run',
  displayName: 'Cancel Run',
  description: 'Cancel a run that is currently planning or awaiting confirmation.',
  summary: 'Cancel a run',
  icon: 'x-circle',
  group: 'Runs',
  input: z.object({
    run_id: z.string().describe('Run ID (e.g., "run-...")'),
    comment: z.string().optional().describe('Comment explaining the cancellation'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/runs/${encodeURIComponent(params.run_id)}/actions/cancel`, {
      method: 'POST',
      body: { comment: params.comment },
    });
    return { success: true };
  },
});
