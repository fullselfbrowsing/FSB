import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';

export const getPlanJsonOutput = defineTool({
  name: 'get_plan_json_output',
  displayName: 'Get Plan JSON Output',
  description:
    'Get the JSON-formatted output of a plan. Returns the planned resource changes in machine-readable format. The plan must be finished.',
  summary: 'Get plan output as JSON',
  icon: 'file-json',
  group: 'Plans',
  input: z.object({
    plan_id: z.string().describe('Plan ID (e.g., "plan-...")'),
  }),
  output: z.object({
    plan_json: z.unknown().describe('Plan JSON output containing resource changes, outputs, and configuration'),
  }),
  handle: async params => {
    const data = await api<unknown>(`/plans/${encodeURIComponent(params.plan_id)}/json-output`);

    return {
      plan_json: data,
    };
  },
});
