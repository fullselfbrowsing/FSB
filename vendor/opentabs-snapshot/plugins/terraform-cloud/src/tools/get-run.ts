import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawRun } from './schemas.js';
import { mapRun, runSchema } from './schemas.js';

export const getRun = defineTool({
  name: 'get_run',
  displayName: 'Get Run',
  description: 'Get detailed information about a specific run including status, plan details, and available actions.',
  summary: 'Get run details',
  icon: 'play',
  group: 'Runs',
  input: z.object({
    run_id: z.string().describe('Run ID (e.g., "run-...")'),
  }),
  output: z.object({
    run: runSchema.describe('Run details'),
  }),
  handle: async params => {
    const res = await api<JsonApiResponse<RawRun>>(`/runs/${encodeURIComponent(params.run_id)}`);
    return {
      run: mapRun(res.data.id, res.data.attributes),
    };
  },
});
