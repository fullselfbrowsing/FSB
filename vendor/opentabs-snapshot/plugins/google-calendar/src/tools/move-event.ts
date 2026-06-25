import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawEvent } from './schemas.js';
import { eventSchema, mapEvent } from './schemas.js';

export const moveEvent = defineTool({
  name: 'move_event',
  displayName: 'Move Event',
  description:
    'Move an event to another calendar. This changes the event organizer. Only default events can be moved — birthday, focusTime, fromGmail, outOfOffice, and workingLocation events cannot be moved.',
  summary: 'Move an event to another calendar',
  icon: 'arrow-right-left',
  group: 'Events',
  input: z.object({
    calendar_id: z.string().optional().describe('Source calendar ID (default "primary")'),
    event_id: z.string().describe('Event ID to move'),
    destination: z.string().describe('Destination calendar ID to move the event to'),
  }),
  output: z.object({ event: eventSchema }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id ?? 'primary');
    const eventId = encodeURIComponent(params.event_id);
    const data = await api<RawEvent>(`/calendars/${calendarId}/events/${eventId}/move`, {
      method: 'POST',
      params: { destination: params.destination },
    });
    return { event: mapEvent(data) };
  },
});
