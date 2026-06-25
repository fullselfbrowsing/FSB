import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';

export const deleteEventType = defineTool({
  name: 'delete_event_type',
  displayName: 'Delete Event Type',
  description:
    'Permanently delete an event type by its numeric ID. This action cannot be undone. Active events scheduled through this event type are not affected.',
  summary: 'Delete an event type permanently',
  icon: 'calendar-x',
  group: 'Event Types',
  input: z.object({
    event_type_id: z.number().int().describe('Event type numeric ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await api<Record<string, unknown>>(`/users/me/event_types/${params.event_type_id}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
