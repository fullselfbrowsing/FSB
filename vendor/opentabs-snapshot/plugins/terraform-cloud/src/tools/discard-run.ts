import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';

export const discardRun = defineTool({
  name: 'discard_run',
  displayName: 'Discard Run',
  description: 'Discard a run that is waiting for confirmation. The plan will not be applied.',
  summary: 'Discard a planned run',
  icon: 'trash-2',
  group: 'Runs',
  input: z.object({
    run_id: z.string().describe('Run ID (e.g., "run-...")'),
    comment: z.string().optional().describe('Comment explaining the discard'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/runs/${encodeURIComponent(params.run_id)}/actions/discard`, {
      method: 'POST',
      body: { comment: params.comment },
    });
    return { success: true };
  },
});
