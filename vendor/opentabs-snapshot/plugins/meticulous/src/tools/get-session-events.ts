import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { sessionEventSchema, mapSessionEvent } from './schemas.js';

export const getSessionEvents = defineTool({
  name: 'get_session_events',
  displayName: 'Get Session Events',
  description: 'Get the user interaction events (clicks, inputs, navigations) recorded during a session.',
  summary: 'Get user events in a session',
  icon: 'activity',
  group: 'Sessions',
  input: z.object({
    session_id: z.string().describe('Session ID'),
  }),
  output: z.object({
    session_id: z.string(),
    events: z.array(sessionEventSchema),
  }),
  handle: async ({ session_id }) => {
    const data = await graphql<{ session: { id: string; data: { userEvents: Array<Record<string, unknown>> } } }>(
      queries.GET_SESSION_EVENTS,
      { sessionId: session_id },
    );
    return {
      session_id: data.session.id,
      events: (data.session.data?.userEvents ?? []).map(mapSessionEvent),
    };
  },
});
