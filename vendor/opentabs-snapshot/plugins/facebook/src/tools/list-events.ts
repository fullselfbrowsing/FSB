import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../facebook-api.js';
import { type RawEvent, eventSchema, mapEvent } from './schemas.js';

interface EventsHomeResponse {
  viewer?: {
    all_events?: {
      edges?: Array<{ node?: RawEvent }>;
      page_info?: { has_next_page?: boolean; end_cursor?: string };
    };
  };
}

export const listEvents = defineTool({
  name: 'list_events',
  displayName: 'List Events',
  description:
    'List upcoming Facebook events for the current user. Returns event name, date, location, cover photo, and attendance counts.',
  summary: 'List upcoming events',
  icon: 'calendar',
  group: 'Events',
  input: z.object({
    count: z.number().int().min(1).max(20).optional().describe('Number of events to return (default 10, max 20)'),
  }),
  output: z.object({
    events: z.array(eventSchema),
    has_next_page: z.boolean().describe('Whether more events are available'),
  }),
  handle: async params => {
    const data = await graphql<EventsHomeResponse>('EventCometHomeRootQuery', {
      count: params.count ?? 10,
      scale: 2,
    });

    const events = data.viewer?.all_events;
    const edges = events?.edges ?? [];

    return {
      events: edges.map(e => mapEvent(e.node ?? {})),
      has_next_page: events?.page_info?.has_next_page ?? false,
    };
  },
});
