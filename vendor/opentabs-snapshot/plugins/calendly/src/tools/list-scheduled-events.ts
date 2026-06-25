import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { mapPagination, mapScheduledEvent, paginationSchema, scheduledEventSchema } from './schemas.js';

interface DateGroup {
  events?: Record<string, unknown>[];
}

interface ScheduledEventsResponse {
  results?: DateGroup[];
  pagination?: Record<string, unknown>;
}

export const listScheduledEvents = defineTool({
  name: 'list_scheduled_events',
  displayName: 'List Scheduled Events',
  description:
    'List scheduled events (meetings) with optional status filter. Defaults to showing all events. Supports pagination with 20 events per page.',
  summary: 'List your scheduled meetings',
  icon: 'calendar-clock',
  group: 'Scheduled Events',
  input: z.object({
    status: z
      .enum(['active', 'upcoming', 'past', 'canceled', 'completed', 'pending'])
      .optional()
      .describe('Filter by status: "active" (current), "upcoming", "past", "canceled", "completed", or "pending"'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    events: z.array(scheduledEventSchema).describe('List of scheduled events'),
    pagination: paginationSchema,
  }),
  handle: async params => {
    const data = await api<ScheduledEventsResponse>('/scheduled_events/events', {
      query: { status: params.status, page: params.page },
    });

    // Results are grouped by date — flatten all events from all date groups
    const allEvents: Record<string, unknown>[] = [];
    for (const group of data.results ?? []) {
      for (const event of group.events ?? []) {
        allEvents.push(event);
      }
    }

    return {
      events: allEvents.map(mapScheduledEvent),
      pagination: mapPagination(
        (data.pagination ?? {}) as {
          total_count?: number;
          current_page?: number;
          total_pages?: number;
          next_page?: number | null;
        },
      ),
    };
  },
});
