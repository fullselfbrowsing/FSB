import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orchestraApi } from '../starbucks-api.js';

const timeSlotSchema = z.object({
  time: z.string().describe('Time slot value (ISO 8601 or formatted time)'),
  display: z.string().describe('Formatted display time (e.g., "3:15 PM")'),
  available: z.boolean().describe('Whether the time slot is available'),
});

interface RawTimeSlot {
  time?: string;
  display?: string;
  available?: boolean;
}

export const getStoreTimeSlots = defineTool({
  name: 'get_store_time_slots',
  displayName: 'Get Store Time Slots',
  description:
    'Get available pickup time slots for a specific Starbucks store. Use this to check when mobile orders can be picked up. Returns empty if the store does not support scheduled ordering or is closed.',
  summary: 'Get available pickup time slots',
  icon: 'clock',
  group: 'Orders',
  input: z.object({
    store_number: z.string().describe('Store number (e.g., "53646-283069")'),
  }),
  output: z.object({
    time_slots: z.array(timeSlotSchema).describe('Available pickup time slots'),
    mobile_order_availability: z.string().describe('Mobile order availability status (e.g., "READY", "NOT_READY")'),
  }),
  handle: async params => {
    interface StoreTimeSlotResponse {
      data?: {
        storeByNumber?: {
          scheduledOrdering?: {
            slots?: RawTimeSlot[];
            mobileOrderAvailability?: string;
          };
        };
      };
    }
    const data = await orchestraApi<StoreTimeSlotResponse>('get-store-time-slots', {
      storeNumber: params.store_number,
    });
    const scheduling = data.data?.storeByNumber?.scheduledOrdering;
    const slots = scheduling?.slots ?? [];
    return {
      time_slots: slots.map(s => ({
        time: s.time ?? '',
        display: s.display ?? '',
        available: s.available ?? false,
      })),
      mobile_order_availability: scheduling?.mobileOrderAvailability ?? '',
    };
  },
});
