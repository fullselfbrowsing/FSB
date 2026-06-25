import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';

interface RawOrderingStatus {
  isOnlineOrderingAvailable?: boolean;
  isDeliveryAvailable?: boolean;
  isGroupOrderAvailable?: boolean;
  isCateringAvailable?: boolean;
}

export const getOrderingStatus = defineTool({
  name: 'get_ordering_status',
  displayName: 'Get Ordering Status',
  description:
    'Get the current online ordering status for Chipotle including delivery, group order, and catering availability flags.',
  summary: 'Check online ordering availability flags',
  icon: 'activity',
  group: 'Account',
  input: z.object({
    country: z.string().optional().describe('Country code (default "US")'),
  }),
  output: z.object({
    online_ordering: z.boolean().describe('Whether online ordering is available'),
    delivery: z.boolean().describe('Whether delivery is available'),
    group_order: z.boolean().describe('Whether group ordering is available'),
    catering: z.boolean().describe('Whether catering is available'),
  }),
  handle: async params => {
    const data = await api<RawOrderingStatus>('/onlineorderingstatus', {
      query: { country: params.country ?? 'US' },
    });
    return {
      online_ordering: data.isOnlineOrderingAvailable ?? false,
      delivery: data.isDeliveryAvailable ?? false,
      group_order: data.isGroupOrderAvailable ?? false,
      catering: data.isCateringAvailable ?? false,
    };
  },
});
