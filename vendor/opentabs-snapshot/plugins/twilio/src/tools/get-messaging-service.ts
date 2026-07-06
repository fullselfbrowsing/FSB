import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { subApi } from '../twilio-api.js';
import { type RawMessagingService, mapMessagingService, messagingServiceSchema } from './schemas.js';

export const getMessagingService = defineTool({
  name: 'get_messaging_service',
  displayName: 'Get Messaging Service',
  description: 'Get a specific messaging service by its SID.',
  summary: 'Get Messaging Service',
  icon: 'mail',
  group: 'Messaging Services',
  input: z.object({
    sid: z.string().describe('Messaging Service SID (e.g., MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: messagingServiceSchema,
  handle: async params => {
    const data = await subApi<RawMessagingService>('https://messaging.twilio.com/v1', `/Services/${params.sid}`);
    return mapMessagingService(data);
  },
});
