import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fidelityRest } from '../fidelity-api.js';

export const getServiceMessages = defineTool({
  name: 'get_service_messages',
  displayName: 'Get Service Messages',
  description:
    'Get account service messages and alerts from the Fidelity message center. Shows total, urgent, and new message counts.',
  summary: 'Check message center alerts',
  icon: 'bell',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    total_message_count: z.number().describe('Total number of messages'),
    urgent_message_count: z.number().describe('Number of urgent messages'),
    new_message_count: z.number().describe('Number of new/unread messages'),
  }),
  handle: async () => {
    // This endpoint returns JSONP, we need to handle it
    interface MsgResponse {
      total_msg_cnt?: number;
      total_urg_msg_count?: number;
      new_msg_cnt?: number;
    }

    try {
      const data = await fidelityRest<MsgResponse>('https://servicemessages.fidelity.com/ftgw/amtd/serviceMsgCtr', {
        headers: { Accept: '*/*' },
      });

      return {
        total_message_count: data.total_msg_cnt ?? 0,
        urgent_message_count: data.total_urg_msg_count ?? 0,
        new_message_count: data.new_msg_cnt ?? 0,
      };
    } catch {
      // This endpoint may use JSONP and fail with JSON parsing
      return {
        total_message_count: 0,
        urgent_message_count: 0,
        new_message_count: 0,
      };
    }
  },
});
