import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { sessionSchema, mapSession } from './schemas.js';

export const searchSessions = defineTool({
  name: 'search_sessions',
  displayName: 'Search Sessions',
  description: 'Search recorded sessions by query string within a project.',
  summary: 'Search sessions',
  icon: 'search',
  group: 'Sessions',
  input: z.object({
    project_id: z.string().describe('Project ID to search within'),
    query: z.string().describe('Search query string'),
    count: z.number().optional().default(50).describe('Number of results to return'),
    offset: z.number().optional().default(0).describe('Offset for pagination'),
    include_empty_sessions: z.boolean().optional().default(false).describe('Include sessions with no user events'),
    include_automated_sessions: z.boolean().optional().default(false).describe('Include automated/bot sessions'),
  }),
  output: z.object({ sessions: z.array(sessionSchema) }),
  handle: async ({ project_id, query, count, offset, include_empty_sessions, include_automated_sessions }) => {
    const data = await graphql<{ sessionsBySearch: Array<Record<string, unknown>> }>(queries.SEARCH_SESSIONS, {
      projectId: project_id,
      searchQuery: query,
      n: count,
      offset,
      includeEmptySessions: include_empty_sessions,
      includeAutomatedSessions: include_automated_sessions,
    });
    return { sessions: (data.sessionsBySearch ?? []).map(mapSession) };
  },
});
