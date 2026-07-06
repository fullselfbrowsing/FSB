import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { subApi } from '../twilio-api.js';
import { type RawMessagingService, mapMessagingService, messagingServiceSchema } from './schemas.js';

export const createMessagingService = defineTool({
  name: 'create_messaging_service',
  displayName: 'Create Messaging Service',
  description: 'Create a new messaging service for sending SMS/MMS at scale.',
  summary: 'Create Messaging Service',
  icon: 'plus',
  group: 'Messaging Services',
  input: z.object({
    friendly_name: z.string().describe('Friendly name for the messaging service'),
    inbound_request_url: z.string().optional().describe('URL to receive incoming message webhooks'),
    status_callback: z.string().optional().describe('URL to receive message status webhooks'),
    sticky_sender: z
      .boolean()
      .optional()
      .describe('Whether to enable sticky sender (keeps the same sender for a recipient)'),
  }),
  output: messagingServiceSchema,
  handle: async params => {
    const body: Record<string, string> = {
      FriendlyName: params.friendly_name,
    };
    if (params.inbound_request_url !== undefined) body.InboundRequestUrl = params.inbound_request_url;
    if (params.status_callback !== undefined) body.StatusCallback = params.status_callback;
    if (params.sticky_sender !== undefined) body.StickySender = String(params.sticky_sender);

    const data = await subApi<RawMessagingService>('https://messaging.twilio.com/v1', '/Services', {
      method: 'POST',
      body,
    });
    return mapMessagingService(data);
  },
});
