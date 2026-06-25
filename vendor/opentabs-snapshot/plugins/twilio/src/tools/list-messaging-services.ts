import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { subApi } from '../twilio-api.js';
import { type RawMessagingService, mapMessagingService, messagingServiceSchema } from './schemas.js';

export const listMessagingServices = defineTool({
  name: 'list_messaging_services',
  displayName: 'List Messaging Services',
  description: 'List messaging services configured on the account.',
  summary: 'List Messaging Services',
  icon: 'mail',
  group: 'Messaging Services',
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
    services: z.array(messagingServiceSchema).describe('Array of messaging services'),
  }),
  handle: async params => {
    const data = await subApi<{ services: RawMessagingService[] }>('https://messaging.twilio.com/v1', '/Services', {
      query: { PageSize: params.page_size ?? 20 },
    });
    return { services: (data.services ?? []).map(mapMessagingService) };
  },
});
