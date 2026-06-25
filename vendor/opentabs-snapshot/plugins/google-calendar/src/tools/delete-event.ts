import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';

export const deleteEvent = defineTool({
  name: 'delete_event',
  displayName: 'Delete Event',
  description:
    'Delete an event from a calendar. For recurring events, this deletes the entire series. To delete a single instance, use the instance event ID.',
  summary: 'Delete a calendar event',
  icon: 'calendar-x',
  group: 'Events',
  input: z.object({
    calendar_id: z.string().optional().describe('Calendar ID (default "primary")'),
    event_id: z.string().describe('Event ID to delete'),
    send_updates: z
      .enum(['all', 'externalOnly', 'none'])
      .optional()
      .describe('Who to send cancellation notifications to (default "none")'),
  }),
  output: z.object({ deleted: z.boolean().describe('Whether the event was deleted') }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id ?? 'primary');
    const eventId = encodeURIComponent(params.event_id);
    await api(`/calendars/${calendarId}/events/${eventId}`, {
      method: 'DELETE',
      params: { sendUpdates: params.send_updates ?? 'none' },
    });
    return { deleted: true };
  },
});
