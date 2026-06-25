// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../eventbrite-api.js';

export const getEvent = defineTool({
  name: 'get_event',
  displayName: 'Get Event',
  description: 'Get the details, organizer, schedule, and ticket types of a single Eventbrite event by its ID.',
  summary: 'look up an eventbrite event',
  icon: 'calendar',
  group: 'Events',
  input: z.object({
    event_id: z.string().min(1).describe('The event ID to fetch'),
  }),
  output: z.object({
    event: z.object({
      id: z.string(),
      name: z.string(),
    }).describe('The event detail'),
  }),
  handle: async (params: { event_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v3/events/:id (default method).
    const data = await api<{ event: { id: string; name: string } }>(
      `/v3/events/${params.event_id}`,
      {}
    );
    return { event: data.event };
  },
});
