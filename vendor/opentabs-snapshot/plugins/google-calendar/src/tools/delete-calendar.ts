import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';

export const deleteCalendar = defineTool({
  name: 'delete_calendar',
  displayName: 'Delete Calendar',
  description:
    'Delete a secondary calendar. Use calendars.clear for clearing all events on primary calendars. The primary calendar cannot be deleted.',
  summary: 'Delete a secondary calendar',
  icon: 'trash-2',
  group: 'Calendars',
  input: z.object({
    calendar_id: z.string().describe('Calendar ID to delete (must be a secondary calendar, not "primary")'),
  }),
  output: z.object({ deleted: z.boolean().describe('Whether the calendar was deleted') }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id);
    await api(`/calendars/${calendarId}`, { method: 'DELETE' });
    return { deleted: true };
  },
});
