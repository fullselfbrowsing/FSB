// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const listTimeline = defineTool({
  name: 'list_timeline',
  displayName: 'List Timeline',
  description: 'List recent posts from your Bluesky home timeline -- read your home feed of posts. Optionally page through with a cursor.',
  summary: 'show me my bluesky timeline',
  icon: 'list',
  group: 'Feed',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous page'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of posts to return'),
  }),
  output: z.object({
    feed: z.array(z.object({
      uri: z.string(),
      text: z.string(),
      author: z.string(),
    })).describe('Recent timeline posts'),
    cursor: z.string().optional().describe('Cursor for the next page'),
  }),
  handle: async (params: { cursor?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET app.bsky.feed.getTimeline (default method).
    const data = await api<{ feed: unknown[]; cursor?: string }>('/xrpc/app.bsky.feed.getTimeline', {
      query: { cursor: params.cursor, limit: params.limit },
    });
    return { feed: data.feed as { uri: string; text: string; author: string }[], cursor: data.cursor };
  },
});
