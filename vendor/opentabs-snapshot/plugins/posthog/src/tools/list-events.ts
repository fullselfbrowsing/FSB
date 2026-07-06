import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type PaginatedResponse, type RawEvent, eventSchema, mapEvent } from './schemas.js';

export const listEvents = defineTool({
  name: 'list_events',
  displayName: 'List Events',
  description:
    'List raw events from the current PostHog project. Returns individual event occurrences with their properties. Filter by event name, person distinct ID, or date range. Events are ordered by timestamp descending (newest first).',
  summary: 'List raw analytics events',
  icon: 'activity',
  group: 'Events',
  input: z.object({
    event: z.string().optional().describe('Filter by event name (e.g., "$pageview", "server_started")'),
    person_id: z.string().optional().describe('Filter by person distinct ID'),
    after: z.string().optional().describe('Only return events after this ISO 8601 timestamp'),
    before: z.string().optional().describe('Only return events before this ISO 8601 timestamp'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum events to return (default 20, max 100)'),
  }),
  output: z.object({
    events: z.array(eventSchema).describe('List of events'),
    has_next: z.boolean().describe('Whether more events are available'),
  }),
  handle: async params => {
    const teamId = getTeamId();
    const query: Record<string, string | number | boolean | undefined> = {
      orderBy: '["-timestamp"]',
      limit: params.limit ?? 20,
    };
    if (params.event) query.event = params.event;
    if (params.person_id) query.person_id = params.person_id;
    if (params.after) query.after = params.after;
    if (params.before) query.before = params.before;

    const data = await api<PaginatedResponse<RawEvent>>(`/api/environments/${teamId}/events/`, { query });
    return {
      events: (data.results ?? []).map(mapEvent),
      has_next: data.next != null,
    };
  },
});
