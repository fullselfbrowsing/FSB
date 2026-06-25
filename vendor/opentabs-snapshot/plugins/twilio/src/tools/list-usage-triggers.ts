import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawUsageTrigger, mapUsageTrigger, usageTriggerSchema } from './schemas.js';

export const listUsageTriggers = defineTool({
  name: 'list_usage_triggers',
  displayName: 'List Usage Triggers',
  description: 'List usage triggers configured on the account.',
  summary: 'List Usage Triggers',
  icon: 'bell',
  group: 'Usage',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of triggers to return per page (default 20, max 1000)'),
  }),
  output: z.object({
    usage_triggers: z.array(usageTriggerSchema).describe('Array of usage triggers'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      PageSize: params.page_size ?? 20,
    };

    const data = await api<{ usage_triggers: RawUsageTrigger[] }>('/Usage/Triggers.json', {
      query,
    });
    return { usage_triggers: (data.usage_triggers ?? []).map(mapUsageTrigger) };
  },
});
