// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ticketmaster-api.js';

export const getEvent = defineTool({
  name: 'get_event',
  displayName: 'Get Event',
  description: 'Get the details, venue, lineup, and ticket price ranges of a single Ticketmaster event by its ID.',
  summary: 'look up a ticketmaster event',
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
    // NEVER executed by the importer. Upstream: api GET /discovery/v2/events/:id (default method).
    const data = await api<{ event: { id: string; name: string } }>(
      `/discovery/v2/events/${params.event_id}`,
      {}
    );
    return { event: data.event };
  },
});
