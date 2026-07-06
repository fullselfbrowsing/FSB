import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';

const busySlotSchema = z.object({
  start: z.string().describe('Start of the busy period as ISO 8601 timestamp'),
  end: z.string().describe('End of the busy period as ISO 8601 timestamp'),
});

const calendarBusySchema = z.object({
  calendar_id: z.string().describe('Calendar ID'),
  busy: z.array(busySlotSchema).describe('List of busy time slots'),
  errors: z.array(z.string()).describe('Errors accessing this calendar'),
});

interface RawFreeBusy {
  calendars?: Record<
    string,
    {
      busy?: { start?: string; end?: string }[];
      errors?: { domain?: string; reason?: string }[];
    }
  >;
}

export const queryFreebusy = defineTool({
  name: 'query_freebusy',
  displayName: 'Query Free/Busy',
  description:
    'Query free/busy information for one or more calendars within a time range. Returns time slots where events are scheduled. Useful for finding available meeting times.',
  summary: 'Query free/busy information for calendars',
  icon: 'clock',
  group: 'Free/Busy',
  input: z.object({
    time_min: z.string().describe('Start of the time range as ISO 8601 timestamp'),
    time_max: z.string().describe('End of the time range as ISO 8601 timestamp'),
    calendar_ids: z.array(z.string()).optional().describe('Calendar IDs to query (default ["primary"])'),
    time_zone: z.string().optional().describe('IANA time zone for the query'),
  }),
  output: z.object({
    calendars: z.array(calendarBusySchema).describe('Free/busy information per calendar'),
  }),
  handle: async params => {
    const calendarIds = params.calendar_ids ?? ['primary'];
    const data = await api<RawFreeBusy>('/freeBusy', {
      method: 'POST',
      body: {
        timeMin: params.time_min,
        timeMax: params.time_max,
        timeZone: params.time_zone,
        items: calendarIds.map(id => ({ id })),
      },
    });

    const calendars = Object.entries(data.calendars ?? {}).map(([id, cal]) => ({
      calendar_id: id,
      busy: (cal.busy ?? []).map(b => ({
        start: b.start ?? '',
        end: b.end ?? '',
      })),
      errors: (cal.errors ?? []).map(e => `${e.domain ?? ''}: ${e.reason ?? ''}`),
    }));

    return { calendars };
  },
});
