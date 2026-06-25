// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../threads-api.js';

export const listTimeline = defineTool({
  name: 'list_timeline',
  displayName: 'List Timeline',
  description: 'List recent posts from your Threads home timeline. Optionally page through with a cursor.',
  summary: 'show me my threads timeline',
  icon: 'list',
  group: 'Timeline',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous page'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of posts to return'),
  }),
  output: z.object({
    posts: z.array(z.object({
      id: z.string(),
      text: z.string(),
      author: z.string(),
    })).describe('Recent timeline posts'),
    next_cursor: z.string().optional().describe('Cursor for the next page'),
  }),
  handle: async (params: { cursor?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /timeline (default method).
    const data = await api<{ posts: unknown[]; next_cursor?: string }>('/timeline', {
      query: { cursor: params.cursor, limit: params.limit },
    });
    return { posts: data.posts as { id: string; text: string; author: string }[], next_cursor: data.next_cursor };
  },
});
