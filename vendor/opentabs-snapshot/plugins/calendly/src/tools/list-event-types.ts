import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { eventTypeSchema, mapEventType, mapPagination, paginationSchema } from './schemas.js';

interface EventTypesResponse {
  results?: {
    event_types?: Record<string, unknown>[];
    next_page?: number | null;
    next_page_count?: number;
  }[];
  pagination?: Record<string, unknown>;
}

export const listEventTypes = defineTool({
  name: 'list_event_types',
  displayName: 'List Event Types',
  description:
    'List all event types for the current user. Event types define the scheduling templates (e.g. "30 Minute Meeting", "Discovery Call"). Returns paginated results with up to 10 event types per page.',
  summary: 'List your scheduling event types',
  icon: 'calendar-days',
  group: 'Event Types',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    event_types: z.array(eventTypeSchema).describe('List of event types'),
    pagination: paginationSchema,
  }),
  handle: async params => {
    const data = await api<EventTypesResponse>('/users/me/event_types', {
      query: { scope: 'my_calendly', page: params.page },
    });

    const allEventTypes: Record<string, unknown>[] = [];
    for (const result of data.results ?? []) {
      for (const et of result.event_types ?? []) {
        allEventTypes.push(et);
      }
    }

    return {
      event_types: allEventTypes.map(mapEventType),
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
