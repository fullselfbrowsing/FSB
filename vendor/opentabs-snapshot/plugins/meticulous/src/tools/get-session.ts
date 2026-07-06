import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { sessionSchema, mapSession } from './schemas.js';

export const getSession = defineTool({
  name: 'get_session',
  displayName: 'Get Session',
  description: 'Get detailed information about a specific recorded user session.',
  summary: 'Get session details',
  icon: 'monitor',
  group: 'Sessions',
  input: z.object({
    session_id: z.string().describe('Session ID'),
  }),
  output: z.object({ session: sessionSchema }),
  handle: async ({ session_id }) => {
    const data = await graphql<{ session: Record<string, unknown> }>(queries.GET_SESSION, { sessionId: session_id });
    return { session: mapSession(data.session) };
  },
});
