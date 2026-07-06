import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';

export const deactivateEventType = defineTool({
  name: 'deactivate_event_type',
  displayName: 'Deactivate Event Type',
  description:
    'Deactivate an event type so it is no longer available for booking. The event type is preserved and can be reactivated later. Existing scheduled events are not affected.',
  summary: 'Deactivate an event type',
  icon: 'calendar-minus',
  group: 'Event Types',
  input: z.object({
    event_type_id: z.number().int().describe('Event type numeric ID to deactivate'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deactivation succeeded'),
  }),
  handle: async params => {
    await api<Record<string, unknown>>(`/users/me/event_types/${params.event_type_id}/deactivate`, { method: 'PUT' });
    return { success: true };
  },
});
