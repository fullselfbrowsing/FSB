import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';

export const activateEventType = defineTool({
  name: 'activate_event_type',
  displayName: 'Activate Event Type',
  description: 'Activate a previously deactivated event type, making it available for booking again.',
  summary: 'Activate an event type for booking',
  icon: 'calendar-check',
  group: 'Event Types',
  input: z.object({
    event_type_id: z.number().int().describe('Event type numeric ID to activate'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the activation succeeded'),
  }),
  handle: async params => {
    await api<Record<string, unknown>>(`/users/me/event_types/${params.event_type_id}/activate`, { method: 'PUT' });
    return { success: true };
  },
});
