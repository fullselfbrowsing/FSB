import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../twilio-api.js';
import { type RawMessage, mapMessage, messageSchema } from './schemas.js';

export const getMessage = defineTool({
  name: 'get_message',
  displayName: 'Get Message',
  description: 'Get a specific SMS/MMS message by its SID.',
  summary: 'Get Message',
  icon: 'message-square',
  group: 'Messages',
  input: z.object({
    sid: z.string().describe('Message SID (e.g., SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)'),
  }),
  output: messageSchema,
  handle: async params => {
    const data = await api<RawMessage>(`/Messages/${params.sid}.json`);
    return mapMessage(data);
  },
});
