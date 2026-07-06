import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';

export const applyRun = defineTool({
  name: 'apply_run',
  displayName: 'Apply Run',
  description: 'Apply a run that is waiting for confirmation. The run must be in "planned" or "policy_checked" status.',
  summary: 'Apply a planned run',
  icon: 'check-circle',
  group: 'Runs',
  input: z.object({
    run_id: z.string().describe('Run ID (e.g., "run-...")'),
    comment: z.string().optional().describe('Comment explaining the apply'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/runs/${encodeURIComponent(params.run_id)}/actions/apply`, {
      method: 'POST',
      body: { comment: params.comment },
    });
    return { success: true };
  },
});
