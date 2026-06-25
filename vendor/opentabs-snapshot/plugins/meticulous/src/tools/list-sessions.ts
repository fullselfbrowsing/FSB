import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { sessionSchema, mapSession } from './schemas.js';

export const listSessions = defineTool({
  name: 'list_sessions',
  displayName: 'List Sessions',
  description: 'List recorded user sessions for a project.',
  summary: 'List sessions for a project',
  icon: 'monitor',
  group: 'Sessions',
  input: z.object({
    project_id: z.string().describe('Project ID'),
    count: z.number().optional().default(50).describe('Number of sessions to return'),
  }),
  output: z.object({ sessions: z.array(sessionSchema) }),
  handle: async ({ project_id, count }) => {
    const data = await graphql<{ sessionsForProject: Array<Record<string, unknown>> }>(
      queries.GET_SESSIONS_FOR_PROJECT,
      { projectId: project_id, n: count },
    );
    return { sessions: (data.sessionsForProject ?? []).map(mapSession) };
  },
});
