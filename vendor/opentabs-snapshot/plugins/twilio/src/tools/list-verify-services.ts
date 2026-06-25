import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { subApi } from '../twilio-api.js';
import { type RawVerifyService, mapVerifyService, verifyServiceSchema } from './schemas.js';

export const listVerifyServices = defineTool({
  name: 'list_verify_services',
  displayName: 'List Verify Services',
  description: 'List verification services configured on the account.',
  summary: 'List Verify Services',
  icon: 'shield-check',
  group: 'Verify',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Number of services to return per page (default 20, max 1000)'),
  }),
  output: z.object({
    services: z.array(verifyServiceSchema).describe('Array of verify services'),
  }),
  handle: async params => {
    const data = await subApi<{ services: RawVerifyService[] }>('https://verify.twilio.com/v2', '/Services', {
      query: { PageSize: params.page_size ?? 20 },
    });
    return { services: (data.services ?? []).map(mapVerifyService) };
  },
});
