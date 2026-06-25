import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawEvent } from './schemas.js';
import { eventSchema, mapEvent } from './schemas.js';

export const quickAddEvent = defineTool({
  name: 'quick_add_event',
  displayName: 'Quick Add Event',
  description:
    'Create an event using natural language text. Google Calendar parses the text to extract event details like title, date, time, and location. Examples: "Meeting with Bob tomorrow at 3pm", "Dinner at Olive Garden on Friday 7pm-9pm".',
  summary: 'Create an event from natural language text',
  icon: 'zap',
  group: 'Events',
  input: z.object({
    calendar_id: z.string().optional().describe('Calendar ID (default "primary")'),
    text: z.string().describe('Natural language text describing the event (e.g., "Lunch with Sarah tomorrow at noon")'),
    send_updates: z
      .enum(['all', 'externalOnly', 'none'])
      .optional()
      .describe('Who to send notifications to (default "none")'),
  }),
  output: z.object({ event: eventSchema }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id ?? 'primary');
    const data = await api<RawEvent>(`/calendars/${calendarId}/events/quickAdd`, {
      method: 'POST',
      params: {
        text: params.text,
        sendUpdates: params.send_updates ?? 'none',
      },
    });
    return { event: mapEvent(data) };
  },
});
