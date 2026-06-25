import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawEvent, eventSchema, mapEvent } from './schemas.js';

export const getEvent = defineTool({
  name: 'get_event',
  displayName: 'Get Event',
  description: 'Get detailed information about a specific event by its ID.',
  summary: 'Get an event by ID',
  icon: 'bell',
  group: 'Events',
  input: z.object({
    event_id: z.string().describe('Event ID (e.g., evt_xxx)'),
  }),
  output: z.object({ event: eventSchema }),
  handle: async params => {
    const data = await api<RawEvent>(`/events/${params.event_id}`);
    return { event: mapEvent(data) };
  },
});
