// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../calendly-api.js';

export const listEventTypes = defineTool({
  name: 'list_event_types',
  displayName: 'List Event Types',
  description:
    'List the Calendly event types (meeting templates) for your account. Returns each event type with its name, duration, and scheduling URL.',
  summary: 'list my calendly event types',
  icon: 'calendar-days',
  group: 'Scheduling',
  input: z.object({
    active: z.boolean().optional().describe('Only return active (bookable) event types'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of event types to return'),
  }),
  output: z.object({
    event_types: z.array(z.object({
      id: z.string(),
      name: z.string(),
      duration: z.number(),
    })).describe('Your Calendly event types'),
  }),
  handle: async (params: { active?: boolean; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /event_types (default method, a READ).
    const data = await api<{ event_types: unknown[] }>('/event_types', {
      query: { active: params.active, count: params.limit },
    });
    return { event_types: data.event_types as { id: string; name: string; duration: number }[] };
  },
});
