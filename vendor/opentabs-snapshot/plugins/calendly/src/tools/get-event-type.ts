import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { eventTypeSchema, mapEventType } from './schemas.js';

export const getEventType = defineTool({
  name: 'get_event_type',
  displayName: 'Get Event Type',
  description:
    'Get detailed information about a specific event type by its numeric ID. Returns full configuration including duration, location settings, custom intake fields, and availability.',
  summary: 'Get event type details by ID',
  icon: 'calendar-search',
  group: 'Event Types',
  input: z.object({
    event_type_id: z.number().int().describe('Event type numeric ID'),
  }),
  output: z.object({ event_type: eventTypeSchema }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/users/me/event_types/${params.event_type_id}`);
    return { event_type: mapEventType(data) };
  },
});
