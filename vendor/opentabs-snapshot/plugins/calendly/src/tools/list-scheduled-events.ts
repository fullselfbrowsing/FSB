// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../calendly-api.js';

export const listScheduledEvents = defineTool({
  name: 'list_scheduled_events',
  displayName: 'List Scheduled Events',
  description: 'List your upcoming and past Calendly scheduled meetings. Returns each meeting with its invitee, time, and status.',
  summary: 'show me my calendly scheduled events',
  icon: 'list',
  group: 'Scheduling',
  input: z.object({
    status: z.enum(['active', 'canceled']).optional().describe('Filter by meeting status'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of meetings to return'),
  }),
  output: z.object({
    events: z.array(z.object({
      id: z.string(),
      start_time: z.string(),
      status: z.string(),
    })).describe('Your scheduled meetings'),
  }),
  handle: async (params: { status?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /scheduled_events (default method, a READ).
    const data = await api<{ events: unknown[] }>('/scheduled_events', {
      query: { status: params.status, count: params.limit },
    });
    return { events: data.events as { id: string; start_time: string; status: string }[] };
  },
});
